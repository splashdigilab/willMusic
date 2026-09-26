import {
  collection,
  documentId,
  getDocs,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot
} from 'firebase/firestore'

/** Firestore 的 `in` 條件一次最多 30 個值 */
const IN_QUERY_LIMIT = 30

/**
 * 依 doc ID 一次拿多份文件。每 30 個一組查詢，比逐筆 getDoc 少很多次來回。
 * 不存在的 ID 直接不會出現在結果裡。
 */
export const getDocsByIds = async (
  db: Firestore,
  collectionName: string,
  ids: string[]
): Promise<QueryDocumentSnapshot[]> => {
  const unique = [...new Set(ids)]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += IN_QUERY_LIMIT) {
    chunks.push(unique.slice(i, i + IN_QUERY_LIMIT))
  }
  const snaps = await Promise.all(chunks.map(chunk =>
    getDocs(query(collection(db, collectionName), where(documentId(), 'in', chunk)))
  ))
  return snaps.flatMap(s => s.docs)
}
