/**
 * 依 token 去重：同一 token 只保留第一筆（呼叫端已照 playedAt 新到舊排好，留下的就是最新的）。
 * 沒有 token 的舊資料用 doc ID 當 key。
 *
 * 瀏覽器（useFirestore 的 getHistory）與伺服器（/api/wall）共用，兩邊的牆才會一致
 */
export const deduplicateByToken = <T extends { id?: string; token?: string }>(items: T[]): T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.token || item.id || ''
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
