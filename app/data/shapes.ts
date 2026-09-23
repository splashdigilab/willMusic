/**
 * 便利貼造型 SVG 資料庫
 * 使用 mask-image 直接讀取 Illustrator 輸出的 SVG（無需 clipPath）
 * 設計規範：1:1 畫布、形狀需有填色（填色區域 = 可見區域）
 */

export interface StickyNoteShape {
  id: string
  svg: string // SVG 檔案路徑（預覽 + clip-path 共用）
}

/**
 * 造型資料庫：所有曾經提供過的造型都要留在這裡。
 *
 * 便利貼存進 Firestore 的是 shape 字串，顯示端靠 getShapeById 查回 SVG。
 * 把造型從這裡刪掉，已經上牆的舊便利貼會查不到而退回預設的正方形 ——
 * 要下架某個造型，是從下面的 SELECTABLE_SHAPES 拿掉，不是從這裡。
 */
export const STICKY_NOTE_SHAPES: StickyNoteShape[] = [
  { id: 'square', svg: '/svg/shapes/square.svg' },
  { id: 'circle', svg: '/svg/shapes/circle.svg' },
  { id: 'star', svg: '/svg/shapes/star.svg' },
  { id: 'heart', svg: '/svg/shapes/heart.svg' },
  { id: 'hexagon', svg: '/svg/shapes/hexagon.svg' },
  { id: 'round', svg: '/svg/shapes/round.svg' },
  { id: 'diamond', svg: '/svg/shapes/diamond.svg' },
]

/**
 * 編輯器 STEP 2 實際列出的造型與排列順序，依設計稿：愛心、寶石、爆炸星、正方形、圓形。
 * hexagon（圓角七邊形）與 round（圓角正方形）不在稿子上，所以不出現在選單，
 * 但仍留在上面的資料庫裡，舊便利貼才查得到。
 */
export const SELECTABLE_SHAPES: StickyNoteShape[] = [
  'heart', 'diamond', 'star', 'square', 'circle'
].map(id => STICKY_NOTE_SHAPES.find(s => s.id === id)!)

/**
 * 預設造型。刻意寫死而不取陣列第一個 ——
 * 它同時是「這張便利貼有沒有被動過」的判斷基準（saveDraftData / hasAnyContent），
 * 日後有人調整陣列順序不該連帶改掉新便利貼的預設長相。
 */
export const DEFAULT_SHAPE_ID = 'square'

/**
 * 根據 ID 取得造型
 */
export const getShapeById = (id: string): StickyNoteShape | undefined => {
  return STICKY_NOTE_SHAPES.find(shape => shape.id === id)
}
