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
 * 草稿資料
 */
export interface DraftData {
  content: string
  backgroundImage: string // 背景圖片 URL
  shape: string // 造型 ID
  textColor: string
  stickers: StickerInstance[]
  textTransform?: TextBlockTransform
  drawing?: string // 手繪內容 data URL
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
  fontFamily?: string
  stickers?: StickerInstance[] // 貼紙
  textTransform?: TextBlockTransform // 文字區塊位置、縮放、旋轉
  drawing?: string // 手繪內容 data URL (base64 PNG)
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
