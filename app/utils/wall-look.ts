/**
 * 便利貼牆的凌亂感：大螢幕的流動牆（useNoteFlow）與首頁的散落牆共用這一套，
 * 兩邊看起來才是同一面牆。
 *
 * 底子是磚牆：格子是正方形，相鄰兩道錯開半格。每張再各自歪一個角度、前後左右偏一段，
 * 前後間距有疏有密、左右可以壓到隔壁道，欄就不再筆直。
 */

/**
 * 預設的樣子：/canvas 沒帶網址參數時用這組，首頁一律用這組。
 * - scale：便利貼邊長佔格距的比例，其餘是間距
 * - mess：雜亂程度，0 = 整齊磚牆、1 = 最亂（大小不變，偏移差最多，會互相壓到一些）
 * - tilt：最多歪幾度（每張在 ±tilt 之間）
 */
export const WALL_LOOK = { scale: 0.85, mess: 1, tilt: 5 } as const

/** 沒指定 tilt 時傾斜的範圍：整齊時 ±3°（完全不歪太死板），最亂時 ±12° */
export const TILT_NEAT = 3
export const TILT_MESSY = 12
/** 最亂時順著流向偏多少（格距的 ±25%）：前後兩張有的擠、有的鬆，相鄰幾道也不會排成一橫線 */
export const ALONG_JITTER = 0.25
/** 最亂時往兩側偏多少（道寬的 ±40%）：可以壓到隔壁道 */
export const CROSS_JITTER = 0.4

/**
 * 每張自己的樣子：第一次看到這張時擲一次骰子，之後不變。
 * 都是 -1～1 的亂數，實際的角度與偏移由用的地方依當下的版面與 mess 換算
 */
export interface WallLook {
  tilt: number
  along: number
  cross: number
}

export const randomWallLook = (): WallLook => {
  const r = () => Math.random() * 2 - 1
  return { tilt: r(), along: r(), cross: r() }
}

/**
 * 最多歪幾度：有指定就照指定，沒有就跟著 mess 走。
 * 上限 45°：外接框（turnFactor）在 45° 最大，超過就算不準，溢出量會估太小
 */
export const maxTiltOf = (mess: number, tilt?: number) =>
  tilt != null ? Math.min(45, Math.max(0, tilt)) : TILT_NEAT + (TILT_MESSY - TILT_NEAT) * mess

/** 轉了 deg 度的正方形，外接框的邊長是原本的幾倍 */
export const turnFactor = (deg: number) => {
  const rad = (Math.abs(deg) * Math.PI) / 180
  return Math.cos(rad) + Math.sin(rad)
}
