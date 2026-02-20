import { ref, computed, shallowRef } from 'vue'
import type { Ref } from 'vue'
import type { Unsubscribe } from 'firebase/firestore'
import type { QueuePendingItem, QueueHistoryItem } from '~/types'
import {
  DISPLAY_SLOT_DURATION_MS,
  DISPLAY_SLOT_DURATION_SECONDS
} from '~/data/display-config'

const IDLE_POOL_SIZE = 20

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
      unsubscribe: null
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
      if (s.unsubscribe) {
        s.unsubscribe()
        s.unsubscribe = null
      }
      delete g[SINGLETON_KEY]
    }
  })
}

export type DisplayState = 'idle' | 'newSingle' | 'queueDrain'

/**
 * 大螢幕顯示控制器
 * - 每張播放秒數唯一參數：~/data/display-config.ts 的 DISPLAY_SLOT_DURATION_SECONDS
 * - 全域規則：每張以該秒數為一單位，切換僅在 slot 結束時進行
 * - 狀態一：閒置輪播最新 20 張歷史；狀態二：新便利貼插入；狀態三：排隊消化
 */
export function useDisplayController() {
  const { listenToPendingQueue, getHistory, moveToHistory } = useFirestore()
  const s = getOrCreateSingleton()

  const queueLength = computed(() => s.queue.value.length)

  const displayState = computed<DisplayState>(() => {
    const n = s.queue.value.length
    if (n >= 2) return 'queueDrain'
    if (n === 1) return 'newSingle'
    return 'idle'
  })

  /** 從歷史抓取最新 20 張並打亂，設為 idle 輪播名單 */
  const refreshIdleList = async () => {
    try {
      const { items } = await getHistory(IDLE_POOL_SIZE)
      s.idleList.value = shuffle(items)
      s.idleIndex = 0
      console.log('[useDisplayController] refreshIdleList:', items.length, 'items')
    } catch (e) {
      console.error('[useDisplayController] refreshIdleList error:', e)
      s.idleList.value = []
      s.idleIndex = 0
    }
  }

  /** 清空閒置名單（播完一輪或被打斷時） */
  const clearIdleList = () => {
    s.idleList.value = []
    s.idleIndex = 0
  }

  /** 有效佇列：排除已送進歷史、尚未從 snapshot 移除的 id */
  const effectiveQueue = () => s.queue.value.filter(q => !s.completedPendingIds.has(q.id ?? q.token ?? ''))

  /** 取得下一個要播放的項目：優先佇列，否則從 idle 名單取（不足則先 refresh） */
  const getNext = async (): Promise<{
    note: QueuePendingItem | QueueHistoryItem | null
    source: 'pending' | 'history'
  }> => {
    const pending = effectiveQueue()
    if (pending.length > 0) {
      const first = pending[0]
      if (first) return { note: first, source: 'pending' }
    }

    let list = s.idleList.value
    if (list.length === 0) {
      await refreshIdleList()
      list = s.idleList.value
    }
    if (list.length === 0) {
      return { note: null, source: 'history' }
    }

    const idx = s.idleIndex % list.length
    const item = list[idx] ?? null
    s.idleIndex = (s.idleIndex + 1) % list.length
    if (s.idleIndex === 0) {
      clearIdleList()
    }
    return { note: item, source: 'history' }
  }

  /**
   * Slot 結束（由 display 在 GSAP timeline 完成時呼叫）：完成當前、取得下一張、更新畫面。
   * 下一張的「計時」由 display 的 timeline 驅動，timeline 結束時再呼叫 endSlot。
   */
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

    const { note, source: nextSource } = await getNext()
    s.currentNote.value = note
    s.currentSource.value = nextSource
  }

  const startListening = () => {
    if (s.unsubscribe) return

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
    })

    if (!s.currentNote.value) {
      getNext().then(({ note, source }) => {
        s.currentNote.value = note
        s.currentSource.value = source
      })
    }
    console.log('[useDisplayController] startListening')
  }

  const stopListening = () => {
    if (s.unsubscribe) {
      s.unsubscribe()
      s.unsubscribe = null
    }
  }

  return {
    queue: computed(() => s.queue.value),
    currentNote: computed(() => s.currentNote.value),
    currentSource: computed(() => s.currentSource.value),
    displayState,
    queueLength,
    startListening,
    stopListening,
    endSlot,
    slotDurationMs: DISPLAY_SLOT_DURATION_MS,
    slotDurationSeconds: DISPLAY_SLOT_DURATION_SECONDS
  }
}
