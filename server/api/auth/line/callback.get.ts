/**
 * LINE 授權完成後的落點。
 *
 * 驗 state → 用 code 換 token → 驗 id_token → 查是不是官方帳號好友 → 簽 Firebase custom token
 * → 放進短命的 httpOnly cookie → 導回原頁，由前端向 /api/auth/session 領取。
 *
 * custom token 走 cookie 而不是網址的 query 或 fragment：query 會進瀏覽器歷史、
 * 進 referer、進 Amplify 的存取紀錄；fragment 雖然不會外送，但仍會留在網址列，
 * 使用者複製網址分享出去就把登入憑證一起送出去了。
 */
import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import { withQuery } from 'ufo'
import {
  LINE_FRIENDSHIP_URL,
  LINE_TOKEN_URL,
  LINE_VERIFY_URL,
  getLineLoginConfig,
  peekReturnTo,
  readLoginState,
  resolveRedirectUri,
  setCustomTokenCookie,
  truncateDisplayName
} from '~~/server/utils/line-login'
import { signFirebaseCustomToken } from '~~/server/utils/firebase-custom-token'

interface LineTokenResponse {
  access_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

interface LineVerifyResponse {
  /** LINE userId，全站唯一。同一個 provider 底下的不同 channel 會拿到相同的值 */
  sub?: string
  name?: string
  picture?: string
  /** channel 沒有 email 權限、或使用者在 LINE 同意畫面上不給，就沒有這個欄位 */
  email?: string
  error?: string
  error_description?: string
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  // 錯誤路徑也要把人送回他按登入的那一頁。這裡還沒驗簽章，
  // 但 peekReturnTo 只會吐出站內路徑，偽造的 state 也導不出站外
  let returnTo = peekReturnTo(query.state)

  // returnTo 本身可能已經帶 query（例如 /editor?token=…），用 withQuery 併上去，
  // 直接字串相接會拼出兩個問號的網址
  const back = (params: Record<string, string>) =>
    sendRedirect(event, withQuery(returnTo, params), 302)

  const fail = (reason: string, detail?: unknown) => {
    if (detail) console.error(`[LINE Login] ${reason}:`, detail)
    return back({ login: 'error', reason })
  }

  // 使用者在授權頁按了「取消」
  if (query.error) {
    if (query.error === 'access_denied') {
      return back({ login: 'cancelled' })
    }
    return fail('line_error', `${query.error} / ${query.error_description}`)
  }

  let config
  try {
    config = getLineLoginConfig()
  } catch (error: any) {
    return fail('unconfigured', error?.message)
  }

  // 簽章不對：不是我們發出去的 state（偽造，或換過 channel secret 之前發的）。
  // 過期：在 LINE 那邊停留超過 10 分鐘。兩種都請使用者重來一次就好
  const loginState = readLoginState(config.channelSecret, query.state)
  if (!loginState.ok) return fail(loginState.reason, `state=${String(query.state).slice(0, 80)}`)
  const pending = loginState.value
  returnTo = pending.returnTo

  const code = typeof query.code === 'string' ? query.code : ''
  if (!code) return fail('code_missing')

  // ── 1. code 換 token ──────────────────────────────────────
  let tokenResult: LineTokenResponse
  try {
    const res = await fetch(LINE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: resolveRedirectUri(event),
        client_id: config.channelId,
        client_secret: config.channelSecret
      })
    })
    tokenResult = await res.json()
    if (!res.ok || !tokenResult.id_token) {
      return fail('token_exchange_failed', tokenResult)
    }
  } catch (error) {
    return fail('token_exchange_failed', error)
  }

  // ── 2. 驗 id_token ────────────────────────────────────────
  // 交給 LINE 的 verify 端點：它會驗簽章、iss、aud、exp，以及我們帶上去的 nonce。
  // nonce 是重放攻擊的防線 —— 少了它，攔到一次 id_token 就能無限次登入。
  let profile: LineVerifyResponse
  try {
    const res = await fetch(LINE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: tokenResult.id_token,
        client_id: config.channelId,
        nonce: pending.nonce
      })
    })
    profile = await res.json()
    if (!res.ok || !profile.sub) {
      return fail('id_token_invalid', profile)
    }
  } catch (error) {
    return fail('id_token_invalid', error)
  }

  // ── 3. 是不是官方帳號好友 ──────────────────────────────────
  // 給前端決定要不要顯示「加入好友」。查不到（channel 沒連結官方帳號、LINE 暫時出錯）
  // 就不放這個 claim，前端當作不知道、不去吵使用者 —— 這不值得擋住登入。
  // 不用 callback 網址上的 friendship_status_changed：它只說「這次有沒有變」，
  // 而且同意畫面沒出現時（之前授權過的人）根本不會帶。
  let isFriend: boolean | undefined
  if (tokenResult.access_token) {
    try {
      const res = await fetch(LINE_FRIENDSHIP_URL, {
        headers: { Authorization: `Bearer ${tokenResult.access_token}` }
      })
      const body = await res.json() as { friendFlag?: boolean }
      if (res.ok && typeof body.friendFlag === 'boolean') isFriend = body.friendFlag
      else console.warn('[LINE Login] 查不到好友狀態:', body)
    } catch (error) {
      console.warn('[LINE Login] 查不到好友狀態:', error)
    }
  }

  // ── 4. 簽 Firebase custom token ───────────────────────────
  try {
    const displayName = truncateDisplayName(profile.name || '')
    const customToken = signFirebaseCustomToken(
      `line:${profile.sub}`,
      {
        lineName: displayName,
        ...(profile.picture ? { linePicture: profile.picture } : {}),
        // 跟 lineName 同樣的理由簽進 token：firestore.rules 用它比對 users/{uid}.email，
        // 前端寫不進別人的信箱
        ...(profile.email ? { lineEmail: profile.email } : {}),
        ...(isFriend !== undefined ? { lineFriend: isFriend } : {}),
        role: 'member'
      },
      { clientEmail: config.clientEmail, privateKey: config.privateKey }
    )
    setCustomTokenCookie(event, customToken)
  } catch (error) {
    return fail('token_sign_failed', error)
  }

  return back({ login: 'ok' })
})
