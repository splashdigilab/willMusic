<template>
  <div class="p-index" ref="containerRef">
    
    <!-- Header -->
    <AppHeader show-help @help="showIntroOverlay = true" />

    <!-- 活動介紹滿版 overlay：載入時顯示，loading 完後按「開始」關閉 -->
    <Transition name="intro-fade">
      <div v-if="showIntroOverlay" class="p-index__intro-overlay">
        <div class="p-index__intro-card">
          <!-- 四角裝飾方塊 -->
          <div class="p-index__intro-marks p-index__intro-marks--tl">
            <i class="p-index__intro-mark" /><i class="p-index__intro-mark" /><i class="p-index__intro-mark" />
          </div>
          <div class="p-index__intro-marks p-index__intro-marks--br">
            <i class="p-index__intro-mark" /><i class="p-index__intro-mark" /><i class="p-index__intro-mark" />
          </div>

          <!-- 卡片上下的英文小字 -->
          <p class="p-index__intro-caption p-index__intro-caption--top">Create your customized message here<br>and share your passion for music with everyone.</p>
          <p class="p-index__intro-caption p-index__intro-caption--bottom">Create your customized message here<br>and share your passion for music with everyone.</p>

          <h1 class="p-index__intro-title">
            <span>應援便利貼<i class="p-index__intro-bang">!</i></span>
            <span>POST BOARD</span>
          </h1>
          <div class="p-index__intro-desc p-index__intro-rules">
            <p>歡迎來到 WillMusic 數位應援便利貼<br>在這裡，您可以創作專屬於您的應援內容<br>與大家一起分享對音樂的熱愛。</p>
          </div>
          <button
            type="button"
            class="p-index__intro-btn"
            :disabled="loading"
            @click="onStartClick"
          >
            <span v-if="loading" class="p-index__intro-btn-inner">
              <span class="p-index__intro-spinner" aria-hidden="true" />
              載入中...
            </span>
            <span v-else>START</span>
          </button>
        </div>

        <img src="/willMusicLogo.png" alt="WillMusic" class="p-index__intro-logo" />
      </div>
    </Transition>

    <!-- 畫布內容區，負責所有 transforms -->
    <TransitionGroup 
      tag="div" 
      class="p-index__canvas" 
      ref="canvasRef"
      :css="false"
      @leave="onLeave"
    >
      <!-- 便利貼容器 -->
      <div 
        v-for="item in displayItems" 
        :key="item.id || item.token"
        :data-id="item.id || item.token"
        class="p-index__note-wrap"
      >
        <StickyNote :note="item" />
      </div>
    </TransitionGroup>

    <!-- UI Controls -->
    <div
      class="p-index__controls"
      @pointerdown.stop
      @mousedown.stop
      @touchstart.stop
      @wheel.stop
    >
      <div class="p-index__controls-top">
        <button class="c-btn c-btn--icon p-index__center-btn" @click="centerContent" title="置中">
          <!-- Center Icon -->
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19 12h2"></path>
            <path d="M3 12h2"></path>
            <path d="M12 3v2"></path>
            <path d="M12 19v2"></path>
          </svg>
        </button>
      </div>
      <NuxtLink to="/editor" class="c-btn c-btn--fab p-index__fab">
        專屬便利貼
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { gsap } from 'gsap'
import type { QueueHistoryItem } from '~/types'
import { useFirestore } from '~/composables/useFirestore'
import { usePanZoom, type PanZoomBounds } from '~/composables/usePanZoom'
import {
  calculateScatterPositions,
  boundingBoxOf,
  type ScatterPosition
} from '~/utils/scatter-layout'
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({ layout: false, ssr: false })

const { getHistory } = useFirestore()

// ====== UI Refs ======
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLElement | null>(null)

// ====== Data ======
const displayItems = ref<QueueHistoryItem[]>([])
const showIntroOverlay = ref(true)
const loading = ref(true)
const HISTORY_FETCH_LIMIT = 100

// ====== 散落佈局 ======
// 演算法與 /canvas 共用，見 ~/utils/scatter-layout
const ITEM_SIZE = 150
const MARGIN = -20
const MAX_BOUNDING_BOX = boundingBoxOf(ITEM_SIZE)

const layoutCache = ref<ScatterPosition[]>([])

// Compute bounding box based on layout cache
const computedBounds = computed<PanZoomBounds | null>(() => {
  if (layoutCache.value.length === 0) return null

  const firstPos = layoutCache.value[0]
  if (!firstPos) return null

  let minX = firstPos.x
  let maxX = firstPos.x
  let minY = firstPos.y
  let maxY = firstPos.y

  for (let i = 1; i < layoutCache.value.length; i++) {
    const pos = layoutCache.value[i]
    if (!pos) continue
    if (pos.x < minX) minX = pos.x
    if (pos.x > maxX) maxX = pos.x
    if (pos.y < minY) minY = pos.y
    if (pos.y > maxY) maxY = pos.y
  }

  // Force bounds to be perfectly symmetric around (0,0) so dragging feels centered
  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX))
  const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY))

  // Account for the item size itself so bounds cover the entire objects
  const halfSize = MAX_BOUNDING_BOX / 2
  return {
    minX: -maxAbsX - halfSize,
    maxX: maxAbsX + halfSize,
    minY: -maxAbsY - halfSize,
    maxY: maxAbsY + halfSize
  }
})

// ====== Pan & Zoom ======
const { centerContent } = usePanZoom(containerRef, canvasRef, {
  minScale: 0.5,
  maxScale: 3,
  initialScale: 1,
  initialCenter: true,
  disabled: showIntroOverlay,
  bounds: computedBounds,
  boundsPadding: 0.9 // allow 70% of the screen width/height empty space margin
})

const calculatePositions = (itemCount: number) => {
  layoutCache.value = calculateScatterPositions(itemCount, {
    itemSize: ITEM_SIZE,
    margin: MARGIN
  })
}

const getStoredPosition = (index: number) => {
  if (layoutCache.value[index]) {
    return layoutCache.value[index]
  }
  return { x: 0, y: 0 }
}

// ====== Animation Logic ======
const ENTRY_ANIMATION_COUNT = 20 // 入場只對前 N 張播 fly-in，其餘直接出現在定位
let isFirstRender = true
let isReflowing = false

const playReflowSequence = async () => {
  if (isReflowing) return
  isReflowing = true

  await nextTick()
  const canvasEl = canvasRef.value ? ((canvasRef.value as any).$el || canvasRef.value) : null
  if (!canvasEl) {
    isReflowing = false
    return
  }

  const elements = Array.from(canvasEl.querySelectorAll('.p-index__note-wrap'))
  if (!elements.length) {
    isReflowing = false
    return
  }

  if (isFirstRender) {
    calculatePositions(displayItems.value.length)

    elements.forEach((el, index) => {
      const pos = getStoredPosition(index)
      const element = el as HTMLElement
      element.style.zIndex = `${1000 - index}`
      const rotation = (Math.random() - 0.5) * 15

      if (index < ENTRY_ANIMATION_COUNT) {
        // 前 30 張：fly-in 動畫，延遲上限避免 iOS 負擔
        const animDelay = Math.min(index * 0.05, 1.5)
        gsap.to(element, {
          x: pos.x,
          y: pos.y,
          scale: 1,
          opacity: 1,
          rotation,
          duration: 1.2 + Math.random() * 0.5,
          ease: 'power3.out',
          delay: animDelay
        })
      } else {
        // 第 31 張起：直接出現在應有位置
        gsap.set(element, {
          x: pos.x,
          y: pos.y,
          scale: 1,
          opacity: 1,
          rotation
        })
      }
    })
    isFirstRender = false
    isReflowing = false
    return
  }

  // Reflow: 直接從目前位置動畫到新位置（不再先收斂到原點）
  calculatePositions(displayItems.value.length)

  elements.forEach((el, index) => {
    const pos = getStoredPosition(index)
    const element = el as HTMLElement
    element.style.zIndex = `${1000 - index}`

    gsap.to(element, {
      x: pos.x,
      y: pos.y,
      scale: 1,
      opacity: 1,
      rotation: (Math.random() - 0.5) * 15,
      duration: 1.0 + Math.random() * 0.4,
      ease: 'power3.out',
      delay: Math.random() * 0.1
    })
  })
  isReflowing = false
}

let leavingCount = 0

const onLeave = (el: Element, done: () => void) => {
  leavingCount++
  
  // Fade out in place, then remove
  gsap.to(el, {
    opacity: 0,
    duration: 0.6,
    onComplete: () => {
      done()
      leavingCount--
      // Only recalculate layout for surviving nodes once ALL leaving nodes have finished their animation
      if (leavingCount === 0) {
        playReflowSequence()
      }
    }
  })
}

// 點擊「開始」：關閉 overlay 並播放進場動畫
const onStartClick = () => {
  if (loading.value) return
  showIntroOverlay.value = false
  nextTick(() => {
    playReflowSequence()
  })
}

// Watch array changes（overlay 還開著時不播動畫，等點「開始」再播）
watch(
  () => displayItems.value.length,
  async (newLen, oldLen) => {
    if (showIntroOverlay.value) return
    if (newLen > oldLen) {
      setTimeout(() => {
        playReflowSequence()
      }, 50)
    }
  }
)

let loadingTimer: ReturnType<typeof setTimeout> | null = null
const waitForNextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

const appendItemsInBatches = async (
  items: QueueHistoryItem[],
  batchSize = 12
) => {
  displayItems.value = []

  for (let i = 0; i < items.length; i += batchSize) {
    displayItems.value.push(...items.slice(i, i + batchSize))
    // 讓行動裝置在批次間有機會完成 layout/paint，避免一次性渲染尖峰
    await waitForNextFrame()
  }
}

onMounted(async () => {
  const waitForIntroImages = async () => {
    await nextTick()
    const introRoot = containerRef.value
    if (!introRoot) return
    const images = Array.from(introRoot.querySelectorAll<HTMLImageElement>('.p-index__intro-overlay img'))
    await Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.addEventListener('load', resolve as () => void, { once: true })
          img.addEventListener('error', resolve as () => void, { once: true })
        })
      })
    )
  }

  const windowLoaded = new Promise<void>(resolve => {
    if (document.readyState === 'complete') {
      resolve()
    } else {
      window.addEventListener('load', () => resolve(), { once: true })
    }
  })

  // 等待字體、圖片載入與最小延遲
  try {
    const historyPromise = getHistory(HISTORY_FETCH_LIMIT)
      .then(async ({ items }) => {
        await appendItemsInBatches(items)
      })
      .catch(e => console.error('Error fetching history:', e))

    await Promise.all([
      historyPromise,
      document.fonts.ready,
      windowLoaded,
      waitForIntroImages(),
      new Promise(resolve => {
        loadingTimer = setTimeout(resolve, 800)
      })
    ])
  } catch (e) {
    console.warn('Loading error', e)
  }
  
  loading.value = false
})

onUnmounted(() => {
  if (loadingTimer) clearTimeout(loadingTimer)
})
</script>
