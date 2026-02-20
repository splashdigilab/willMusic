<template>
  <div class="p-queue-status">
    <div class="p-queue-status__container">
      <!-- Header -->
      <header class="p-queue-status__header">
        <div class="p-queue-status__icon">
          <div class="p-queue-status__pulse-circle"></div>
          <span class="p-queue-status__icon-emoji">⏳</span>
        </div>
        <h1 class="p-queue-status__title">便利貼已提交</h1>
        <p class="p-queue-status__subtitle">正在排隊等待顯示中...</p>
      </header>

      <!-- Queue Info Card -->
      <div class="p-queue-status__card">
        <div class="p-queue-status__info-row">
          <span class="p-queue-status__info-label">目前佇列長度</span>
          <span class="p-queue-status__info-value">{{ queueCount }}</span>
        </div>

        <div class="p-queue-status__info-divider"></div>

        <div class="p-queue-status__info-row">
          <span class="p-queue-status__info-label">預估等待時間</span>
          <span class="p-queue-status__info-value p-queue-status__info-value--primary">
            {{ estimatedTime }}
          </span>
        </div>

        <div v-if="queueCount > 20" class="p-queue-status__info-note">
          <span class="p-queue-status__note-icon">💡</span>
          <span>目前人氣很高！感謝您的耐心等待</span>
        </div>
      </div>

      <!-- Status Messages -->
      <div class="p-queue-status__status-messages">
        <div v-if="queueCount <= 1" class="p-queue-status__message-box p-queue-status__message-box--success">
          <span class="p-queue-status__message-icon">🎉</span>
          <p class="p-queue-status__message-text">您的便利貼已上傳！</p>
        </div>

        <div v-else-if="queueCount <= 5" class="p-queue-status__message-box p-queue-status__message-box--info">
          <span class="p-queue-status__message-icon">⚡</span>
          <p class="p-queue-status__message-text">您的便利貼很快就會顯示了</p>
        </div>

        <div v-else-if="queueCount <= 20" class="p-queue-status__message-box p-queue-status__message-box--warning">
          <span class="p-queue-status__message-icon">⏱️</span>
          <p class="p-queue-status__message-text">請稍候片刻，您的便利貼正在排隊中</p>
        </div>

        <div v-else class="p-queue-status__message-box p-queue-status__message-box--info">
          <span class="p-queue-status__message-icon">🎵</span>
          <p class="p-queue-status__message-text">人氣很旺！不妨先去逛逛唱片行，等等再回來看看</p>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="p-queue-status__progress-section">
        <div class="p-queue-status__progress-label">
          <span>處理進度</span>
          <span>{{ progressPercentage }}%</span>
        </div>
        <div class="p-queue-status__progress-bar">
          <div class="p-queue-status__progress-fill" :style="{ width: `${progressPercentage}%` }"></div>
        </div>
      </div>

      <!-- Actions -->
      <div class="p-queue-status__actions">
        <NuxtLink to="/home" class="p-queue-status__btn-home">
          <span>← 返回首頁</span>
        </NuxtLink>
        <button class="p-queue-status__action-btn" @click="refreshStatus">
          <span class="p-queue-status__button-icon">🔄</span>
          <span>重新整理</span>
        </button>
      </div>

      <!-- Info Box -->
      <div class="p-queue-status__info-box">
        <h3 class="p-queue-status__info-title">關於顯示時間</h3>
        <ul class="p-queue-status__info-list">
          <li class="p-queue-status__info-item">每個便利貼會在大螢幕上顯示約 {{ DISPLAY_SLOT_DURATION_SECONDS }} 秒</li>
          <li class="p-queue-status__info-item">顯示順序為提交的先後順序</li>
          <li class="p-queue-status__info-item"><strong>需開啟 /display 頁面（LED 螢幕）</strong>，便利貼才會播放並加入即時牆/典藏牆</li>
          <li class="p-queue-status__info-item">此頁面會即時更新佇列狀態</li>
          <li class="p-queue-status__info-item">您可以離開此頁面，便利貼仍會正常顯示</li>
        </ul>
        <NuxtLink to="/display" target="_blank" class="p-queue-status__display-link">
          開啟 LED 螢幕頁面 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { collection, query, onSnapshot } from 'firebase/firestore'
import { DISPLAY_SLOT_DURATION_SECONDS } from '~/data/display-config'

definePageMeta({
  layout: false
})

const { $firestore } = useNuxtApp()
const db = $firestore as any

const queueCount = ref(0)
const isLoading = ref(true)

let unsubscribe: (() => void) | null = null

/**
 * 預估等待時間（每張以 DISPLAY_SLOT_DURATION_SECONDS 計算）
 */
const estimatedTime = computed(() => {
  const totalSeconds = queueCount.value * DISPLAY_SLOT_DURATION_SECONDS
  
  if (totalSeconds === 0) {
    return '您的便利貼已上傳'
  }
  
  if (totalSeconds < 60) {
    return `約 ${totalSeconds} 秒`
  }
  
  const minutes = Math.ceil(totalSeconds / 60)
  
  if (minutes < 60) {
    return `約 ${minutes} 分鐘`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  
  if (remainingMinutes === 0) {
    return `約 ${hours} 小時`
  }
  
  return `約 ${hours} 小時 ${remainingMinutes} 分鐘`
})

/**
 * 進度百分比（假設最多 100 個為 100%）
 */
const progressPercentage = computed(() => {
  if (queueCount.value === 0) return 100
  const percentage = Math.max(0, 100 - (queueCount.value / 100) * 100)
  return Math.round(percentage)
})

/**
 * 監聽佇列長度
 */
const startListening = () => {
  const q = query(collection(db, 'queue_pending'))
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    queueCount.value = snapshot.size
    isLoading.value = false
  }, (error) => {
    console.error('Error listening to queue:', error)
    isLoading.value = false
  })
}

/**
 * 重新整理狀態
 */
const refreshStatus = () => {
  isLoading.value = true
  // onSnapshot 會自動更新，只需要顯示載入狀態
  setTimeout(() => {
    isLoading.value = false
  }, 500)
}

// Lifecycle
onMounted(() => {
  startListening()
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_queue-status.scss */
</style>
