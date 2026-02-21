/**
 * 大螢幕顯示與即時牆共用常數
 * 每張便利貼播放秒數、動畫比例、歷史張數皆由此衍生
 */

/** display 閒置輪播與 live 即時牆共用的歷史張數（同一份「最新 N 張」） */
export const HISTORY_POOL_SIZE = 25

/** 每張便利貼播放秒數 */
export const DISPLAY_SLOT_DURATION_SECONDS = 5

/** 每張播放毫秒數（由 DISPLAY_SLOT_DURATION_SECONDS 衍生） */
export const DISPLAY_SLOT_DURATION_MS = DISPLAY_SLOT_DURATION_SECONDS * 1000

/**
 * 動畫佔 slot 的比例（0~1）
 * 前 ratio：進入動畫（動畫1 移入+scale、動畫2 scale→1）
 * 後 ratio：移出動畫（動畫1 scale→1.1、動畫2 移出+scale）
 * 中間 (1 - 2*ratio)：靜止
 */
export const DISPLAY_ANIMATION_RATIO = 0.4

/**
 * 畫面外／移入移出時的 scale（較大）
 * 移入：從此值與位移同時變到 DISPLAY_SCALE_PEAK；移出：從 PEAK 與位移同時變到此值
 */
export const DISPLAY_SCALE_OFF = 0.5

/**
 * 動畫中間的 scale（移入時先到此再變 1，移出時從 1 先到此再與位移一起變 OFF）
 */
export const DISPLAY_SCALE_PEAK = 1.1

/**
 * 進入階段內「動畫1」所佔比例（0~1）
 * 動畫1：從畫面外移入同時 scale DISPLAY_SCALE_OFF → DISPLAY_SCALE_PEAK
 * 動畫2：scale DISPLAY_SCALE_PEAK → 1
 */
export const DISPLAY_ENTER_ANIM1_RATIO = 0.5

/**
 * 移出階段內「動畫1」所佔比例（0~1）
 * 動畫1：scale 1 → DISPLAY_SCALE_PEAK
 * 動畫2：往外移出同時 scale DISPLAY_SCALE_PEAK → DISPLAY_SCALE_OFF
 */
export const DISPLAY_EXIT_ANIM1_RATIO = 1 - DISPLAY_ENTER_ANIM1_RATIO

// ─── Live 牆動畫設定 ───────────────────────────────────────────────────────────

/**
 * Live 動畫與 Display 使用相同 phase 時長：
 * DISPLAY_SLOT_DURATION_SECONDS * DISPLAY_ANIMATION_RATIO（入場/出場各一階段）
 * 比例同 DISPLAY_ENTER_ANIM1_RATIO / DISPLAY_EXIT_ANIM1_RATIO
 */

/**
 * Live 畫面外／飛行中的 scale（移入：從此值→PEAK；移出：PEAK→此值）
 * 與 Display 視覺一致時可設為與 DISPLAY_SCALE_OFF 相同（例：2）
 */
export const LIVE_SCALE_OFF = 2

/**
 * Live 動畫中間的 scale（移入時先到此再變 1，移出時從 1 先到此再與位移一起變 OFF）
 * 與 Display 一致可設 1.1
 */
export const LIVE_SCALE_PEAK = 1.1
