<template>
  <div class="landing-page">
    <!-- In-App Browser 警告 -->
    <BrowserWarning
      :show="showWarning"
      :browser-name="browserName"
      :instructions="instructions"
      @close="closeWarning"
    />

    <!-- Header -->
    <header class="landing-header">
      <div class="container">
        <h1 class="landing-title">WillMusic Sky Memo</h1>
        <p class="landing-subtitle">在天空留下你的訊息</p>
      </div>
    </header>

    <!-- Tabs -->
    <div class="landing-tabs">
      <div class="container">
        <div class="tabs-wrapper">
          <button
            class="tab-item"
            :class="{ 'is-active': activeTab === 'live' }"
            @click="activeTab = 'live'"
          >
            <span class="tab-icon">🔴</span>
            <span>即時牆</span>
          </button>
          <button
            class="tab-item"
            :class="{ 'is-active': activeTab === 'archive' }"
            @click="activeTab = 'archive'"
          >
            <span class="tab-icon">📚</span>
            <span>典藏牆</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Live Wall -->
    <div v-show="activeTab === 'live'" class="live-wall">
      <div class="container">
        <div v-if="liveLoading && liveItems.length === 0" class="loading-state">
          <div class="loading-spinner"></div>
          <p>載入中...</p>
        </div>

        <div v-else-if="liveItems.length === 0" class="empty-state">
          <p class="empty-icon">📝</p>
          <p>目前還沒有便利貼</p>
        </div>

        <div v-else class="wall-grid">
          <div
            v-for="item in liveItems"
            :key="item.id"
            class="wall-item"
          >
            <StickyNote :note="item" />
          </div>
        </div>
      </div>
    </div>

    <!-- Archive Wall (Infinite Scroll) -->
    <div v-show="activeTab === 'archive'" class="archive-wall">
      <div class="container">
        <div v-if="archiveLoading && archiveItems.length === 0" class="loading-state">
          <div class="loading-spinner"></div>
          <p>載入中...</p>
        </div>

        <div v-else-if="archiveItems.length === 0" class="empty-state">
          <p class="empty-icon">📝</p>
          <p>目前沒有歷史紀錄</p>
        </div>

        <div v-else class="wall-grid">
          <div
            v-for="item in archiveItems"
            :key="item.id"
            class="wall-item"
          >
            <StickyNote :note="item" />
          </div>
        </div>

        <!-- Infinite Scroll Trigger -->
        <div ref="infiniteScrollTrigger" class="infinite-scroll-trigger">
          <div v-if="archiveLoading" class="loading-more">
            <div class="loading-spinner-small"></div>
            <span>載入更多...</span>
          </div>
          <div v-else-if="!hasMoreArchive" class="no-more">
            已顯示所有內容
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Action Button -->
    <NuxtLink to="/editor" class="fab">
      <span class="fab-icon">✏️</span>
      <span class="fab-text">建立便利貼</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { QueueHistoryItem } from '~/types'
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'

definePageMeta({
  layout: false
})

const { getHistory } = useFirestore()
const { 
  isInAppBrowser, 
  browserName, 
  showWarning, 
  instructions, 
  showBrowserWarning, 
  closeWarning 
} = useInAppBrowser()

const activeTab = ref<'live' | 'archive'>('live')

// Live Wall (最新 60 筆)
const liveItems = ref<QueueHistoryItem[]>([])
const liveLoading = ref(false)

// Archive Wall (無限捲動)
const archiveItems = ref<QueueHistoryItem[]>([])
const archiveLoading = ref(false)
const hasMoreArchive = ref(true)
let lastArchiveDoc: QueryDocumentSnapshot<DocumentData> | null = null

const infiniteScrollTrigger = ref<HTMLElement | null>(null)

/**
 * 載入 Live Wall 資料
 */
const loadLiveWall = async () => {
  liveLoading.value = true
  try {
    const result = await getHistory(60)
    liveItems.value = result.items
  } catch (error) {
    console.error('Error loading live wall:', error)
  } finally {
    liveLoading.value = false
  }
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

  // 載入 Live Wall
  loadLiveWall()

  // 設定 Infinite Scroll
  setupInfiniteScroll()
})
</script>

<style scoped lang="scss">
.landing-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding-bottom: 6rem;
}

.landing-header {
  padding: 3rem 1rem 2rem;
  text-align: center;
  color: white;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.landing-title {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.landing-subtitle {
  font-size: 1.125rem;
  opacity: 0.95;
}

.landing-tabs {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 1rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.tabs-wrapper {
  display: flex;
  gap: 1rem;
  max-width: 400px;
  margin: 0 auto;
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid transparent;
  border-radius: 12px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  &.is-active {
    background: white;
    color: #667eea;
    border-color: white;
  }
}

.tab-icon {
  font-size: 1.25rem;
}

.live-wall,
.archive-wall {
  padding: 2rem 0;
}

.wall-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.wall-item {
  animation: fadeInUp 0.5s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: white;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.infinite-scroll-trigger {
  padding: 2rem 0;
  text-align: center;
}

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: white;
  font-size: 0.875rem;
}

.loading-spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.no-more {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.875rem;
}

.fab {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: white;
  text-decoration: none;
  border-radius: 50px;
  box-shadow: 0 8px 24px rgba(251, 191, 36, 0.4);
  font-weight: 600;
  transition: all 0.3s ease;
  z-index: 50;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(251, 191, 36, 0.5);
  }

  &:active {
    transform: translateY(-2px);
  }
}

.fab-icon {
  font-size: 1.5rem;
}

.fab-text {
  font-size: 1rem;
}

@media (max-width: 768px) {
  .landing-title {
    font-size: 2rem;
  }

  .wall-grid {
    grid-template-columns: 1fr;
  }

  .fab {
    bottom: 1.5rem;
    right: 1.5rem;
  }

  .fab-text {
    display: none;
  }
}
</style>
