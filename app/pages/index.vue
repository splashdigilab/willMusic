<template>
  <div class="p-index" ref="containerRef">
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
        v-for="(item, index) in displayItems" 
        :key="item.id || item.token"
        :data-id="item.id || item.token"
        class="p-index__note-wrap"
      >
        <StickyNote :note="item" />
      </div>
    </TransitionGroup>

    <!-- UI Controls -->
    <div class="p-index__controls">
      <button class="c-btn c-btn--icon" @click="centerContent" title="置中">
        <!-- Center Icon -->
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19 12h2"></path>
          <path d="M3 12h2"></path>
          <path d="M12 3v2"></path>
          <path d="M12 19v2"></path>
        </svg>
      </button>
      <NuxtLink to="/editor" class="c-btn c-btn--fab">
        ✏️ 寫張便利貼
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { gsap } from 'gsap'
import type { QueuePendingItem, QueueHistoryItem } from '~/types'
import { useFirestore } from '~/composables/useFirestore'
import { usePanZoom } from '~/composables/usePanZoom'
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({ layout: false })

const { listenToTodayHistory } = useFirestore()

// ====== UI Refs ======
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLElement | null>(null)

// ====== Pan & Zoom ======
const { centerContent } = usePanZoom(containerRef, canvasRef, {
  minScale: 0.1,
  maxScale: 3,
  initialScale: 1
})

// ====== Data ======
const displayItems = ref<QueueHistoryItem[]>([])

// ====== Layout Math: Fermat's Spiral with Collision Detection ======
const ITEM_SIZE = 150 
const MARGIN = 50 // Increase margin significantly
// Ensure the collision radius accounts for the maximum possible bounding box of a rotated square
// A 150x150 square rotated 45 degrees has a diagonal of 150 * sqrt(2) ≈ 212
const MAX_BOUNDING_BOX = ITEM_SIZE * Math.SQRT2
const COLLISION_RADIUS = (MAX_BOUNDING_BOX + MARGIN) / 2 

// Cache calculated positions
interface Position { x: number; y: number }
const layoutCache = ref<Position[]>([])

// Helper to check if a new position collides with any existing positions
const isColliding = (pos: Position, existingPositions: Position[]): boolean => {
  for (const existing of existingPositions) {
    const dx = pos.x - existing.x
    const dy = pos.y - existing.y
    const distanceSquared = dx * dx + dy * dy
    // If distance is less than 2 * radius, they overlap
    if (distanceSquared < (COLLISION_RADIUS * 2) * (COLLISION_RADIUS * 2)) {
      return true
    }
  }
  return false
}

/**
 * Calculates non-overlapping positions using Fermat's Spiral
 * index 0 is always exactly at (0, 0)
 */
const calculatePositions = (itemCount: number) => {
  const positions: Position[] = []
  
  // c is the step multiplier.
  const c = 35 
  let spiralIndex = 0

  for (let i = 0; i < itemCount; i++) {
    if (i === 0) {
      positions.push({ x: 0, y: 0 })
      spiralIndex++
      continue
    }

    let found = false
    let currentPos: Position = { x: 0, y: 0 }
    
    // Keep traversing the spiral until we find a spot that doesn't collide
    while (!found) {
      const r = c * Math.sqrt(spiralIndex)
      const theta = spiralIndex * 137.508 * (Math.PI / 180)
      
      currentPos = {
        x: r * Math.cos(theta),
        y: r * Math.sin(theta)
      }

      if (!isColliding(currentPos, positions)) {
        found = true
      }
      spiralIndex++
    }
    
    positions.push(currentPos)
  }

  layoutCache.value = positions
}

const getStoredPosition = (index: number) => {
  if (layoutCache.value[index]) {
    return layoutCache.value[index]
  }
  return { x: 0, y: 0 }
}

// ====== Animation Logic ======
let isFirstRender = true

const playReflowSequence = async () => {
  await nextTick()
  const canvasEl = canvasRef.value ? ((canvasRef.value as any).$el || canvasRef.value) : null
  if (!canvasEl) return

  const elements = Array.from(canvasEl.querySelectorAll('.p-index__note-wrap'))
  if (!elements.length) return

  if (isFirstRender) {
    // Recalculate layout cache for current number of items to ensure everyone has a spot
    calculatePositions(displayItems.value.length)
    elements.forEach((el, index) => {
      const pos = getStoredPosition(index)
      const element = el as HTMLElement
      element.style.zIndex = `${1000 - index}`

      // First Load: Fly in
      gsap.to(element, {
        x: pos.x,
        y: pos.y,
        scale: 1,
        opacity: 1,
        rotation: (Math.random() - 0.5) * 15,
        duration: 1.2 + Math.random() * 0.5,
        ease: 'power3.out',
        delay: index * 0.05
      })
    })
    isFirstRender = false
    return
  }

  // Reflow sequence: Collapse to center THEN fan out
  // 1. Move everything to center
  gsap.to(elements, {
    x: 0,
    y: 0,
    duration: 0.6,
    ease: 'back.in(1.2)',
    onComplete: () => {
      // 2. Recalculate layout depending on new length
      calculatePositions(displayItems.value.length)
      
      // 3. Fan out to new positions
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
    }
  })
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

// Watch array changes
watch(
  () => displayItems.value.length,
  async (newLen, oldLen) => {
    // Also capture when there are element content changes, but specifically length triggers a layout shift
    if (newLen > oldLen) {
      setTimeout(() => {
        playReflowSequence()
      }, 50)
    }
    // Deletions are completely managed by onLeave above.
  }
)

let unsubHistory: any

onMounted(() => {
  // 聽歷史
  unsubHistory = listenToTodayHistory((items) => {
    displayItems.value = items
  })
})

onUnmounted(() => {
  if (unsubHistory) unsubHistory()
})
</script>

<style scoped>
/* 將於 src 抽離為 _index.scss，這裡做基本佔位確保初次渲染正確 */
.p-index {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--color-background, #f5f5f5);
}

.p-index__tips {
  position: absolute;
  top: 2rem;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  z-index: 10;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.7);
  padding: 1rem 2rem;
  border-radius: 99px;
  backdrop-filter: blur(8px);
}

.p-index__canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* 由 usePanZoom 控制 transform */
  will-change: transform;
}

.p-index__note-wrap {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 150px;
  height: 150px;
  margin-left: -75px;
  margin-top: -75px;
  opacity: 0;
  transform: translate(0px, 0px) scale(0);
}

.p-index__controls {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  z-index: 100;
  display: flex;
  gap: 1rem;
}

.c-btn--icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: white;
  border: 1px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  color: #333;
}

.c-btn--fab {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  padding: 0 1.5rem;
  border-radius: 99px;
  background: #333;
  color: white;
  text-decoration: none;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
</style>
