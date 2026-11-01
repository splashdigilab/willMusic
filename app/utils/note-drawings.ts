/**
 * 便利貼的手繪圖檔。一張便利貼可能有好幾張：第一輪在 style.drawing，
 * 之後幾輪在 style.drawingLayers（為什麼會分輪，見 sticky-note-style.ts 的 NOTE_LAYER_Z）。
 */
import { deleteObject, ref as storageRef, type FirebaseStorage } from 'firebase/storage'

/** 手繪圖在 Storage 上的資料夾 */
export const NOTE_DRAWING_PATH = 'note_drawings'

/**
 * 手繪圖檔的 Cache-Control。檔名帶隨機碼、Storage 規則又不准覆寫，同一個網址的內容永遠不變，
 * 可以放心長期快取。上傳時設（useFirestore 的 uploadDrawing）
 */
export const NOTE_DRAWING_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** 便利貼上所有手繪圖的來源（網址或內嵌的 data URL） */
export function noteDrawingSources(style: unknown): string[] {
  if (!style || typeof style !== 'object') return []
  const { drawing, drawingLayers } = style as { drawing?: unknown; drawingLayers?: unknown }
  const sources: string[] = []
  if (typeof drawing === 'string') sources.push(drawing)
  if (Array.isArray(drawingLayers)) {
    for (const layer of drawingLayers) {
      if (typeof layer?.src === 'string') sources.push(layer.src)
    }
  }
  return sources
}

/**
 * 手繪圖能不能顯示：只收內嵌的 PNG 與本站 bucket 的 note_drawings/。
 *
 * firestore.rules 對新格式驗的是同樣的條件，這裡再擋一次：【過渡期】的舊格式什麼都收，
 * 規則還沒部署到的期間也一樣。外部網址會讓牆上的圖由別人的主機供應，
 * 每個看牆的人的 IP 也會被對方記下來（理由同署名頭貼，見 name-tag.ts 的 isInlineAvatar）。
 * 沒設定 bucket 的環境退回只看網域與資料夾，不至於讓所有手繪一起消失
 */
export function isNoteDrawingSrc(src: unknown, bucket: string): src is string {
  if (typeof src !== 'string') return false
  if (src.startsWith('data:image/png;base64,')) return true
  const prefix = bucket
    ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${NOTE_DRAWING_PATH}%2F`
    : 'https://firebasestorage.googleapis.com/v0/b/'
  return src.startsWith(prefix) && src.includes(`/o/${NOTE_DRAWING_PATH}%2F`)
}

/**
 * 這張圖是不是這張便利貼自己上傳的：檔名以便利貼的 ID 開頭
 * （`{id}-{隨機碼}.png`，最早的幾張是 `{id}.png`，見 useFirestore 的 uploadDrawing）。
 * 規則只驗網址開頭時，別人可以把你的圖片網址抄進他的便利貼；後台刪他那張的時候
 * 不能連你的圖一起刪掉
 */
export function isOwnDrawingFile(src: string, noteId: string): boolean {
  const file = `/o/${NOTE_DRAWING_PATH}%2F${encodeURIComponent(noteId)}`
  return src.includes(`${file}-`) || src.includes(`${file}.png`)
}

/**
 * 刪便利貼時清掉它的手繪圖檔：只刪這張自己上傳的（isOwnDrawingFile），
 * 內嵌的 data URL 沒有檔案。一張失敗不影響其他張，已經不存在的不算失敗。
 * 呼叫端要先刪文件再清圖：反過來的話，文件刪除一旦失敗，牆上會留下破圖
 */
export async function deleteNoteDrawings(
  storage: FirebaseStorage,
  noteId: string,
  style: unknown,
  failureMessage: string
): Promise<void> {
  const files = noteDrawingSources(style).filter(src => src.startsWith('http') && isOwnDrawingFile(src, noteId))
  await Promise.all(files.map(async (src) => {
    try {
      await deleteObject(storageRef(storage, src))
    } catch (err: any) {
      if (err?.code !== 'storage/object-not-found') console.warn(failureMessage, err)
    }
  }))
}
