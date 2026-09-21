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

/**
 * 編輯器調色盤。色相環順序：白/黑 → 紅 → 橙 → 黃 → 綠 → 青 → 藍 → 紫 → 粉
 *
 * 文字與筆刷刻意共用同一組顏色，使用者在兩個 tab 之間切換時看到的色票一致。
 * 若日後真的需要讓兩者不同，把下面兩個常數各自展開成獨立陣列即可。
 */
export const EDITOR_PALETTE = [
  { value: '#ffffff' },
  { value: '#241F20' },
  { value: '#E6204D' },
  { value: '#FF99B2' },
  { value: '#f7c9c9' },
  { value: '#fcc2be' },
  { value: '#f7c495' },
  { value: '#f5e6a4' },
  { value: '#f99d1c' },
  { value: '#bad887' },
  { value: '#a6e2de' },
  { value: '#00A8C6' },
  { value: '#66E5FF' },
  { value: '#12205c' },
  { value: '#bbdcef' },
  { value: '#81a5f9' },
  { value: '#91a9d0' },
  { value: '#b95ee7' },
  { value: '#e4c5ef' },
  { value: '#fb5c9c' },
  { value: '#ff99cb' },
  { value: '#fccdd9' },
] as const

/**
 * 文字顏色：稿子畫板 09 只提供白與深灰兩色（方形色票）。
 * 與筆刷刻意分開 —— 筆刷仍是整組調色盤（畫板 10）。
 * 既有便利貼若存了其他文字色，顯示不受影響，只是新的做不出來。
 */
export const TEXT_COLORS = [
  { value: '#ffffff' },
  { value: '#323232' },
] as const

export const BRUSH_COLORS = EDITOR_PALETTE
