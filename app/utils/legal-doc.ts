/**
 * 法律文件（隱私權政策、活動規範）共用的資料結構。
 *
 * 這類文件有兩個共同的需求：
 *   1. 文案與版面分開，法務或客戶改完只要換資料檔
 *   2. 還沒定稿的地方用【】標示，頁面自己偵測並顯示警告 ——
 *      不靠人記得在上線前關掉某個開關
 */

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'note'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }

export interface LegalSection {
  /** 目錄與錨點用 */
  id: string
  heading: string
  blocks: LegalBlock[]
}

/** 把巢狀的區塊攤成純文字 */
export const blockText = (block: LegalBlock): string => {
  switch (block.type) {
    case 'p':
    case 'h3':
    case 'note':
      return block.text
    case 'ul':
    case 'ol':
      return block.items.join('')
    case 'table':
      return [...block.head, ...block.rows.flat()].join('')
  }
}

/**
 * 數還有幾處【】沒填。
 *
 * 大於 0 時頁面會顯示「尚未定稿」橫幅並加上 noindex，填完自動消失。
 */
export const countPlaceholders = (...parts: Array<string | LegalBlock[]>): number => {
  const all = parts
    .map(part => (typeof part === 'string' ? part : part.map(blockText).join('')))
    .join('')
  return (all.match(/【/g) || []).length
}
