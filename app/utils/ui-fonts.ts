/**
 * 介面字（LINE Seed）的檔案與預載。檔案由 scripts/fonts/build.py 產生，每個字重分三份，依「多早需要」：
 *
 *   home   首頁開場的字（約 40KB）。nuxt.config 讓每一頁都 preload
 *   front  其他前台頁面（編輯器、我的便利貼）的字。首頁以外的頁面 preload（app.vue）；
 *          首頁等 START 能按之後才抓（pages/index.vue），點進編輯器時已經在手機裡
 *   more   只有後台、LED 牆、條款頁才有的字，不 preload，畫到那些字才下載
 *
 * 便利貼上的字一律 700，常用字不一定在 home 那份裡，所以 front／more 的 700 由
 * plugins/content-font.client.ts 在畫面接手後提前抓。
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

/** 在瀏覽器端補抓一個字型（已經有同一個 preload 的不重複加）。只能在瀏覽器端呼叫 */
export const preloadFontNow = (href: string): void => {
  if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'font'
  link.type = 'font/woff2'
  link.href = href
  link.crossOrigin = ''
  document.head.appendChild(link)
}
