<template>
  <div class="queue-status-page">
    <div class="container">
      <!-- Header -->
      <header class="status-header">
        <div class="status-icon">
          <div class="pulse-circle"></div>
          <span class="icon-emoji">⏳</span>
        </div>
        <h1 class="status-title">便利貼已提交</h1>
        <p class="status-subtitle">正在排隊等待顯示中...</p>
      </header>

      <!-- Queue Info Card -->
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">目前佇列長度</span>
          <span class="info-value">{{ queueCount }}</span>
        </div>

        <div class="info-divider"></div>

        <div class="info-row">
          <span class="info-label">預估等待時間</span>
          <span class="info-value info-value--primary">
            {{ estimatedTime }}
          </span>
        </div>

        <div v-if="queueCount > 20" class="info-note">
          <span class="note-icon">💡</span>
          <span>目前人氣很高！感謝您的耐心等待</span>
        </div>
      </div>

      <!-- Status Messages -->
      <div class="status-messages">
        <div v-if="queueCount === 0" class="status-message status-message--success">
          <span class="message-icon">🎉</span>
          <p>您的便利貼即將顯示！</p>
        </div>

        <div v-else-if="queueCount <= 5" class="status-message status-message--info">
          <span class="message-icon">⚡</span>
          <p>您的便利貼很快就會顯示了</p>
        </div>

        <div v-else-if="queueCount <= 20" class="status-message status-message--warning">
          <span class="message-icon">⏱️</span>
          <p>請稍候片刻，您的便利貼正在排隊中</p>
        </div>

        <div v-else class="status-message status-message--info">
          <span class="message-icon">🎵</span>
          <p>人氣很旺！不妨先去逛逛唱片行，等等再回來看看</p>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="progress-section">
        <div class="progress-label">
          <span>處理進度</span>
          <span>{{ progressPercentage }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progressPercentage}%` }"></div>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions">
        <NuxtLink to="/home" class="action-link">
          <span>← 返回首頁</span>
        </NuxtLink>
        <button class="action-button" @click="refreshStatus">
          <span class="button-icon">🔄</span>
          <span>重新整理</span>
        </button>
      </div>

      <!-- Info Box -->
      <div class="info-box">
        <h3 class="info-box-title">關於顯示時間</h3>
        <ul class="info-box-list">
          <li>每個便利貼會在大螢幕上顯示約 15 秒</li>
          <li>顯示順序為提交的先後順序</li>
          <li><strong>需開啟 /display 頁面（LED 螢幕）</strong>，便利貼才會播放並加入即時牆/典藏牆</li>
          <li>此頁面會即時更新佇列狀態</li>
          <li>您可以離開此頁面，便利貼仍會正常顯示</li>
        </ul>
        <NuxtLink to="/display" target="_blank" class="display-link">
          開啟 LED 螢幕頁面 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { collection, query, onSnapshot } from 'firebase/firestore'

definePageMeta({
  layout: false
})

const { $firestore } = useNuxtApp()
const db = $firestore as any

const queueCount = ref(0)
const isLoading = ref(true)

let unsubscribe: (() => void) | null = null

/**
 * 預估等待時間（每個 15 秒）
 */
const estimatedTime = computed(() => {
  const totalSeconds = queueCount.value * 15
  
  if (totalSeconds === 0) {
    return '即將顯示'
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

<style scoped lang="scss">
.queue-status-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem 1rem;
}

.container {
  max-width: 600px;
  margin: 0 auto;
}

.status-header {
  text-align: center;
  color: white;
  margin-bottom: 2rem;
}

.status-icon {
  position: relative;
  display: inline-block;
  margin-bottom: 1rem;
}

.pulse-circle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.5;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0;
  }
}

.icon-emoji {
  position: relative;
  font-size: 4rem;
  z-index: 1;
}

.status-title {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.status-subtitle {
  font-size: 1.125rem;
  opacity: 0.9;
}

.info-card {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  margin-bottom: 2rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 1rem;
  color: #666;
}

.info-value {
  font-size: 2rem;
  font-weight: bold;
  color: #333;

  &--primary {
    color: #667eea;
  }
}

.info-divider {
  height: 1px;
  background: #e0e0e0;
  margin: 1.5rem 0;
}

.info-note {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f0f0f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: #666;
}

.note-icon {
  font-size: 1.5rem;
}

.status-messages {
  margin-bottom: 2rem;
}

.status-message {
  padding: 1.5rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 1rem;
  color: white;

  &--success {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  }

  &--info {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  }

  &--warning {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  }
}

.message-icon {
  font-size: 2rem;
}

.progress-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  color: #666;
  font-weight: 600;
}

.progress-bar {
  height: 12px;
  background: #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 6px;
  transition: width 0.5s ease;
}

.actions {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.action-link {
  flex: 1;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  color: white;
  text-decoration: none;
  text-align: center;
  font-weight: 600;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

.action-button {
  flex: 1;
  padding: 1rem;
  background: white;
  border: none;
  border-radius: 12px;
  color: #667eea;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: translateY(0);
  }
}

.button-icon {
  font-size: 1.25rem;
}

.info-box {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 1.5rem;
  color: white;
}

.info-box-title {
  font-size: 1.125rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.info-box-list {
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    padding: 0.5rem 0;
    padding-left: 1.5rem;
    position: relative;
    line-height: 1.6;
    font-size: 0.875rem;

    &:before {
      content: '✓';
      position: absolute;
      left: 0;
      font-weight: bold;
    }
  }
}

.display-link {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  text-decoration: none;
  border-radius: 8px;
  font-size: 0.875rem;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

@media (max-width: 768px) {
  .status-title {
    font-size: 1.75rem;
  }

  .info-value {
    font-size: 1.75rem;
  }
}
</style>
