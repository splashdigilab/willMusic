<template>
  <div class="p-display">
    <!-- 佇列資訊 -->
    <div class="p-display__queue-info">
      <div class="p-display__queue-info-item">
        <span class="p-display__queue-info-label">佇列長度:</span>
        <span class="p-display__queue-info-value">{{ queueLength }}</span>
      </div>
      <div class="p-display__queue-info-item">
        <span class="p-display__queue-info-label">狀態:</span>
        <span class="p-display__queue-info-value">
          {{ displayStateLabel }}
        </span>
      </div>
      <div class="p-display__queue-info-item">
        <span class="p-display__queue-info-label">每張:</span>
        <span class="p-display__queue-info-value">{{ slotDurationSeconds }} 秒</span>
      </div>
    </div>

    <!-- 主要顯示區域：由 GSAP timeline 驅動 前 ratio 進入、中間靜止、後 ratio 移出 -->
    <div class="p-display__display-area" ref="displayAreaRef">
      <template v-if="currentNote">
        <div
          ref="currentNoteWrapRef"
          :key="currentNoteKey"
          class="p-display__current-note c-sticky-note-container--display"
        >
          <StickyNote :note="currentNote" />
        </div>
      </template>
      <div v-else class="p-display__idle-state">
        <div class="p-display__idle-state-content">
          <h2 class="p-display__idle-state-title">WillMusic Sky Memo</h2>
          <p class="p-display__idle-state-subtitle">等待便利貼中...</p>
          <div class="p-display__idle-state-animation">
            <div class="p-display__floating-note" v-for="i in 5" :key="i"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 下一個佇列預覽（排隊消化時顯示接下來 3 筆） -->
    <div class="p-display__queue-preview" v-if="queue.length > 1">
      <h3 class="p-display__queue-preview-title">接下來</h3>
      <div class="p-display__queue-preview-list">
        <div
          v-for="(item, index) in nextItems"
          :key="item.id ?? item.token ?? index"
          class="p-display__queue-preview-item"
        >
          <span class="p-display__queue-preview-number">{{ index + 1 }}</span>
          <div class="p-display__queue-preview-content">
            {{ truncate(item.content, 30) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import StickyNote from '~/components/StickyNote.vue'
import type { QueuePendingItem, QueueHistoryItem } from '~/types'
import { useDisplayController } from '~/composables/useDisplayController'
import {
  DISPLAY_SLOT_DURATION_MS,
  DISPLAY_ANIMATION_RATIO
} from '~/data/display-config'

const {
  queue,
  currentNote,
  currentSource,
  displayState,
  queueLength,
  slotDurationSeconds,
  endSlot,
  startListening,
  stopListening
} = useDisplayController()

const displayAreaRef = ref<HTMLElement | null>(null)
const currentNoteWrapRef = ref<HTMLElement | null>(null)
let slotTimeline: gsap.core.Timeline | null = null

const displayStateLabel = computed(() => {
  switch (displayState.value) {
    case 'idle':
      return '閒置輪播'
    case 'newSingle':
      return '新便利貼'
    case 'queueDrain':
      return '排隊消化'
    default:
      return '—'
  }
})

const currentNoteKey = computed(() => {
  const n = currentNote.value
  if (!n) return 'empty'
  return (n as QueuePendingItem).id ?? (n as QueueHistoryItem).id ?? (n as QueuePendingItem).token ?? 'note'
})

const nextItems = computed(() => queue.value.slice(1, 4))

const truncate = (text: string, length: number) => {
  return text.length > length ? text.substring(0, length) + '...' : text
}

const EASE = 'power2.inOut'
const OFF_SCREEN_BOTTOM = '100vh'
const OFF_SCREEN_LEFT = '-100vw'

/**
 * 進入：新加入(pending) 從下方、歷史(history) 從左方；出場一律往左移出
 */
function runSlotTimeline(el: HTMLElement, fromHistory: boolean) {
  if (slotTimeline) {
    slotTimeline.kill()
    slotTimeline = null
  }
  const durationSec = DISPLAY_SLOT_DURATION_MS / 1000
  const enterDuration = durationSec * DISPLAY_ANIMATION_RATIO
  const exitDuration = durationSec * DISPLAY_ANIMATION_RATIO
  const holdDuration = durationSec - enterDuration - exitDuration
  const exitStart = enterDuration + holdDuration

  if (fromHistory) {
    gsap.set(el, { x: OFF_SCREEN_LEFT, y: 0, scale: 0.8, opacity: 1, transformOrigin: '50% 50%' })
  } else {
    gsap.set(el, { x: 0, y: OFF_SCREEN_BOTTOM, scale: 0.8, opacity: 1, transformOrigin: '50% 50%' })
  }

  slotTimeline = gsap.timeline({
    onComplete: () => {
      slotTimeline = null
      endSlot()
    }
  })

  // 0 ~ ratio：進入 — 到中央、scale 1.1 → 1
  if (fromHistory) {
    slotTimeline.to(el, { x: 0, scale: 1.1, duration: enterDuration * 0.6, ease: EASE })
  } else {
    slotTimeline.to(el, { y: 0, scale: 1.1, duration: enterDuration * 0.6, ease: EASE })
  }
  slotTimeline.to(el, { scale: 1, duration: enterDuration * 0.4, ease: EASE }, `+=0`)

  if (holdDuration > 0) {
    slotTimeline.to({}, { duration: holdDuration }, enterDuration)
  }

  // (1-ratio) ~ 1：移出 — 一律往左；先 scale 1→1.1，再 x 移出
  slotTimeline.to(el, { scale: 1.1, duration: exitDuration * 0.4, ease: EASE }, exitStart)
  slotTimeline.to(el, { x: OFF_SCREEN_LEFT, duration: exitDuration * 0.6, ease: EASE }, exitStart + exitDuration * 0.4)
}

watch(
  () => [currentNote.value, currentSource.value],
  ([note, source]) => {
    if (!note) return
    const fromHistory = source === 'history'
    nextTick(() => {
      const el = currentNoteWrapRef.value
      if (el && import.meta.client) {
        runSlotTimeline(el, fromHistory)
      }
    })
  },
  { flush: 'post' }
)

onMounted(() => {
  startListening()
})

onUnmounted(() => {
  if (slotTimeline) {
    slotTimeline.kill()
    slotTimeline = null
  }
  stopListening()
})
</script>
