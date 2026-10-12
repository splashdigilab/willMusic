import { computed } from 'vue'
import { THEMES, parseThemeId, resolveThemeId, type ThemeId } from '~/data/themes'

/**
 * 預覽用的主題覆寫。session cookie：伺服器端也讀得到，關掉瀏覽器就回到正式設定。
 * 後台儲存節慶主題時會清掉它（admin.vue），否則按過預覽的人會一直看到預覽的主題
 */
export const THEME_PREVIEW_COOKIE = 'wm-theme-preview'

/** 後台設定的主題，由 plugins/site-theme.ts 在伺服器端讀好放進這個 useState */
export const SITE_THEME_STATE_KEY = 'site-theme'

/**
 * 目前套用的節慶主題（見 data/themes.ts）。
 *
 * 正式值依序看：後台設定（system/site_theme，plugins/site-theme.ts 讀）→
 * 後台沒設定、選了「依部署設定」、或存的是這個版本不認得的主題時，用 runtimeConfig.public.theme
 * （NUXT_PUBLIC_THEME）。不認得的不當成原本的主題：新版本加了主題、後台存了，之後退回舊版本時，
 * 應該退回部署設定，而不是突然變回沒有節慶。
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
  const preview = useCookie<string | null>(THEME_PREVIEW_COOKIE, { path: '/', sameSite: 'lax', default: () => null })
  const siteTheme = useState<string | null | undefined>(SITE_THEME_STATE_KEY, () => undefined)

  // 每個呼叫的地方都自己讀一次網址：同一個請求裡，先設的 cookie 值後面的 useCookie 不一定看得到
  const q = route.query.theme
  const fromQuery = Array.isArray(q) ? q[0] : q
  if (typeof fromQuery === 'string') {
    preview.value = fromQuery === '' || fromQuery === 'reset' ? null : resolveThemeId(fromQuery)
  }

  const themeId = computed<ThemeId>(() => {
    if (preview.value) return resolveThemeId(preview.value)
    return parseThemeId(siteTheme.value) ?? resolveThemeId(config.public.theme)
  })
  const theme = computed(() => THEMES[themeId.value])

  return { themeId, theme }
}
