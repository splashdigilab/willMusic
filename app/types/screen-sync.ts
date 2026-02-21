import type { SerializedNote } from '~/utils/screen-sync-payload'

/**
 * BroadcastChannel 跨分頁訊息協議（note 以 SerializedNote 傳送，可被 structured clone）
 * Display（指揮端）↔ Live（執行端）
 */
export type ScreenSyncMessage =
  /** Display → Live：閒置時請求借一張 history note 做輪播 */
  | { type: 'BORROW_REQUEST' }
  /** Live → Display：已選好這張並開始出場動畫，夾帶 note 資料供 Display 預先渲染 */
  | { type: 'BORROW_DEPARTING'; note: SerializedNote }
  /** Live → Display：Live 出場動畫結束，Display 可開始從左側入場 */
  | { type: 'LIVE_EXIT_DONE'; noteId: string }
  /** Display → Live：idle note 出場完畢，Live 可讓此 note 從右側飛回原 slot */
  | { type: 'DISPLAY_EXIT_DONE'; noteId: string }
  /** Display → Live：新 pending note 展示完畢，含完整 note 資料，Live 從右側接入 */
  | { type: 'NEW_NOTE_ARRIVING'; note: SerializedNote }
