import { ref, shallowRef, computed, triggerRef } from 'vue'
import type { Ref } from 'vue'
import type { QueueHistoryItem, QueuePendingItem } from '~/types'
import { HISTORY_POOL_SIZE } from '~/data/display-config'

// ─── 型別 ────────────────────────────────────────────────────────────────────

export interface SlotPx {
  cx: number
  cy: number
  size: number
  rotateDeg: number
}

export type LiveItemState =
  | 'visible'        // 正常顯示在牆上
  | 'reserved'       // 已被 BORROW_REQUEST 預選，等待 TRANSITION_START 觸發出場動畫
  | 'exiting-right'  // 向右飛出（被 Display 借走，動畫中）
  | 'absent'         // 目前在 Display（slot 保留，DOM 移除）
  | 'entering-right' // 從右飛入（新 pending 或 idle 歸還）
  | 'entering-left'  // 從左飛入（初始進場或保留備用）
  | 'removing-top'   // 往上看不見移出後消失（最舊的被擠掉）

export interface LiveItem {
  /** v-for key，等同 noteId（id ?? token） */
  key: string
  note: QueueHistoryItem
  /** 對應 slots[] 的索引，固定不動，保留 slot 位置 */
  slotIndex: number
  state: LiveItemState
}

// ─── Singleton ───────────────────────────────────────────────────────────────

const SINGLETON_KEY = '__willmusic_live_controller__'

interface LiveSingleton {
  items: Ref<LiveItem[]>
  /** HISTORY_POOL_SIZE 個固定 slot，位置由 viewport 決定 */
  slots: Ref<SlotPx[]>
  viewport: Ref<{ w: number; h: number }>
  /** 由 BroadcastChannel 先行加入的 token，等待 Firebase 補齊資料 */
  localTokens: Set<string>
  loaded: Ref<boolean>
  unsubscribe: (() => void) | null
}

function getOrCreateSingleton(): LiveSingleton {
  const g = globalThis as Record<string, any>
  if (!g[SINGLETON_KEY]) {
    g[SINGLETON_KEY] = {
      items: shallowRef<LiveItem[]>([]),
      slots: ref<SlotPx[]>([]),
      viewport: ref({ w: 0, h: 0 }),
      localTokens: new Set<string>(),
      loaded: ref(false),
      unsubscribe: null
    } satisfies LiveSingleton
  }
  return g[SINGLETON_KEY]
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const g = globalThis as Record<string, any>
    const s = g[SINGLETON_KEY] as LiveSingleton | undefined
    if (s) {
      s.unsubscribe?.()
      delete g[SINGLETON_KEY]
    }
  })
}

// ─── 工具函式 ────────────────────────────────────────────────────────────────

const FILL = 0.78
const ROTATE_DEG = 10

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}

function computeSlots(W: number, H: number, N: number): SlotPx[] {
  if (N <= 0 || W <= 0 || H <= 0) return []
  const cols = Math.max(1, Math.ceil(Math.sqrt(N)))
  const rows = Math.ceil(N / cols)
  const cellW = W / cols
  const cellH = H / rows
  const size = Math.floor(Math.min(cellW, cellH) * FILL)
  const maxJX = Math.max(0, (cellW - size) / 2)
  const maxJY = Math.max(0, (cellH - size) / 2)

  const all: SlotPx[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      all.push({
        cx: (c + 0.5) * cellW + (Math.random() - 0.5) * 2 * maxJX,
        cy: (r + 0.5) * cellH + (Math.random() - 0.5) * 2 * maxJY,
        size,
        rotateDeg: (Math.random() - 0.5) * 2 * ROTATE_DEG
      })
    }
  }
  return shuffle(all).slice(0, N)
}

export function getNoteKey(note: QueueHistoryItem | QueuePendingItem): string {
  return (note as QueueHistoryItem).id ?? (note as QueuePendingItem).token ?? ''
}

// ─── Composable ──────────────────────────────────────────────────────────────

export function useLiveController() {
  const { listenToHistory } = useFirestore()
  const s = getOrCreateSingleton()

  // ── Slot 管理 ──────────────────────────────────────────────────────────────

  /**
   * 更新 viewport 並重算 HISTORY_POOL_SIZE 個固定 slot
   * 已存在的 items 的 slotIndex 不變，但 slot 位置（cx/cy/size）會更新
   */
  const setViewport = (w: number, h: number) => {
    s.viewport.value = { w, h }
    s.slots.value = computeSlots(w, h, HISTORY_POOL_SIZE)
  }

  const getSlot = (slotIndex: number): SlotPx =>
    s.slots.value[slotIndex] ?? { cx: 0, cy: 0, size: 100, rotateDeg: 0 }

  /** 找出尚未被使用的最小 slotIndex */
  const nextFreeSlotIndex = (): number => {
    const used = new Set(s.items.value.map(i => i.slotIndex))
    for (let i = 0; i < HISTORY_POOL_SIZE; i++) {
      if (!used.has(i)) return i
    }
    return 0
  }

  // ── Firebase 協調 ──────────────────────────────────────────────────────────

  const reconcileFromFirebase = (data: QueueHistoryItem[]) => {
    // 更新本地先行加入的 note（用 token 比對，補齊正式 id & playedAt）
    for (const fbNote of data) {
      if (s.localTokens.has(fbNote.token)) {
        const item = s.items.value.find(i => i.note.token === fbNote.token)
        if (item) {
          item.note = fbNote
          triggerRef(s.items)
        }
        s.localTokens.delete(fbNote.token)
      }
    }

    if (!s.loaded.value) {
      s.loaded.value = true
    }

    // 初次載入：items 為空，直接用 Firebase 資料建立
    if (s.items.value.length === 0) {
      const N = Math.min(data.length, HISTORY_POOL_SIZE)
      s.items.value = data.slice(0, N).map((note, i) => ({
        key: getNoteKey(note) || `note-${i}`,
        note,
        slotIndex: i,
        state: 'visible' as LiveItemState
      }))
      return
    }

    // 後續更新：加入 Firebase 有、本地沒有的 note（補位用）
    const currentKeys = new Set(s.items.value.map(i => getNoteKey(i.note)))
    let changed = false
    for (const fbNote of data) {
      const id = getNoteKey(fbNote)
      if (!currentKeys.has(id) && !s.localTokens.has(fbNote.token)) {
        const activeCount = s.items.value.filter(
          i => i.state !== 'removing-top'
        ).length
        if (activeCount < HISTORY_POOL_SIZE) {
          s.items.value = [
            ...s.items.value,
            {
              key: id || `note-${Date.now()}`,
              note: fbNote,
              slotIndex: nextFreeSlotIndex(),
              state: 'visible'
            }
          ]
          changed = true
        }
      }
    }
    if (changed) triggerRef(s.items)
  }

  const startListening = () => {
    if (s.unsubscribe) return
    s.unsubscribe = listenToHistory(HISTORY_POOL_SIZE, reconcileFromFirebase)
  }

  const stopListening = () => {
    if (s.unsubscribe) {
      s.unsubscribe()
      s.unsubscribe = null
    }
  }

  // ── 狀態操作（由 live.vue 協調動畫後呼叫） ─────────────────────────────────

  /** 隨機挑一張 visible 的 note 借給 Display（排除 reserved / removing-top / exiting-right / absent / entering-*） */
  const pickVisible = (): LiveItem | null => {
    const visible = s.items.value.filter(i => i.state === 'visible')
    if (visible.length === 0) return null
    return visible[Math.floor(Math.random() * visible.length)] ?? null
  }

  /** 找到已被 reserved 的 note（由 BORROW_REQUEST 預選，等待 TRANSITION_START） */
  const findReserved = (): LiveItem | null => {
    return s.items.value.find(i => i.state === 'reserved') ?? null
  }

  const setItemState = (key: string, state: LiveItemState) => {
    const item = s.items.value.find(i => i.key === key)
    if (item) {
      item.state = state
      triggerRef(s.items)
    }
  }

  /**
   * 規則四：當 pending note 在 Display 剛開始出場時，踢出 Live 最舊的便利貼（如有），
   * 並為此 pending note 建立 absent 站位，等 DISPLAY_EXIT_DONE 再進場。
   * - 回傳 { arriving, removed }，其中 arriving 狀態為 'absent'
   */
  const evictOldestAndCreatePlaceholder = (note: QueuePendingItem): { arriving: LiveItem; removed: LiveItem | null } => {
    const histNote: QueueHistoryItem = {
      ...note,
      status: 'played',
      playedAt: null as any  // Firebase 同步後會補齊
    }
    s.localTokens.add(note.token)

    // 為了避免干擾正在 Display 播放或進出場動畫的便利貼，只從「乖乖貼在牆上」的裡面抓最舊的一張
    const evictionCandidates = s.items.value.filter(
      i => i.state === 'visible' || i.state === 'reserved'
    )
    let removed: LiveItem | null = null

    // 如果牆上加上即將回來的 absent 總數達到上限，就必須擠出一張
    // 這裡 active.length 計算全體（但排除已在離場的 removing-top）
    const totalActive = s.items.value.filter(i => i.state !== 'removing-top').length

    if (totalActive >= HISTORY_POOL_SIZE) {
      // 從候選名單依 playedAt 找出最早上傳的 note 移除
      const oldestVisible = evictionCandidates
        .filter(i => i.note.playedAt !== null)
        .sort((a, b) => {
          const ta = a.note.playedAt?.toMillis() ?? Infinity
          const tb = b.note.playedAt?.toMillis() ?? Infinity
          return ta - tb
        })[0] ?? null
      removed = oldestVisible
      if (removed) {
        removed.state = 'removing-top'
        triggerRef(s.items)
      }
    }

    // 新便利貼取得 removed 釋放的 slot（如有），否則取空閒 slot
    const slotIndex = removed ? removed.slotIndex : nextFreeSlotIndex()
    const key = getNoteKey(note) || `arriving-${Date.now()}`

    // 與舊版 addNote 的核心差異：這裡建立的站位是 absent，不立即觸發 entering-right
    const arriving: LiveItem = { key, note: histNote, slotIndex, state: 'absent' }

    // 一律 append 到最後：避免在 removed 前面插入導致 Vue 重算 DOM key、stale element reference
    s.items.value = [...s.items.value, arriving]
    triggerRef(s.items)

    return { arriving, removed }
  }

  const removeItem = (key: string) => {
    s.items.value = s.items.value.filter(i => i.key !== key)
    triggerRef(s.items)
  }

  return {
    items: computed(() => s.items.value),
    slots: computed(() => s.slots.value),
    viewport: computed(() => s.viewport.value),
    loading: computed(() => !s.loaded.value),
    getSlot,
    setViewport,
    pickVisible,
    findReserved,
    setItemState,
    reconcileFromFirebase,
    evictOldestAndCreatePlaceholder,
    removeItem,
    startListening,
    stopListening
  }
}
