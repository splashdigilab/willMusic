<template>
  <div class="display-page">
    <!-- 佇列資訊 -->
    <div class="queue-info">
      <div class="queue-info__item">
        <span class="queue-info__label">佇列長度:</span>
        <span class="queue-info__value">{{ queueLength }}</span>
      </div>
      <div class="queue-info__item">
        <span class="queue-info__label">狀態:</span>
        <span class="queue-info__value">
          {{ isPlaying ? '播放中' : '等待中' }}
        </span>
      </div>
    </div>

    <!-- 主要顯示區域 -->
    <div class="display-area" ref="displayAreaRef">
      <transition name="note-transition" mode="out-in">
        <div v-if="currentItem" :key="currentItem.id" class="current-note">
          <StickyNote :note="currentItem" animate />
        </div>
        <div v-else class="idle-state">
          <div class="idle-state__content">
            <h2 class="idle-state__title">WillMusic Sky Memo</h2>
            <p class="idle-state__subtitle">等待便利貼中...</p>
            <div class="idle-state__animation">
              <div class="floating-note" v-for="i in 5" :key="i"></div>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- 下一個佇列預覽 -->
    <div class="queue-preview" v-if="queue.length > 1">
      <h3 class="queue-preview__title">接下來</h3>
      <div class="queue-preview__list">
        <div
          v-for="(item, index) in nextItems"
          :key="item.id"
          class="queue-preview__item"
        >
          <span class="queue-preview__number">{{ index + 1 }}</span>
          <div class="queue-preview__content">
            {{ truncate(item.content, 30) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { gsap } from 'gsap'

definePageMeta({
  layout: false
})

const { queue, currentItem, isPlaying, queueLength, startListening, completeCurrentItem } = useQueue()

const displayAreaRef = ref<HTMLElement | null>(null)
const displayDuration = 8000 // 每個便利貼顯示 8 秒

// 下一個 3 個項目
const nextItems = computed(() => {
  return queue.value.slice(1, 4)
})

// 自動播放計時器
let autoPlayTimer: ReturnType<typeof setTimeout> | null = null

const startAutoPlay = () => {
  if (autoPlayTimer) {
    clearTimeout(autoPlayTimer)
  }

  if (currentItem.value) {
    autoPlayTimer = setTimeout(async () => {
      await completeCurrentItem()
    }, displayDuration)
  }
}

// 截斷文字
const truncate = (text: string, length: number) => {
  return text.length > length ? text.substring(0, length) + '...' : text
}

// 監聽當前項目變化，自動開始播放
watch(currentItem, (newItem) => {
  if (newItem) {
    startAutoPlay()
  }
})

// 當頁面載入時開始監聽佇列
onMounted(() => {
  startListening()
})

// 清理計時器
onUnmounted(() => {
  if (autoPlayTimer) {
    clearTimeout(autoPlayTimer)
  }
})
</script>

<style scoped lang="scss">
.display-page {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e22ce 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.queue-info {
  position: absolute;
  top: 2rem;
  right: 2rem;
  display: flex;
  gap: 2rem;
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  color: white;
  z-index: 10;

  &__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  &__label {
    font-size: 0.875rem;
    opacity: 0.8;
  }

  &__value {
    font-size: 1.5rem;
    font-weight: bold;
  }
}

.display-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem;
}

.current-note {
  transform: scale(1.5);
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: scale(1.5) translateY(0);
  }
  50% {
    transform: scale(1.5) translateY(-20px);
  }
}

.idle-state {
  text-align: center;
  color: white;

  &__content {
    position: relative;
  }

  &__title {
    font-size: 4rem;
    font-weight: bold;
    margin-bottom: 1rem;
    text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  &__subtitle {
    font-size: 2rem;
    opacity: 0.8;
  }

  &__animation {
    margin-top: 3rem;
    position: relative;
    height: 200px;
  }
}

.floating-note {
  position: absolute;
  width: 80px;
  height: 80px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  animation: floatRandom 4s ease-in-out infinite;

  @for $i from 1 through 5 {
    &:nth-child(#{$i}) {
      left: #{$i * 15%};
      animation-delay: #{$i * 0.5}s;
      opacity: #{0.3 + $i * 0.1};
    }
  }
}

@keyframes floatRandom {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-30px) rotate(5deg);
  }
  75% {
    transform: translateY(-15px) rotate(-5deg);
  }
}

.queue-preview {
  position: absolute;
  bottom: 2rem;
  left: 2rem;
  max-width: 400px;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  color: white;

  &__title {
    font-size: 1.25rem;
    font-weight: bold;
    margin-bottom: 1rem;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  &__item {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  &__number {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    font-weight: bold;
  }

  &__content {
    flex: 1;
    font-size: 0.875rem;
    line-height: 1.4;
    opacity: 0.9;
  }
}

// 轉場動畫
.note-transition-enter-active,
.note-transition-leave-active {
  transition: all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.note-transition-enter-from {
  opacity: 0;
  transform: scale(0) rotate(-180deg);
}

.note-transition-leave-to {
  opacity: 0;
  transform: scale(0) rotate(180deg);
}

@media (max-width: 768px) {
  .queue-info {
    top: 1rem;
    right: 1rem;
    padding: 0.75rem 1rem;
    gap: 1rem;

    &__value {
      font-size: 1.25rem;
    }
  }

  .display-area {
    padding: 2rem;
  }

  .current-note {
    transform: scale(1);
  }

  .idle-state {
    &__title {
      font-size: 2rem;
    }

    &__subtitle {
      font-size: 1.25rem;
    }
  }

  .queue-preview {
    bottom: 1rem;
    left: 1rem;
    right: 1rem;
    max-width: none;
  }
}
</style>
