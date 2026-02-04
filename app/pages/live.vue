<template>
  <div class="p-live">
    <BrowserWarning
      :show="showWarning"
      :browser-name="browserName"
      :instructions="instructions"
      @close="closeWarning"
    />

    <nav class="p-live__nav">
      <NuxtLink to="/archive" class="p-live__nav-link">典藏牆</NuxtLink>
    </nav>

    <div class="p-live__container">
      <div v-if="loading && items.length === 0" class="p-live__loading-state">
        <div class="p-live__loading-spinner"></div>
        <p>載入中...</p>
      </div>

      <div v-else-if="items.length === 0" class="p-live__empty-state">
        <p class="p-live__empty-icon">📝</p>
        <p>目前還沒有便利貼</p>
      </div>

      <div v-else class="p-live__wall-grid">
        <div
          v-for="item in items"
          :key="item.id"
          class="p-live__wall-item c-sticky-note-container--wall"
        >
          <StickyNote :note="item" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueueHistoryItem } from '~/types'
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({
  layout: false
})

const { listenToHistory } = useFirestore()
const { isInAppBrowser, showWarning, browserName, instructions, showBrowserWarning, closeWarning } = useInAppBrowser()

const items = ref<QueueHistoryItem[]>([])
const loading = ref(false)
let unsubscribe: (() => void) | null = null

onMounted(() => {
  if (isInAppBrowser.value) showBrowserWarning()

  loading.value = true
  unsubscribe = listenToHistory(20, (data) => {
    items.value = data
    loading.value = false
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>
