/**
 * 便利貼背景圖片資料庫
 */

export interface BackgroundImage {
  id: string
  url: string
}

export const BACKGROUND_IMAGES: BackgroundImage[] = [
  { id: 'bg-1', url: '/svg/bg/bg-1.svg' },
  { id: 'bg-2', url: '/svg/bg/bg-2.svg' },
  { id: 'bg-4', url: '/svg/bg/bg-4.webp' },
  { id: 'bg-3', url: '/svg/bg/bg-3.webp' },
  { id: 'bg-5', url: '/svg/bg/bg-5.webp' },
  { id: 'bg-6', url: '/svg/bg/bg-6.webp' },
  { id: 'bg-7', url: '/svg/bg/bg-7.webp' },
  { id: 'bg-8', url: '/svg/bg/bg-8.webp' },
]

/**
 * 根據 ID 取得背景圖片
 */
export const getBackgroundById = (id: string): BackgroundImage | undefined => {
  return BACKGROUND_IMAGES.find(bg => bg.id === id)
}
