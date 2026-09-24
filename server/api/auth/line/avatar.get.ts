/**
 * 代抓 LINE 頭貼並轉成 data URL。
 *
 * 為什麼要經過 server：
 *   1. LINE 的 profile CDN 沒有承諾提供 CORS 標頭，瀏覽器直接 fetch 會被擋
 *   2. 順便把來源網域鎖死。少了白名單，這就是一個「叫我們的伺服器去抓任意
 *      網址」的代理，內網位址也抓得到（SSRF）
 *
 * 轉成 base64 而不是回傳網址，是因為這張圖最終要進便利貼的 style，
 * 而便利貼的下載／分享是用 html-to-image 序列化節點 —— 外部網域的圖片
 * 在那個情境抓不到，base64 直接繞開。
 */
import { createError, defineEventHandler, getQuery } from 'h3'

/** LINE 頭貼的 CDN。只認這個網域，其餘一律拒絕 */
const ALLOWED_HOST_SUFFIX = '.line-scdn.net'

/**
 * LINE 的 pictureUrl 後面可以加 /small 或 /large 取不同尺寸。
 * 名牌貼紙只需要縮圖，用 /small 省下傳輸量，也讓 base64 塞得進文件。
 */
const THUMBNAIL_SUFFIX = '/small'

/** 與 firestore.rules 的 canWriteUserProfile 一致（data URL 的字元數） */
const MAX_DATA_URL_LENGTH = 30000

export default defineEventHandler(async (event) => {
  const raw = getQuery(event).url
  if (typeof raw !== 'string' || !raw) {
    throw createError({ statusCode: 400, message: 'Missing url' })
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid url' })
  }

  const hostAllowed =
    parsed.protocol === 'https:' &&
    (parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX) || parsed.hostname === 'line-scdn.net')
  if (!hostAllowed) {
    throw createError({ statusCode: 400, message: 'Unsupported host' })
  }

  try {
    const res = await fetch(`${parsed.toString()}${THUMBNAIL_SUFFIX}`)
    if (!res.ok) {
      console.warn('[LINE Avatar] 下載失敗', res.status)
      return { dataUrl: null }
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      console.warn('[LINE Avatar] 回應不是圖片:', contentType)
      return { dataUrl: null }
    }

    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    // 超過上限就當作沒有頭貼：規則那一關會擋下來，與其讓寫入整個失敗，
    // 不如少一張頭貼但會員資料寫得進去
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      console.warn('[LINE Avatar] 縮圖仍超過大小上限:', dataUrl.length)
      return { dataUrl: null }
    }

    return { dataUrl }
  } catch (error) {
    console.warn('[LINE Avatar] 取得頭貼時發生錯誤', error)
    return { dataUrl: null }
  }
})
