/**
 * 產生 CSV 並讓瀏覽器下載。目前只有後台的行銷名單在用。
 *
 * 開頭加 BOM：Excel 遇到沒有 BOM 的 UTF-8 會當成 Big5 讀，中文暱稱全變亂碼。
 * 寄信服務（Mailchimp 之類）匯入時都認得 BOM，不受影響。
 */

/**
 * 含逗號、引號、換行的欄位要整格包引號，裡面的引號重複一次。
 *
 * 開頭是 = + - @ 的欄位前面墊一個單引號：暱稱是使用者自己取的，
 * 取成「=HYPERLINK(…)」的話，用 Excel 打開名單時會被當成公式執行。
 */
const escapeCell = (raw: string): string => {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export const toCsv = (rows: string[][]): string =>
  rows.map(row => row.map(escapeCell).join(',')).join('\r\n')

export const downloadCsv = (filename: string, rows: string[][]) => {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
