/**
 * 把 callback 簽好、暫存在 httpOnly cookie 裡的 Firebase custom token 交給前端。
 *
 * 一次性：讀完立刻清掉 cookie。前端拿去 signInWithCustomToken 之後，
 * 真正的登入狀態就由 Firebase SDK 自己維護（IndexedDB），不再經過這裡。
 */
import { defineEventHandler, deleteCookie, getCookie } from 'h3'
import { CUSTOM_TOKEN_COOKIE } from '~~/server/utils/line-login'

export default defineEventHandler((event) => {
  const customToken = getCookie(event, CUSTOM_TOKEN_COOKIE) || null
  deleteCookie(event, CUSTOM_TOKEN_COOKIE, { path: '/' })

  // 沒有不算錯誤：使用者本來就可能在未登入的情況下重新整理頁面
  return { customToken }
})
