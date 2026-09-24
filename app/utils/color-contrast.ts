import { isColorMaterial } from '~/data/backgrounds'

/**
 * 色票可用性：算「色票」與「便利貼材質」差多少，太接近的就不給選。
 *
 * 為什麼用算的而不是每個材質各列一份「不可用色碼」清單：
 * 材質有 6 種、筆刷色有 22 個，手列是 132 格的表，日後加材質或改調色盤兩邊很容易對不上。
 * 算的話兩邊都只是資料，改了自己會跟著對。
 *
 * 為什麼用 OKLab 距離而不是 WCAG 對比度：
 * WCAG 只看亮度，會把「亮度相近但色相互補」誤判成看不到 ——
 * 橘 #f99d1c 畫在天藍材質 #4CC1D6 上，兩者亮度幾乎相同（對比度 1.00），
 * 但實際上非常清楚。OKLab 同時涵蓋明度與色相，判斷結果才跟眼睛一致。
 */

/** #RGB 或 #RRGGBB → [r, g, b]（0–255）。認不出來回傳 null。 */
const parseHex = (hex: string): [number, number, number] | null => {
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ]
}

/** 單一通道的 sRGB 反伽瑪 */
const toLinear = (channel: number): number => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** sRGB 色碼 → OKLab 的 [L, a, b]（Björn Ottosson 的係數）。認不出來回傳 null。 */
const toOklab = (hex: string): [number, number, number] | null => {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(toLinear) as [number, number, number]

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ]
}

/**
 * 兩個色碼的感知色差，0（同色）起跳，純黑對純白約 1.0。
 * 任一色碼認不出來回傳 null。
 */
export const colorDistance = (a: string, b: string): number | null => {
  const A = toOklab(a)
  const B = toOklab(b)
  if (!A || !B) return null
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

/**
 * 色票要留在面板上的最低色差。
 *
 * 這是「看不看得到」而不是「讀不讀得清楚」的門檻，所以訂得比排版用的無障礙標準寬鬆：
 * 一條筆畫或一行標題只要跟底色分得出來就夠用，訂太嚴會把整排粉彩色全砍掉。
 *
 * 0.15 是把 6 個材質 × 22 個筆刷色全部畫出來逐格看過挑的：
 *   天藍材質擋掉 #00A8C6(0.08)、#91a9d0(0.08)、#66E5FF(0.11)、#81a5f9(0.11)、
 *   #a6e2de(0.13)、#bbdcef(0.14)，而互補的橘 #f99d1c(0.26) 留著；
 *   黑材質只擋掉自己與深藍 #12205c(0.11)。
 * 覺得擋太多或擋不夠，調這個數字就好。
 */
export const MIN_SWATCH_DISTANCE = 0.15

/**
 * 這個色票在這個材質上看不看得到。
 *
 * 材質是圖片（鐳射）時沒有單一顏色可比，一律視為看得到 ——
 * 寧可不擋，也不要憑猜測讓使用者少掉選項。
 */
export const isSwatchVisibleOn = (material: string, color: string): boolean => {
  if (!isColorMaterial(material)) return true
  const distance = colorDistance(material, color)
  if (distance === null) return true
  return distance >= MIN_SWATCH_DISTANCE
}
