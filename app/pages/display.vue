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
  HOLD_SECONDS,
  HALF_TRANSITION_SECONDS,
  DISPLAY_SCALE_OFF,
  DISPLAY_SCALE_PEAK
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
 * 動畫時序（依照 DISPLAY_LIVE_ANIMATION_RULES.md）：
 *
 * ┌─── 後半 (HALF_TRANSITION_SECONDS) ──→ 進場
 * │     fromHistory → 從「畫面左邊外、中間」進場
 * │     fromPending → 從「畫面下面外、中間」進場
 * ├─── HOLD_SECONDS ──→ 靜止不動
 * └─── 前半 (HALF_TRANSITION_SECONDS) ──→ 出場
 *       往「畫面左邊外、中間」出場
 *       出場開始時送 TRANSITION_START 給 Live（同步觸發 Live 前半）
 */
function runSlotTimeline(el: HTMLElement, fromHistory: boolean) {
  if (slotTimeline) {
    slotTimeline.kill()
    slotTimeline = null
  }

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

      // 規則二：所有從 display 出場後的便利貼（不論是 history 或是 pending），
      // 出場完畢後一律通知 Live，讓 Live 將其從右側飛回/飛進原位。
      send({ type: 'DISPLAY_EXIT_DONE', noteId })
      endSlot()
    }
  })

  // ── 進場（後半：HALF_TRANSITION_SECONDS）──────────────────────────────────
  if (fromHistory) {
    slotTimeline.to(el, { x: 0, y: 0, scale: DISPLAY_SCALE_PEAK, duration: HALF_TRANSITION_SECONDS * 0.6, ease: EASE })
    slotTimeline.to(el, { scale: 1, duration: HALF_TRANSITION_SECONDS * 0.4, ease: EASE })
  } else {
    slotTimeline.to(el, { x: 0, y: 0, scale: DISPLAY_SCALE_PEAK, duration: HALF_TRANSITION_SECONDS * 0.6, ease: EASE })
    slotTimeline.to(el, { scale: 1, duration: HALF_TRANSITION_SECONDS * 0.4, ease: EASE })
  }

  // ── 靜止開始：提早向 Live 借下一張（BORROW_REQUEST）──────────────────────
  // 不論 history 或 pending，只要 queue 空就借，確保 exitStart 時 reserved 已就緒
  const holdStart = HALF_TRANSITION_SECONDS
  slotTimeline.add(() => {
    // 如果下一張需要從 Live 借：在 hold 開始就預借
    // pending note 自己還在 queue 裡（尚未 completed），所以 <= 1 代表「除了自己沒別的了」
    const needsBorrow = sourceAtStart === 'pending'
      ? effectiveQueueLength.value <= 1
      : effectiveQueueLength.value === 0
    if (needsBorrow) {
      requestBorrowEarly()
    }
  }, holdStart)

  // ── 靜止 ────────────────────────────────────────────────────────────────────
  if (HOLD_SECONDS > 0) {
    slotTimeline.to({}, { duration: HOLD_SECONDS }, holdStart)
  }

  // ── 出場（前半：HALF_TRANSITION_SECONDS）──────────────────────────────────
  const exitStart = HALF_TRANSITION_SECONDS + HOLD_SECONDS

  // 出場開始時向 Live 送出 TRANSITION_START（同步觸發 Live 前半動畫）
  slotTimeline.add(() => {
    const noteId = getNoteId(noteAtStart)
    const isExitingPending = sourceAtStart === 'pending'
    
    // 如果目前是 pending，且 queue length > 1 (扣掉自己還有別人)，下一個就是 pending
    // 如果目前是 history，且 queue length > 0，下一個就是 pending
    const nextSrc = (isExitingPending && effectiveQueueLength.value > 1) || (!isExitingPending && effectiveQueueLength.value > 0) 
      ? 'pending' : 'history'

    if (!isExitingPending && nextSrc === 'history') {
      // 規則一/二：idle 輪播，Live 出場 reserved note
      send({ 
        type: 'TRANSITION_START', 
        noteId, 
        nextSource: 'history',
        isExitingPending: false
      })
    } else if (!isExitingPending && nextSrc === 'pending') {
      // 規則三：history 播完接下來是 pending，Live 前半不需要任何動作
    } else if (isExitingPending) {
      // 規則四：pending 出場，Live 需要擠出最舊的，並處理下一個
      send({
        type: 'TRANSITION_START',
        noteId,
        nextSource: nextSrc,
        isExitingPending: true,
        exitingPendingNote: toCloneableNotePayload(noteAtStart as QueuePendingItem)
      })
    }
  }, exitStart)

  slotTimeline.to(el, { scale: DISPLAY_SCALE_PEAK, duration: HALF_TRANSITION_SECONDS * 0.4, ease: EASE }, exitStart)
  slotTimeline.to(el, { x: OFF_SCREEN_LEFT, scale: DISPLAY_SCALE_OFF, duration: HALF_TRANSITION_SECONDS * 0.6, ease: EASE }, exitStart + HALF_TRANSITION_SECONDS * 0.4)
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
