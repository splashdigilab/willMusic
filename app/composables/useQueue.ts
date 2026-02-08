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
      if (!isPlaying.value && items.length > 0) {
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
    currentItem.value = null
    isPlaying.value = false
    isCompleting = true

    try {
      await moveToHistory(itemToComplete)
      if (queue.value.length > 0) {
        await playNext()
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
