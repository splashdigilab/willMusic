/**
 * 介面字（LINE Seed）的檔案與預載。檔案由 scripts/fonts/build.py 產生，每個字重分三份，依「多早需要」：
 *
 *   home   首頁開場的字（約 40KB）。nuxt.config 讓每一頁都 preload
 *   front  其他前台頁面（編輯器、我的便利貼）的字。首頁以外的頁面 preload（app.vue）；
 *          首頁等 START 能按之後才抓（pages/index.vue），點進編輯器時已經在手機裡
 *   more   只有後台、LED 牆、條款頁才有的字，不 preload，畫到那些字才下載
 *
 * 便利貼上的字一律 700，常用字不一定在 home 那份裡，所以 front／more 的 700 由
 * plugins/content-font.client.ts 在頁面資源都下載完之後提前抓。
 *
 * 不 import 任何 Nuxt 的東西：nuxt.config 也用這支。
 */

export const UI_FONT_WEIGHTS = [400, 700, 800] as const

export type UiFontTier = 'home' | 'front' | 'more'

export const uiFontHref = (tier: UiFontTier, weight: number): string =>
  `/fonts/line-seed-ui${tier === 'home' ? '' : `-${tier}`}-${weight}.woff2`

/** <head> 裡的字型 preload。crossorigin 一定要有：字型一律是 cors 請求，沒寫的話會再抓一次 */
export const fontPreloadLink = (href: string) => ({
  rel: 'preload',
  as: 'font',
  type: 'font/woff2',
  href,
  crossorigin: ''
} as const)

/**
 * 在瀏覽器端先把某一份介面字載好，畫到那些字時就不用等。只能在瀏覽器端呼叫。
 *
 * 不用動態加 <link rel="preload">：實測（2026-11-02，正式站）Chrome 不會把它配給 @font-face，
 * 字型真的要用時又抓一次，還會在 console 報「preloaded but not used」。
 * 改成直接請字型 API 載那一份 @font-face：從內嵌的 @font-face 找到這個檔案，
 * 拿它 unicode-range 裡的第一個字給 document.fonts.load，載的就是畫面上真正會用的那一份。
 * 各份的 unicode-range 不重疊，所以只會載這一個檔案
 */
export const loadUiFontNow = (tier: UiFontTier, weight: number): void => {
  const file = uiFontHref(tier, weight)
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      // 跨網域的樣式表讀不到規則，介面字也不在那裡
      continue
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule) || !rule.style.getPropertyValue('src').includes(file)) continue
      const first = /U\+([0-9a-f]+)/i.exec(rule.style.getPropertyValue('unicode-range'))
      if (first?.[1]) {
        document.fonts.load(`${weight} 1em "LINE Seed"`, String.fromCodePoint(parseInt(first[1], 16))).catch(() => {})
      }
      return
    }
  }
}
