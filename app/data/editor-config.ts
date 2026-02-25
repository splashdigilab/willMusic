/**
 * 編輯器相關常數
 */

export const MAX_CONTENT_LENGTH = 200

export const EDITOR_TABS = [
  { id: 'note' as const, label: '便利貼', icon: '/editor-icon/icons3.png' },
  { id: 'text' as const, label: '文字', icon: '/editor-icon/icons2.png' },
  { id: 'draw' as const, label: '繪圖', icon: '/editor-icon/icons1.png' },
  { id: 'sticker' as const, label: '貼紙', icon: '/editor-icon/icons4.png' }
] as const

export type EditorTabId = typeof EDITOR_TABS[number]['id']

export const TEXT_ALIGN_OPTIONS = [
  { value: 'left' as const, svg: '/align-left.svg' },
  { value: 'center' as const, svg: '/align-center.svg' },
  { value: 'right' as const, svg: '/align-right.svg' }
] as const

/** 色相環順序：白/黑 → 紅 → 橙 → 青 → 藍 → 紫 → 洋紅/粉 */
export const TEXT_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#241F20' },
  { name: 'Red', value: '#E6204D' },
  { name: 'LightRed', value: '#FF99B2' },
  { name: 'twicePink', value: '#fb5c9c' },
  { name: 'blackPink', value: '#ff99cb' },
  { name: 'seventeenPink', value: '#f7c9c9' },
  { name: 'twiceOrange', value: '#f7c495' },
  { name: 'Blue', value: '#00A8C6' },
  { name: 'LightBlue', value: '#66E5FF' },
  { name: 'seventeenBlue', value: '#91a9d0' },
  { name: 'leSserafim', value: '#81a5f9' },
  { name: 'bts', value: '#b95ee7' },
] as const

export const BRUSH_COLORS = [
  { value: '#ffffff' },
  { value: '#241F20' },
  { value: '#E6204D' },
  { value: '#FF99B2' },
  { value: '#fb5c9c' },
  { value: '#ff99cb' },
  { value: '#f7c9c9' },
  { value: '#f7c495' },
  { value: '#00A8C6' },
  { value: '#66E5FF' },
  { value: '#91a9d0' },
  { value: '#81a5f9' },
  { value: '#b95ee7' },
] as const
