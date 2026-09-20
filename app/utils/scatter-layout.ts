/**
 * 不重疊的散落排版：費馬螺旋 + 空間網格碰撞偵測。
 *
 * 首頁（`/`）與大螢幕（`/canvas`）都用這套佈局，差別只在座標系的尺度：
 * 首頁直接用 px、大螢幕先在虛擬座標系排好再整體縮放到播放區。
 *
 * 特性：
 * - 完全決定性（沒有亂數），同樣的輸入永遠得到同樣的結果
 * - 第 0 個元素一定落在原點 (0, 0)
 * - 碰撞偵測用網格分割，只比對相鄰 9 格，避免 O(n²)
 */

export interface ScatterPosition {
  x: number
  y: number
}

export interface ScatterOptions {
  /** 元素邊長。碰撞半徑會以「旋轉 45° 後的外接框」計算，所以元素可以自由旋轉不重疊 */
  itemSize: number
  /** 元素間距：負值排得更緊、正值更鬆 */
  margin: number
  /** 螺旋步進係數，越大整體越鬆散 */
  spiralStep?: number
}

/** 黃金角，讓螺旋上的點分布得最均勻 */
const GOLDEN_ANGLE_DEG = 137.508

export const DEFAULT_SPIRAL_STEP = 35

/**
 * 元素旋轉後的最大外接框邊長。
 * 例如 150×150 的方塊轉 45° 後對角線是 150 × √2 ≈ 212。
 */
export const boundingBoxOf = (itemSize: number): number => itemSize * Math.SQRT2

/** 碰撞半徑：外接框加上間距後的一半 */
export const collisionRadiusOf = (itemSize: number, margin: number): number =>
  (boundingBoxOf(itemSize) + margin) / 2

const gridKey = (x: number, y: number, cellSize: number): string =>
  `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`

const isColliding = (
  pos: ScatterPosition,
  grid: Map<string, ScatterPosition[]>,
  cellSize: number,
  diameterSq: number
): boolean => {
  const cellX = Math.floor(pos.x / cellSize)
  const cellY = Math.floor(pos.y / cellSize)

  // 只檢查自己與周圍 8 格：任何更遠的元素都不可能碰到
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const neighbours = grid.get(`${cellX + dx},${cellY + dy}`)
      if (!neighbours) continue
      for (const other of neighbours) {
        const distX = pos.x - other.x
        const distY = pos.y - other.y
        if (distX * distX + distY * distY < diameterSq) return true
      }
    }
  }
  return false
}

/**
 * 算出 `count` 個互不重疊的位置。
 * 沿費馬螺旋往外找，碰撞就跳到螺旋上的下一點。
 */
export function calculateScatterPositions(
  count: number,
  { itemSize, margin, spiralStep = DEFAULT_SPIRAL_STEP }: ScatterOptions
): ScatterPosition[] {
  const positions: ScatterPosition[] = []
  if (count <= 0) return positions

  const collisionRadius = collisionRadiusOf(itemSize, margin)
  const cellSize = collisionRadius * 2
  const diameterSq = cellSize * cellSize

  const grid = new Map<string, ScatterPosition[]>()
  let spiralIndex = 0

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      const origin = { x: 0, y: 0 }
      positions.push(origin)
      grid.set(gridKey(origin.x, origin.y, cellSize), [origin])
      spiralIndex++
      continue
    }

    let placed: ScatterPosition = { x: 0, y: 0 }
    for (;;) {
      const radius = spiralStep * Math.sqrt(spiralIndex)
      const theta = spiralIndex * GOLDEN_ANGLE_DEG * (Math.PI / 180)
      placed = { x: radius * Math.cos(theta), y: radius * Math.sin(theta) }
      spiralIndex++
      if (!isColliding(placed, grid, cellSize, diameterSq)) break
    }

    positions.push(placed)
    const key = gridKey(placed.x, placed.y, cellSize)
    const bucket = grid.get(key)
    if (bucket) bucket.push(placed)
    else grid.set(key, [placed])
  }

  return positions
}
