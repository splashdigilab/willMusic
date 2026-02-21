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
  DISPLAY_SLOT_DURATION_SECONDS,
  DISPLAY_ANIMATION_RATIO,
  DISPLAY_ENTER_ANIM1_RATIO,
  DISPLAY_EXIT_ANIM1_RATIO,
  LIVE_SCALE_OFF,
  LIVE_SCALE_PEAK
} from '~/data/display-config'

// ─── 初始化 ───────────────────────────────────────────────────────────────────

const { isInAppBrowser, showWarning, browserName, instructions, showBrowserWarning, closeWarning } = useInAppBrowser()
const {
  items, loading, getSlot, setViewport,
  pickVisible, setItemState, addNote, removeItem,
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
      // visible / exiting / removing：靜止或由後續 GSAP to() 驅動
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
  // 堆疊：removing-top 最高（移出動畫在上層）；其餘依 slotIndex，新張同 slot 不會疊在上面
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

// ─── GSAP 動畫工具（與 Display 同 phase 時長與 anim1/anim2 比例）──────────────

/** 單一 phase 時長（入場或出場），與 Display 一致 */
const LIVE_PHASE_DURATION = DISPLAY_SLOT_DURATION_SECONDS * DISPLAY_ANIMATION_RATIO
const EASE = 'power2.inOut'

/** 向右飛出（Live → Display）：動畫1 scale 1→PEAK，動畫2 往「畫面右邊外中間」移出 + scale PEAK→OFF */
function animExitRight(el: HTMLElement, slot: SlotPx): Promise<void> {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const rightOffX = vw + slot.size * 1.5 - slot.cx
  const rightOffY = vh / 2 - slot.cy
  const anim1Duration = LIVE_PHASE_DURATION * DISPLAY_EXIT_ANIM1_RATIO
  const anim2Duration = LIVE_PHASE_DURATION * (1 - DISPLAY_EXIT_ANIM1_RATIO)
  return new Promise(resolve => {
    gsap.to(el, { scale: LIVE_SCALE_PEAK, duration: anim1Duration, ease: EASE })
    gsap.to(el, {
      x: rightOffX,
      y: rightOffY,
      scale: LIVE_SCALE_OFF,
      duration: anim2Duration,
      ease: EASE,
      delay: anim1Duration,
      onComplete: resolve
    })
  })
}

/** 從「畫面右邊外中間」飛入（Display → Live）：動畫1 移入 + scale OFF→PEAK，動畫2 scale PEAK→1 */
function animEnterRight(el: HTMLElement, slot: SlotPx): Promise<void> {
  const anim1Duration = LIVE_PHASE_DURATION * DISPLAY_ENTER_ANIM1_RATIO
  const anim2Duration = LIVE_PHASE_DURATION * (1 - DISPLAY_ENTER_ANIM1_RATIO)
  return new Promise(resolve => {
    gsap.to(el, {
      x: 0,
      y: 0,
      scale: LIVE_SCALE_PEAK,
      duration: anim1Duration,
      ease: EASE
    })
    gsap.to(el, {
      scale: 1,
      duration: anim2Duration,
      ease: EASE,
      delay: anim1Duration,
      onComplete: resolve
    })
  })
}

function animEnterLeft(el: HTMLElement, size: number, rotateDeg: number): Promise<void> {
  const anim1Duration = LIVE_PHASE_DURATION * DISPLAY_ENTER_ANIM1_RATIO
  const anim2Duration = LIVE_PHASE_DURATION * (1 - DISPLAY_ENTER_ANIM1_RATIO)
  return new Promise(resolve => {
    gsap.to(el, {
      x: 0,
      scale: LIVE_SCALE_PEAK,
      duration: anim1Duration,
      ease: EASE
    })
    gsap.to(el, {
      scale: 1,
      duration: anim2Duration,
      ease: EASE,
      delay: anim1Duration,
      onComplete: resolve
    })
  })
}

/** 往畫面上面中間移出並消失（最舊被擠掉）：動畫1 scale 1→PEAK，動畫2 往上看不見 + scale PEAK→OFF */
function animRemoveTop(el: HTMLElement, slot: SlotPx): Promise<void> {
  const vw = window.innerWidth
  const topOffX = vw / 2 - slot.cx
  const topOffY = -slot.cy - slot.size - 80
  const anim1Duration = LIVE_PHASE_DURATION * DISPLAY_EXIT_ANIM1_RATIO
  const anim2Duration = LIVE_PHASE_DURATION * (1 - DISPLAY_EXIT_ANIM1_RATIO)
  return new Promise(resolve => {
    gsap.to(el, { scale: LIVE_SCALE_PEAK, duration: anim1Duration, ease: EASE })
    gsap.to(el, {
      x: topOffX,
      y: topOffY,
      scale: LIVE_SCALE_OFF,
      duration: anim2Duration,
      ease: EASE,
      delay: anim1Duration,
      onComplete: resolve
    })
  })
}

// ─── BroadcastChannel 協調 ────────────────────────────────────────────────────

let offSync: (() => void) | null = null

const setupSync = () => {
  offSync = onMessage(async (msg) => {
    switch (msg.type) {

      // Display 請求借一張 note 做 idle 輪播（不 await 出場動畫，讓 DISPLAY_EXIT_DONE 可同時觸發前一張入場）
      case 'BORROW_REQUEST': {
        const item = pickVisible()
        if (!item) return
        const noteId = getNoteKey(item.note)
        const slot = getSlot(item.slotIndex)

        send({ type: 'BORROW_DEPARTING', note: toCloneableNotePayload(item.note) })

        setItemState(item.key, 'exiting-right')
        await nextTick()
        const el = elMap.get(item.key)
        if (el) {
          animExitRight(el, slot).then(() => {
            setItemState(item.key, 'absent')
            send({ type: 'LIVE_EXIT_DONE', noteId })
          })
        } else {
          setItemState(item.key, 'absent')
          send({ type: 'LIVE_EXIT_DONE', noteId })
        }
        break
      }

      // Display idle 展示結束，note 飛回 Live（從右飛入原 slot）
      case 'DISPLAY_EXIT_DONE': {
        const item = items.value.find(i => getNoteKey(i.note) === msg.noteId)
        if (!item) return
        const slot = getSlot(item.slotIndex)

        // absent → entering-right：重新渲染此元素，registerEl 設定起始位置
        setItemState(item.key, 'entering-right')
        await nextTick()
        const el = elMap.get(item.key)
        if (el) await animEnterRight(el, slot)
        setItemState(item.key, 'visible')
        break
      }

      // Display 播完新 pending note，便利貼從右飛入 Live（新張佔最舊那張的 slot，最舊往上看不見移出）
      case 'NEW_NOTE_ARRIVING': {
        const note = deserializeNoteFromChannel(msg.note) as QueuePendingItem
        const { arriving, removed } = addNote(note)
        await nextTick()
        // 等 Vue 更新 DOM 並跑完 ref 回調再取元素（必要時多等一幀），確保 removedEl 可播移出動畫
        const getEl = (key: string) => elMap.get(key)
        for (let i = 0; i < 5; i++) {
          if (getEl(arriving.key) && (!removed || getEl(removed.key))) break
          await new Promise<void>(r => setTimeout(r, 16))
        }

        const arrivingSlot = getSlot(arriving.slotIndex)
        const arrivingEl = getEl(arriving.key)
        const removedEl = removed ? getEl(removed.key) : null
        const removedSlot = removed ? getSlot(removed.slotIndex) : null

        // 先讓最舊那張往上移出，完成後再讓新便利貼從右飛入
        if (removedEl && removedSlot) await animRemoveTop(removedEl, removedSlot)
        if (removed) removeItem(removed.key)
        if (arrivingEl) await animEnterRight(arrivingEl, arrivingSlot)
        setItemState(arriving.key, 'visible')
        break
      }
    }
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
