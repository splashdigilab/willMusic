/**
 * 日文、韓文介面的字型（scripts/fonts/build.py 的「語言層」）。
 *
 * @font-face 在建置時讀進來（?raw），選了那個語言才內嵌到 <head> 並預載字型檔 ——
 * 跟繁中的介面字一樣不多一次樣式表往返，介面不會先用後備字型畫一次再換。
 * 兩份加起來只有幾 KB，所以直接打包，不另外延遲載入。
 * 字型名稱與套用的地方見 base/_global.scss 的 html:lang(ja)／html:lang(ko)。
 *
 * 改了日文或韓文翻譯之後要跑 `python3 scripts/fonts/build.py --locale-ui`，
 * 新的字才會進字型；沒跑的話那幾個字會退回繁中的字型，顯示正常但字形不一致。
 */
import jaFaces from '~~/public/fonts/line-seed-ui-ja.css?raw'
import koFaces from '~~/public/fonts/line-seed-ui-ko.css?raw'
import type { Locale } from '~/utils/i18n'

interface LocaleUiFont {
  css: string
  files: string[]
}

export const LOCALE_UI_FONTS: Partial<Record<Locale, LocaleUiFont>> = {
  ja: {
    css: jaFaces,
    files: [400, 700, 800].map(w => `/fonts/line-seed-ui-ja-${w}.woff2`)
  },
  ko: {
    css: koFaces,
    files: [400, 700].map(w => `/fonts/line-seed-ui-ko-${w}.woff2`)
  }
}
