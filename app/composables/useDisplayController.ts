import { ref, computed, shallowRef } from 'vue'
import type { Ref } from 'vue'
import type { Unsubscribe } from 'firebase/firestore'
import type { QueuePendingItem, QueueHistoryItem } from '~/types'
import { deserializeNoteFromChannel } from '~/utils/screen-sync-payload'
import {
  DISPLAY_SLOT_DURATION_MS,
  DISPLAY_SLOT_DURATION_SECONDS,
  HISTORY_POOL_SIZE
} from '~/data/display-config'

const SINGLETON_KEY = '__willmusic_display_controller__'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i] as T
    a[i] = a[j] as T
    a[j] = t
  }
  return a
}

interface DisplayControllerSingleton {
  queue: Ref<QueuePendingItem[]>
  currentNote: Ref<QueuePendingItem | QueueHistoryItem | null>
  currentSource: Ref<'pending' | 'history' | null>
  idleList: Ref<QueueHistoryItem[]>
  idleIndex: number
  completedPendingIds: Set<string>
  unsubscribe: Unsubscribe | null
  syncOff: (() => void) | null
  /** BORROW_DEPARTING 比 waitForLiveReady 先到時暫存 */
  pendingBorrowedNote: QueueHistoryItem | null
  /** 收到 BORROW_DEPARTING 時 resolve */
  borrowDepartingResolve: ((note: QueueHistoryItem) => void) | null
  /** 出場開始時提早借片，onComplete 前就緒則直接使用，避免空檔 */
  prefetchedNextNote: QueueHistoryItem | null
}

function getOrCreateSingleton(): DisplayControllerSingleton {
  const g = globalThis as any
  if (!g[SINGLETON_KEY]) {
    g[SINGLETON_KEY] = {
      queue: ref<QueuePendingItem[]>([]),
      currentNote: shallowRef<QueuePendingItem | QueueHistoryItem | null>(null),
      currentSource: ref<'pending' | 'history' | null>(null),
      idleList: ref<QueueHistoryItem[]>([]),
      idleIndex: 0,
      completedPendingIds: new Set<string>(),
      unsubscribe: null,
      syncOff: null,
      pendingBorrowedNote: null,
      borrowDepartingResolve: null,
      prefetchedNextNote: null
    }
    console.log('[useDisplayController] Created new singleton')
  }
  return g[SINGLETON_KEY]
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const g = globalThis as any
    const s = g[SINGLETON_KEY] as DisplayControllerSingleton | undefined
    if (s) {
      s.unsubscribe?.()
      s.syncOff?.()
      delete g[SINGLETON_KEY]
    }
  })
}

export type DisplayState = 'idle' | 'newSingle' | 'queueDrain'

/**
 * 大螢幕顯示控制器
 *
 * 狀態一（pending 佇列有 note）：
 *   endSlot → moveToHistory → 立即設 currentNote（pending note 進 display）
 *
 * 狀態二（idle）：
 *   endSlot → send BORROW_REQUEST → 等 BORROW_DEPARTING（取得 note 資料）
 *           收到 BORROW_DEPARTING 即 resolve，Display 出場結束即可接續播下一張
 */
export function useDisplayController() {
  const { listenToPendingQueue, getHistory, moveToHistory } = useFirestore()
  const { onMessage: syncOnMessage } = useScreenSync()
  const s = getOrCreateSingleton()

  const queueLength = computed(() => s.queue.value.length)

  const displayState = computed<DisplayState>(() => {
    const n = s.queue.value.length
    if (n >= 2) return 'queueDrain'
    if (n === 1) return 'newSingle'
    return 'idle'
  })

  const refreshIdleList = async () => {
    try {
      const { items } = await getHistory(HISTORY_POOL_SIZE)
      s.idleList.value = shuffle(items)
      s.idleIndex = 0
    } catch (e) {
      console.error('[useDisplayController] refreshIdleList error:', e)
      s.idleList.value = []
      s.idleIndex = 0
    }
  }

  const clearIdleList = () => {
    s.idleList.value = []
    s.idleIndex = 0
  }

  const effectiveQueue = () =>
    s.queue.value.filter(q => !s.completedPendingIds.has(q.id ?? q.token ?? ''))

  const effectiveQueueLength = computed(() => effectiveQueue().length)

  // ── BroadcastChannel 同步訊號處理 ─────────────────────────────────────────

  /**
   * 出場動畫「開始時」呼叫：送出 BORROW_REQUEST，回傳 promise（收到 BORROW_DEPARTING 即 resolve）。
   * Display 出場結束即可接續播下一張；Live 出場由 TRANSITION_START 同步觸發。
   */
  const requestBorrowEarly = (): Promise<QueueHistoryItem> => {
    send({ type: 'BORROW_REQUEST' })
    return waitForLiveReady()
  }

  /** 收到 BORROW_DEPARTING 就 resolve（有 note 資料即可），Display 可立即接續播放，不等待 Live 出場動畫結束 */
  const waitForLiveReady = (): Promise<QueueHistoryItem> => {
    return new Promise<QueueHistoryItem>(resolve => {
      const tryResolve = (n: QueueHistoryItem) => {
        s.borrowDepartingResolve = null
        s.prefetchedNextNote = n
        resolve(n)
      }

      s.borrowDepartingResolve = tryResolve

      if (s.pendingBorrowedNote) {
        const note = s.pendingBorrowedNote
        s.pendingBorrowedNote = null
        tryResolve(note)
      }
    })
  }

  // ── Slot 主流程 ────────────────────────────────────────────────────────────

  const { send } = useScreenSync()

  const endSlot = async () => {
    const current = s.currentNote.value
    const source = s.currentSource.value

    if (current && source === 'pending') {
      const pendingItem = current as QueuePendingItem
      const id = pendingItem.id ?? pendingItem.token ?? ''
      if (id) s.completedPendingIds.add(id)
      try {
        await moveToHistory(pendingItem)
        console.log('[useDisplayController] moveToHistory done:', id)
      } catch (e) {
        console.error('[useDisplayController] moveToHistory error:', e)
        if (id) s.completedPendingIds.delete(id)
      }
    }

    const pending = effectiveQueue()

    if (pending.length > 0) {
      // 有排隊的 pending note：直接上場，不需要等 Live
      // 若已有提早借好的 idle note（原本要上場的），必須通知 Live 讓它回去
      if (s.prefetchedNextNote) {
        const skippedNoteId = getNoteId(s.prefetchedNextNote)
        send({ type: 'DISPLAY_EXIT_DONE', noteId: skippedNoteId })
        s.prefetchedNextNote = null
        console.log(`[useDisplayController] Prefetched note ${skippedNoteId} skipped due to pending note, returning to Live.`)
      }

      const first = pending[0]!
      s.currentNote.value = first
      s.currentSource.value = 'pending'
    } else {
      // Idle：若有提早借好的 prefetched 直接使用；否則才 send + wait
      if (s.prefetchedNextNote) {
        const note = s.prefetchedNextNote
        s.prefetchedNextNote = null
        s.currentNote.value = note
        s.currentSource.value = 'history'
      } else {
        s.currentNote.value = null
        s.currentSource.value = null
        send({ type: 'BORROW_REQUEST' })
        try {
          const note = await waitForLiveReady()
          // 通知 Live 將 reserved note 出場
          const noteId = getNoteId(note)
          send({ type: 'TRANSITION_START', noteId, nextSource: 'history', isExitingPending: false })
          s.currentNote.value = note
          s.currentSource.value = 'history'
        } catch (e) {
          console.error('[useDisplayController] waitForLiveReady error:', e)
        }
      }
    }
  }

  const startListening = () => {
    if (s.unsubscribe) return

    // BroadcastChannel：接收 Live 的動畫完成訊號
    if (!s.syncOff) {
      s.syncOff = syncOnMessage((msg) => {
        if (msg.type === 'BORROW_DEPARTING') {
          const note = deserializeNoteFromChannel(msg.note) as QueueHistoryItem
          if (s.borrowDepartingResolve) {
            s.borrowDepartingResolve(note)
          } else {
            s.pendingBorrowedNote = note
          }
        }
      })
    }

    s.unsubscribe = listenToPendingQueue((items) => {
      const prevLen = s.queue.value.length
      s.queue.value = items
      const nowLen = items.length
      if (prevLen === 0 && nowLen >= 1) {
        clearIdleList()
      }
      const inSnapshot = new Set(items.map(it => it.id ?? it.token ?? ''))
      for (const id of s.completedPendingIds) {
        if (!inSnapshot.has(id)) s.completedPendingIds.delete(id)
      }
      // 不插播：有新 pending 時不打斷，等當下動畫跑完後 endSlot 再依佇列播下一張
    })

    if (!s.currentNote.value) {
      // 第一張：如果有 pending 就直接上，否則等 Live
      const pending = effectiveQueue()
      if (pending.length > 0) {
        s.currentNote.value = pending[0]!
        s.currentSource.value = 'pending'
      } else {
        send({ type: 'BORROW_REQUEST' })
        waitForLiveReady().then(note => {
          if (!s.currentNote.value) {
            // 第一次借 note：通知 Live 立即將 reserved note 出場（前半）
            const noteId = getNoteId(note)
            send({ type: 'TRANSITION_START', noteId, nextSource: 'history', isExitingPending: false })
            s.currentNote.value = note
            s.currentSource.value = 'history'
          }
        })
      }
    }
    console.log('[useDisplayController] startListening')
  }

  const stopListening = () => {
    s.unsubscribe?.()
    s.unsubscribe = null
    s.syncOff?.()
    s.syncOff = null
  }

  return {
    queue: computed(() => s.queue.value),
    currentNote: computed(() => s.currentNote.value),
    currentSource: computed(() => s.currentSource.value),
    displayState,
    queueLength,
    effectiveQueueLength,
    startListening,
    stopListening,
    endSlot,
    requestBorrowEarly,
    slotDurationMs: DISPLAY_SLOT_DURATION_MS,
    slotDurationSeconds: DISPLAY_SLOT_DURATION_SECONDS
  }
}

// ─── Helper ────────────────────────────────────────────────────────────────

function getNoteId(note: QueuePendingItem | QueueHistoryItem | null): string {
  if (!note) return ''
  return (note as any).id ?? (note as any).token ?? ''
}
