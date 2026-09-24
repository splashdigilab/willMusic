import { defineNuxtRouteMiddleware, navigateTo } from '#imports'
import { useAuthSession } from '~/composables/useAuthSession'

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
  const protectedPaths = ['/qrcode', '/canvas', '/admin']
  if (!protectedPaths.includes(to.path)) return

  const { isStaff, ensureInitialized } = useAuthSession()

  // 等第一次 onAuthStateChanged 與身分解析完成，避免初次載入時還沒就緒就被踢走
  await ensureInitialized()

  if (isStaff.value) return

  return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
})
