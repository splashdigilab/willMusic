/**
 * 署名（名牌貼紙）的共用常數與工具。
 *
 * 名牌在編輯器裡是 stickers 陣列中的一個特殊成員（type = NAME_TAG_STICKER_TYPE），
 * 拖曳、雙指縮放旋轉、刪除鈕都直接沿用貼紙那一套。但它不會以貼紙的身分存出去：
 * 草稿存成 DraftData.nameTag（只有位置），送出存成 style.nameTag（加上暱稱與頭貼），
 * 兩處都在 editor.vue 裡拆開。拆開才有辦法讓 firestore.rules 驗暱稱。
 */
import type { NameTagPlacement, StickerInstance } from '~/types'

export const NAME_TAG_STICKER_TYPE = 'name-tag'

/** 名牌在 stickers 陣列裡的固定 id —— 一張便利貼最多一個名牌 */
export const NAME_TAG_STICKER_ID = 'name-tag'

export const isNameTagSticker = (sticker: Pick<StickerInstance, 'type'>) =>
  sticker.type === NAME_TAG_STICKER_TYPE

/** 預設大小。雙指縮放的下限是 1，比預設小一點也還看得清楚 */
const DEFAULT_SCALE = 1.5

/**
 * 各造型放名牌的預設高度（%），水平一律置中。
 *
 * 不能照署名的慣例放右下角：七種造型裡只有方形與圓角方形的右下角有東西，
 * 圓、愛心、菱形、爆炸星、五角形的右下角都在輪廓外面，會被遮罩整個切掉。
 * 下緣置中也要看造型：愛心與菱形往下收窄得很快，放太低只剩一小段看得到。
 * 數字是照 public/svg/shapes/ 的輪廓算的：在這個高度，造型的寬度都還有一半以上，
 * 一般長度的暱稱放得下。
 */
const DEFAULT_Y_BY_SHAPE: Record<string, number> = {
  square: 84,
  round: 84,
  circle: 80,
  hexagon: 80,
  star: 76,
  heart: 66,
  diamond: 64
}

export const defaultNameTagPlacement = (shapeId: string): NameTagPlacement => ({
  x: 50,
  y: DEFAULT_Y_BY_SHAPE[shapeId] ?? 80,
  scale: DEFAULT_SCALE,
  rotation: 0
})

/** 暱稱可能以 emoji 開頭，用 Array.from 才不會切到半個字 */
export const nameInitial = (name: string) => Array.from(name || '?')[0]

/**
 * 頭貼只收這種格式，與 firestore.rules 的 isValidNameTag 一致。
 * 擋的是外部網址：那會讓牆上的圖片由別人的主機供應，審核過後還能換掉。
 */
export const isInlineAvatar = (value: unknown): value is string =>
  typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(value)

/** 頭貼縮圖的邊長。名牌上顯示得很小，LED 牆放大展示時也還夠用 */
const AVATAR_SIZE = 128

/**
 * 把頭貼縮成小張 JPEG 再放進便利貼。
 *
 * users/{uid} 裡的頭貼是 LINE 的 /small 縮圖（上限 30KB）。直接放進便利貼的話，
 * 首頁一次讀 100 張就可能多拖好幾 MB —— 手繪圖當初就是因為這個搬去 Storage。
 * 縮到 128px 之後只剩幾 KB，留在文件裡就好。
 * 來源本身是 data URL，畫進 canvas 不會被當成跨網域而無法匯出。
 * 失敗就回 null（名牌改顯示暱稱第一個字），不擋送出。
 */
export const downscaleAvatar = (dataUrl: string): Promise<string | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        if (!side) { resolve(null); return }
        const size = Math.min(AVATAR_SIZE, side)
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        // JPEG 沒有透明度，透明底的頭貼不先鋪白會變成黑底
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, size, size)
        // 置中裁成正方形：名牌上是圓形頭像，長方形的頭貼不裁會被壓扁
        const sx = (img.naturalWidth - side) / 2
        const sy = (img.naturalHeight - side) / 2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
