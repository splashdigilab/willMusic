/**
 * LINE 授權完成後的落點。
 *
 * 驗 state → 用 code 換 token → 驗 id_token → 簽 Firebase custom token
 * → 放進短命的 httpOnly cookie → 導回原頁，由前端向 /api/auth/session 領取。
 *
 * custom token 走 cookie 而不是網址的 query 或 fragment：query 會進瀏覽器歷史、
 * 進 referer、進 Amplify 的存取紀錄；fragment 雖然不會外送，但仍會留在網址列，
 * 使用者複製網址分享出去就把登入憑證一起送出去了。
 */
import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import { withQuery } from 'ufo'
import {
  LINE_TOKEN_URL,
  LINE_VERIFY_URL,
  getLineLoginConfig,
  resolveRedirectUri,
  sanitizeReturnTo,
  setCustomTokenCookie,
  takePendingState,
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
  error?: string
  error_description?: string
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const pending = takePendingState(event)
  // pending 掉了就不知道該回哪，退回編輯器
  const returnTo = pending?.returnTo ?? sanitizeReturnTo(undefined)

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

  // state 對不起來代表這不是我們發起的請求（CSRF），或 cookie 在往返途中掉了。
  // LINE 內建瀏覽器偶爾會出現後者，訊息要讓使用者知道「再試一次」通常就好。
  if (!pending) return fail('state_missing')
  if (typeof query.state !== 'string' || query.state !== pending.state) {
    return fail('state_mismatch')
  }

  const code = typeof query.code === 'string' ? query.code : ''
  if (!code) return fail('code_missing')

  let config
  try {
    config = getLineLoginConfig()
  } catch (error: any) {
    return fail('unconfigured', error?.message)
  }

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

  // ── 3. 簽 Firebase custom token ───────────────────────────
  try {
    const displayName = truncateDisplayName(profile.name || '')
    const customToken = signFirebaseCustomToken(
      `line:${profile.sub}`,
      {
        lineName: displayName,
        ...(profile.picture ? { linePicture: profile.picture } : {}),
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
