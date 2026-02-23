/**
 * useConductor – 大螢幕指揮家
 *
 * 職責：
 *  1. 管理 liveGrid / nowPlaying / borrowedId 等 reactive 狀態
 *  2. 每 N 秒執行一次 tick（Live Push 或 Idle Borrow）
 *  3. 廣播狀態到 Firestore system/current_state
 *  4. 暴露 onBeforeStateChange / onAfterStateChange 回呼，
 *     供 canvas.vue 嵌入 GSAP FLIP 動畫
 */
import { ref, computed, reactive } from 'vue'
import {
    collection, doc, setDoc, onSnapshot,
    query, limit, orderBy, getDocs
} from 'firebase/firestore'
import { useNuxtApp } from '#app'
import { useFirestore } from '~/composables/useFirestore'
import type {
    QueuePendingItem, QueueHistoryItem, CurrentStateData
} from '~/types'

/* ─── Types ─── */

export interface ConductorOptions {
    /** 每張便利貼在右邊展示的毫秒數（預設 15000） */
    loopIntervalMs?: number
    /** 左邊網格最大容量（預設 20） */
    historyLimit?: number
    /** FLIP 動畫：在 tick 修改 reactive 資料 **之前** 呼叫 */
    onBeforeStateChange?: () => void
    /** FLIP 動畫：在 tick 修改 reactive 資料 **之後** 呼叫 */
    onAfterStateChange?: () => void
}

interface ConductorState {
    isConductor: boolean
    queuePending: QueuePendingItem[]
    liveGrid: (QueueHistoryItem | QueuePendingItem)[]
    nowPlaying: QueueHistoryItem | QueuePendingItem | null
    mode: 'live' | 'idle' | 'waiting'
    borrowedId: string | null
    // internals
    unsubPending: (() => void) | null
    unsubHistory: (() => void) | null
    unsubState: (() => void) | null
    timer: ReturnType<typeof setTimeout> | null
    animTimer: ReturnType<typeof setTimeout> | null
    isAnimating: boolean
    lastTickTime: number
    completedIds: Set<string>
    // callbacks (stored so tick() can call them)
    onBefore: (() => void) | null
    onAfter: (() => void) | null
    // config
    loopMs: number
    gridMax: number
}

/* ─── Singleton（跨 HMR 保持同一份狀態） ─── */

const KEY = '__willmusic_conductor__'

function getSingleton(): ConductorState {
    const g = globalThis as any
    if (!g[KEY]) {
        g[KEY] = reactive<ConductorState>({
            isConductor: false,
            queuePending: [],
            liveGrid: [],
            nowPlaying: null,
            mode: 'waiting',
            borrowedId: null,
            unsubPending: null,
            unsubHistory: null,
            unsubState: null,
            timer: null,
            animTimer: null,
            isAnimating: false,
            lastTickTime: 0,
            completedIds: new Set(),
            onBefore: null,
            onAfter: null,
            loopMs: 15_000,
            gridMax: 20
        })
    }
    return g[KEY]
}

/* ─── Helper ─── */
const noteId = (n: any): string => n?.id ?? n?.token ?? ''

/* ─── Composable ─── */

export function useConductor() {
    const { $firestore } = useNuxtApp()
    const db = $firestore as any
    const { moveToHistory } = useFirestore()
    const s = getSingleton()

    // 給手機端用的 ref
    const currentState = ref<CurrentStateData | null>(null)

    /* ── startConductor ── */
    const startConductor = async (opts?: ConductorOptions) => {
        if (s.isConductor) return
        s.isConductor = true

        // 套用設定
        if (opts?.loopIntervalMs) s.loopMs = opts.loopIntervalMs
        if (opts?.historyLimit) s.gridMax = opts.historyLimit
        s.onBefore = opts?.onBeforeStateChange ?? null
        s.onAfter = opts?.onAfterStateChange ?? null

        console.log(
            `[Conductor] start  gridMax=${s.gridMax}  loop=${s.loopMs}ms`
        )

        // 1) 從 queue_history 載入最多 gridMax 張並監聽遠端刪除
        const q = query(
            collection(db, 'queue_history'),
            orderBy('playedAt', 'desc'),
            limit(s.gridMax)
        )

        await new Promise<void>((resolve) => {
            let isFirst = true
            s.unsubHistory = onSnapshot(
                q,
                (snapshot) => {
                    if (isFirst) {
                        isFirst = false
                        // 初次載入
                        s.liveGrid = snapshot.docs.map(
                            d => ({ id: d.id, ...d.data() } as QueueHistoryItem)
                        )
                        resolve()
                        return
                    }

                    // 後續更新：只處理被遠端刪除或擠出的項目，避免打斷本地已 unshift() 正在執行的 FLIP 動畫
                    const changes = snapshot.docChanges()
                    const hasRemovals = changes.some(change => change.type === 'removed')

                    if (hasRemovals) {
                        // 如果有刪除，觸發動畫 hook (擷取當前狀態)
                        s.onBefore?.()

                        let removedCount = 0
                        let nowPlayingRemoved = false
                        changes.forEach((change) => {
                            if (change.type === 'removed') {
                                const deletedId = change.doc.id
                                if (s.nowPlaying && noteId(s.nowPlaying) === deletedId) {
                                    nowPlayingRemoved = true
                                }
                                const beforeLen = s.liveGrid.length
                                s.liveGrid = s.liveGrid.filter(n => noteId(n) !== deletedId)
                                if (s.liveGrid.length < beforeLen) removedCount++
                            }
                        })

                        // 補上新拉到的歷史資料
                        if (removedCount > 0 && s.liveGrid.length < s.gridMax) {
                            const existingIds = new Set(s.liveGrid.map(n => noteId(n)))
                            for (const d of snapshot.docs) {
                                if (!existingIds.has(d.id) && s.liveGrid.length < s.gridMax) {
                                    s.liveGrid.push({ id: d.id, ...d.data() } as QueueHistoryItem)
                                }
                            }
                        }

                        // 若被刪除的剛好是正在展示的歷史便利貼，強制換首
                        if (nowPlayingRemoved) {
                            s.nowPlaying = null
                            s.borrowedId = null
                            if (s.timer) clearTimeout(s.timer)
                            tick(true)
                        }

                        // 觸發動畫 hook (執行 Flip 動畫)
                        s.onAfter?.()
                    }
                },
                (error) => {
                    console.error('[Conductor] history listener error', error)
                    if (isFirst) resolve() // 避免卡死
                }
            )
        })

        // 2) 即時監聽 queue_pending
        const pq = query(
            collection(db, 'queue_pending'),
            orderBy('timestamp', 'asc')
        )
        s.unsubPending = onSnapshot(pq, snap => {
            const changes = snap.docChanges()
            let nowPlayingRemoved = false

            changes.forEach(change => {
                if (change.type === 'removed') {
                    const deletedId = change.doc.id
                    if (s.nowPlaying && noteId(s.nowPlaying) === deletedId) {
                        nowPlayingRemoved = true
                    }
                }
            })

            if (nowPlayingRemoved) {
                s.onBefore?.()
            }

            s.queuePending = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as QueuePendingItem))
                .filter(q => !s.completedIds.has(noteId(q)))

            if (nowPlayingRemoved) {
                s.nowPlaying = null
                s.mode = 'waiting'
                if (s.timer) clearTimeout(s.timer)
                tick(true)
                s.onAfter?.()
                return
            }

            // 如果在 idle 模式下偵測到新的 pending，重新排程 tick
            // 讓當前展示結束後立刻進入 live push，不用多等一個完整週期
            if (s.mode === 'idle' && s.queuePending.length > 0) {
                const elapsed = Date.now() - s.lastTickTime
                const remaining = Math.max(0, s.loopMs - elapsed)
                scheduleTick(remaining)
            }
        })

        // 3) 啟動第一次 tick
        tick()
    }

    /* ── stopConductor ── */
    const stopConductor = () => {
        s.isConductor = false
        s.unsubPending?.()
        s.unsubPending = null
        s.unsubHistory?.()
        s.unsubHistory = null
        if (s.timer) { clearTimeout(s.timer); s.timer = null }
        if (s.animTimer) { clearTimeout(s.animTimer); s.animTimer = null }
        s.isAnimating = false
        s.onBefore = null
        s.onAfter = null
    }

    /* ── tick：每 N 秒執行一次 ── */
    const tick = (skipHooks = false, force = false) => {
        // 如果正在進行動畫（且非強制中斷刪除），則進入排隊等待
        if (s.isAnimating && !force) {
            scheduleTick(100)
            return
        }

        s.lastTickTime = Date.now()

        // ▸ Phase 1: 呼叫 BEFORE hook（canvas 在此擷取 FLIP state）
        if (!skipHooks) s.onBefore?.()

        // 記住上一回合，準備收尾
        const prevMode = s.mode
        const prevPlaying = s.nowPlaying ? { ...s.nowPlaying } : null

        // 清空借用標記（若之前是 idle，佔位符會恢復為可見）
        s.borrowedId = null

        // ▸ Phase 2: 處理上一回合的收尾
        let justPushedId: string | null = null
        if (prevPlaying) {
            if (prevMode === 'live') {
                // Live Push 收尾：展示完畢 → 飛進 grid[0]，推擠其他
                s.liveGrid.unshift(prevPlaying)
                justPushedId = noteId(prevPlaying)
                if (s.liveGrid.length > s.gridMax) s.liveGrid.pop()
                // 寫入 Firestore
                try {
                    moveToHistory(prevPlaying as QueuePendingItem)
                        .catch(e => console.error('[Conductor] moveToHistory', e))
                } catch (e) { console.error(e) }
            }
            // idle 收尾：borrowedId 已清空，note 本來就在 grid 裡，不需搬動
        }

        // ▸ Phase 3: 決定下一回合
        const next = s.queuePending.find(
            q => !s.completedIds.has(noteId(q))
        )

        if (next) {
            // ─ 狀態一：Live Push ─
            s.mode = 'live'
            s.nowPlaying = { ...next }
            s.completedIds.add(noteId(next))
        } else if (s.liveGrid.length > 0) {
            // ─ 狀態二：Idle Borrow（排除剛放入的那張與上一張，避免連續顯示） ─
            s.mode = 'idle'
            const prevPlayingId = prevPlaying ? noteId(prevPlaying) : null

            const candidates = s.liveGrid.filter(n => {
                const id = noteId(n)
                return id !== justPushedId && id !== prevPlayingId
            })

            const pool = candidates.length > 0 ? candidates : s.liveGrid
            const idx = Math.floor(Math.random() * pool.length)
            const borrowed = pool[idx]!
            s.nowPlaying = { ...borrowed }
            s.borrowedId = noteId(borrowed)
        } else {
            s.mode = 'waiting'
            s.nowPlaying = null
        }

        // ▸ Phase 5: 呼叫 AFTER hook（canvas 在此執行 Flip.from）
        if (!skipHooks) {
            s.onAfter?.()
            s.isAnimating = true
            if (s.animTimer) clearTimeout(s.animTimer)
            s.animTimer = setTimeout(() => {
                s.isAnimating = false
            }, 1250) // 等待 CSS Flip 動畫播放完畢 (1.2s + 緩衝)
        }

        // ▸ Phase 6: 自動排程下一次回合
        scheduleTick(s.loopMs)
    }

    /** 排程下一次 tick（使用 setTimeout 以便重新排程） */
    const scheduleTick = (delayMs: number) => {
        if (s.timer) clearTimeout(s.timer)
        s.timer = setTimeout(() => {
            tick()
        }, delayMs)
    }

    /* ── broadcast ── */
    const broadcast = () => {
        const payload: CurrentStateData = {
            mode: s.mode,
            now_playing: s.nowPlaying,
            live_grid: s.liveGrid,
            updated_at: Date.now()
        }
        try {
            setDoc(doc(db, 'system', 'current_state'), payload)
                .catch(e => console.error('[Conductor] broadcast', e))
        } catch (e) { console.error(e) }
    }

    /* ── 手機端監聽 ── */
    const startListeningState = () => {
        if (s.unsubState) return
        s.unsubState = onSnapshot(
            doc(db, 'system', 'current_state'),
            snap => {
                if (!snap.exists()) return
                const d = snap.data() as CurrentStateData
                if (currentState.value?.updated_at === d.updated_at) return
                currentState.value = d
            }
        )
    }
    const stopListeningState = () => {
        s.unsubState?.(); s.unsubState = null
    }

    /* ── 暴露給 template 的 reactive 物件 ── */
    const displayState = computed(() => ({
        mode: s.mode,
        nowPlaying: s.nowPlaying,
        liveGrid: s.liveGrid,
        borrowedId: s.borrowedId
    }))

    return {
        startConductor,
        stopConductor,
        displayState,
        currentState,
        startListeningState,
        stopListeningState
    }
}
