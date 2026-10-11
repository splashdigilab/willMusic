import { computed } from 'vue'
import { THEMES, resolveThemeId, type ThemeId } from '~/data/themes'

/** 預覽用的主題覆寫。session cookie：伺服器端也讀得到，關掉瀏覽器就回到正式設定 */
const PREVIEW_KEY = 'wm-theme-preview'

/**
 * 目前套用的節慶主題（見 data/themes.ts）。
 *
 * 正式值來自 runtimeConfig.public.theme（NUXT_PUBLIC_THEME）。
 * 網址帶 ?theme=<id> 時改用那個主題並記住，換頁也不會掉（?theme=default 可在節慶期間預覽原本的樣子）；
 * ?theme=reset 清掉，回到正式設定。
 *
 * 覆寫記在 cookie 而不是 sessionStorage：有 SSR 的頁面，伺服器與瀏覽器必須算出同一個主題，
 * 否則 hydration 對不上 —— 伺服器照正式主題畫出選單，瀏覽器換成預覽主題的清單，
 * Vue 不會修正對不上的屬性，結果按鈕的圖與它實際代表的造型錯位。
 */
export function useTheme() {
  const config = useRuntimeConfig()
  const route = useRoute()
  const preview = useCookie<string | null>(PREVIEW_KEY, { path: '/', sameSite: 'lax', default: () => null })

  // 每個呼叫的地方都自己讀一次網址：同一個請求裡，先設的 cookie 值後面的 useCookie 不一定看得到
  const q = route.query.theme
  const fromQuery = Array.isArray(q) ? q[0] : q
  if (typeof fromQuery === 'string') {
    preview.value = fromQuery === '' || fromQuery === 'reset' ? null : resolveThemeId(fromQuery)
  }

  const themeId = computed<ThemeId>(() =>
    preview.value ? resolveThemeId(preview.value) : resolveThemeId(config.public.theme))
  const theme = computed(() => THEMES[themeId.value])

  return { themeId, theme }
}
