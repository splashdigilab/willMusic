<template>
  <div class="p-home">
    <!-- In-App Browser 警告 -->
    <BrowserWarning
      :show="showWarning"
      :browser-name="browserName"
      :instructions="instructions"
      @close="closeWarning"
    />

    <!-- Header -->
    <header class="p-home__header">
      <div class="p-home__container">
        <h1 class="p-home__title">WillMusic Sky Memo</h1>
        <p class="p-home__subtitle">在天空留下你的訊息</p>
      </div>
    </header>

    <!-- Tabs -->
    <div class="p-home__tabs">
      <div class="p-home__container">
        <div class="p-home__tabs-wrapper">
          <button
            class="p-home__tab-item"
            :class="{ 'is-active': activeTab === 'live' }"
            @click="activeTab = 'live'"
          >
            <span class="p-home__tab-icon">🔴</span>
            <span>即時牆</span>
          </button>
          <button
            class="p-home__tab-item"
            :class="{ 'is-active': activeTab === 'archive' }"
            @click="activeTab = 'archive'"
          >
            <span class="p-home__tab-icon">📚</span>
            <span>典藏牆</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Live Wall -->
    <div v-show="activeTab === 'live'" class="p-home__live-wall">
      <div class="p-home__container">
        <div v-if="liveLoading && liveItems.length === 0" class="p-home__loading-state">
          <div class="p-home__loading-spinner"></div>
          <p>載入中...</p>
        </div>

        <div v-else-if="liveItems.length === 0" class="p-home__empty-state">
          <p class="p-home__empty-icon">📝</p>
          <p>目前還沒有便利貼</p>
        </div>

        <div v-else class="p-home__wall-grid">
          <div
            v-for="item in liveItems"
            :key="item.id"
            class="p-home__wall-item c-sticky-note-container--wall"
          >
            <StickyNote :note="item" />
          </div>
        </div>
      </div>
    </div>

    <!-- Archive Wall (Infinite Scroll) -->
    <div v-show="activeTab === 'archive'" class="p-home__archive-wall">
      <div class="p-home__container">
        <div v-if="archiveLoading && archiveItems.length === 0" class="p-home__loading-state">
          <div class="p-home__loading-spinner"></div>
          <p>載入中...</p>
        </div>

        <div v-else-if="archiveItems.length === 0" class="p-home__empty-state">
          <p class="p-home__empty-icon">📝</p>
          <p>目前沒有歷史紀錄</p>
        </div>

        <div v-else class="p-home__wall-grid">
          <div
            v-for="item in archiveItems"
            :key="item.id"
            class="p-home__wall-item c-sticky-note-container--wall"
          >
            <StickyNote :note="item" />
          </div>
        </div>

        <!-- Infinite Scroll Trigger -->
        <div ref="infiniteScrollTrigger" class="p-home__infinite-scroll-trigger">
          <div v-if="archiveLoading" class="p-home__loading-more">
            <div class="p-home__loading-spinner-small"></div>
            <span>載入更多...</span>
          </div>
          <div v-else-if="!hasMoreArchive" class="p-home__no-more">
            已顯示所有內容
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Action Button -->
    <NuxtLink to="/editor" class="p-home__fab">
      <span class="p-home__fab-icon">✏️</span>
      <span class="p-home__fab-text">建立便利貼</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { QueueHistoryItem } from '~/types'
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({
  layout: false
})

const { getHistory, listenToHistory } = useFirestore()
const { 
  isInAppBrowser, 
  browserName, 
  showWarning, 
  instructions, 
  showBrowserWarning, 
  closeWarning 
} = useInAppBrowser()

const activeTab = ref<'live' | 'archive'>('live')

// Live Wall (最新 60 筆，即時監聽)
const liveItems = ref<QueueHistoryItem[]>([])
const liveLoading = ref(false)
let liveUnsubscribe: (() => void) | null = null

// Archive Wall (無限捲動)
const archiveItems = ref<QueueHistoryItem[]>([])
const archiveLoading = ref(false)
const hasMoreArchive = ref(true)
let lastArchiveDoc: QueryDocumentSnapshot<DocumentData> | null = null

const infiniteScrollTrigger = ref<HTMLElement | null>(null)

/**
 * 即時監聽 Live Wall 資料（資料庫更新時自動同步）
 */
const startLiveWallListener = () => {
  liveLoading.value = true
  liveUnsubscribe = listenToHistory(60, (items) => {
    liveItems.value = items
    liveLoading.value = false
  })
}

/**
 * 載入 Archive Wall 資料
 */
const loadArchiveWall = async () => {
  if (archiveLoading.value || !hasMoreArchive.value) return

  archiveLoading.value = true
  try {
    const result = await getHistory(20, lastArchiveDoc || undefined)
    
    if (result.items.length === 0) {
      hasMoreArchive.value = false
      return
    }

    archiveItems.value.push(...result.items)
    lastArchiveDoc = result.lastDoc
    hasMoreArchive.value = result.items.length === 20
  } catch (error) {
    console.error('Error loading archive wall:', error)
  } finally {
    archiveLoading.value = false
  }
}

/**
 * 設定 Intersection Observer for Infinite Scroll
 */
const setupInfiniteScroll = () => {
  if (!import.meta.client || !infiniteScrollTrigger.value) return

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && activeTab.value === 'archive') {
        loadArchiveWall()
      }
    },
    {
      rootMargin: '100px'
    }
  )

  observer.observe(infiniteScrollTrigger.value)

  onUnmounted(() => {
    observer.disconnect()
  })
}

// 當切換到 Archive tab 時載入資料
watch(activeTab, (newTab) => {
  if (newTab === 'archive' && archiveItems.value.length === 0) {
    loadArchiveWall()
  }
})

onMounted(() => {
  // 檢查 In-App Browser
  if (isInAppBrowser.value) {
    showBrowserWarning()
  }

  // 即時監聽 Live Wall（資料庫更新時自動出現）
  startLiveWallListener()

  // 設定 Infinite Scroll
  setupInfiniteScroll()
})

onUnmounted(() => {
  if (liveUnsubscribe) {
    liveUnsubscribe()
  }
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_home.scss */
</style>
