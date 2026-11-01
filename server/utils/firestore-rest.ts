/**
 * 伺服器端用 Firestore REST 讀公開資料（主題設定、首頁的便利貼牆）。
 *
 * 不帶 API key 也不登入：讀的都是規則開放所有人讀的集合（firestore.rules）。
 * 網站的 Firebase 金鑰若在 GCP 限定了網域，伺服器帶它反而會被擋。
 */

/**
 * Firestore REST 的位址。本機用 Firebase 模擬器測試時，照 Firebase 官方 SDK 的慣例
 * 看 FIRESTORE_EMULATOR_HOST（例如 127.0.0.1:8080）；正式與測試站都不會設這個變數
 */
export const firestoreBase = (): string => {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST
  return emulator ? `http://${emulator}/v1` : 'https://firestore.googleapis.com/v1'
}

/** REST 回來的欄位值（{ stringValue: 'x' } 這種帶型別的包裝） */
export type FirestoreValue = Record<string, any>

/**
 * 把 REST 的欄位值拆回一般的 JSON。時間戳記轉成 ISO 字串；
 * 便利貼用不到的型別（bytes、reference、geoPoint）照原樣的字串或物件留著
 */
export const fromFirestoreValue = (value: FirestoreValue | undefined): unknown => {
  if (!value) return null
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('stringValue' in value) return value.stringValue
  if ('timestampValue' in value) return value.timestampValue
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields)
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue)
  return value.referenceValue ?? value.bytesValue ?? value.geoPointValue ?? null
}

export const fromFirestoreFields = (fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields ?? {}).map(([key, v]) => [key, fromFirestoreValue(v)]))
