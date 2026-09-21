/**
 * 便利貼材質資料庫
 *
 * 2026 新視覺改版：稿子畫板 08 的「STEP 1. 挑選材質」是四個選項 ——
 * 前三個純色（黃／天藍／桃紅），第四個是鐳射質感的圖片。
 *
 * value 同時承載兩種材質，用開頭是不是 "#" 來區分：
 *   "#FADC00"                 → 純色，套 background-color
 *   "/svg/bg/material-holo.webp" → 圖片，套 background-image
 *
 * 這樣設計是為了相容既有資料：舊便利貼存的是圖片路徑，
 * 沿用同一個欄位就不需要資料庫遷移，舊貼紙仍能正確顯示。
 */

export interface StickyNoteMaterial {
  id: string
  /** 色碼或圖片路徑，見上方說明 */
  value: string
}

/** 判斷材質值是純色還是圖片 */
export const isColorMaterial = (value?: string): boolean =>
  !!value && value.trim().startsWith('#')

export const STICKY_NOTE_MATERIALS: StickyNoteMaterial[] = [
  { id: 'yellow', value: '#FADC00' },
  { id: 'cyan', value: '#4CC1D6' },
  { id: 'pink', value: '#EA4C71' },
  { id: 'holo', value: '/svg/bg/material-holo.webp' }
]

/** 預設材質（第一個） */
export const DEFAULT_MATERIAL = STICKY_NOTE_MATERIALS[0]?.value ?? '#FADC00'

/**
 * 舊名稱相容：先前的程式以 BACKGROUND_IMAGES / bg.url 取用。
 * 保留匯出避免一次改動過多呼叫端，欄位對應到新的 value。
 */
export interface BackgroundImage {
  id: string
  url: string
}

export const BACKGROUND_IMAGES: BackgroundImage[] = STICKY_NOTE_MATERIALS.map(m => ({
  id: m.id,
  url: m.value
}))
