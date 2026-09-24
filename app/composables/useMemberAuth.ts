/**
 * 前台顧客的 LINE 登入。
 *
 * 整個網站不登入也能逛、也能做便利貼 —— 只有**送出**需要身分。
 * 所以這裡的入口不是一個「登入頁」，而是「在需要的那一刻把人送去 LINE，
 * 回來之後接續原本在做的事」。
 *
 * 往返會讓頁面整個重載，所以導向之前一定要把草稿同步寫下來（見 startLogin）。
 */
import { useNuxtApp } from '#imports'
import { signInWithCustomToken } from 'firebase/auth'
import { useAuthSession } from '~/composables/useAuthSession'

/** 登入往返期間記住「回來之後要做什麼」。sessionStorage 撐得過一次 302 往返 */
const PENDING_ACTION_KEY = 'willmusic_pending_action'

export type PendingAction = 'submit'

/** callback 會在網址上附註結果，前端讀完就把它從網址清掉 */
export type LoginOutcome = 'ok' | 'cancelled' | 'error'

export const useMemberAuth = () => {
  const { $auth } = useNuxtApp() as any
  const { user, ready, isMember, claims, ensureInitialized, syncRole, logout } = useAuthSession()

  ensureInitialized()

  const setPendingAction = (action: PendingAction) => {
    if (!import.meta.client) return
    try {
      sessionStorage.setItem(PENDING_ACTION_KEY, action)
    } catch { /* 無痕模式寫不進去；頂多是回來之後不自動接續 */ }
  }

  const takePendingAction = (): PendingAction | null => {
    if (!import.meta.client) return null
    try {
      const value = sessionStorage.getItem(PENDING_ACTION_KEY)
      sessionStorage.removeItem(PENDING_ACTION_KEY)
      return value === 'submit' ? value : null
    } catch {
      return null
    }
  }

  /**
   * 導向 LINE 授權頁。**這個呼叫之後頁面就離開了**，
   * 所有要保留的東西必須在呼叫前就已經寫進 storage。
   *
   * @param returnTo 回來之後要落在哪個站內路徑（含 query）
   * @param action   回來之後要自動接續的動作
   */
  const startLogin = (returnTo: string, action?: PendingAction) => {
    if (!import.meta.client) return
    if (action) setPendingAction(action)
    window.location.href = `/api/auth/line/start?r=${encodeURIComponent(returnTo)}`
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

  return {
    user,
    ready,
    isMember,
    /** LINE 暱稱與頭貼（來自 custom token 的 claim），未登入時為 null */
    profile: claims,
    startLogin,
    completeLogin,
    takePendingAction,
    logout
  }
}
