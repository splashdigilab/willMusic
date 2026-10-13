/**
 * 「現在能不能送、還剩幾張、還要等多久」的顯示狀態，附一個每秒跳的倒數。
 *
 * 頭像小卡、活動規範頁、送出確認畫面、「我的便利貼」頁都用這一份，
 * 同一件事在四個地方講法一致。這裡全部是顯示用 —— 真正的關卡在
 * confirmSubmit 的檢查與 firestore.rules。
 */
import { computed, onScopeDispose, ref } from 'vue'
import type { QuotaUsage } from '~/composables/useSubmissionQuota'

export type QuotaKind =
  /** 還沒讀、或正在讀 */
  | 'loading'
  /** 被停權 */
  | 'banned'
  /** 後台關掉了頻率限制，或讀不到用量：不顯示張數，不要猜 */
  | 'unlimited'
  /** 今天的額度用完了 */
  | 'exhausted'
  /** 還在冷卻 */
  | 'cooldown'
  /** 現在就能送 */
  | 'ready'

/**
 * 毫秒 → m:ss。超過一小時的冷卻不會出現（後台只能設分鐘），不處理。
 * m:ss 各語言都看得懂，所以不翻譯；呼叫端把它帶進各自翻譯好的句子裡。
 */
export const formatWait = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export const useQuotaStatus = () => {
  const { loadUsage } = useSubmissionQuota()
  const { isSelfBanned } = useBannedUsers()
  // 三個呼叫端（頭像小卡、編輯器、我的便利貼）都在 setup 裡呼叫，這裡拿得到 Nuxt 的 context
  const { t } = useI18n()

  const loading = ref(false)
  const loaded = ref(false)
  const usage = ref<QuotaUsage | null>(null)
  const banned = ref(false)
  /** 可以送下一張的時間點（epoch ms）。倒數用它跟 now 相減，不必每秒重讀 */
  const readyAt = ref(0)
  const now = ref(Date.now())

  let timer: ReturnType<typeof setInterval> | null = null
  const stopTicking = () => {
    if (timer) clearInterval(timer)
    timer = null
  }
  // 只在冷卻中才跳，倒數到 0 就停
  const startTicking = () => {
    stopTicking()
    if (!import.meta.client || readyAt.value <= Date.now()) return
    timer = setInterval(() => {
      now.value = Date.now()
      if (now.value >= readyAt.value) stopTicking()
    }, 1000)
  }
  onScopeDispose(stopTicking)

  let request = 0

  /**
   * @param noteId 送出確認畫面帶目前的 submissionId：同一張的重試不吃額度、
   *               不受冷卻限制（跟規則的判斷一致）。其他地方不帶。
   */
  const load = async (noteId?: string) => {
    const current = ++request
    loading.value = true
    const [u, b] = await Promise.all([loadUsage(noteId), isSelfBanned()])
    if (current !== request) return
    usage.value = u
    banned.value = b
    now.value = Date.now()
    readyAt.value = u ? now.value + u.retryAfterMs : 0
    loading.value = false
    loaded.value = true
    startTicking()
  }

  /** 收起來時呼叫：停掉倒數、丟掉還在路上的結果 */
  const reset = () => {
    request++
    stopTicking()
    loading.value = false
    loaded.value = false
    usage.value = null
    banned.value = false
  }

  const remaining = computed(() =>
    usage.value ? Math.max(0, usage.value.dailyLimit - usage.value.usedToday) : null
  )
  const waitMs = computed(() => Math.max(0, readyAt.value - now.value))
  const waitText = computed(() => formatWait(waitMs.value))

  const kind = computed<QuotaKind>(() => {
    if (!loaded.value) return 'loading'
    if (banned.value) return 'banned'
    const u = usage.value
    if (!u) return 'unlimited'
    // 用 nth 判斷而不是 remaining：同一張的重試已經算在用量裡，不算超額
    if (u.nth > u.dailyLimit) return 'exhausted'
    if (waitMs.value > 0) return 'cooldown'
    return 'ready'
  })

  /** 送不出去的狀態，畫面上用警示色 */
  const isBlocked = computed(() => ['banned', 'exhausted', 'cooldown'].includes(kind.value))

  /**
   * 一句話的摘要。unlimited 與 loading 回 ''，由各處自己決定要不要顯示別的。
   * 在 computed 裡讀 t：切換語言時跟著換。
   * exhausted／cooldown／ready 一定有 usage，`?? 0` 只是給型別看的
   */
  const summary = computed(() => {
    const msg = t.value.quota
    const u = usage.value
    switch (kind.value) {
      case 'banned': return msg.banned
      case 'exhausted': return msg.exhausted(u?.dailyLimit ?? 0)
      case 'cooldown': return msg.remainingWithWait(remaining.value ?? 0, waitText.value)
      case 'ready': return msg.remaining(remaining.value ?? 0)
      default: return ''
    }
  })

  return { load, reset, loading, usage, kind, isBlocked, remaining, waitText, summary }
}
