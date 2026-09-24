/**
 * LINE Login（OAuth 2.0 / OIDC）的設定與共用工具。
 *
 * 流程分成兩個 route：
 *   /api/auth/line/start    產 state + nonce 存進 httpOnly cookie，302 到 LINE
 *   /api/auth/line/callback 驗 state、用 code 換 token、驗 id_token、簽 Firebase token
 *
 * 所有值都在 cookie 與 query 之間來回，server 本身不存任何 session ——
 * Amplify 的 Lambda 沒有共用記憶體，兩次請求不保證落在同一個執行實體上。
 */
import { getRequestURL, setCookie, getCookie, deleteCookie, type H3Event } from 'h3'

export const LINE_AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize'
export const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
/**
 * 用 LINE 官方的驗證端點，不自己驗簽。
 * id_token 的簽章演算法會隨 channel 設定在 HS256 與 ES256 之間變動，自己處理很容易
 * 寫成「只認其中一種」，而那種錯誤在本機測得過、換個 channel 就整個登不進來。
 * 這個端點會一併驗 iss / aud / exp / nonce，回傳解好的 payload。
 */
export const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

/** 只要 openid profile，不要 email —— 沒有用到的個資就不要蒐集 */
export const LINE_SCOPE = 'openid profile'

/** OAuth 往返用的暫存 cookie，callback 一進來就清掉 */
export const OAUTH_STATE_COOKIE = 'wm_oauth'
/** 簽好的 Firebase custom token，等前端來領。壽命只要夠撐完一次 302 + 一次 fetch */
export const CUSTOM_TOKEN_COOKIE = 'wm_ct'
export const CUSTOM_TOKEN_TTL_SECONDS = 120

/**
 * LINE 暱稱會原樣顯示在店內 LED 牆上，長度沒有上限、也可能整串都是 emoji。
 * 12 個字是便利貼名牌塞得下的極限，超過的部分在這裡就截掉，
 * 之後 firestore.rules 會用截過的值比對，前端改不了。
 */
export const DISPLAY_NAME_MAX_LENGTH = 12

/** 用展開運算子而非 slice：避免把 emoji 這類代理對從中間切成亂碼 */
export const truncateDisplayName = (name: string): string => {
  const chars = [...(name || '').trim()]
  return chars.length <= DISPLAY_NAME_MAX_LENGTH
    ? chars.join('')
    : chars.slice(0, DISPLAY_NAME_MAX_LENGTH).join('')
}

export interface LineLoginConfig {
  channelId: string
  channelSecret: string
  clientEmail: string
  privateKey: string
}

/**
 * 讀設定。任何一項缺了就丟錯，讓 route 回可辨識的錯誤訊息 ——
 * 這幾個值都在環境變數裡，漏設的症狀會是「按了登入就白畫面」，很難查。
 *
 * 變數名一律**不加 NUXT_PUBLIC_ 前綴**。那個前綴會讓 Nuxt 把值打包進前端 bundle，
 * channel secret 與 service account 私鑰進了前端等於直接公開。
 */
export const getLineLoginConfig = (): LineLoginConfig => {
  const config = useRuntimeConfig()

  const resolved: LineLoginConfig = {
    channelId: (config.lineChannelId as string) || process.env.LINE_CHANNEL_ID || '',
    channelSecret: (config.lineChannelSecret as string) || process.env.LINE_CHANNEL_SECRET || '',
    clientEmail: (config.firebaseClientEmail as string) || process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (config.firebasePrivateKey as string) || process.env.FIREBASE_PRIVATE_KEY || ''
  }

  const missing = (Object.keys(resolved) as Array<keyof LineLoginConfig>)
    .filter(key => !resolved[key])
  if (missing.length > 0) {
    throw new Error(`LINE 登入未設定完成，缺少：${missing.join(', ')}`)
  }

  return resolved
}

/**
 * 導回 LINE 的網址。必須與 LINE Developers 後台登記的 Callback URL 逐字相同。
 *
 * 預設從請求本身推導，這樣測試站與正式站可以共用同一份環境變數設定；
 * 需要固定值時（例如前面還有別的代理）用 LINE_LOGIN_REDIRECT_URI 覆寫。
 */
export const resolveRedirectUri = (event: H3Event): string => {
  const override = process.env.LINE_LOGIN_REDIRECT_URI
  if (override) return override

  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  return `${url.origin}/api/auth/line/callback`
}

interface OAuthPendingState {
  state: string
  nonce: string
  /** 登入完成後要回到哪裡。只收站內相對路徑 */
  returnTo: string
}

const isSecureRequest = (event: H3Event): boolean =>
  getRequestURL(event, { xForwardedProto: true }).protocol === 'https:'

/**
 * 只接受站內的相對路徑。少了這個檢查，`/api/auth/line/start?r=https://evil.example`
 * 就成了一個帶著本站網域的開放轉址。
 */
export const sanitizeReturnTo = (raw: unknown): string => {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return '/editor'
  // `//evil.example` 會被瀏覽器當成協定相對的絕對網址
  if (raw.startsWith('//')) return '/editor'
  return raw
}

export const savePendingState = (event: H3Event, pending: OAuthPendingState) => {
  setCookie(event, OAUTH_STATE_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    sameSite: 'lax', // callback 是 top-level GET 轉址，lax 會帶上；strict 不會
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 10 * 60
  })
}

export const takePendingState = (event: H3Event): OAuthPendingState | null => {
  const raw = getCookie(event, OAUTH_STATE_COOKIE)
  deleteCookie(event, OAUTH_STATE_COOKIE, { path: '/' })
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.state !== 'string' || typeof parsed?.nonce !== 'string') return null
    return {
      state: parsed.state,
      nonce: parsed.nonce,
      returnTo: sanitizeReturnTo(parsed.returnTo)
    }
  } catch {
    return null
  }
}

export const setCustomTokenCookie = (event: H3Event, token: string) => {
  setCookie(event, CUSTOM_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: CUSTOM_TOKEN_TTL_SECONDS
  })
}
