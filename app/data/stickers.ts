/**
 * Sticker 類型定義
 */
export interface StickerType {
  id: string
  defaultScale: number
  svgFile: string // SVG 檔案路徑
}

/**
 * 預設 Sticker 庫
 */
export const STICKER_LIBRARY: StickerType[] = [
  { id: 'sticker-1', defaultScale: 1, svgFile: '/svg/stickers/sticker-1.svg' },
  { id: 'sticker-2', defaultScale: 1, svgFile: '/svg/stickers/sticker-2.svg' },
  { id: 'sticker-3', defaultScale: 1, svgFile: '/svg/stickers/sticker-3.svg' },
  { id: 'sticker-4', defaultScale: 1, svgFile: '/svg/stickers/sticker-4.svg' },
  { id: 'sticker-5', defaultScale: 1, svgFile: '/svg/stickers/sticker-5.svg' },
  { id: 'sticker-6', defaultScale: 1, svgFile: '/svg/stickers/sticker-6.svg' },
  { id: 'sticker-7', defaultScale: 1, svgFile: '/svg/stickers/sticker-7.svg' },
  { id: 'sticker-8', defaultScale: 1, svgFile: '/svg/stickers/sticker-8.svg' },
  { id: 'sticker-9', defaultScale: 1, svgFile: '/svg/stickers/sticker-9.svg' },
  { id: 'sticker-10', defaultScale: 1, svgFile: '/svg/stickers/sticker-10.svg' },
  { id: 'sticker-11', defaultScale: 1, svgFile: '/svg/stickers/sticker-11.svg' },
  { id: 'sticker-12', defaultScale: 1, svgFile: '/svg/stickers/sticker-12.svg' },
]

/**
 * 依 ID 取得 Sticker
 */
export const getStickerById = (id: string): StickerType | undefined =>
  STICKER_LIBRARY.find(s => s.id === id)
