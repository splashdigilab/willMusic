/**
 * NUXT_PUBLIC_FIRESTORE_SUFFIX 的正規化，nuxt.config（建置時判斷要不要整站 noindex）
 * 與 useCollections（執行時組集合名稱）共用同一份。
 *
 * 'none' 等同不加後綴 —— Amplify 的環境變數一律不接受空字串，正式站只能填一個字來表達「無」。
 * 兩邊各寫一份的話，有人在 Amplify 填成 `None` 或 `none `（多一個空白），
 * 正式站就會一邊整站不給收錄、一邊去讀 queue_pendingNone，而且兩件事都不會報錯。
 */
export const normalizeFirestoreSuffix = (raw: unknown): string => {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value.toLowerCase() === 'none' ? '' : value
}
