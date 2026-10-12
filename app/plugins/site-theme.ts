/**
 * 後台設定的節慶主題（見 data/themes.ts 的「切換方式」）。
 *
 * 伺服器畫頁面之前先讀好、放進 useState，瀏覽器接手時直接用同一個值，不再讀第二次。
 * 不能等到瀏覽器才讀：主題會決定開場畫面與編輯器的選單內容，伺服器與瀏覽器算出不同主題的話
 * hydration 對不上（見 useTheme 的說明），還會先閃一下原本的主題。
 *
 * 實際讀取與快取在 server/api/site-theme.get.ts：伺服器端的 $fetch 打自己的 API 是同一個行程內
 * 直接呼叫，不走網路；快取過期時那邊會先回舊值、背景重讀，這裡幾乎不必等。
 */
import { SITE_THEME_STATE_KEY } from '~/composables/useTheme'
import { useCollections } from '~/utils/collections'

export default defineNuxtPlugin(async () => {
  // undefined ＝還沒讀過；null ＝讀過了，後台沒設定（交給環境變數）
  const siteTheme = useState<string | null | undefined>(SITE_THEME_STATE_KEY, () => undefined)
  // 瀏覽器端：伺服器已經讀好、跟著 payload 帶過來了
  if (siteTheme.value !== undefined) return

  try {
    const res = await $fetch<{ themeId: string | null }>('/api/site-theme', {
      query: { doc: useCollections().siteThemeConfig },
      timeout: 3_000,
      retry: 0
    })
    siteTheme.value = res.themeId
  } catch (error: any) {
    // 讀不到（伺服器剛啟動時 Firestore 剛好出錯）就交給環境變數；之後的請求會再讀
    console.warn('[site-theme] 讀取節慶主題設定失敗，先用部署設定', error?.message ?? error)
    siteTheme.value = null
  }
})
