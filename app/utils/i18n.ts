/**
 * 介面語言：繁中、英、日、韓。
 *
 * 只翻譯顧客會看到的頁面（首頁、編輯器、等待頁、我的便利貼、法律文件的外框）。
 * 後台、LED 牆、掃碼頁、後台登入是店員與店內設備用的，固定繁中（頁面加 `zhOnly: true`）。
 * 法律文件本文只有繁中版，其他語言在頁首說明以中文版為準。
 *
 * 網址不帶語言（沒有 /en/ 這種前綴）：使用者都是掃店內 QR code 進來的，不靠搜尋，
 * 而 LINE 登入的回程網址帶著 resume 參數，加前綴的話每一段轉址都得跟著帶語言。
 * 語言依序看：使用者自己選過的（cookie）→ 瀏覽器語言 → 繁中。
 */

export const LOCALES = ['zh-TW', 'en', 'ja', 'ko'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-TW'

/** 使用者自己選的語言，伺服器也要讀得到（伺服器畫頁面時就要用對語言），所以用 cookie */
export const LOCALE_COOKIE = 'wm-locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** 語言選單上的名稱，一律用該語言自己的寫法 */
export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어'
}

/** <html lang>。系統字與螢幕報讀器靠它挑字形與發音 */
export const HTML_LANG: Record<Locale, string> = {
  'zh-TW': 'zh-Hant-TW',
  en: 'en',
  ja: 'ja',
  ko: 'ko'
}

/** LINE 授權頁的 ui_locales（LINE 認得的寫法） */
export const LINE_UI_LOCALE: Record<Locale, string> = {
  'zh-TW': 'zh-TW',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR'
}

/** 認得的語言代碼就回傳它，不認得回傳 null */
export const parseLocale = (value: unknown): Locale | null =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value) ? (value as Locale) : null

/** 單一個語言標籤（en-US、zh-Hant、ja）對應到支援的語言，對不上回傳 null */
const matchTag = (tag: string): Locale | null => {
  const primary = tag.trim().toLowerCase().split('-')[0]
  switch (primary) {
    // 簡體的瀏覽器也給繁中：介面看得懂，比退到英文好
    case 'zh': return 'zh-TW'
    case 'en': return 'en'
    case 'ja': return 'ja'
    case 'ko': return 'ko'
    default: return null
  }
}

/**
 * 依瀏覽器的語言偏好挑語言（Accept-Language 或 navigator.languages）。
 *
 * - 照偏好順序找第一個支援的
 * - 有給偏好但一個都不支援（例如只有泰文）→ 英文：外國人看英文的機會比中文大
 * - 完全沒給（多半是爬蟲）→ 繁中，搜尋引擎收錄的是中文版
 */
export const detectLocale = (preferences: string[]): Locale => {
  const tags = preferences.filter(Boolean)
  if (tags.length === 0) return DEFAULT_LOCALE
  for (const tag of tags) {
    const hit = matchTag(tag)
    if (hit) return hit
  }
  return 'en'
}

/** 解析 Accept-Language，依 q 值排序，回傳語言標籤 */
export const parseAcceptLanguage = (header: string | undefined): string[] => {
  if (!header) return []
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) || 0 : 1, index }
    })
    .filter(item => item.tag && item.tag !== '*' && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(item => item.tag)
}
