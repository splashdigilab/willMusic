<template>
  <div class="p-queue-status-minimal">
    <AppHeader />
    <div class="p-queue-status-minimal__container">
      
      <!-- Queue Info -->
      <div class="p-queue-status-minimal__content">
        <h1 class="p-queue-status-minimal__title">等待中</h1>
        
        <div class="p-queue-status-minimal__stats">
          <div class="p-queue-status-minimal__stat-item">
            <span class="p-queue-status-minimal__stat-label">目前佇列</span>
            <span class="p-queue-status-minimal__stat-value">{{ queueCount }} <small>張</small></span>
          </div>

          <div class="p-queue-status-minimal__stat-divider"></div>

          <div class="p-queue-status-minimal__stat-item">
            <span class="p-queue-status-minimal__stat-label">預估時間</span>
            <span class="p-queue-status-minimal__stat-value" :class="{ 'is-countdown': isCountdown }">
              {{ formattedTime }}
            </span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="p-queue-status-minimal__actions">
        <NuxtLink to="/home" class="p-queue-status-minimal__btn-home">
          回到首頁
        </NuxtLink>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { DISPLAY_SLOT_DURATION_SECONDS } from '~/data/display-config'

definePageMeta({
  layout: false
})

const { $firestore } = useNuxtApp()
const db = $firestore as any

const queueCount = ref(0)
let unsubscribe: (() => void) | null = null

// Countdown logic for < 1 minute
const remainingSeconds = ref(0)
let countdownTimer: any = null

const startListening = () => {
  const q = query(collection(db, 'queue_pending'))
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    queueCount.value = snapshot.size
    // Update base seconds when queue changes
    remainingSeconds.value = snapshot.size * DISPLAY_SLOT_DURATION_SECONDS
  }, (error) => {
    console.error('Error listening to queue:', error)
  })
}

// Tick down the seconds logically if < 60 so user sees motion without waiting for DB updates
const tickCountdown = () => {
  if (remainingSeconds.value > 0 && remainingSeconds.value < 60) {
    remainingSeconds.value--
  }
}

watch(queueCount, (newVal, oldVal) => {
  // If queue count changed, reset the timer to ensure accurate base time from DB
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(tickCountdown, 1000)
})

const isCountdown = computed(() => remainingSeconds.value < 60 && remainingSeconds.value > 0)

const formattedTime = computed(() => {
  const total = remainingSeconds.value
  
  if (total <= 0) {
    return '準備顯示'
  }
  
  if (total < 60) {
    return `${total} 秒`
  }
  
  const minutes = Math.ceil(total / 60)
  
  if (minutes < 60) {
    return `${minutes} 分鐘`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  
  if (remainingMinutes === 0) {
    return `${hours} 小時`
  }
  
  return `${hours} 小時 ${remainingMinutes} 分`
})

onMounted(() => {
  startListening()
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>
