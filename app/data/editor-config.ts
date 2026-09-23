/**
 * 編輯器相關常數
 */

export const MAX_CONTENT_LENGTH = 200

/**
 * 編輯流程的四個畫面，陣列順序就是步驟順序。
 *
 * 舊版是可自由切換的分頁列（EDITOR_TABS，帶 icon），使用者做完一項就回到中樞
 * 自己挑下一項；現在改成線性流程，只靠上一步／下一步與面板右上的步驟點導覽，
 * icon 不再需要。STEP 1 與 STEP 2 共用第一個畫面，所以是 4 個畫面、5 個 STEP 標題。
 */
export const EDITOR_STEPS = [
  { id: 'note' as const, label: '便利貼' },
  { id: 'text' as const, label: '文字' },
  { id: 'draw' as const, label: '繪圖' },
  { id: 'sticker' as const, label: '貼紙' }
] as const

export type EditorStepId = typeof EDITOR_STEPS[number]['id']

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
