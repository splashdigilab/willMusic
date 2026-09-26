import type { Timestamp } from 'firebase/firestore'

/**
 * 貼紙實例
 */
export interface StickerInstance {
  id: string
  type: string
  x: number
  y: number
  scale: number
  rotation: number
}

/**
 * 文字區塊實例（多文字支援）
 */
export interface TextBlockInstance {
  id: string
  content: string
  x: number
  y: number
  scale: number
  rotation: number
  color: string
  align: TextAlign
  /**
   * 鎖定圖層：無法被點擊選取，只能長按解鎖。
   * 上鎖的入口已從編輯器面板拿掉，這個欄位留著讓舊草稿裡已鎖定的區塊還能長按解開。
   */
  locked?: boolean
}

/**
 * 草稿資料
 */
export type TextAlign = 'left' | 'center' | 'right'

export interface DraftData {
  content: string
  backgroundImage: string // 背景圖片 URL
  shape: string // 造型 ID
  textColor: string
  textAlign?: TextAlign
  stickers: StickerInstance[]
  textTransform?: TextBlockTransform
  textBlocks?: TextBlockInstance[] // 多文字區塊
  drawing?: string // 手繪內容 data URL
  /** 各物件 id 的疊放順序（與編輯器 objectZOrder 一致）；載入草稿時還原 */
  objectLayerOrder?: Record<string, number>
  /**
   * 這份草稿送出時要用的 queue_pending doc ID。
   *
   * 跟著草稿走，所以「按送出 → 被導去 LINE 登入 → 回來再送一次」與
   * 「使用者連按兩下」都會寫到同一個 ID。規則只開放 create（update 是 false），
   * 第二次寫同一個 ID 會被 Firestore 擋下來，不會變成兩張便利貼。
   */
  submissionId?: string
  timestamp: number
}

/**
 * 文字區塊變換（位置、縮放、旋轉）
 */
export interface TextBlockTransform {
  x: number
  y: number
  scale: number
  rotation: number
}

/**
 * 便利貼樣式配置
 */
export interface StickyNoteStyle {
  backgroundImage: string // 背景圖片 URL
  shape: string // 造型 ID (對應 shapes.ts)
  textColor: string
  textAlign?: TextAlign // 文字對齊：左、中、右
  fontFamily?: string
  stickers?: StickerInstance[] // 貼紙
  textTransform?: TextBlockTransform // 文字區塊位置、縮放、旋轉（舊格式向下相容）
  textBlocks?: TextBlockInstance[] // 多文字區塊
  drawing?: string // 手繪內容 data URL (base64 PNG)
  /** 各物件 id 的疊放順序（預覽/上傳/display 與編輯器一致）；無則沿用預設文字 1、貼紙 3 */
  objectLayerOrder?: Record<string, number>
}

/**
 * 佇列項目狀態
 */
export type QueueStatus = 'waiting' | 'playing' | 'played'

/**
 * Token 狀態
 */
export type TokenStatus = 'unused' | 'used'

/**
 * 待處理佇列項目
 *
 * **沒有投稿者欄位。** 便利貼是公開可讀的，投稿者（LINE 使用者編號）放在
 * 只有本人與後台讀得到的 note_owners/{noteId}，見 NoteOwner。
 */
export interface QueuePendingItem {
  id?: string // Firestore document ID
  content: string
  style: StickyNoteStyle
  token: string
  timestamp: Timestamp
  status: 'waiting'
}

/**
 * 歷史紀錄項目
 */
export interface QueueHistoryItem {
  id?: string // Firestore document ID
  content: string
  style: StickyNoteStyle
  token: string
  timestamp: Timestamp
  status: 'played'
  playedAt: Timestamp
}

/**
 * 便利貼的投稿者（note_owners/{noteId}），doc ID 與便利貼相同。
 *
 * 跟便利貼分開存，是因為便利貼公開可讀而 uid 就是 LINE 使用者編號。
 * 必須跟便利貼同一批寫入，規則用 getAfter／existsAfter 檢查兩邊對得上。
 *
 * 匿名時期（LINE 登入上線前）的便利貼沒有這一份，顯示端當成「舊資料」。
 */
export interface NoteOwner {
  uid: string
  createdAt: Timestamp
}

/**
 * LINE 會員資料（users/{uid}）
 *
 * 由前端在登入後自己寫入，`displayName` 必須與 custom token 的 lineName claim
 * 一致才寫得進去（見 firestore.rules 的 canWriteUserProfile）。
 */
export interface UserProfile {
  displayName: string
  /** 頭貼的 base64 data URL。沒抓到就沒有這個欄位 */
  avatar?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * 停權名單（banned_users/{uid}）。只有後台能寫，被封鎖的本人讀得到自己那一份。
 *
 * 存在就代表停權，沒有「enabled」之類的欄位 —— 規則只需要 exists() 一次，
 * 解除封鎖就是把文件刪掉。
 *
 * 暱稱存一份快照：刪除個人資料會把 users/{uid} 清掉，但停權名單要留著，
 * 否則後台會看到一串認不出是誰的編號。
 */
export interface BannedUser {
  displayName: string
  /** 給後台自己看的備註，不會顯示給被封鎖的人 */
  reason: string
  bannedAt: Timestamp
  /** 執行封鎖的後台帳號 email */
  bannedBy: string
}

/**
 * 投稿配額（user_quota/{uid}）—— 每人每 N 分鐘 1 張、每天 M 張。
 *
 * 這是「預約」：前端在真正寫入便利貼之前先寫這一份，規則在這一步檢查冷卻與
 * 每日上限；便利貼的 create 則要求存在一張指名該 doc ID 的新鮮預約。
 * 詳見 firestore.rules 的「投稿配額」段落。
 */
export interface UserQuota {
  /** 一律是 serverTimestamp()，規則會驗它等於 request.time */
  lastSubmitAt: Timestamp
  /** 台灣當地日期鍵，沒有補零（例：2026-9-5）。算法要與規則的 taipeiDateKey 一致 */
  submitDate: string
  /** submitDate 那一天已經用掉幾張 */
  submitCount: number
  /** 這張預約對應的 queue_pending doc ID（= 編輯器的 submissionId） */
  pendingNoteId: string
}

/** system/editor_rate_limit —— 後台可調的投稿頻率限制 */
export interface RateLimitConfig {
  enabled: boolean
  cooldownMinutes: number
  dailyLimit: number
}

/** 規則裡寫死的預設值，文件不存在時生效。兩邊要一致 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  enabled: true,
  cooldownMinutes: 5,
  dailyLimit: 3
}

/**
 * Token 文件
 */
export interface TokenDocument {
  id?: string // Firestore document ID
  status: TokenStatus
  createdAt: Timestamp
}

/**
 * 建立便利貼的表單資料
 */
export interface CreateNoteForm {
  content: string
  style: StickyNoteStyle
}
