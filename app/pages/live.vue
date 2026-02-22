<template>
  <div class="p-live">
    <BrowserWarning
      :show="showWarning"
      :browser-name="browserName"
      :instructions="instructions"
      @close="closeWarning"
    />

    <div class="p-live__container">
      <div v-if="loading && visibleItems.length === 0" class="p-live__loading-state">
        <div class="p-live__loading-spinner"></div>
        <p>載入中...</p>
      </div>

      <div v-else-if="!loading && visibleItems.length === 0" class="p-live__empty-state">
        <p class="p-live__empty-icon">📝</p>
        <p>目前還沒有便利貼</p>
      </div>

      <div class="p-live__wall">
        <div
          v-for="item in visibleItems"
          :key="item.key"
          :ref="(el) => registerEl(item.key, el)"
          class="p-live__wall-item"
          :style="itemPositionStyle(item)"
        >
          <StickyNote :note="item.note" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { gsap } from 'gsap'
import type { QueuePendingItem } from '~/types'
import StickyNote from '~/components/StickyNote.vue'
import { useLiveController, getNoteKey } from '~/composables/useLiveController'
import type { LiveItem, SlotPx } from '~/composables/useLiveController'
import { useScreenSync } from '~/composables/useScreenSync'
import { toCloneableNotePayload, deserializeNoteFromChannel } from '~/utils/screen-sync-payload'
import {
  HALF_TRANSITION_SECONDS,
  LIVE_SCALE_OFF,
  LIVE_SCALE_PEAK
} from '~/data/display-config'

// ─── 初始化 ───────────────────────────────────────────────────────────────────

const { isInAppBrowser, showWarning, browserName, instructions, showBrowserWarning, closeWarning } = useInAppBrowser()
const {
  items, loading, getSlot, setViewport,
  pickVisible, findReserved, setItemState, evictOldestAndCreatePlaceholder, removeItem,
  startListening, stopListening
} = useLiveController()
const { send, onMessage } = useScreenSync()

// ─── DOM 參照 ─────────────────────────────────────────────────────────────────

/** 僅顯示非 absent 的 items（absent 的 DOM 移除但 slot 保留） */
const visibleItems = computed(() => items.value.filter(i => i.state !== 'absent'))

const elMap = new Map<string, HTMLElement>()

/**
 * 動態 ref callback：
 * - 元素建立時：根據 item.state 設定 GSAP 初始位置
 * - 元素移除時：從 elMap 清除
 */
const registerEl = (key: string, rawEl: Element | ComponentPublicInstance | null) => {
  const el = rawEl instanceof HTMLElement ? rawEl : null
  if (el) {
    elMap.set(key, el)
    const item = items.value.find(i => i.key === key)
    if (!item) return
    const slot = getSlot(item.slotIndex)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rightOffX = vw + slot.size * 1.5 - slot.cx
    const rightOffY = vh / 2 - slot.cy

    // GSAP 接管所有 transform（centering + rotation）
    if (item.state === 'entering-right') {
      gsap.set(el, {
        xPercent: -50, yPercent: -50,
        rotation: slot.rotateDeg,
        x: rightOffX, y: rightOffY, scale: LIVE_SCALE_OFF, opacity: 1
      })
    } else if (item.state === 'entering-left') {
      gsap.set(el, {
        xPercent: -50, yPercent: -50,
        rotation: slot.rotateDeg,
        x: -(vw + slot.size / 2), scale: LIVE_SCALE_OFF, opacity: 1
      })
    } else {
      // visible / reserved / exiting / removing：靜止或由後續 GSAP to() 驅動
      gsap.set(el, {
        xPercent: -50, yPercent: -50,
        rotation: slot.rotateDeg,
        x: 0, y: 0, scale: 1, opacity: 1
      })
    }
  } else {
    elMap.delete(key)
  }
}

const itemPositionStyle = (item: LiveItem) => {
  const s = getSlot(item.slotIndex)
  // 堆疊：removing-top 最高（移出動畫在上層）；其餘依 slotIndex
  const zIndex = item.state === 'removing-top' ? 1000 + item.slotIndex : 1 + item.slotIndex
  return {
    left: `${s.cx}px`,
    top: `${s.cy}px`,
    width: `${s.size}px`,
    height: `${s.size}px`,
    zIndex
    // transform 完全交給 GSAP
  }
}

// ─── GSAP 動畫工具（使用 HALF_TRANSITION_SECONDS 做前半 / 後半）──────────────

const EASE = 'power2.inOut'

/**
 * 向右飛出：前半 HALF_TRANSITION_SECONDS
 * 從「原本貼的位置」→「畫面右邊外、中間」
 */
function animExitRight(el: HTMLElement, slot: SlotPx): Promise<void> {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const rightOffX = vw + slot.size * 1.5 - slot.cx
  const rightOffY = vh / 2 - slot.cy
  const anim1 = HALF_TRANSITION_SECONDS * 0.4
  const anim2 = HALF_TRANSITION_SECONDS * 0.6
  return new Promise(resolve => {
    gsap.to(el, { scale: LIVE_SCALE_PEAK, duration: anim1, ease: EASE })
    gsap.to(el, {
      x: rightOffX,
      y: rightOffY,
      scale: LIVE_SCALE_OFF,
      duration: anim2,
      ease: EASE,
      delay: anim1,
      onComplete: resolve
    })
  })
}

/**
 * 從右飛入：後半 HALF_TRANSITION_SECONDS
 * 從「畫面右邊外中間」→ 原位
 */
function animEnterRight(el: HTMLElement, slot: SlotPx): Promise<void> {
  const anim1 = HALF_TRANSITION_SECONDS * 0.6
  const anim2 = HALF_TRANSITION_SECONDS * 0.4
  return new Promise(resolve => {
    gsap.to(el, {
      x: 0,
      y: 0,
      scale: LIVE_SCALE_PEAK,
      duration: anim1,
      ease: EASE
    })
    gsap.to(el, {
      scale: 1,
      duration: anim2,
      ease: EASE,
      delay: anim1,
      onComplete: resolve
    })
  })
}

/**
 * 往上移出並消失：前半 HALF_TRANSITION_SECONDS
 * 最舊被擠掉 → 從原位 →「畫面上方外、中間」
 */
function animRemoveTop(el: HTMLElement, slot: SlotPx): Promise<void> {
  const vw = window.innerWidth
  const topOffX = vw / 2 - slot.cx
  const topOffY = -slot.cy - slot.size - 80
  const anim1 = HALF_TRANSITION_SECONDS * 0.4
  const anim2 = HALF_TRANSITION_SECONDS * 0.6
  return new Promise(resolve => {
    gsap.to(el, { scale: LIVE_SCALE_PEAK, duration: anim1, ease: EASE })
    gsap.to(el, {
      x: topOffX,
      y: topOffY,
      scale: LIVE_SCALE_OFF,
      duration: anim2,
      ease: EASE,
      delay: anim1,
      onComplete: resolve
    })
  })
}

// ─── BroadcastChannel 協調（序列化訊息處理，避免並發衝突） ─────────────────

let offSync: (() => void) | null = null
let msgProcessing = false
const msgQueue: ScreenSyncMessage[] = []

async function processMsgQueue() {
  if (msgProcessing) return
  msgProcessing = true
  while (msgQueue.length > 0) {
    const msg = msgQueue.shift()!
    try {
      await handleMsg(msg)
    } catch (err) {
      console.error('[Live] Error processing message:', msg, err)
    }
  }
  msgProcessing = false
}

async function handleMsg(msg: ScreenSyncMessage) {
  switch (msg.type) {

    /**
     * Display 請求借一張 note（idle 輪播）
     * 預選一張標記為 reserved，回傳 note 資料供 Display 準備
     * 不觸發出場動畫——等 TRANSITION_START 同步
     */
    case 'BORROW_REQUEST': {
      // 如果上一輪的 reserved 還沒被 TRANSITION_START 消化，先歸還
      const stale = findReserved()
      if (stale) {
        setItemState(stale.key, 'visible')
      }
      const item = pickVisible()
      if (!item) return
      setItemState(item.key, 'reserved')
      send({ type: 'BORROW_DEPARTING', note: toCloneableNotePayload(item.note) })
      break
    }

    /**
     * Display 出場開始（前半），Live 同步動畫
     * 嚴格遵循使用者的 7 條規則
     */
    case 'TRANSITION_START': {
      const reserved = findReserved()
      const frontPromises: Promise<void>[] = []
      let removed: LiveItem | null = null

      // 規則四（前半）：當 pending note 出場時，擠出最舊的便利貼，並為該 pending 準備空位
      if (msg.isExitingPending && msg.exitingPendingNote) {
        const note = deserializeNoteFromChannel(msg.exitingPendingNote) as QueuePendingItem
        const res = evictOldestAndCreatePlaceholder(note)
        removed = res.removed
      }

      // 規則一 / 規則四：若下一張要播的是歷史便利貼，reserved 要往右出場
      if (msg.nextSource === 'history' && reserved) {
        setItemState(reserved.key, 'exiting-right')
      }

      // 在所有狀態都改完後，await 一次 nextTick 讓 Vue 更新 DOM
      await nextTick()

      // 啟動動畫
      if (removed) {
        const removedEl = elMap.get(removed.key)
        const removedSlot = getSlot(removed.slotIndex)
        if (removedEl) frontPromises.push(animRemoveTop(removedEl, removedSlot))
      }

      if (msg.nextSource === 'history' && reserved) {
        const reservedEl = elMap.get(reserved.key)
        const reservedSlot = getSlot(reserved.slotIndex)
        if (reservedEl) frontPromises.push(animExitRight(reservedEl, reservedSlot))
      }

      // 規則三：如果 frontPromises 為空，表示 history→pending，Live 靜止不動

      if (frontPromises.length > 0) await Promise.all(frontPromises)

      // 結算狀態
      if (removed) removeItem(removed.key)
      if (msg.nextSource === 'history' && reserved) setItemState(reserved.key, 'absent')

      break
    }

    /**
     * 規則二：所有從 Display 出場完畢的便利貼，一律從 Live 右側飛入
     */
    case 'DISPLAY_EXIT_DONE': {
      const item = items.value.find(i => {
        const n = i.note as any
        return (n.id && n.id === msg.noteId) || (n.token && n.token === msg.noteId) || (i.key === msg.noteId)
      })
      if (!item) {
        console.warn(`[Live] 找不到 DISPLAY_EXIT_DONE 的 noteId: ${msg.noteId}`)
        return
      }

      // 如果該 note 仍然是 reserved（Display 借了它但沒用上），直接恢復 visible
      if (item.state === 'reserved') {
        setItemState(item.key, 'visible')
        return
      }

      const slot = getSlot(item.slotIndex)
      setItemState(item.key, 'entering-right')
      await nextTick()

      const el = elMap.get(item.key)
      if (el) {
        gsap.killTweensOf(el)
        await animEnterRight(el, slot)
      }
      setItemState(item.key, 'visible')
      break
    }
  }
}

const setupSync = () => {
  offSync = onMessage((msg) => {
    msgQueue.push(msg)
    processMsgQueue()
  })
}

// ─── Viewport & Resize ────────────────────────────────────────────────────────

let resizeTimer: ReturnType<typeof setTimeout> | null = null

function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    setViewport(window.innerWidth, window.innerHeight)
  }, 100)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  if (isInAppBrowser.value) showBrowserWarning()
  setViewport(window.innerWidth, window.innerHeight)
  window.addEventListener('resize', onResize)
  startListening()
  setupSync()
  document.documentElement.classList.add('p-live-active')
  document.body.classList.add('p-live-active')
  document.getElementById('__nuxt')?.classList.add('p-live-active')
})

onUnmounted(() => {
  stopListening()
  offSync?.()
  window.removeEventListener('resize', onResize)
  if (resizeTimer) clearTimeout(resizeTimer)
  document.documentElement.classList.remove('p-live-active')
  document.body.classList.remove('p-live-active')
  document.getElementById('__nuxt')?.classList.remove('p-live-active')
})
</script>
