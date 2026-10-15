/**
 * Amplify 的預設網址（*.amplifyapp.com）一律不給搜尋引擎收錄。
 *
 * 測試站（staging.….amplifyapp.com）從 2026-10-15 起跟正式站用同一份資料，
 * 原本「集合有後綴就整站 noindex」的判斷（nuxt.config 的 routeRules）不再成立；
 * 正式站自己也有一個 main.….amplifyapp.com 的預設網址，內容跟 postboard.willmusic.com.tw 一模一樣。
 * 這兩個都只該讓自訂網域被搜到，所以改看網域，不看資料。
 *
 * 網域取自 X-Forwarded-Host：Amplify 的 SSR 在 CloudFront 後面，正式站上線時實測過
 * 自訂網域的請求拿到的是 postboard.willmusic.com.tw（LINE 登入的回呼網址也是這樣推導的）。
 * HTML 不經 CloudFront 快取（每次都回到這裡），依網域給不同標頭不會互相污染。
 */
import { defineEventHandler, getRequestURL, setResponseHeader } from 'h3'

export default defineEventHandler((event) => {
  const { hostname } = getRequestURL(event, { xForwardedHost: true })
  if (hostname.endsWith('.amplifyapp.com')) {
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  }
})
