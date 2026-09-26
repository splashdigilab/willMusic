/**
 * 前台顧客的 LINE 登入。
 *
 * 整個網站不登入也能逛、也能做便利貼 —— 只有**送出**需要身分。
 * 所以這裡的入口不是一個「登入頁」，而是「在需要的那一刻把人送去 LINE，
 * 回來之後接續原本在做的事」。
 *
 * 往返會讓頁面整個重載，所以導向之前一定要把草稿同步寫下來（見 startLogin）。
 */
import { useNuxtApp, useRoute, useRouter } from '#imports'
import { signInWithCustomToken } from 'firebase/auth'
import { withQuery } from 'ufo'
import { useAuthSession } from '~/composables/useAuthSession'
import { useMemberProfile } from '~/composables/useMemberProfile'

/**
 * 登入往返期間記住「回來之後要做什麼」，放在回程網址的 query 上。
 *
 * 不放 sessionStorage：手機外部瀏覽器走「用 LINE App 登入」時，LINE App 認證完
 * 是把回程網址丟回瀏覽器，可能開在新分頁，而 sessionStorage 是跟著分頁走的。
 * 網址則會跟著 start → LINE → callback 的每一次 302 一路帶到最後。
 *
 * 這個值決定回來時要不要跳過活動規範頁，所以不能丟：丟了的話，送出途中去登入的人
 * 回來會被要求重新勾同意、按 START。
 */
export const PENDING_ACTION_QUERY = 'resume'

/**
 * 編輯器裡從哪裡去登入的：
 *   submit → 送出確認畫面。回來還原草稿、開回確認畫面
 *   edit   → 右上角（編輯到一半）。回來還原草稿、回到同一步
 * 兩者都已經過了活動規範頁，回來時都跳過開場。
 */
export type PendingAction = 'submit' | 'edit'

/** callback 會在網址上附註結果，前端讀完就把它從網址清掉 */
export type LoginOutcome = 'ok' | 'cancelled' | 'error'

/** 回程網址上的待續動作。讀完要連同 login／reason 一起從網址上清掉 */
export const readPendingAction = (query: Record<string, unknown>): PendingAction | null => {
  const value = query[PENDING_ACTION_QUERY]
  return value === 'submit' || value === 'edit' ? value : null
}

export const useMemberAuth = () => {
  const { $auth } = useNuxtApp() as any
  const route = useRoute()
  const router = useRouter()
  // 要在同步的地方先拿：completeLoginReturn 裡是 await 之後，那時 Nuxt 的 context 已經不在了
  const { syncProfile } = useMemberProfile()
  const { user, ready, isMember, claims, ensureInitialized, syncRole, logout } = useAuthSession()

  ensureInitialized()

  /**
   * 導向 LINE 授權頁。**這個呼叫之後頁面就離開了**，
   * 所有要保留的東西必須在呼叫前就已經寫進 storage。
   *
   * @param returnTo 回來之後要落在哪個站內路徑（含 query）
   * @param action   回來之後要自動接續的動作
   */
  const startLogin = (returnTo: string, action?: PendingAction) => {
    if (!import.meta.client) return
    const target = action ? withQuery(returnTo, { [PENDING_ACTION_QUERY]: action }) : returnTo
    window.location.href = `/api/auth/line/start?r=${encodeURIComponent(target)}`
  }

  /**
   * 從 LINE 回來之後領取 custom token 並完成登入。
   * 沒有待領的 token 時回 false —— 一般的頁面載入都會走到這裡，不是錯誤。
   */
  const completeLogin = async (): Promise<boolean> => {
    if (!import.meta.client || !$auth) return false

    try {
      const { customToken } = await $fetch<{ customToken: string | null }>('/api/auth/session')
      if (!customToken) return false

      await signInWithCustomToken($auth, customToken)
      // 先把身分解析完再回報成功，否則呼叫端接著判斷 isMember 會拿到還沒更新的值
      await syncRole()
      return true
    } catch (e) {
      console.error('[MemberAuth] 完成登入失敗', e)
      return false
    }
  }

  /**
   * 一般頁面（首頁、我的便利貼）從 LINE 回來時的收尾：把網址上的結果清掉、
   * 領 token 完成登入、在背景寫會員資料。
   *
   * **編輯器不要用這個**：它要接續送出、還原草稿，有自己的 handleLoginReturn。
   * /api/auth/session 的 token 是一次性的，同一次載入呼叫兩次的話後面那次會失敗。
   *
   * @returns 這次載入不是登入回程時回 null
   */
  const completeLoginReturn = async (): Promise<LoginOutcome | null> => {
    const outcome = route.query.login
    if (typeof outcome !== 'string') return null

    // 讀完就清掉：重新整理不該再觸發一次，也不該連同網址被分享出去
    const query = { ...route.query }
    delete query.login
    delete query.reason
    delete query[PENDING_ACTION_QUERY]
    await router.replace({ query })

    if (outcome === 'cancelled') return 'cancelled'
    if (outcome === 'ok' && await completeLogin()) {
      // 會員資料寫入是背景工作，寫失敗不影響登入
      void syncProfile(claims.value?.lineName ?? '', claims.value?.linePicture ?? null)
      return 'ok'
    }
    return 'error'
  }

  return {
    user,
    ready,
    isMember,
    /** LINE 暱稱與頭貼（來自 custom token 的 claim），未登入時為 null */
    profile: claims,
    startLogin,
    completeLogin,
    completeLoginReturn,
    logout
  }
}
