/**
 * 便利貼造型 SVG 資料庫
 * 使用 mask-image 直接讀取 Illustrator 輸出的 SVG（無需 clipPath）
 * 設計規範：1:1 畫布、形狀需有填色（填色區域 = 可見區域）
 */

export interface StickyNoteShape {
  id: string
  svg: string // SVG 檔案路徑（預覽 + clip-path 共用）
  /**
   * 預先算好的陰影圖（scripts/shapes/build_shadows.py 依上面的 svg 產生）。
   * 新增造型時要重跑那支腳本，否則這個造型的便利貼不會有陰影。
   */
  shadow: string
  /**
   * 只影響 STEP 2 選單裡的預覽大小（1 = 撐滿格子），不影響便利貼實際的裁切形狀。
   * 稿子上正方形刻意畫得比其他造型小 —— 外接框一樣大時，實心方塊看起來就是比圓形大，
   * 這是視覺補正。其餘造型的輪廓本來就不會填滿外接框，不需要補。
   */
  previewScale?: number
}

/**
 * 造型資料庫：所有曾經提供過的造型都要留在這裡。
 *
 * 便利貼存進 Firestore 的是 shape 字串，顯示端靠 getShapeById 查回 SVG。
 * 把造型從這裡刪掉，已經上牆的舊便利貼會查不到而退回預設的正方形 ——
 * 要下架某個造型，是從下面的 SELECTABLE_SHAPES 拿掉，不是從這裡。
 */
export const STICKY_NOTE_SHAPES: StickyNoteShape[] = [
  { id: 'square', svg: '/svg/shapes/square.svg', shadow: '/svg/shapes/shadow/square.webp', previewScale: 0.85 },
  { id: 'circle', svg: '/svg/shapes/circle.svg', shadow: '/svg/shapes/shadow/circle.webp' },
  { id: 'star', svg: '/svg/shapes/star.svg', shadow: '/svg/shapes/shadow/star.webp' },
  { id: 'heart', svg: '/svg/shapes/heart.svg', shadow: '/svg/shapes/shadow/heart.webp' },
  { id: 'hexagon', svg: '/svg/shapes/hexagon.svg', shadow: '/svg/shapes/shadow/hexagon.webp' },
  { id: 'round', svg: '/svg/shapes/round.svg', shadow: '/svg/shapes/shadow/round.webp' },
  { id: 'diamond', svg: '/svg/shapes/diamond.svg', shadow: '/svg/shapes/shadow/diamond.webp' },
  // 萬聖節（2026）。只在萬聖節主題列進選單（見 data/themes.ts），節慶過後仍要留在這裡
  { id: 'pumpkin', svg: '/svg/shapes/pumpkin.svg', shadow: '/svg/shapes/shadow/pumpkin.webp' },
  { id: 'skull', svg: '/svg/shapes/skull.svg', shadow: '/svg/shapes/shadow/skull.webp' },
  { id: 'ghost', svg: '/svg/shapes/ghost.svg', shadow: '/svg/shapes/shadow/ghost.webp' },
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
