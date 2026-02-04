/**
 * Sticker 類型定義
 */
export interface StickerType {
  id: string
  category: 'emoji' | 'icon' | 'shape' | 'kpop'
  defaultScale: number
  svgFile: string // SVG 檔案路徑
}

/**
 * 預設 Sticker 庫
 */
export const STICKER_LIBRARY: StickerType[] = [
  // Emoji 類別 (使用 SVG 檔案)
  { id: 'sticker-1', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-1.svg' },
  { id: 'sticker-2', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-2.svg' },
  { id: 'sticker-3', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-3.svg' },
  { id: 'sticker-4', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-4.svg' },
  { id: 'sticker-5', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-5.svg' },
  { id: 'sticker-6', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-6.svg' },
  { id: 'sticker-7', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-7.svg' },
  { id: 'sticker-8', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-8.svg' },
  { id: 'sticker-9', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-9.svg' },
  { id: 'sticker-10', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-10.svg' },
  { id: 'sticker-11', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-11.svg' },
  { id: 'sticker-12', category: 'emoji', defaultScale: 1, svgFile: '/svg/stickers/sticker-12.svg' },
]

/**
 * 依類別取得 Stickers
 */
export const getStickersByCategory = (category: StickerType['category']) => {
  return STICKER_LIBRARY.filter(s => s.category === category)
}

/**
 * 取得所有類別
 */
export const getStickerCategories = (): Array<{ id: StickerType['category'], name: string }> => {
  return [
    { id: 'emoji', name: 'Emoji' },
    { id: 'kpop', name: 'K-Pop' },
    { id: 'icon', name: '圖示' },
    { id: 'shape', name: '形狀' }
  ]
}
