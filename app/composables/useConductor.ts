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
import { computed, markRaw, reactive } from 'vue'
import {
    collection, onSnapshot,
    query, limit, orderBy
} from 'firebase/firestore'
import { useNuxtApp } from '#app'
import { useFirestore } from '~/composables/useFirestore'
import type { QueuePendingItem, QueueHistoryItem } from '~/types'

/* ─── Types ─── */

export interface StateChangeInfo {
    source: 'tick' | 'remote'
    /** 'remote' 時：這次被刪掉的便利貼 id（canvas 用來判斷要不要打斷正在跑的動畫） */
    removed?: string[]
}

type NoteItem = QueueHistoryItem | QueuePendingItem

/** moveToHistory 失敗時排進重試清單：下一輪 tick 或恢復連線時重送 */
interface HistoryRetry {
    item: QueuePendingItem
    /** 已經送過幾次 */
    attempts: number
    /** 最早什麼時候重送（Date.now()） */
    nextAt: number
}

export interface ConductorOptions {
    /** 每張便利貼在右邊展示的毫秒數（預設 15000） */
    loopIntervalMs?: number
    /** 左邊網格最大容量（預設 20） */
    historyLimit?: number
    /** FLIP 動畫：在 tick 修改 reactive 資料 **之前** 呼叫（info 同 onAfterStateChange） */
    onBeforeStateChange?: (info: StateChangeInfo) => void
    /** FLIP 動畫：在 tick 修改 reactive 資料 **之後** 呼叫 */
    /**
     * source 是這次改動的來源：
     * - 'tick'：輪播換張。這時從 liveGrid 消失的只會是「超過張數被擠掉」的最舊那張
     * - 'remote'：Firestore 監聽到刪除（後台下架），消失的就是被刪掉的
     */
    onAfterStateChange?: (info: StateChangeInfo) => void
    /**
     * 便利貼的內容被改了（例如後台「刪除個人資料」拿掉署名）。liveGrid 與 nowPlaying 這邊已經就地換好，
     * conductor 管不到的那幾份（展示區正在飛回牆上的、被擠掉還在流出去的）由 canvas 自己換
     */
    onNoteUpdated?: (id: string, note: Record<string, any>) => void
    /**
     * 這張是不是被擠出 liveGrid、還在牆上流出去的途中。後台刪除後補位時不能把它補回來：
     * 它會同時在 liveGrid 與流出去的名單裡，之後再被擠掉一次就重複了
     */
    isRetiring?: (id: string) => boolean
    /** 插播影片 URL（無則略過插播佇列） */
    getInterstitialVideoUrl?: () => string | null
    /** FLIP 結束後開始播放插播影片（canvas 內顯示 video） */
    onInterstitialStart?: () => void
    /**
     * 一輪動畫從頭到尾的毫秒數。這段期間 tick 會延後，插播也不會開始。
     * 實際長度由 canvas 的 ANIM 決定（拿起 + 移動 + 放下），所以由呼叫端傳入；
     * 寫死在這裡的話，改了動畫時間這邊不會跟著改，守衛就會提早解除。
     */
    animationMs?: number
    /**
     * idle 輪播挑便利貼時，這張現在適不適合被借出。canvas 用它避開流到畫面外的便利貼 ——
     * 拿起的那一下要讓人看得到。沒有一張符合時照舊挑，不會因此停擺。
     */
    canBorrow?: (id: string) => boolean
    /** canBorrow 之中更好的選擇（例如展示完還回得去原位的），有就先挑它（其中再挑最久沒展示的） */
    preferBorrow?: (id: string) => boolean
    /**
     * canBorrow 一張都沒有時的退路（例如中心在範圍內就好）。canvas 的範圍只有右邊螢幕，
     * 偶爾剛好每一張都卡在畫面邊緣；沒有這一層就會落到最後的降級，挑到範圍外的
     */
    canBorrowFallback?: (id: string) => boolean
}

interface ConductorState {
    isConductor: boolean
    queuePending: QueuePendingItem[]
    liveGrid: NoteItem[]
    nowPlaying: NoteItem | null
    mode: 'live' | 'idle' | 'waiting'
    borrowedId: string | null
    // internals
    unsubPending: (() => void) | null
    unsubHistory: (() => void) | null
    /** 待播監聽出錯後，隔一段時間重掛的計時器與已連續失敗幾次 */
    pendingResubTimer: ReturnType<typeof setTimeout> | null
    pendingErrorCount: number
    /** 歷史監聽最新一次看到的那幾張（依 playedAt 由新到舊），補位用 */
    latestHistory: QueueHistoryItem[]
    /** 搬到 history 失敗、等著重送的 */
    historyRetries: HistoryRetry[]
    onlineHandler: (() => void) | null
    timer: ReturnType<typeof setTimeout> | null
    animTimer: ReturnType<typeof setTimeout> | null
    isAnimating: boolean
    lastTickTime: number
    completedIds: Set<string>
    /** idle 模式用的播放袋（A: shuffle bag） */
    idleBag: string[]
    /** 最近播放時間（用於冷卻避免短時間重複） */
    lastPlayedAt: Map<string, number>
    // callbacks (stored so tick() can call them)
    onBefore: ((info: StateChangeInfo) => void) | null
    onAfter: ((info: StateChangeInfo) => void) | null
    onNoteUpdated: ((id: string, note: Record<string, any>) => void) | null
    isRetiring: ((id: string) => boolean) | null
    // config
    loopMs: number
    gridMax: number
    /** 一輪動畫的總長度，決定 isAnimating 守衛要撐多久 */
    animationMs: number
    /** 固定間隔插播：待播放的時段鍵（FIFO） */
    interstitialQueue: string[]
    /** 插播播放中：不排程 tick、不接 pending 重排 */
    interstitialBlocking: boolean
    getVideoUrl: (() => string | null) | null
    onInterstitialStart: (() => void) | null
    canBorrow: ((id: string) => boolean) | null
    preferBorrow: ((id: string) => boolean) | null
    canBorrowFallback: ((id: string) => boolean) | null
}

/**
 * 展示完回得去原位的（preferBorrow）可以插隊，但只能插到「比最久沒展示的那張晚展示不到幾輪」的前面。
 * 數字是模擬比較出來的，見 tick 裡挑便利貼的那段
 */
const PREFER_SLACK_TURNS = 4

/**
 * moveToHistory 失敗的重送：最多送幾次、每次間隔多久（10 秒起跳每次加倍，最多 5 分鐘）。
 * 加起來約 25 分鐘，斷線更久就放棄（待播文件還在，重新整理大螢幕後會當成新投稿再播一次）
 */
const HISTORY_RETRY_MAX_ATTEMPTS = 10
const historyRetryDelay = (attempts: number) => Math.min(5 * 60_000, 10_000 * 2 ** (attempts - 1))

/** 監聽出錯後重掛的間隔：5 秒起跳每次加倍，最多 1 分鐘 */
const resubscribeDelay = (errors: number) => Math.min(60_000, 5_000 * 2 ** (errors - 1))

/**
 * 用新資料就地換掉一張便利貼的內容，物件本身不換：canvas 展示區那份與 nowPlaying 是同一個物件，
 * 延後執行的移除也是認物件本身（見 canvas 的 removeDisplayItem），換成新物件就對不上了
 */
export function assignNoteData(target: Record<string, any>, fresh: Record<string, any>) {
    for (const k of Object.keys(target)) if (!(k in fresh)) delete target[k]
    Object.assign(target, fresh)
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
            pendingResubTimer: null,
            pendingErrorCount: 0,
            latestHistory: markRaw([]),
            historyRetries: [],
            onlineHandler: null,
            timer: null,
            animTimer: null,
            isAnimating: false,
            lastTickTime: 0,
            completedIds: new Set(),
            idleBag: [],
            lastPlayedAt: new Map(),
            onBefore: null,
            onAfter: null,
            onNoteUpdated: null,
            isRetiring: null,
            loopMs: 15_000,
            gridMax: 20,
            animationMs: 2_250,
            interstitialQueue: [],
            interstitialBlocking: false,
            getVideoUrl: null,
            onInterstitialStart: null,
            canBorrow: null,
            preferBorrow: null,
            canBorrowFallback: null
        })
    }
    return g[KEY]
}

/* ─── Helper ─── */
const noteId = (n: any): string => n?.id ?? n?.token ?? ''

function clampInt(min: number, val: number, max: number): number {
    return Math.max(min, Math.min(val, max))
}

/**
 * 插播間隔僅使用 **60 的正因數**（分鐘）。
 * 如此 (從 0:00 起算的「分鐘數」) % N === 0 時，每小時觸發在**同一組分鐘刻度**
 *（例如 N=5 永遠是 :00、:05、:10…）；若 N 不是 60 的因數，每小時的觸發分鐘會隨整點偏移。
 */
export const CANVAS_INTERSTITIAL_DIVISORS_OF_60 = [
    1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60
] as const

export const CANVAS_INTERSTITIAL_DEFAULT_MINUTES = 2

/** Firestore `interstitialScheduleEnabled`：僅在為 true 時依時間觸發插播；缺欄位視為 false */
export function parseInterstitialScheduleEnabled(v: unknown): boolean {
    return v === true
}

export function clampInterstitialIntervalMinutes(n: unknown): number {
    const v = Math.floor(Number(n))
    if (!Number.isFinite(v)) return CANVAS_INTERSTITIAL_DEFAULT_MINUTES
    let best: (typeof CANVAS_INTERSTITIAL_DIVISORS_OF_60)[number] = CANVAS_INTERSTITIAL_DIVISORS_OF_60[0]!
    let bestDist = Infinity
    for (const d of CANVAS_INTERSTITIAL_DIVISORS_OF_60) {
        const dist = Math.abs(v - d)
        if (dist < bestDist) {
            bestDist = dist
            best = d
        }
    }
    return best
}

/**
 * 與 canvas 依「從午夜起算分鐘數」對齊的 arm 使用同一套鍵；間隔應為 60 的因數，每小時觸發分鐘才一致。
 * @param intervalMinutes 須為 60 的因數（會經 clampInterstitialIntervalMinutes）
 */
export function getInterstitialSlotKey(d: Date, intervalMinutes: number): string {
    const n = clampInterstitialIntervalMinutes(intervalMinutes)
    const y = d.getFullYear()
    const mo = d.getMonth() + 1
    const da = d.getDate()
    const totalM = d.getHours() * 60 + d.getMinutes()
    const slotIndex = Math.floor(totalM / n)
    return `${y}-${mo}-${da}_${slotIndex}`
}

/** Fisher–Yates shuffle（就地洗牌） */
function shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    return arr
}

/** 移除 bag 中已不存在於 liveGrid 的 id，並去除重複 */
function reconcileBagWithLiveGrid(bag: string[], liveIds: Set<string>): string[] {
    const seen = new Set<string>()
    const next: string[] = []
    for (const id of bag) {
        if (!liveIds.has(id)) continue
        if (seen.has(id)) continue
        seen.add(id)
        next.push(id)
    }
    return next
}

/** 將新加入的 id 插入到 bag 的前段，提升「新貼」曝光速度 */
function insertIdsNearFront(
    bag: string[],
    idsToInsert: string[],
    {
        frontWindow,
        prevPlayingId
    }: {
        frontWindow: number
        prevPlayingId: string | null
    }
): string[] {
    const existing = new Set(bag)
    const out = bag.slice()
    const k = Math.max(1, Math.min(frontWindow, out.length + 1))

    for (const id of idsToInsert) {
        if (!id) continue
        if (existing.has(id)) continue
        existing.add(id)

        // 插入位置：0 ~ k-1 隨機，但避免直接插成「下一張 == 上一張」
        let idx = Math.floor(Math.random() * k)
        if (idx === 0 && prevPlayingId && id === prevPlayingId) {
            idx = Math.min(1, out.length)
        }
        out.splice(idx, 0, id)
    }
    return out
}

/**
 * A + C：依 liveGrid 產生一輪播放袋（洗牌），並避免第一張剛好等於上一張（交界去重）。
 * - excludeIds：這一輪不該出現的 id（例如剛推入的 justPushed 或上一張）
 * - cooldownMs：冷卻時間內不選（若全被排除，會在選取時降級）
 */
function buildIdleBag(
    liveIds: string[],
    {
        excludeIds,
        prevPlayingId,
        cooldownMs,
        lastPlayedAt
    }: {
        excludeIds: Set<string>
        prevPlayingId: string | null
        cooldownMs: number
        lastPlayedAt: Map<string, number>
    }
): string[] {
    const now = Date.now()
    const base = liveIds.filter(id => {
        if (excludeIds.has(id)) return false
        const t = lastPlayedAt.get(id)
        if (!t) return true
        return now - t >= cooldownMs
    })

    // 若冷卻把全部排掉，先退回到只排除 excludeIds（仍保留 C 的效果在後面做）
    const pool = base.length > 0 ? base : liveIds.filter(id => !excludeIds.has(id))
    const bag = shuffleInPlace(pool.slice())

    // C：避免交界連續重複（上一張 == 下一輪第一張）
    if (prevPlayingId && bag.length >= 2 && bag[0] === prevPlayingId) {
        ;[bag[0], bag[1]] = [bag[1]!, bag[0]!]
    }
    return bag
}

/* ─── Composable ─── */

export function useConductor() {
    const { $firestore } = useNuxtApp()
    const db = $firestore as any
    const cols = useCollections()
    const { moveToHistory } = useFirestore()
    const s = getSingleton()

    /* ── startConductor ── */
    const startConductor = async (opts?: ConductorOptions) => {
        if (s.isConductor) return
        s.isConductor = true

        // 套用設定
        if (opts?.loopIntervalMs) s.loopMs = opts.loopIntervalMs
        if (opts?.historyLimit) s.gridMax = opts.historyLimit
        if (opts?.animationMs) s.animationMs = opts.animationMs
        s.onBefore = opts?.onBeforeStateChange ?? null
        s.onAfter = opts?.onAfterStateChange ?? null
        s.onNoteUpdated = opts?.onNoteUpdated ?? null
        s.isRetiring = opts?.isRetiring ?? null
        s.getVideoUrl = opts?.getInterstitialVideoUrl ?? null
        s.onInterstitialStart = opts?.onInterstitialStart ?? null
        s.canBorrow = opts?.canBorrow ?? null
        s.preferBorrow = opts?.preferBorrow ?? null
        s.canBorrowFallback = opts?.canBorrowFallback ?? null

        console.log(`[Conductor] start  gridMax=${s.gridMax}  loop=${s.loopMs}ms`)

        // 1) 從 queue_history 載入最多 gridMax 張並監聽遠端刪除
        const q = query(
            collection(db, cols.queueHistory),
            orderBy('playedAt', 'desc'),
            limit(s.gridMax)
        )

        await new Promise<void>((resolve) => {
            let isFirst = true
            s.unsubHistory = onSnapshot(
                q,
                (snapshot) => {
                    s.latestHistory = markRaw(snapshot.docs.map(
                        d => ({ id: d.id, ...d.data() } as QueueHistoryItem)
                    ))
                    if (isFirst) {
                        isFirst = false
                        // 初次載入
                        s.liveGrid = s.latestHistory.map(n => ({ ...n }))
                        // 初次載入後同步 idle bag（避免第一次 idle 隨機重複）
                        const liveIds = s.liveGrid.map(n => noteId(n)).filter(Boolean)
                        const cooldownTurns = clampInt(3, Math.floor(s.gridMax * 0.5), 8)
                        const cooldownMs = cooldownTurns * s.loopMs
                        s.idleBag = buildIdleBag(liveIds, {
                            excludeIds: new Set(),
                            prevPlayingId: null,
                            cooldownMs,
                            lastPlayedAt: s.lastPlayedAt
                        })
                        resolve()
                        return
                    }

                    // 後續更新：只處理被遠端刪除或擠出的項目，避免打斷本地已 unshift() 正在執行的 FLIP 動畫
                    const changes = snapshot.docChanges()

                    // 內容被改了（後台「刪除個人資料」會拿掉署名）：只換資料，不動牆、不重播動畫
                    for (const change of changes) {
                        if (change.type === 'modified') refreshNote(change.doc.id, change.doc.data())
                    }

                    // 只看「本地真的還有」的那些。新投稿展示完時，tick 已經先在本地把它放進牆、
                    // 擠掉最舊那張，接著 moveToHistory 寫入；寫入完成後這裡會收到最舊那張的 removed。
                    // 那張本地早就不在了，若照樣呼叫 onBefore，會把剛開始的換張動畫直接跳到終點
                    // （歷史筆數超過牆面張數後，每次新投稿換張都會這樣）
                    const liveIds = new Set(s.liveGrid.map(n => noteId(n)))
                    const playingId = s.nowPlaying ? noteId(s.nowPlaying) : null
                    const removed = changes
                        .filter(change =>
                            change.type === 'removed' &&
                            (liveIds.has(change.doc.id) || change.doc.id === playingId)
                        )
                        .map(change => change.doc.id)

                    if (removed.length) removeNotes(removed)
                },
                (error) => {
                    console.error('[Conductor] history listener error', error)
                    if (isFirst) resolve() // 避免卡死
                }
            )
        })

        // 2) 即時監聽 queue_pending
        subscribePending()

        // 3) 恢復連線時馬上重送搬移失敗的（不等退避時間）
        if (typeof window !== 'undefined') {
            s.onlineHandler = () => flushHistoryRetries(true)
            window.addEventListener('online', s.onlineHandler)
        }

        // 4) 啟動第一次 tick
        tick()
    }

    const subscribePending = () => {
        const pq = query(
            collection(db, cols.queuePending),
            orderBy('timestamp', 'asc')
        )
        s.unsubPending = onSnapshot(pq, snap => {
            s.pendingErrorCount = 0
            const changes = snap.docChanges()
            const playingId = s.nowPlaying ? noteId(s.nowPlaying) : null
            const nowPlayingRemoved = !!playingId &&
                changes.some(change => change.type === 'removed' && change.doc.id === playingId)
            const info: StateChangeInfo = { source: 'remote', removed: playingId ? [playingId] : [] }

            if (nowPlayingRemoved) {
                s.onBefore?.(info)
            }

            s.queuePending = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as QueuePendingItem))
                .filter(q => !s.completedIds.has(noteId(q)))

            // 內容被改了（後台「刪除個人資料」會拿掉署名）：展示中的、剛展示完還在搬去 history 的都要換
            for (const change of changes) {
                if (change.type === 'modified') refreshNote(change.doc.id, change.doc.data())
            }

            if (nowPlayingRemoved && playingId) {
                s.nowPlaying = null
                s.mode = 'waiting'
                s.lastPlayedAt.delete(playingId)
                s.completedIds.delete(playingId)
                if (s.timer) clearTimeout(s.timer)
                tick(true, true)
                s.onAfter?.(info)
                return
            }

            // 如果在 idle 模式下偵測到新的 pending，重新排程 tick
            // 讓當前展示結束後立刻進入 live push，不用多等一個完整週期
            if (!s.interstitialBlocking && s.mode === 'idle' && s.queuePending.length > 0) {
                const elapsed = Date.now() - s.lastTickTime
                const remaining = Math.max(0, s.loopMs - elapsed)
                scheduleTick(remaining)
            }
        }, (error) => {
            // 監聽出錯（例如規則改了）之後就不會再收到任何東西，新投稿從此上不了大螢幕：隔一段時間重掛。
            // 重掛的第一筆是全部的待播，跟一開始掛上時一樣處理
            console.error('[Conductor] pending listener error', error)
            s.unsubPending = null
            if (!s.isConductor) return
            if (s.pendingResubTimer) clearTimeout(s.pendingResubTimer)
            s.pendingResubTimer = setTimeout(() => {
                s.pendingResubTimer = null
                if (s.isConductor && !s.unsubPending) subscribePending()
            }, resubscribeDelay(++s.pendingErrorCount))
        })
    }

    /**
     * 遠端刪除（後台下架，或新投稿展示完、搬去 history 之前就被刪了）：從 liveGrid 拿掉，
     * 展示中的那張被刪就馬上換下一張。空出來的位置用歷史監聽最新看到的補上
     */
    const removeNotes = (ids: string[]) => {
        const gone = new Set(ids)
        const playingId = s.nowPlaying ? noteId(s.nowPlaying) : null
        const nowPlayingRemoved = !!playingId && gone.has(playingId)
        const info: StateChangeInfo = { source: 'remote', removed: ids }

        // 觸發動畫 hook (擷取當前狀態)
        s.onBefore?.(info)

        const beforeLen = s.liveGrid.length
        s.liveGrid = s.liveGrid.filter(n => !gone.has(noteId(n)))
        // 刪掉的不會再回來，順手清掉它的紀錄
        for (const id of ids) {
            s.lastPlayedAt.delete(id)
            s.completedIds.delete(id)
        }

        // 補上新拉到的歷史資料。還在牆上流出去的（剛被擠掉、history 那邊還沒跟上）不補回來，
        // 不然它會同時在 liveGrid 與流出去的名單裡（見 isRetiring）
        if (s.liveGrid.length < beforeLen && s.liveGrid.length < s.gridMax) {
            const existingIds = new Set(s.liveGrid.map(n => noteId(n)))
            for (const n of s.latestHistory) {
                if (s.liveGrid.length >= s.gridMax) break
                const id = noteId(n)
                if (!id || existingIds.has(id) || gone.has(id) || s.isRetiring?.(id)) continue
                existingIds.add(id)
                s.liveGrid.push({ ...n })
            }
        }

        // 若被刪除的剛好是正在展示的歷史便利貼，強制換首
        if (nowPlayingRemoved) {
            s.nowPlaying = null
            s.borrowedId = null
            if (s.timer) clearTimeout(s.timer)
            // 先把 bag 同步到目前 liveGrid，避免抽到已被移除的 id
            const liveIdSet = new Set(s.liveGrid.map(n => noteId(n)))
            s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)
            tick(true, true)
        }

        // 每次 history 有移除/補齊後都同步 bag（但不強制重洗，避免打斷節奏）
        const liveIdSet = new Set(s.liveGrid.map(n => noteId(n)))
        s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)

        // 觸發動畫 hook (執行 Flip 動畫)
        s.onAfter?.(info)
    }

    /** 便利貼的內容被改了：liveGrid、nowPlaying 裡的那份就地換掉，其他的交給 canvas（onNoteUpdated） */
    const refreshNote = (id: string, data: Record<string, any>) => {
        const fresh = { id, ...data }
        for (const n of s.liveGrid) if (noteId(n) === id) assignNoteData(n, fresh)
        if (s.nowPlaying && noteId(s.nowPlaying) === id) assignNoteData(s.nowPlaying, fresh)
        s.onNoteUpdated?.(id, fresh)
    }

    /**
     * 剛展示完的新投稿搬去 history。失敗就排進重試清單；搬的時候發現待播文件已經不在了
     * （換張那一刻被後台刪掉），本地已經把它放進牆裡，比照遠端刪除拿掉
     */
    const sendToHistory = (item: QueuePendingItem, attempts = 0) => {
        const id = noteId(item)
        moveToHistory(item)
            .then((result) => {
                if (result !== 'pending-missing' || !s.isConductor) return
                const local = s.liveGrid.some(n => noteId(n) === id) ||
                    (!!s.nowPlaying && noteId(s.nowPlaying) === id)
                if (!local) return
                console.warn('[Conductor] 展示完要搬去 history 時已被刪除，從牆上拿掉', id)
                removeNotes([id])
            })
            .catch((e) => {
                const tries = attempts + 1
                // 權限錯誤重送也沒用（只會一直失敗），只留紀錄。不在大螢幕上顯示任何字：顧客看得到
                if ((e as { code?: string } | null)?.code === 'permission-denied') {
                    console.error('[Conductor] moveToHistory 權限不足，不重送', id, e)
                    return
                }
                if (tries >= HISTORY_RETRY_MAX_ATTEMPTS) {
                    console.error(`[Conductor] moveToHistory 失敗 ${tries} 次，放棄`, id, e)
                    return
                }
                if (s.historyRetries.some(r => noteId(r.item) === id)) return
                console.warn(`[Conductor] moveToHistory 失敗（第 ${tries} 次），稍後重送`, id, e)
                s.historyRetries.push({ item, attempts: tries, nextAt: Date.now() + historyRetryDelay(tries) })
            })
    }

    /** 重送到時間的搬移；force（恢復連線時）不管退避時間全部重送 */
    const flushHistoryRetries = (force = false) => {
        if (!s.historyRetries.length) return
        const now = Date.now()
        const due = s.historyRetries.filter(r => force || r.nextAt <= now)
        if (!due.length) return
        s.historyRetries = s.historyRetries.filter(r => !due.includes(r))
        for (const r of due) sendToHistory(r.item, r.attempts)
    }

    /* ── stopConductor ── */
    const stopConductor = () => {
        s.isConductor = false
        s.unsubPending?.()
        s.unsubPending = null
        s.unsubHistory?.()
        s.unsubHistory = null
        if (s.pendingResubTimer) { clearTimeout(s.pendingResubTimer); s.pendingResubTimer = null }
        s.pendingErrorCount = 0
        if (s.onlineHandler && typeof window !== 'undefined') window.removeEventListener('online', s.onlineHandler)
        s.onlineHandler = null
        if (s.timer) { clearTimeout(s.timer); s.timer = null }
        if (s.animTimer) { clearTimeout(s.animTimer); s.animTimer = null }
        s.isAnimating = false
        s.onBefore = null
        s.onAfter = null
        s.onNoteUpdated = null
        s.isRetiring = null
        s.idleBag = []
        s.lastPlayedAt.clear()
        s.interstitialQueue = []
        s.interstitialBlocking = false
        s.getVideoUrl = null
        s.onInterstitialStart = null
        s.canBorrow = null
        s.preferBorrow = null
        s.canBorrowFallback = null
    }

    /* ── tick：每 N 秒執行一次 ── */
    const tick = (skipHooks = false, force = false) => {
        if (s.interstitialBlocking && !force) return

        // 如果正在進行動畫（且非強制中斷刪除），則進入排隊等待
        if (s.isAnimating && !force) {
            scheduleTick(100)
            return
        }

        s.lastTickTime = Date.now()

        // 上次搬去 history 失敗、到了重送時間的
        flushHistoryRetries()

        // ▸ Phase 1: 呼叫 BEFORE hook（canvas 在此擷取 FLIP state）
        if (!skipHooks) s.onBefore?.({ source: 'tick' })

        // 記住上一回合，準備收尾
        const prevMode = s.mode
        const prevPlaying = s.nowPlaying ? { ...s.nowPlaying } : null
        const prevPlayingId = prevPlaying ? noteId(prevPlaying) : null

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
                // live push 播放過也要記錄，避免剛播完馬上又被 idle 借出
                if (justPushedId) s.lastPlayedAt.set(justPushedId, Date.now())

                // 新加入（剛推入 grid）的項目：插入 bag 前段，讓它在冷卻結束後能較快出現
                if (justPushedId) {
                    const liveIdSet = new Set(s.liveGrid.map(n => noteId(n)))
                    s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)
                    s.idleBag = insertIdsNearFront(s.idleBag, [justPushedId], {
                        frontWindow: 4,
                        prevPlayingId
                    })
                }
                // 寫入 Firestore（失敗會排進重試清單）
                try {
                    sendToHistory(prevPlaying as QueuePendingItem)
                } catch (e) { console.error(e) }
            }
            // idle 收尾：borrowedId 已清空，note 本來就在 grid 裡，不需搬動
        }

        const videoUrl = s.getVideoUrl?.() ?? null
        const interstitialThisRound =
            !skipHooks && !force && s.interstitialQueue.length > 0 && !!videoUrl

        // ▸ Phase 3: 決定下一回合（或定時插播：本張結束後不選下一張）
        if (interstitialThisRound) {
            s.interstitialQueue.shift()
            s.mode = 'waiting'
            s.nowPlaying = null
        } else {
            const next = s.queuePending.find(
                q => !s.completedIds.has(noteId(q))
            )

            if (next) {
                // ─ 狀態一：Live Push ─
                s.mode = 'live'
                s.nowPlaying = { ...next }
                s.completedIds.add(noteId(next))
                // 記錄播放時間（雖然 pending 理論上不會重複，但可以防止極端狀況）
                const id = noteId(next)
                if (id) s.lastPlayedAt.set(id, Date.now())
            } else if (s.liveGrid.length > 0) {
                // ─ 狀態二：Idle Borrow（A: shuffle bag + C: 交界去重 + 30s 冷卻） ─
                s.mode = 'idle'
                // 冷卻建議用「回合數」定義：避免 displaySec 改變時體感跑掉
                // cooldownTurns: 至少 3 回合，目標約半輪，上限 8 回合
                const cooldownTurns = clampInt(3, Math.floor(s.gridMax * 0.5), 8)
                const COOLDOWN_MS = cooldownTurns * s.loopMs

                // 1) 先把 bag 同步到 liveGrid（處理新增/移除）
                const liveIds = s.liveGrid.map(n => noteId(n)).filter(Boolean)
                const liveIdSet = new Set(liveIds)
                s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)

                // 2) 本回合排除：剛推入（避免剛播完馬上借出）與上一張（避免連播）
                const excludeIds = new Set<string>()
                if (justPushedId) excludeIds.add(justPushedId)
                if (prevPlayingId) excludeIds.add(prevPlayingId)

                // 3) 若 bag 空了或下一個候選不合冷卻/排除條件 → 重建新一輪 bag
                const shouldRebuild = () => {
                    if (s.idleBag.length === 0) return true
                    const nextId = s.idleBag[0]!
                    if (excludeIds.has(nextId)) return true
                    const t = s.lastPlayedAt.get(nextId)
                    if (t && Date.now() - t < COOLDOWN_MS) return true
                    return false
                }

                if (shouldRebuild()) {
                    // 新貼加入時：若不在 bag 裡，會在這次重建自然納入；若你想更快出現，可在後面加「插入前段」策略
                    s.idleBag = buildIdleBag(liveIds, {
                        excludeIds,
                        prevPlayingId,
                        cooldownMs: COOLDOWN_MS,
                        lastPlayedAt: s.lastPlayedAt
                    })
                }

                const isCooling = (id: string) => {
                    const t = s.lastPlayedAt.get(id)
                    return !!t && Date.now() - t < COOLDOWN_MS
                }

                // 4) 有 canBorrow（借出範圍，例如大螢幕只挑右邊螢幕上的）時：
                //    範圍內同時只有幾張，bag 排前面的多半剛好不在範圍內，照 bag 找會一直落到下面的降級，
                //    反覆挑到同幾張（實測 300 秒內有一張被挑 17 次、平均才 3 次）。
                //    改成範圍內挑「最久沒展示」的（沒展示過的最優先），每張輪到的機會才平均。
                //    展示完回得去原位的（preferBorrow）可以插隊，但只能插「比最久沒展示的那張
                //    晚展示不到 PREFER_SLACK_TURNS 輪」的：回不去原位，原位就變成空洞一路流走，
                //    它自己還得擠進別的地方；可是不限制插隊的話，同一張會一直被插隊。
                //    模擬一小時（直排、每分鐘一張新投稿，五種初始排法平均）：
                //    不插隊最久 747 秒沒輪到、50% 回得去原位；隨便插隊 867 秒、63%；限 4 輪 699 秒、58%。
                //    再照 bag 的順序。
                //    借出的範圍比冷卻重要：範圍內全都還在冷卻，也是挑最久沒展示的那張，不越界
                let pickedId: string | null = null
                if (s.canBorrow) {
                    const canBorrow = s.canBorrow
                    const prefer = s.preferBorrow
                    const bagOrder = new Map(s.idleBag.map((id, i) => [id, i]))
                    const lastAt = (id: string) => s.lastPlayedAt.get(id) ?? 0
                    const preferRank = (id: string) => (prefer?.(id) ? 0 : 1)
                    const inRangeOf = (ok: (id: string) => boolean) =>
                        liveIds.filter(id => !excludeIds.has(id) && ok(id))
                    let inRange = inRangeOf(canBorrow)
                    // 範圍內一張都借不到（右邊螢幕上的剛好都卡在畫面上下緣），放寬再找一次。
                    // 實測 33 輪有 5 輪會這樣；不放寬就落到下面的降級，挑到範圍外的（從左邊螢幕、畫面頂端外拿起）
                    if (!inRange.length && s.canBorrowFallback) inRange = inRangeOf(s.canBorrowFallback)
                    const oldest = Math.min(...inRange.map(lastAt))
                    const slackMs = PREFER_SLACK_TURNS * s.loopMs
                    /** 0 = 跟最久沒展示的那張差不多久，回得去原位的可以插到它前面 */
                    const tier = (id: string) => (lastAt(id) <= oldest + slackMs ? 0 : 1)
                    const candidates = inRange.sort((a, b) =>
                        tier(a) - tier(b) ||
                        (tier(a) === 0 ? preferRank(a) - preferRank(b) : 0) ||
                        lastAt(a) - lastAt(b) ||
                        (bagOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (bagOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
                    )
                    pickedId = candidates[0] ?? null
                    if (pickedId) {
                        const idx = s.idleBag.indexOf(pickedId)
                        if (idx >= 0) s.idleBag.splice(idx, 1)
                    }
                }

                // 沒有 canBorrow 時照原本的規則：如果因為冷卻導致 bag 內前幾張都不行，最多跳過幾張。
                // 有 canBorrow 卻在 bag 裡找不到，就直接到下面的降級（它也會優先挑適合借出的），
                // 不走這段 —— 這段不看 canBorrow，會挑到範圍外的
                if (!pickedId && !s.canBorrow) {
                    const MAX_SKIPS = Math.min(8, s.idleBag.length)
                    for (let i = 0; i < MAX_SKIPS; i++) {
                        const id = s.idleBag.shift()
                        if (!id) break
                        if (excludeIds.has(id)) continue
                        if (isCooling(id)) continue
                        pickedId = id
                        break
                    }
                }

                // 5) 若仍挑不到（資料量太小/全在冷卻內），降級：只避免連播上一張，能借的優先，
                //    同一層裡挑最久沒展示的（沒展示過的最優先）。
                //    照 liveGrid 的順序挑的話一律是最新那張：張數少時右邊螢幕常常一張都借不到
                //    （3 張時約一半的輪次），模擬半小時是 50／46／24 次，最舊那張只輪到一半。
                //    只剩上一張時可以連播，但剛推進牆的（live 剛展示完）不行：它還在飛回牆上，
                //    馬上又借出去的話展示區不會換，牆上卻多出一份（牆上本來沒有便利貼時的第一張投稿）
                if (!pickedId) {
                    const lastAt = (id: string) => s.lastPlayedAt.get(id) ?? 0
                    const fallback = liveIds.filter(id => id !== prevPlayingId)
                    const pool = (fallback.length ? fallback : liveIds.filter(id => id !== justPushedId))
                        .sort((a, b) => lastAt(a) - lastAt(b))
                    pickedId = pool.find(id => s.canBorrow?.(id)) ??
                        pool.find(id => s.canBorrowFallback?.(id)) ??
                        pool[0] ?? null
                }

                const borrowed = pickedId ? s.liveGrid.find(n => noteId(n) === pickedId) : null
                if (borrowed) {
                    s.nowPlaying = { ...borrowed }
                    s.borrowedId = noteId(borrowed)
                    const id = noteId(borrowed)
                    if (id) s.lastPlayedAt.set(id, Date.now())
                } else {
                    // 牆上只有剛展示完的那一張（見 5）：這一輪不展示，讓它先回到牆上，下一輪再借
                    s.mode = 'waiting'
                    s.nowPlaying = null
                }
            } else {
                s.mode = 'waiting'
                s.nowPlaying = null
            }
        }

        // ▸ Phase 5: 呼叫 AFTER hook（canvas 在此執行 Flip.from）
        if (!skipHooks) {
            s.onAfter?.({ source: 'tick' })
            s.isAnimating = true
            if (s.animTimer) clearTimeout(s.animTimer)
            s.animTimer = setTimeout(() => {
                s.isAnimating = false
                if (!interstitialThisRound) return
                // 沒有人接手播放的話，插播的封鎖永遠不會解除，輪播就停在這裡
                if (s.onInterstitialStart) s.onInterstitialStart()
                else finishInterstitial()
            }, s.animationMs) // 整輪動畫跑完才解除守衛（拿起 + 移動 + 放下）
        }

        if (interstitialThisRound) {
            if (s.timer) {
                clearTimeout(s.timer)
                s.timer = null
            }
            s.interstitialBlocking = true
            return
        }

        // ▸ Phase 6: 自動排程下一次回合
        scheduleTick(s.loopMs)
    }

    /** 排程下一次 tick（使用 setTimeout 以便重新排程） */
    const scheduleTick = (delayMs: number) => {
        if (s.interstitialBlocking) return
        if (s.timer) clearTimeout(s.timer)
        s.timer = setTimeout(() => {
            tick()
        }, delayMs)
    }

    const armInterstitialSlot = (slotKey: string) => {
        if (!slotKey) return
        // 沒有影片就不排：排著的時段會一直累積，等後台補上影片時就一次接一次連播
        if (!s.getVideoUrl?.()) return
        // 上一次插播還沒播完又到了下一個時段（影片比間隔長）：不排，不然一播完馬上又播一次
        if (s.interstitialBlocking) return
        // 最多只留一筆（新的取代舊的）：還沒輪到播就又到了下一個時段，播一次就好
        s.interstitialQueue.splice(0, s.interstitialQueue.length, slotKey)
    }

    /** 關閉依時間插播時清空佇列，避免關閉後仍播放已排的插播 */
    const clearInterstitialArmQueue = () => {
        s.interstitialQueue.length = 0
    }

    const finishInterstitial = () => {
        // 只收一次：影片的 ended、error、逾時保護可能先後都來，多收一次就會多跑一輪 tick（換張跳一下）
        if (!s.interstitialBlocking) return
        s.interstitialBlocking = false
        tick()
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
        armInterstitialSlot,
        clearInterstitialArmQueue,
        finishInterstitial
    }
}
