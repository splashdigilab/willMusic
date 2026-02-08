import type { QueuePendingItem } from '~/types'
import type { Unsubscribe } from 'firebase/firestore'

export const useQueue = () => {
  const { listenToPendingQueue, moveToHistory } = useFirestore()
  
  const queue = ref<QueuePendingItem[]>([])
  const currentItem = ref<QueuePendingItem | null>(null)
  const isPlaying = ref(false)
  let isCompleting = false

  let unsubscribe: Unsubscribe | null = null

  /**
   * 開始監聽佇列
   */
  const startListening = () => {
    if (unsubscribe) return

    unsubscribe = listenToPendingQueue((items) => {
      queue.value = items
      
      // 如果沒有正在播放的項目且佇列有項目，自動播放下一個
      // 注意：不在 isCompleting 期間自動播放，避免與 completeCurrentItem 中的 playNext 衝突
      if (!isPlaying.value && !isCompleting && items.length > 0) {
        playNext()
      }
    })
  }

  /**
   * 停止監聽佇列
   */
  const stopListening = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  /**
   * 播放下一個項目
   */
  const playNext = async () => {
    if (queue.value.length === 0) {
      currentItem.value = null
      isPlaying.value = false
      return
    }

    const nextItem = queue.value[0]
    if (!nextItem) return

    currentItem.value = nextItem
    isPlaying.value = true
  }

  /**
   * 完成當前項目（移至歷史紀錄）
   */
  const completeCurrentItem = async () => {
    if (!currentItem.value || isCompleting) return

    const itemToComplete = currentItem.value
    isCompleting = true

    try {
      await moveToHistory(itemToComplete)
      currentItem.value = null
      isPlaying.value = false

      // 從佇列中排除剛完成的項目後再播放下一個（避免 listener 尚未更新時重複播放同一則）
      const completedId = itemToComplete.id
      const remaining = queue.value.filter((item) => item.id !== completedId)
      const nextItem = remaining[0]
      if (nextItem) {
        currentItem.value = nextItem
        isPlaying.value = true
      }
    } catch (error) {
      console.error('Error completing item:', error)
      currentItem.value = itemToComplete
      isPlaying.value = true
      throw error
    } finally {
      isCompleting = false
    }
  }

  /**
   * 取得佇列長度
   */
  const queueLength = computed(() => queue.value.length)

  /**
   * 清理資源
   */
  onUnmounted(() => {
    stopListening()
  })

  return {
    queue: readonly(queue),
    currentItem: readonly(currentItem),
    isPlaying: readonly(isPlaying),
    queueLength,
    startListening,
    stopListening,
    playNext,
    completeCurrentItem
  }
}
