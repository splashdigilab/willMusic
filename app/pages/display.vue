<template>
  <div class="p-display">
    <!-- 佇列資訊 -->
    <div class="p-display__queue-info">
      <div class="p-display__queue-info-item">
        <span class="p-display__queue-info-label">佇列長度:</span>
        <span class="p-display__queue-info-value">{{ queueLength }}</span>
      </div>
      <div class="p-display__queue-info-item">
        <span class="p-display__queue-info-label">狀態:</span>
        <span class="p-display__queue-info-value">
          {{ isPlaying ? '播放中' : '等待中' }}
        </span>
      </div>
    </div>

    <!-- 主要顯示區域 -->
    <div class="p-display__display-area" ref="displayAreaRef">
      <transition name="note-transition" mode="out-in">
        <div v-if="currentItem" :key="currentItem.id" class="p-display__current-note c-sticky-note-container--display">
          <StickyNote :note="currentItem" animate />
        </div>
        <div v-else class="p-display__idle-state">
          <div class="p-display__idle-state-content">
            <h2 class="p-display__idle-state-title">WillMusic Sky Memo</h2>
            <p class="p-display__idle-state-subtitle">等待便利貼中...</p>
            <div class="p-display__idle-state-animation">
              <div class="p-display__floating-note" v-for="i in 5" :key="i"></div>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- 下一個佇列預覽 -->
    <div class="p-display__queue-preview" v-if="queue.length > 1">
      <h3 class="p-display__queue-preview-title">接下來</h3>
      <div class="p-display__queue-preview-list">
        <div
          v-for="(item, index) in nextItems"
          :key="item.id"
          class="p-display__queue-preview-item"
        >
          <span class="p-display__queue-preview-number">{{ index + 1 }}</span>
          <div class="p-display__queue-preview-content">
            {{ truncate(item.content, 30) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { gsap } from 'gsap'
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({
  layout: false
})

const { queue, currentItem, isPlaying, queueLength, startListening, startAutoPlay } = useQueue()

const displayAreaRef = ref<HTMLElement | null>(null)
const displayDuration = 8000 // 每個便利貼顯示 8 秒

// 下一個 3 個項目
const nextItems = computed(() => {
  return queue.value.slice(1, 4)
})

// 截斷文字
const truncate = (text: string, length: number) => {
  return text.length > length ? text.substring(0, length) + '...' : text
}

// 監聽當前項目變化，自動開始播放
// 計時器由 useQueue singleton 管理，避免 HMR 產生多個計時器
watch(currentItem, (newItem) => {
  if (newItem) {
    startAutoPlay(displayDuration)
  }
})

// 當頁面載入時開始監聽佇列
onMounted(() => {
  startListening()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_display.scss */
</style>
