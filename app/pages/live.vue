<template>
  <div class="p-live">
    <BrowserWarning
      :show="showWarning"
      :browser-name="browserName"
      :instructions="instructions"
      @close="closeWarning"
    />

    <div class="p-live__container">
      <div v-if="loading && items.length === 0" class="p-live__loading-state">
        <div class="p-live__loading-spinner"></div>
        <p>載入中...</p>
      </div>

      <div v-else-if="items.length === 0" class="p-live__empty-state">
        <p class="p-live__empty-icon">📝</p>
        <p>目前還沒有便利貼</p>
      </div>

      <div v-else class="p-live__wall">
        <div
          v-for="(item, index) in itemsWithPosition"
          :key="item.note.id ?? item.note.token ?? index"
          class="p-live__wall-item"
          :style="item.style"
        >
          <StickyNote :note="item.note" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { QueueHistoryItem } from '~/types'
import StickyNote from '~/components/StickyNote.vue'
import { HISTORY_POOL_SIZE } from '~/data/display-config'

/**
 * 單張佔格子比例；依張數動態格子時，noteSize = min(cellW, cellH) * FILL，絕不重疊。
 */
const FILL = 0.78

/** 隨機旋轉範圍（度），每張便利貼 ±ROTATE_DEG */
const ROTATE_DEG = 10

// ─── 工具函式 ────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}

interface SlotPx {
  cx: number
  cy: number
  size: number
  rotateDeg: number
}

/**
 * 依張數 N 動態算格子與尺寸，讓 N 少時單張變大、N 多時變小。
 * 產生足夠格子後隨機抽 N 個，散佈在畫面中；每格內再加 jitter 與隨機角度。
 */
function computeSlots(W: number, H: number, N: number): SlotPx[] {
  if (N <= 0) return []
  const cols = Math.max(1, Math.ceil(Math.sqrt(N)))
  const rows = Math.ceil(N / cols)
  const cellW = W / cols
  const cellH = H / rows
  const size = Math.floor(Math.min(cellW, cellH) * FILL)
  const maxJitterX = Math.max(0, (cellW - size) / 2)
  const maxJitterY = Math.max(0, (cellH - size) / 2)

  const allSlots: SlotPx[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const baseCx = (col + 0.5) * cellW
      const baseCy = (row + 0.5) * cellH
      allSlots.push({
        cx: baseCx + (Math.random() - 0.5) * 2 * maxJitterX,
        cy: baseCy + (Math.random() - 0.5) * 2 * maxJitterY,
        size,
        rotateDeg: (Math.random() - 0.5) * 2 * ROTATE_DEG
      })
    }
  }
  return shuffle(allSlots).slice(0, N)
}

// ─── 資料 ────────────────────────────────────────────────────────────────────
const { listenToHistory } = useFirestore()
const { isInAppBrowser, showWarning, browserName, instructions, showBrowserWarning, closeWarning } = useInAppBrowser()

const items = ref<QueueHistoryItem[]>([])
const shuffledItems = ref<QueueHistoryItem[]>([])
const viewport = ref({ w: 0, h: 0 })
const slots = ref<SlotPx[]>([])
const loading = ref(false)
let unsubscribe: (() => void) | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null

watch(items, (list) => {
  shuffledItems.value = list.length === 0 ? [] : shuffle([...list])
}, { immediate: true })

watch(
  [viewport, () => shuffledItems.value.length],
  () => {
    const { w, h } = viewport.value
    const n = shuffledItems.value.length
    slots.value = w > 0 && h > 0 && n > 0 ? computeSlots(w, h, n) : []
  },
  { immediate: true }
)

const itemsWithPosition = computed(() => {
  const list = shuffledItems.value
  const sl = slots.value
  if (!list.length || !sl.length) return []
  const n = Math.min(list.length, sl.length)
  return Array.from({ length: n }, (_, i) => {
    const s = sl[i]!
    return {
      note: list[i]!,
      style: {
        left: `${s.cx}px`,
        top: `${s.cy}px`,
        width: `${s.size}px`,
        height: `${s.size}px`,
        transform: `translate(-50%, -50%) rotate(${s.rotateDeg}deg)`,
        '--rotate-deg': `${s.rotateDeg}deg`
      } as Record<string, string>
    }
  })
})

function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    viewport.value = { w: window.innerWidth, h: window.innerHeight }
  }, 100)
}

onMounted(() => {
  if (isInAppBrowser.value) showBrowserWarning()
  viewport.value = { w: window.innerWidth, h: window.innerHeight }
  window.addEventListener('resize', onResize)
  loading.value = true
  unsubscribe = listenToHistory(HISTORY_POOL_SIZE, (data) => {
    items.value = data
    loading.value = false
  })
  document.documentElement.classList.add('p-live-active')
  document.body.classList.add('p-live-active')
  document.getElementById('__nuxt')?.classList.add('p-live-active')
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  window.removeEventListener('resize', onResize)
  if (resizeTimer) clearTimeout(resizeTimer)
  document.documentElement.classList.remove('p-live-active')
  document.body.classList.remove('p-live-active')
  document.getElementById('__nuxt')?.classList.remove('p-live-active')
})
</script>
