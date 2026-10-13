import { computed } from 'vue'
import zhTW from '~/locales/zh-TW'
import type { Messages } from '~/locales/types'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale
} from '~/utils/i18n'

/**
 * 介面翻譯（語言怎麼決定見 utils/i18n.ts，在 plugins/i18n.ts 決定一次）。
 *
 *   const { t } = useI18n()
 *   模板裡：{{ t.editor.submit }}、{{ t.quota.remaining(n) }}
 *   script 裡：t.value.editor.submit
 *
 * `t` 是整份翻譯物件，不是 vue-i18n 那種 t('key') 函式：key 打錯、某個語言漏翻，型別檢查就會報錯
 * （型別以繁中為準，見 locales/types.ts）。要帶數字或名字的字串寫成函式。
 *
 * 繁中直接打包；其他語言用到才載入，切換語言時先載完才換，畫面不會閃一下空字串。
 * 標了 `zhOnly` 的頁面（後台、LED 牆這些店內用的）不管使用者選什麼都是繁中。
 */

export const LOCALE_STATE_KEY = 'locale'

const loaders: Record<Exclude<Locale, 'zh-TW'>, () => Promise<{ default: Messages }>> = {
  en: () => import('~/locales/en'),
  ja: () => import('~/locales/ja'),
  ko: () => import('~/locales/ko')
}

/** 翻譯內容不會變，伺服器上各個請求共用同一份沒有問題 */
const loaded = new Map<Locale, Messages>([['zh-TW', zhTW]])

export const loadMessages = async (locale: Locale): Promise<void> => {
  if (loaded.has(locale) || locale === 'zh-TW') return
  loaded.set(locale, (await loaders[locale]()).default)
}

export function useI18n() {
  const route = useRoute()
  const chosen = useState<Locale>(LOCALE_STATE_KEY, () => DEFAULT_LOCALE)
  const cookie = useCookie<string | null>(LOCALE_COOKIE, {
    path: '/',
    sameSite: 'lax',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    default: () => null
  })

  /** 這一頁實際用的語言 */
  const locale = computed<Locale>(() => (route.meta.zhOnly ? 'zh-TW' : chosen.value))
  const t = computed<Messages>(() => loaded.get(locale.value) ?? zhTW)

  const setLocale = async (next: Locale) => {
    await loadMessages(next)
    cookie.value = next
    chosen.value = next
  }

  return { locale, t, setLocale }
}
