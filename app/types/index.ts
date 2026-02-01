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
  backgroundColor: string
  textColor: string
  fontSize: number
  stickers: StickerInstance[]
  timestamp: number
}

/**
 * 便利貼樣式配置
 */
export interface StickyNoteStyle {
  backgroundColor: string
  textColor: string
  fontSize: number
  fontFamily?: string
  rotation?: number // 旋轉角度 (-10 到 10 度)
  pattern?: 'solid' | 'lines' | 'dots' | 'grid' // 背景花紋
  stickers?: StickerInstance[] // 貼紙
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

/**
 * 預設樣式配置
 */
export const DEFAULT_STYLES: StickyNoteStyle[] = [
  {
    backgroundColor: '#FFE97F',
    textColor: '#333333',
    fontSize: 24,
    pattern: 'solid'
  },
  {
    backgroundColor: '#FF9CEE',
    textColor: '#FFFFFF',
    fontSize: 24,
    pattern: 'solid'
  },
  {
    backgroundColor: '#9CDDFF',
    textColor: '#333333',
    fontSize: 24,
    pattern: 'solid'
  },
  {
    backgroundColor: '#CAFFBF',
    textColor: '#333333',
    fontSize: 24,
    pattern: 'solid'
  },
  {
    backgroundColor: '#FFC6FF',
    textColor: '#333333',
    fontSize: 24,
    pattern: 'solid'
  }
]
