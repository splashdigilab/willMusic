/**
 * LocalStorage 和 SessionStorage 工具函式
 */

export interface DraftData {
  content: string
  backgroundColor: string
  textColor: string
  fontSize: number
  stickers: StickerInstance[]
  timestamp: number
}

export interface StickerInstance {
  id: string
  type: string
  x: number
  y: number
  scale: number
  rotation: number
}

const DRAFT_KEY = 'willmusic_draft'
const TOKEN_KEY = 'willmusic_token'

export const useStorage = () => {
  /**
   * 儲存草稿到 LocalStorage
   */
  const saveDraft = (data: DraftData) => {
    if (!import.meta.client) return

    try {
      const draft = {
        ...data,
        timestamp: Date.now()
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  /**
   * 從 LocalStorage 讀取草稿
   */
  const loadDraft = (): DraftData | null => {
    if (!import.meta.client) return null

    try {
      const draftStr = localStorage.getItem(DRAFT_KEY)
      if (!draftStr) return null

      const draft = JSON.parse(draftStr) as DraftData
      
      // 檢查草稿是否過期（24 小時）
      const isExpired = Date.now() - draft.timestamp > 24 * 60 * 60 * 1000
      if (isExpired) {
        clearDraft()
        return null
      }

      return draft
    } catch (error) {
      console.error('Error loading draft:', error)
      return null
    }
  }

  /**
   * 清除草稿
   */
  const clearDraft = () => {
    if (!import.meta.client) return
    localStorage.removeItem(DRAFT_KEY)
  }

  /**
   * 儲存 Token 到 SessionStorage
   */
  const saveToken = (token: string) => {
    if (!import.meta.client) return

    try {
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch (error) {
      console.error('Error saving token:', error)
    }
  }

  /**
   * 從 SessionStorage 讀取 Token
   */
  const loadToken = (): string | null => {
    if (!import.meta.client) return null

    try {
      return sessionStorage.getItem(TOKEN_KEY)
    } catch (error) {
      console.error('Error loading token:', error)
      return null
    }
  }

  /**
   * 清除 Token
   */
  const clearToken = () => {
    if (!import.meta.client) return
    sessionStorage.removeItem(TOKEN_KEY)
  }

  /**
   * 檢查是否有草稿
   */
  const hasDraft = computed(() => {
    if (!import.meta.client) return false
    return !!localStorage.getItem(DRAFT_KEY)
  })

  /**
   * 檢查是否有 Token
   */
  const hasToken = computed(() => {
    if (!import.meta.client) return false
    return !!sessionStorage.getItem(TOKEN_KEY)
  })

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    saveToken,
    loadToken,
    clearToken,
    hasDraft,
    hasToken
  }
}
