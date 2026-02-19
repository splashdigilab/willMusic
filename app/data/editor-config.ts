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

export const TEXT_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#241F20' },
  { name: 'Blue', value: '#00A8C6' },
  { name: 'Red', value: '#E6204D' },
  { name: 'LightBlue', value: '#66E5FF' },
  { name: 'LightRed', value: '#FF99B2' },
] as const

export const BRUSH_COLORS = [
  { value: '#ffffff' },
  { value: '#241F20' },
  { value: '#00A8C6' },
  { value: '#E6204D' },
  { value: '#66E5FF' },
  { value: '#FF99B2' },
] as const
