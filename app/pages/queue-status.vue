<template>
  <div class="p-queue-status">
    <div class="p-queue-status__container">
      <img src="/willMusicLogo.png" alt="WillMusic" class="p-queue-status__logo" />

      <div class="p-queue-status__heading">
        <h1 class="p-queue-status__title">{{ t.queue.title }}</h1>
        <p class="p-queue-status__lead">{{ t.queue.lead }}</p>
      </div>

      <!-- 數值卡：沿用編輯器面板那套白色漸層與圓角 -->
      <div class="p-queue-status__stats">
        <div class="p-queue-status__stat">
          <span class="p-queue-status__stat-label">{{ t.queue.countLabel }}</span>
          <span class="p-queue-status__stat-value">{{ queueCount }} <small>{{ t.queue.countUnit(queueCount) }}</small></span>
        </div>

        <div class="p-queue-status__stat-divider" />

        <div class="p-queue-status__stat">
          <span class="p-queue-status__stat-label">{{ t.queue.waitLabel }}</span>
          <span class="p-queue-status__stat-value">{{ formattedTime }}</span>
        </div>
      </div>

      <!-- 送出之後、等上牆的這段空檔邀請加好友。已經是好友、或按過一次的人不會出現 -->
      <LineFriendPrompt variant="banner" />

      <NuxtLink to="/" class="p-queue-status__btn-home">{{ t.queue.backHome }}</NuxtLink>
      <!-- 離開這頁之後，還能在「我的便利貼」看到自己那張排到第幾 -->
      <NuxtLink to="/my-notes" class="p-queue-status__link">{{ t.queue.viewMyNotes }}</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { collection, query, onSnapshot } from 'firebase/firestore'

definePageMeta({
  layout: false
})

const { t } = useI18n()
usePageSeo(() => t.value.seo.queue.title, () => t.value.seo.queue.description)

const { $firestore } = useNuxtApp()
const db = $firestore as any
const cols = useCollections()

const queueCount = ref(0)
let unsubscribe: (() => void) | null = null

// 每張便利貼的預估顯示時間（秒）
const displaySec = 15

const startListening = () => {
  const q = query(collection(db, cols.queuePending))
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    queueCount.value = snapshot.size
  }, (error) => {
    console.error('Error listening to queue:', error)
  })
}

/** 「大概時間」的區間上限（分鐘）。十分鐘內一分鐘一格，之後五分鐘一格 */
const WAIT_BUCKETS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30]
const LONGEST_BUCKET = WAIT_BUCKETS[WAIT_BUCKETS.length - 1]!

const formattedTime = computed(() => {
  const total = queueCount.value * displaySec

  if (total <= 60) {
    // 一分鐘內一律顯示「準備顯示」，不再顯示秒數倒數
    return t.value.queue.waitSoon
  }

  const minutes = Math.ceil(total / 60)

  // 使用「大概時間」區間文案，而不是精確分秒
  const bucket = WAIT_BUCKETS.find(limit => minutes <= limit)
  return bucket ? t.value.queue.waitWithin(bucket) : t.value.queue.waitOver(LONGEST_BUCKET)
})

onMounted(() => {
  startListening()
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>
