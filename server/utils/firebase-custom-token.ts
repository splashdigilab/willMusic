/**
 * 簽發 Firebase Auth custom token。
 *
 * 刻意**不裝 firebase-admin**：custom token 就是一張用 service account 私鑰
 * 以 RS256 簽名的 JWT，格式是公開的，Node 內建的 crypto 十幾行就能簽完。
 * 為了這件事把整包 admin SDK 拉進 Nitro bundle，換來的是 Lambda 冷啟動變慢，
 * 而登入正好是使用者盯著螢幕等的那幾秒。
 *
 * 這也表示 server **完全沒有** Firestore 的寫入權限 —— 它只簽 token，
 * 會員資料由前端自己寫進 users/{uid}，靠 firestore.rules 的
 * canWriteUserProfile() 把 displayName 綁死在這裡簽進去的 lineName claim 上。
 */
import { createSign } from 'node:crypto'

/** Firebase 規定 custom token 的 aud 必須是這個固定字串 */
const FIREBASE_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit'

/** Firebase 接受的上限就是一小時；前端拿到後會立刻換成自己的 session，不需要更久 */
const TOKEN_TTL_SECONDS = 3600

const base64url = (input: string | Buffer): string =>
  Buffer.from(input).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/**
 * 把環境變數裡的私鑰還原成 PEM。
 *
 * 允許兩種寫法，因為 Amplify 的環境變數是單行的：
 *   1. base64（建議）—— 整段 PEM 做 base64，一行塞得下
 *   2. 原始 PEM 但換行寫成字面上的 \n —— 從 service account JSON 直接複製過來的形狀
 */
const normalizePrivateKey = (raw: string): string => {
  const trimmed = raw.trim()
  if (trimmed.includes('BEGIN')) return trimmed.replace(/\\n/g, '\n')

  const decoded = Buffer.from(trimmed, 'base64').toString('utf-8')
  if (!decoded.includes('BEGIN')) {
    throw new Error('FIREBASE_PRIVATE_KEY 解不出 PEM，請確認是 base64 或含 \\n 的原始內容')
  }
  return decoded.replace(/\\n/g, '\n')
}

export interface CustomTokenClaims {
  /** 從 LINE 取得並截斷過的顯示名稱。firestore.rules 會拿它比對 users/{uid}.displayName */
  lineName: string
  /** LINE 頭貼網址。之後名牌貼紙要用，先隨 token 帶著 */
  linePicture?: string
  /**
   * 目前的權限判斷是看 sign_in_provider（custom = 會員、password = 後台），
   * 這個 claim 還沒有人讀。先簽進去是為了萬一之後出現「不是後台但用帳密」的帳號，
   * 那時 sign_in_provider 就不夠用了，屆時只要改 rules，不必請所有人重新登入。
   */
  role: 'member'
}

/**
 * @param uid    Firebase uid，格式為 `line:<LINE userId>`
 */
export const signFirebaseCustomToken = (
  uid: string,
  claims: CustomTokenClaims,
  serviceAccount: { clientEmail: string; privateKey: string }
): string => {
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: serviceAccount.clientEmail,
    sub: serviceAccount.clientEmail,
    aud: FIREBASE_AUDIENCE,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    uid,
    claims
  }))

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  signer.end()

  const signature = base64url(signer.sign(normalizePrivateKey(serviceAccount.privateKey)))
  return `${header}.${payload}.${signature}`
}
