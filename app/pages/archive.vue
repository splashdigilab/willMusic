<template>
  <div class="p-archive">
    <BrowserWarning
      :show="showWarning"
      :browser-name="browserName"
      :instructions="instructions"
      @close="closeWarning"
    />

    <nav class="p-archive__nav">
      <NuxtLink to="/live" class="p-archive__nav-link">即時牆</NuxtLink>
    </nav>

    <div class="p-archive__container">
      <div v-if="loading && items.length === 0" class="p-archive__loading-state">
        <div class="p-archive__loading-spinner"></div>
        <p>載入中...</p>
      </div>

      <div v-else-if="items.length === 0" class="p-archive__empty-state">
        <p class="p-archive__empty-icon">📝</p>
        <p>目前沒有歷史紀錄</p>
      </div>

      <div v-else class="p-archive__wall-grid">
        <div
          v-for="item in items"
          :key="item.id"
          class="p-archive__wall-item c-sticky-note-container--wall"
        >
          <StickyNote :note="item" />
        </div>
      </div>

      <div ref="infiniteScrollTrigger" class="p-archive__infinite-scroll-trigger">
        <div v-if="loadingMore" class="p-archive__loading-more">
          <div class="p-archive__loading-spinner-small"></div>
          <span>載入更多...</span>
        </div>
        <div v-else-if="!hasMore && items.length > 0" class="p-archive__no-more">
          已顯示所有內容
        </div>
      </div>
    </div>

    <NuxtLink to="/editor" class="p-archive__fab">
      <span class="p-archive__fab-icon">✏️</span>
      <span class="p-archive__fab-text">建立便利貼</span>
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

const { getHistory } = useFirestore()
const { isInAppBrowser, showWarning, browserName, instructions, showBrowserWarning, closeWarning } = useInAppBrowser()

const items = ref<QueueHistoryItem[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
const infiniteScrollTrigger = ref<HTMLElement | null>(null)

const existingIds = new Set<string>()

const loadMore = async () => {
  if (loadingMore.value || !hasMore.value) return

  loadingMore.value = true
  try {
    const result = await getHistory(20, lastDoc ?? undefined)
    if (result.items.length === 0) {
      hasMore.value = false
      return
    }
    const newItems = result.items.filter((item) => {
      const id = item.id
      if (id == null || existingIds.has(id)) return false
      existingIds.add(id)
      return true
    })
    items.value.push(...newItems)
    lastDoc = result.lastDoc
    hasMore.value = result.items.length === 20
  } catch (e) {
    console.error(e)
  } finally {
    loadingMore.value = false
  }
}

let observerInstance: IntersectionObserver | null = null

const setupInfiniteScroll = () => {
  const el = infiniteScrollTrigger.value
  if (!el || observerInstance) return
  observerInstance = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) loadMore()
    },
    { rootMargin: '100px' }
  )
  observerInstance.observe(el)
}

onMounted(() => {
  if (isInAppBrowser.value) showBrowserWarning()

  loading.value = true
  getHistory(20).then((result) => {
    // 依 id 去重
    const deduped = result.items.filter((item) => {
      const id = item.id
      if (id == null || id === '' || existingIds.has(id)) return false
      existingIds.add(id)
      return true
    })
    items.value = deduped
    lastDoc = result.lastDoc
    hasMore.value = result.items.length === 20
  }).catch(console.error).finally(() => {
    loading.value = false
    nextTick(setupInfiniteScroll)
  })
})

onUnmounted(() => {
  observerInstance?.disconnect()
})
</script>
