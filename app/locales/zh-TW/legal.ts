import { TERMS_RULES } from '~/data/terms'

/**
 * 法律文件相關的介面字。
 *
 * `rules` 是編輯器開場卡片上的活動規範摘要。繁中直接用 data/terms.ts 的 TERMS_RULES（同一份），
 * 其他語言是翻譯 —— 改了 TERMS_RULES，其他三個語言的 legal.ts 也要跟著改。
 *
 * 隱私權政策與活動規範的本文只有繁中版，其他語言在頁首顯示 `chineseOnly`。
 */
export default {
  rules: TERMS_RULES,
  privacyPolicy: '隱私權政策',
  terms: '活動規範',
  /** 非繁中介面看法律文件時的說明（繁中介面不顯示） */
  chineseOnly: ''
}
