/**
 * 後台登入（帳號密碼）。
 *
 * 只負責「staff」這一種身分，狀態本身共用 [useAuthSession]。
 * 前台顧客的 LINE 登入在 useMemberAuth，兩者跑在同一個 Firebase Auth 上。
 *
 * 注意 `isStaff` 不等於「有登入」：LINE 會員也是登入狀態，但不是 staff。
 * 判斷後台權限一律用 `isStaff`，不要退回去看 `user` 有沒有值。
 */
import { useNuxtApp } from '#imports'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useAuthSession } from '~/composables/useAuthSession'

export const useAdminAuth = () => {
  const { $auth } = useNuxtApp() as any
  const { isStaff, ready, ensureInitialized, syncRole, logout } = useAuthSession()

  ensureInitialized()

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      await signInWithEmailAndPassword($auth, email, password)
      // 先把身分解析完再回報成功，否則呼叫端 await 之後導頁，
      // middleware 會在 role 還是 null 的瞬間把人踢回 /login
      await syncRole()
      return true
    } catch (e) {
      console.error('[Auth] signIn failed', e)
      return false
    }
  }

  return {
    isStaff,
    ready,
    login,
    logout,
    ensureInitialized
  }
}
