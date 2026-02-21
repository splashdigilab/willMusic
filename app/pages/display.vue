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

    <!-- 主要顯示區域：由 GSAP timeline 驅動 -->
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
import { toCloneableNotePayload } from '~/utils/screen-sync-payload'
import { useScreenSync } from '~/composables/useScreenSync'
import {
  DISPLAY_SLOT_DURATION_MS,
  DISPLAY_ANIMATION_RATIO,
  DISPLAY_SCALE_OFF,
  DISPLAY_SCALE_PEAK,
  DISPLAY_ENTER_ANIM1_RATIO,
  DISPLAY_EXIT_ANIM1_RATIO
} from '~/data/display-config'

const {
  queue,
  currentNote,
  currentSource,
  displayState,
  queueLength,
  slotDurationSeconds,
  effectiveQueueLength,
  endSlot,
  requestBorrowEarly,
  startListening,
  stopListening
} = useDisplayController()

const { send } = useScreenSync()

const displayAreaRef = ref<HTMLElement | null>(null)
const currentNoteWrapRef = ref<HTMLElement | null>(null)
let slotTimeline: gsap.core.Timeline | null = null
/** 避免 currentNote/currentSource 分兩次更新時 watch 觸發兩次，第二次 kill 掉剛建立的 timeline 造成閃現 */
let lastSlotKey = ''

const displayStateLabel = computed(() => {
  switch (displayState.value) {
    case 'idle': return '閒置輪播'
    case 'newSingle': return '新便利貼'
    case 'queueDrain': return '排隊消化'
    default: return '—'
  }
})

const currentNoteKey = computed(() => {
  const n = currentNote.value
  if (!n) return 'empty'
  return (n as QueuePendingItem).id ?? (n as QueueHistoryItem).id ?? (n as QueuePendingItem).token ?? 'note'
})

const nextItems = computed(() => queue.value.slice(1, 4))

const truncate = (text: string, length: number) =>
  text.length > length ? text.substring(0, length) + '...' : text

function getNoteId(note: QueuePendingItem | QueueHistoryItem | null): string {
  if (!note) return ''
  return (note as any).id ?? (note as any).token ?? ''
}

// ─── GSAP 動畫 ────────────────────────────────────────────────────────────────

const EASE = 'power2.inOut'
const OFF_SCREEN_BOTTOM = '100vh'
const OFF_SCREEN_LEFT = '-100vw'

/**
 * 入場方向：
 * - pending（新便利貼）：從下方進入
 * - history（idle 從 Live 借來）：從左側進入（Live 在螢幕左方）
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

  // 初始位置
  if (fromHistory) {
    // 從左側進入（Live 在左邊）
    gsap.set(el, { x: OFF_SCREEN_LEFT, y: 0, scale: DISPLAY_SCALE_OFF, opacity: 1, transformOrigin: '50% 50%' })
  } else {
    // 從下方進入（pending note 全新亮相）
    gsap.set(el, { x: 0, y: OFF_SCREEN_BOTTOM, scale: DISPLAY_SCALE_OFF, opacity: 1, transformOrigin: '50% 50%' })
  }

  // 快照：timeline onComplete 時 currentNote 可能已被清除，先存下來
  const noteAtStart = currentNote.value
  const sourceAtStart = currentSource.value

  slotTimeline = gsap.timeline({
    onComplete: () => {
      slotTimeline = null
      const noteId = getNoteId(noteAtStart)

      if (sourceAtStart === 'history') {
        send({ type: 'DISPLAY_EXIT_DONE', noteId })
        endSlot()
      } else if (sourceAtStart === 'pending') {
        send({ type: 'NEW_NOTE_ARRIVING', note: toCloneableNotePayload(noteAtStart as QueuePendingItem) })
        endSlot()
      } else {
        endSlot()
      }
    }
  })

  // 進入：動畫1 移入同時 scale OFF→PEAK，動畫2 scale PEAK→1
  const enterAnim1Duration = enterDuration * DISPLAY_ENTER_ANIM1_RATIO
  const enterAnim2Duration = enterDuration * (1 - DISPLAY_ENTER_ANIM1_RATIO)
  if (fromHistory) {
    slotTimeline.to(el, { x: 0, scale: DISPLAY_SCALE_PEAK, duration: enterAnim1Duration, ease: EASE })
  } else {
    slotTimeline.to(el, { y: 0, scale: DISPLAY_SCALE_PEAK, duration: enterAnim1Duration, ease: EASE })
  }
  slotTimeline.to(el, { scale: 1, duration: enterAnim2Duration, ease: EASE }, `+=0`)

  if (holdDuration > 0) {
    slotTimeline.to({}, { duration: holdDuration }, enterDuration)
  }

  // 移出：動畫1 scale 1→PEAK，動畫2 往左移出同時 scale PEAK→OFF
  const exitAnim1Duration = exitDuration * DISPLAY_EXIT_ANIM1_RATIO
  const exitAnim2Duration = exitDuration * (1 - DISPLAY_EXIT_ANIM1_RATIO)
  slotTimeline.to(el, { scale: DISPLAY_SCALE_PEAK, duration: exitAnim1Duration, ease: EASE }, exitStart)
  slotTimeline.to(el, { x: OFF_SCREEN_LEFT, scale: DISPLAY_SCALE_OFF, duration: exitAnim2Duration, ease: EASE }, exitStart + exitAnim1Duration)

  // 出場開始時向 Live 借下一張：僅當「當前是借來的（idle）且 queue 空」才提早借。
  // 若當前是最後一則 pending（會送 NEW_NOTE_ARRIVING），不在這裡借片，改由 onComplete → endSlot() 再 BORROW_REQUEST，
  // 這樣 Live 會先處理 NEW_NOTE_ARRIVING（最舊改 removing-top）再收 BORROW_REQUEST，才不會把「被移出那張」借去 Display。
  slotTimeline.add(() => {
    if (fromHistory && effectiveQueueLength.value === 0) requestBorrowEarly()
  }, exitStart)
}

watch(
  () => [currentNote.value, currentSource.value],
  ([note, source]) => {
    if (!note) return
    const slotKey = `${getNoteId(note)}-${source}`
    if (slotKey === lastSlotKey) return
    lastSlotKey = slotKey
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
