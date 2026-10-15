import { defineNuxtRouteMiddleware, navigateTo } from '#imports'
import { useAuthSession } from '~/composables/useAuthSession'

/**
 * 只有後台帳號能進的頁面，以路由名稱（pages/ 底下的檔名）判斷，不比對網址。
 *
 * Vue Router 預設不分大小寫、尾端斜線可有可無：/ADMIN、/admin/ 打開的一樣是後台，
 * 拿 to.path 逐字比對的話這些寫法全都繞得過。路由名稱代表的是「實際要顯示哪一頁」，
 * 不受網址怎麼寫影響。頁面改檔名的話這裡要跟著改。
 */
const STAFF_ONLY_ROUTES = new Set(['qrcode', 'canvas', 'admin'])

/**
 * 後台頁面的路由守衛。
 *
 * 判斷的是「是不是 staff」而不是「有沒有登入」—— LINE 會員也是登入狀態，
 * 只看 user 有沒有值的話，顧客登入後可以直接走進 /admin。畫面上的資料會被
 * Firestore 規則擋掉，但後台的版面與操作按鈕會整個露出來。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Firebase auth plugin 是 client-only，SSR 階段不做登入判斷，避免刷新時被誤導向 /login
  if (import.meta.server) return

  // 只保護特定頁面
  if (typeof to.name !== 'string' || !STAFF_ONLY_ROUTES.has(to.name)) return

  const { isStaff, ensureInitialized } = useAuthSession()

  // 等第一次 onAuthStateChanged 與身分解析完成，避免初次載入時還沒就緒就被踢走
  await ensureInitialized()

  if (isStaff.value) return

  return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
})
