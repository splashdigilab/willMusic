/**
 * Sticker 類型定義
 */
export interface StickerType {
  id: string
  name: string
  category: 'emoji' | 'icon' | 'shape' | 'kpop'
  content: string // Emoji 或 SVG path
  defaultScale: number
}

/**
 * 預設 Sticker 庫
 */
export const STICKER_LIBRARY: StickerType[] = [
  // Emoji 類別
  {
    id: 'emoji-heart',
    name: '愛心',
    category: 'emoji',
    content: '❤️',
    defaultScale: 1
  },
  {
    id: 'emoji-star',
    name: '星星',
    category: 'emoji',
    content: '⭐',
    defaultScale: 1
  },
  {
    id: 'emoji-sparkle',
    name: '閃亮',
    category: 'emoji',
    content: '✨',
    defaultScale: 1
  },
  {
    id: 'emoji-music',
    name: '音符',
    category: 'emoji',
    content: '🎵',
    defaultScale: 1
  },
  {
    id: 'emoji-fire',
    name: '火焰',
    category: 'emoji',
    content: '🔥',
    defaultScale: 1
  },
  {
    id: 'emoji-crown',
    name: '皇冠',
    category: 'emoji',
    content: '👑',
    defaultScale: 1
  },
  {
    id: 'emoji-rainbow',
    name: '彩虹',
    category: 'emoji',
    content: '🌈',
    defaultScale: 1
  },
  {
    id: 'emoji-butterfly',
    name: '蝴蝶',
    category: 'emoji',
    content: '🦋',
    defaultScale: 1
  },
  {
    id: 'emoji-flower',
    name: '花朵',
    category: 'emoji',
    content: '🌸',
    defaultScale: 1
  },
  {
    id: 'emoji-moon',
    name: '月亮',
    category: 'emoji',
    content: '🌙',
    defaultScale: 1
  },
  
  // K-Pop 相關
  {
    id: 'emoji-mic',
    name: '麥克風',
    category: 'kpop',
    content: '🎤',
    defaultScale: 1
  },
  {
    id: 'emoji-cd',
    name: 'CD',
    category: 'kpop',
    content: '💿',
    defaultScale: 1
  },
  {
    id: 'emoji-headphone',
    name: '耳機',
    category: 'kpop',
    content: '🎧',
    defaultScale: 1
  },
  {
    id: 'emoji-guitar',
    name: '吉他',
    category: 'kpop',
    content: '🎸',
    defaultScale: 1
  },
  {
    id: 'emoji-drum',
    name: '鼓',
    category: 'kpop',
    content: '🥁',
    defaultScale: 1
  },
  {
    id: 'emoji-party',
    name: '派對',
    category: 'kpop',
    content: '🎉',
    defaultScale: 1
  },
  {
    id: 'emoji-clap',
    name: '鼓掌',
    category: 'kpop',
    content: '👏',
    defaultScale: 1
  },
  {
    id: 'emoji-peace',
    name: 'Peace',
    category: 'kpop',
    content: '✌️',
    defaultScale: 1
  },
  {
    id: 'emoji-purple-heart',
    name: '紫心',
    category: 'kpop',
    content: '💜',
    defaultScale: 1
  },
  {
    id: 'emoji-pink-heart',
    name: '粉心',
    category: 'kpop',
    content: '💗',
    defaultScale: 1
  }
]

/**
 * 依類別取得 Stickers
 */
export const getStickersByCategory = (category: StickerType['category']) => {
  return STICKER_LIBRARY.filter(s => s.category === category)
}

/**
 * 取得所有類別
 */
export const getStickerCategories = (): Array<{ id: StickerType['category'], name: string }> => {
  return [
    { id: 'emoji', name: 'Emoji' },
    { id: 'kpop', name: 'K-Pop' },
    { id: 'icon', name: '圖示' },
    { id: 'shape', name: '形狀' }
  ]
}
