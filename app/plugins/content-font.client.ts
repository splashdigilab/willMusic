/**
 * 套用內容字型（使用者打的中文／韓文）的樣式表。
 *
 * nuxt.config 已經用 preload 提前下載，這裡只是把它掛成樣式表。
 * 不直接寫成 <link rel="stylesheet">：那樣每一頁的首次渲染都要等這 250KB 下載完，
 * 但首次渲染時畫面上沒有任何使用者的字（便利貼都是瀏覽器抓完資料才畫）。
 *
 * 分享圖（useNoteExport）是自己 fetch 這支檔案，不受這裡影響。
 */
const CONTENT_FONT_CSS = '/fonts/line-seed.css'

export default defineNuxtPlugin(() => {
  if (document.querySelector(`link[rel="stylesheet"][href="${CONTENT_FONT_CSS}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CONTENT_FONT_CSS
  document.head.appendChild(link)
})
