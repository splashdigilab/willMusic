/**
 * 決定這次要用的語言，並在畫面出來之前把翻譯載好（見 utils/i18n.ts、composables/useI18n.ts）。
 *
 * 伺服器畫頁面時就決定好、放進 useState，瀏覽器接手時沿用同一個值 ——
 * 兩邊各自判斷的話，Accept-Language 與 navigator.languages 不一定一樣，hydration 會對不上。
 * 只在瀏覽器端畫的頁面（/admin）沒有伺服器的結果，才看 navigator.languages。
 */
import { LOCALE_STATE_KEY, loadMessages } from '~/composables/useI18n'
import {
  LOCALE_COOKIE,
  detectLocale,
  parseAcceptLanguage,
  parseLocale,
  type Locale
} from '~/utils/i18n'

export default defineNuxtPlugin(async () => {
  const locale = useState<Locale | undefined>(LOCALE_STATE_KEY, () => undefined)

  if (!locale.value) {
    const fromCookie = parseLocale(useCookie(LOCALE_COOKIE).value)
    locale.value = fromCookie ?? detectLocale(
      import.meta.server
        ? parseAcceptLanguage(useRequestHeaders(['accept-language'])['accept-language'])
        : [...navigator.languages]
    )
  }

  await loadMessages(locale.value)
})
