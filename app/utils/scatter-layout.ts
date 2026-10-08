/**
 * 首頁（`/`）便利貼牆的排版：跟大螢幕的流動牆同一種凌亂感（見 ~/utils/wall-look），
 * 只是不流動，從中間往外排成一團。
 *
 * - 底子是磚牆：一欄一欄，格子是正方形，奇數欄往下錯開半格（跟大螢幕由下往上流的欄一樣）
 * - 格子照離原點的距離排，第 0 張在正中間 (0, 0)，越後面越外圈
 * - 每張再依自己的樣子（WallLook）歪一個角度、前後左右偏一段，會互相壓到一些
 */
import { ALONG_JITTER, CROSS_JITTER, maxTiltOf, type WallLook } from '~/utils/wall-look'

export interface ScatterPosition {
  /** 便利貼中心，相對於原點 */
  x: number
  y: number
  rotation: number
}

export interface ScatterOptions {
  /** 便利貼邊長（px） */
  itemSize: number
  /** 便利貼佔格距的比例，其餘是間距 */
  scale: number
  /** 雜亂程度，0 = 整齊磚牆、1 = 最亂 */
  mess: number
  /** 最多歪幾度；沒給就跟著 mess 走 */
  tilt?: number
}

/** 從原點往外最近的 count 個格子中心 */
const brickCells = (count: number, pitch: number) => {
  // 每格佔 pitch²，排成圓大約要這個半徑（格數）；多抓兩格，圓周附近的格子才不會漏掉
  const reach = Math.ceil(Math.sqrt(count / Math.PI)) + 2
  const cells: { x: number; y: number; d: number; angle: number }[] = []
  for (let col = -reach; col <= reach; col++) {
    const offset = col % 2 ? 0.5 : 0
    for (let row = -reach; row <= reach; row++) {
      const x = col * pitch
      const y = (row + offset) * pitch
      cells.push({ x, y, d: x * x + y * y, angle: Math.atan2(y, x) })
    }
  }
  // 距離一樣的照角度排，同樣的張數永遠排出同樣的形狀
  cells.sort((p, q) => p.d - q.d || p.angle - q.angle)
  return cells.slice(0, count)
}

/** 依序排好每一張的位置與角度，looks[i] 是第 i 張的樣子 */
export function calculateScatterPositions(
  looks: WallLook[],
  { itemSize, scale, mess, tilt }: ScatterOptions
): ScatterPosition[] {
  const pitch = itemSize / scale
  const maxTilt = maxTiltOf(mess, tilt)
  return brickCells(looks.length, pitch).map((cell, i) => {
    const look = looks[i]!
    return {
      x: cell.x + look.cross * CROSS_JITTER * pitch * mess,
      y: cell.y + look.along * ALONG_JITTER * pitch * mess,
      rotation: look.tilt * maxTilt
    }
  })
}
