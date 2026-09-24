/**
 * 全站共用的一份 Firebase Auth 狀態。
 *
 * 這個專案有**兩種**登入，共用同一個 Firebase Auth：
 *
 *   staff  —— 後台／大螢幕／掃碼頁，帳號密碼（sign_in_provider = 'password'）
 *   member —— 前台顧客，LINE Login 換來的 custom token（sign_in_provider = 'custom'）
 *
 * 所以「有沒有登入」這個問題在這裡沒有意義，任何地方都必須問「是哪一種登入」。
 * 曾經 middleware 與 Firestore 規則都只看 `request.auth != null` / `!!user`，
 * 那是在「只有後台會登入」的前提下成立的；顧客一旦也能登入，前者會讓顧客
 * 直接走進 /admin，後者會把清空佇列與改設定的權限一起送出去。
 *
 * 身分不是自己宣告的，是從 ID token 的 `signInProvider` 讀出來的 —— 那個欄位由
 * Firebase 簽發，前端偽造不了，跟 firestore.rules 判斷的是同一個值。
 */
import { useNuxtApp, useState } from '#imports'
import { getIdTokenResult, signOut, type User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'

export type AuthRole = 'staff' | 'member'

/**
 * LINE 會員的暱稱與頭貼。來源是 server 簽 custom token 時放進去的 claim，
 * 解析身分時會一起拿到，所以不需要另外打 API 或讀 Firestore。
 */
export interface MemberClaims {
  lineName: string
  linePicture: string | null
}

export interface AuthSessionState {
  /** 已收過至少一次 onAuthStateChanged，且該次的身分也解析完了 */
  ready: boolean
  user: User | null
  role: AuthRole | null
  claims: MemberClaims | null
}

/**
 * onAuthStateChanged 只掛一次，並記住「第一次結果」的 promise 讓 middleware 等。
 * 放模組層而不是 useState：它是 promise 不是可序列化的狀態，而且 auth plugin
 * 本來就是 client-only，一次頁面載入對應一份。
 */
let firstResolution: Promise<void> | null = null

export const useAuthSession = () => {
  const { $auth } = useNuxtApp() as any

  const session = useState<AuthSessionState>('auth-session', () => ({
    ready: false,
    user: null,
    role: null,
    claims: null
  }))

  interface Resolved {
    role: AuthRole | null
    claims: MemberClaims | null
  }

  const EMPTY: Resolved = { role: null, claims: null }

  const resolve = async (user: User | null): Promise<Resolved> => {
    if (!user) return EMPTY
    try {
      // forceRefresh = false：用快取的 token 就好，不必每次都往 Google 跑一趟
      const { signInProvider, claims } = await getIdTokenResult(user)
      if (signInProvider === 'password') return { role: 'staff', claims: null }
      if (signInProvider === 'custom') {
        return {
          role: 'member',
          claims: {
            lineName: typeof claims.lineName === 'string' ? claims.lineName : '',
            linePicture: typeof claims.linePicture === 'string' ? claims.linePicture : null
          }
        }
      }
      // 之後若接了第三種登入方式，這裡回 null 會讓它兩邊權限都拿不到，
      // 這是刻意的：不認得的身分一律當成沒有權限，而不是預設放行。
      console.warn('[Auth] 未知的 signInProvider:', signInProvider)
      return EMPTY
    } catch (e) {
      console.error('[Auth] 取得 ID token 失敗', e)
      return EMPTY
    }
  }

  /**
   * 掛上監聽並回傳「第一次結果已到」的 promise。
   * 重複呼叫是安全的，只會掛一次。
   */
  const ensureInitialized = (): Promise<void> => {
    if (!import.meta.client || !$auth) return Promise.resolve()
    if (firstResolution) return firstResolution

    firstResolution = new Promise<void>((resolveFirst) => {
      let settled = false
      // 使用者可能在等待 role 解析的空檔又登出，用流水號丟棄過期的結果，
      // 否則舊的 await 回來會把新狀態蓋回去
      let generation = 0

      onAuthStateChanged($auth, async (user) => {
        const current = ++generation
        session.value.user = user
        if (!user) {
          session.value.role = null
          session.value.claims = null
          session.value.ready = true
          if (!settled) { settled = true; resolveFirst() }
          return
        }

        session.value.ready = false
        const resolved = await resolve(user)
        if (current !== generation) return

        session.value.role = resolved.role
        session.value.claims = resolved.claims
        session.value.ready = true
        if (!settled) { settled = true; resolveFirst() }
      })
    })

    return firstResolution
  }

  /** 登入流程結束後立刻把身分補上，讓 `await login()` 之後的狀態就是對的 */
  const syncRole = async () => {
    const user = $auth?.currentUser ?? null
    const resolved = await resolve(user)
    session.value.user = user
    session.value.role = resolved.role
    session.value.claims = resolved.claims
    session.value.ready = true
  }

  const logout = async () => {
    try {
      await signOut($auth)
    } catch (e) {
      console.error('[Auth] signOut failed', e)
    }
  }

  return {
    session,
    ready: computed(() => session.value.ready),
    user: computed(() => session.value.user),
    role: computed(() => session.value.role),
    claims: computed(() => session.value.claims),
    isStaff: computed(() => session.value.role === 'staff'),
    isMember: computed(() => session.value.role === 'member'),
    ensureInitialized,
    syncRole,
    logout
  }
}
