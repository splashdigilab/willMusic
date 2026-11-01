/**
 * 載入便利貼上的字（使用者打的中文／韓文）要用的字型：內容字分片的樣式表，
 * 加上介面字裡 700 的 -front、-more 兩份。
 *
 * 等畫面接手（app:mounted）之後才開始抓，HTML 裡也不 preload：
 * 樣式表約 250KB（gzip 後 65KB），preload 的樣式表在 Chrome 是最高優先權，
 * 原本會在首屏跟 JS、介面字搶頻寬。首次渲染時畫面上沒有任何使用者的字
 * （首頁與大螢幕的便利貼都是瀏覽器抓完資料才畫，編輯器要等使用者開始打字），晚一點抓不影響首屏。
 * 也不直接寫成 <link rel="stylesheet">：那樣每一頁的首次渲染都要等它下載完。
 *
 * 介面字的 -front、-more 是首頁開場以外的字（見 utils/ui-fonts.ts），其中有不少是便利貼的常用字
 * （快樂、希望、演唱會），而便利貼的字一律是 700，所以這兩份的 700 跟內容字一起提前抓，
 * 牆上與編輯器的字才不會閃一下。首頁以外的頁面 -front 已經預載了，preloadFontNow 不會重複抓。
 *
 * 分享圖（useNoteExport）是自己 fetch 這些檔案，不受這裡影響。
 */
import { preloadFontNow, uiFontHref } from '~/utils/ui-fonts'

const CONTENT_FONT_CSS = '/fonts/line-seed.css'
/** 便利貼上的字一律 700 */
const NOTE_FONT_WEIGHT = 700

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    if (document.querySelector(`link[rel="stylesheet"][href="${CONTENT_FONT_CSS}"]`)) return

    preloadFontNow(uiFontHref('front', NOTE_FONT_WEIGHT))
    preloadFontNow(uiFontHref('more', NOTE_FONT_WEIGHT))

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CONTENT_FONT_CSS
    document.head.appendChild(link)
  })
})
