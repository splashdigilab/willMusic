/**
 * 大螢幕顯示與即時牆共用常數
 * 每張便利貼播放秒數、動畫比例、歷史張數皆由此衍生
 */

/** display 閒置輪播與 live 即時牆共用的歷史張數（同一份「最新 N 張」） */
export const HISTORY_POOL_SIZE = 9

/** 每張便利貼播放秒數 */
export const DISPLAY_SLOT_DURATION_SECONDS = 3

/** 每張播放毫秒數（由 DISPLAY_SLOT_DURATION_SECONDS 衍生） */
export const DISPLAY_SLOT_DURATION_MS = DISPLAY_SLOT_DURATION_SECONDS * 1000

/**
 * 動畫佔 slot 的比例（0~1）
 * 前 ratio：進入動畫（底部→中央，尺寸至 1.1 再回 1）
 * 後 ratio：移出動畫（中央尺寸 1→1.1，再往底部移出）
 * 中間 (1 - 2*ratio)：靜止
 */
export const DISPLAY_ANIMATION_RATIO = 0.1
