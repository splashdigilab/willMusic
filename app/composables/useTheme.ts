import { computed } from 'vue'
import { THEMES, parseThemeId, resolveThemeId, type ThemeId } from '~/data/themes'

/**
 * 預覽用的主題覆寫。用 cookie 是因為伺服器端也要讀得到（見 useTheme 的說明）。
 * 後台儲存節慶主題時會清掉它（admin.vue），否則按過預覽的人會一直看到預覽的主題
 */
export const THEME_PREVIEW_COOKIE = 'wm-theme-preview'

/**
 * 預覽最多留多久（秒）。原本是 session cookie，但 Chrome、Safari 開著「重新開啟上次的分頁」時
 * session cookie 關掉瀏覽器也不會消失，按過一次預覽的瀏覽器就一直跟後台設定不一樣（2026-10-12）
 */
const THEME_PREVIEW_MAX_AGE = 60 * 60

/** 後台設定的主題，由 plugins/site-theme.ts 在伺服器端讀好放進這個 useState */
export const SITE_THEME_STATE_KEY = 'site-theme'

/**
 * 目前套用的節慶主題（見 data/themes.ts）。
 *
 * 正式值依序看：後台設定（system/site_theme，plugins/site-theme.ts 讀）→
 * 後台沒設定、存的是 null（舊的「依部署設定」）、或存的是這個版本不認得的主題時，用 runtimeConfig.public.theme
 * （NUXT_PUBLIC_THEME）。不認得的不當成原本的主題：新版本加了主題、後台存了，之後退回舊版本時，
 * 應該退回部署設定，而不是突然變回沒有節慶。
 * 網址帶 ?theme=<id> 時改用那個主題並記住，換頁也不會掉（?theme=default 可在節慶期間預覽原本的樣子）；
 * ?theme=reset 清掉，回到正式設定。記住的預覽一小時後失效；跟正式設定一樣時也會直接清掉 ——
 * 例如先預覽了萬聖節、後來後台也切成萬聖節，之後後台切回去，這個瀏覽器才會跟著切回去。
 *
 * 覆寫記在 cookie 而不是 sessionStorage：有 SSR 的頁面，伺服器與瀏覽器必須算出同一個主題，
 * 否則 hydration 對不上 —— 伺服器照正式主題畫出選單，瀏覽器換成預覽主題的清單，
 * Vue 不會修正對不上的屬性，結果按鈕的圖與它實際代表的造型錯位。
 */
export function useTheme() {
  const config = useRuntimeConfig()
  const route = useRoute()
  const preview = useCookie<string | null>(THEME_PREVIEW_COOKIE, {
    path: '/',
    sameSite: 'lax',
    maxAge: THEME_PREVIEW_MAX_AGE,
    default: () => null
  })
  const siteTheme = useState<string | null | undefined>(SITE_THEME_STATE_KEY, () => undefined)
  const officialThemeId = computed<ThemeId>(() => parseThemeId(siteTheme.value) ?? resolveThemeId(config.public.theme))

  // 每個呼叫的地方都自己讀一次網址：同一個請求裡，先設的 cookie 值後面的 useCookie 不一定看得到
  const q = route.query.theme
  const fromQuery = Array.isArray(q) ? q[0] : q
  if (typeof fromQuery === 'string') {
    preview.value = fromQuery === '' || fromQuery === 'reset' ? null : resolveThemeId(fromQuery)
  }
  // 預覽跟正式設定一樣就沒有意義，留著反而會在後台之後換主題時卡住。清掉不影響這次算出來的主題，
  // 伺服器與瀏覽器結果一樣，hydration 不會對不上
  if (preview.value && resolveThemeId(preview.value) === officialThemeId.value) {
    preview.value = null
  }

  const themeId = computed<ThemeId>(() => {
    if (preview.value) return resolveThemeId(preview.value)
    return officialThemeId.value
  })
  const theme = computed(() => THEMES[themeId.value])

  return { themeId, theme }
}
