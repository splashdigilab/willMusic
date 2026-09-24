/**
 * 投稿配額：每人每 N 分鐘 1 張、每天 M 張（預設 5 分鐘／3 張，後台可調）。
 *
 * 取代原本寫在 editor.vue 的 localStorage 冷卻——那個清一下瀏覽器資料就沒了。
 * 有了 LINE 身分之後，用量可以綁在人身上而不是綁在裝置上。
 *
 * ## 為什麼是「預約制」
 *
 * 直覺的做法是送出後再累加計數、下次送出前檢查。那擋不住人：計數是前端寫的，
 * 跳過那次寫入計數就永遠不會前進，而規則沒辦法要求「你必須同時也寫另一份文件」。
 *
 * 所以順序反過來——先 `reserve()` 寫下預約（規則在這一步檢查冷卻與每日上限），
 * 再建立便利貼（規則要求存在一張指名該 doc ID 的新鮮預約）。跳過預約就建不了。
 *
 * `check()` 只是體驗用的：讓使用者在辛苦畫完之前就知道自己已經沒額度，
 * 而不是按了送出才被拒絕。真正的強制在規則那一層。
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { DEFAULT_RATE_LIMIT, type RateLimitConfig, type UserQuota } from '~/types'
import { SYSTEM_COLLECTION } from '~/utils/collections'

/** 台灣與 UTC 的時差。每日額度要在台灣的午夜重置，不是 UTC 的 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * 台灣當地的日期鍵。
 *
 * **算法必須與 firestore.rules 的 `taipeiDateKey()` 完全一致**，包括「不補零」
 * 這件事（規則的 `string(month())` 給的是 "9" 不是 "09"）。不一致的話規則會
 * 因為 submitDate 對不上而拒絕寫入，而且錯誤訊息完全看不出原因。
 */
export const taipeiDateKey = (now: number = Date.now()): string => {
  const local = new Date(now + TAIPEI_OFFSET_MS)
  return `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}-${local.getUTCDate()}`
}

export type QuotaBlockReason = 'cooldown' | 'daily'

export interface QuotaCheck {
  allowed: boolean
  reason?: QuotaBlockReason
  /** reason === 'cooldown' 時，還要等幾毫秒 */
  retryAfterMs?: number
  /** reason === 'daily' 時，上限是幾張 */
  dailyLimit?: number
}

export const useSubmissionQuota = () => {
  const { $firestore, $auth } = useNuxtApp() as any
  const cols = useCollections()

  const quotaRef = () => {
    const uid = $auth?.currentUser?.uid
    return uid ? doc($firestore, cols.userQuota, uid) : null
  }

  const loadConfig = async (): Promise<RateLimitConfig> => {
    try {
      const snap = await getDoc(doc($firestore, SYSTEM_COLLECTION, 'editor_rate_limit'))
      if (!snap.exists()) return DEFAULT_RATE_LIMIT
      const data = snap.data() as Partial<RateLimitConfig>
      return {
        // 與規則一致：文件在、但欄位缺或型別不對時退回預設值，
        // 而不是當成「沒有限制」
        enabled: data.enabled !== false,
        cooldownMinutes: Number.isFinite(data.cooldownMinutes)
          ? Number(data.cooldownMinutes)
          : DEFAULT_RATE_LIMIT.cooldownMinutes,
        dailyLimit: Number.isFinite(data.dailyLimit)
          ? Number(data.dailyLimit)
          : DEFAULT_RATE_LIMIT.dailyLimit
      }
    } catch (e) {
      console.warn('[quota] 讀取頻率設定失敗，沿用預設值', e)
      return DEFAULT_RATE_LIMIT
    }
  }

  const loadQuota = async (): Promise<UserQuota | null> => {
    const ref = quotaRef()
    if (!ref) return null
    try {
      const snap = await getDoc(ref)
      return snap.exists() ? (snap.data() as UserQuota) : null
    } catch (e) {
      console.warn('[quota] 讀取用量失敗', e)
      return null
    }
  }

  /**
   * 送出前的體驗性檢查。讀不到資料時一律放行——真正的關卡在規則，
   * 這裡誤擋只會讓使用者莫名其妙送不出去。
   *
   * @param noteId 這次要送的 doc ID。與上次預約相同代表是「同一張的重試」，
   *               不吃額度也不受冷卻限制（規則的判斷方式相同）。
   */
  const check = async (noteId: string): Promise<QuotaCheck> => {
    const [config, quota] = await Promise.all([loadConfig(), loadQuota()])
    if (!config.enabled || !quota) return { allowed: true }

    if (quota.pendingNoteId === noteId) return { allowed: true }

    const today = taipeiDateKey()
    const usedToday = quota.submitDate === today ? (quota.submitCount ?? 0) : 0

    if (usedToday >= config.dailyLimit) {
      return { allowed: false, reason: 'daily', dailyLimit: config.dailyLimit }
    }

    const lastMs = (quota.lastSubmitAt as any)?.toMillis?.()
    if (typeof lastMs === 'number') {
      const readyAt = lastMs + config.cooldownMinutes * 60 * 1000
      if (Date.now() < readyAt) {
        return { allowed: false, reason: 'cooldown', retryAfterMs: readyAt - Date.now() }
      }
    }

    return { allowed: true }
  }

  /**
   * 寫下預約。**必須在建立便利貼之前呼叫**，否則規則會擋下 create。
   *
   * 被規則拒絕時丟出 'QUOTA_EXCEEDED'，讓呼叫端與其他 permission-denied
   * 分得開——同樣是權限錯誤，但要顯示完全不同的訊息。
   */
  const reserve = async (noteId: string): Promise<void> => {
    const ref = quotaRef()
    if (!ref) throw new Error('NOT_LOGGED_IN')

    const quota = await loadQuota()
    const today = taipeiDateKey()
    const usedToday = quota?.submitDate === today ? (quota.submitCount ?? 0) : 0
    const isRetry = !!quota && quota.pendingNoteId === noteId

    // 這幾個值的算法要與 firestore.rules 的 canWriteQuota 對齊，
    // 算錯的話規則會拒絕，而且看起來像是「沒有權限」
    const submitCount = isRetry
      ? (usedToday === 0 ? 1 : usedToday)
      : usedToday + 1

    try {
      await setDoc(ref, {
        lastSubmitAt: serverTimestamp(),
        submitDate: today,
        submitCount,
        pendingNoteId: noteId
      })
    } catch (error: any) {
      const denied =
        error?.code === 'permission-denied' ||
        String(error?.message || '').includes('Missing or insufficient permissions')
      if (denied) throw new Error('QUOTA_EXCEEDED')
      throw error
    }
  }

  return { check, reserve, loadConfig, loadQuota, taipeiDateKey }
}
