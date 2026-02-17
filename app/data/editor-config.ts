/**
 * 編輯器相關常數
 */

export const MAX_CONTENT_LENGTH = 200

export const EDITOR_TABS = [
  { id: 'note' as const, label: '便利貼' },
  { id: 'text' as const, label: '文字' },
  { id: 'draw' as const, label: '繪圖' },
  { id: 'sticker' as const, label: '貼紙' }
] as const

export type EditorTabId = typeof EDITOR_TABS[number]['id']

export const TEXT_COLORS = [
  { name: 'Black', value: '#333333' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Red', value: '#f43f5e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' }
] as const

export const BRUSH_COLORS = [
  { value: '#333333' },
  { value: '#f43f5e' },
  { value: '#3b82f6' },
  { value: '#22c55e' },
  { value: '#fbbf24' },
  { value: '#ffffff' }
] as const
