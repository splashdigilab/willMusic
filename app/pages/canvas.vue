<template>
  <div v-if="!isCanvasReady" class="p-canvas-loading" role="status" aria-live="polite">
    <div class="p-canvas-loading__spinner" aria-hidden="true"></div>
    <p class="p-canvas-loading__text">Loading...</p>
  </div>
  <div
    v-else-if="!hasUserStarted"
    class="p-canvas-start"
    role="dialog"
    aria-modal="true"
    aria-labelledby="p-canvas-start-title"
  >
    <h1 id="p-canvas-start-title" class="p-canvas-start__title">大螢幕展示</h1>
    <p class="p-canvas-start__hint">請點擊「開始」以啟用播放（含插播影片聲音）。</p>
    <button type="button" class="p-canvas-start__btn" @click="beginCanvasSession">開始</button>
  </div>
  <div v-show="isCanvasReady && hasUserStarted" class="p-canvas" ref="canvasRef" :style="{ '--display-scale': displayNoteScale }">

    <!-- ─── 左側容器 ─── -->
    <div class="p-canvas__half p-canvas__half--stack">
      <!-- ─── 左半：隨機散落區 ─── -->
      <div class="p-canvas__live-zone" ref="liveZoneRef">
        <div
          v-for="item in displayState.liveGrid"
          :key="getId(item)"
          class="p-canvas__scatter-slot"
        >
          <div
            v-if="displayState.borrowedId !== getId(item)"
            :data-flip-id="getId(item)"
            class="p-canvas__note-wrap"
            :style="getScatterStyle(getId(item))"
          >
            <StickyNote :note="item" />
          </div>
        </div>
      </div>
      <div
        v-show="showInterstitial && interstitialSrc"
        class="p-canvas__interstitial p-canvas__interstitial--left"
        aria-hidden="true"
      >
        <video
          ref="videoLeftRef"
          class="p-canvas__interstitial__video"
          :src="interstitialSrc || undefined"
          preload="auto"
          playsinline
          @timeupdate="onInterstitialPrimaryTimeUpdate"
          @ended="onInterstitialVideoEnded"
        />
      </div>
    </div>

    <!-- ─── 右側容器 ─── -->
    <div class="p-canvas__half p-canvas__half--stack">
      <!-- ─── 右半：單張展示區 ─── -->
      <div class="p-canvas__display-zone">
        <!-- 標語 + QR：放在同一個容器用 flex 排，
             各自絕對定位會互相重疊（標語與 QR 原本是同一張圖，拆開後才需要排版） -->
        <div class="p-canvas__cta">
          <p class="p-canvas__slogan">
            <span>上傳便利貼</span>
            <span>為你的本命<em>應援</em>！</span>
          </p>
          <img src="/qrcode.svg" alt="上傳便利貼 QR code" class="p-canvas__qr" />
        </div>
        <div
          v-if="displayState.nowPlaying"
          :key="'display-' + getId(displayState.nowPlaying)"
          :data-flip-id="getId(displayState.nowPlaying)"
          class="p-canvas__note-wrap p-canvas__note-wrap--display"
        >
          <StickyNote :note="displayState.nowPlaying" />
        </div>
      </div>
      <div
        v-show="showInterstitial && interstitialSrc"
        class="p-canvas__interstitial p-canvas__interstitial--right"
        aria-hidden="true"
      >
        <video
          ref="videoRightRef"
          class="p-canvas__interstitial__video"
          :src="interstitialSrc || undefined"
          preload="auto"
          playsinline
          muted
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch, reactive } from 'vue'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { useRoute } from 'vue-router'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import StickyNote from '~/components/StickyNote.vue'
import { calculateScatterPositions } from '~/utils/scatter-layout'
import {
  useConductor,
  getInterstitialSlotKey,
  clampInterstitialIntervalMinutes,
  parseInterstitialScheduleEnabled
} from '~/composables/useConductor'

definePageMeta({ layout: false })
gsap.registerPlugin(Flip)

/* ─── 動畫時間設定（秒）───────────────────────────────────────
   調整這裡可以統一改變所有動畫的快慢
   ─────────────────────────────────────────────────────────── */
const ANIM = {
  /** 所有移動 / 飛行動畫（進場飛入、跨區飛行、live 重排、離場飛出）*/
  moveDuration:  1.2,
  /** 所有 scale 縮放（1→1.1 拿起 / 1.1→1 放下，時間相同）*/
  scaleDuration: 0.5,
} as const

/**
 * 一輪動畫從頭到尾要多久：拿起 → 移動 → 放下，外加一點緩衝。
 * 傳給 Conductor 當作「動畫進行中不要開始下一輪」的守衛長度。
 * 這個值必須跟著 ANIM 走，寫死就會在改動畫時間後悄悄失準。
 */
const ANIM_TOTAL_MS = (ANIM.scaleDuration * 2 + ANIM.moveDuration) * 1000 + 50

/* ─── URL 參數 ─── */
const route = useRoute()
const maxNotes   = computed(() => Number(route.query.count) || 16)
const displaySec = computed(() => Number(route.query.duration) || 15)
const liveNoteScale = computed(() => Number(route.query.liveScale) || 0.95)
const displayNoteScale = computed(() => Number(route.query.displayScale) || 0.9)

/* ─── Conductor + 插播影片 ─── */
const { $firestore } = useNuxtApp()
const db = $firestore as any

const interstitialSrc = ref<string | null>(null)
/** 插播排程間隔（分鐘），與 Firestore system/canvas_video.interstitialIntervalMinutes 同步 */
const interstitialIntervalMinutes = ref(clampInterstitialIntervalMinutes(undefined))
/** 與 Firestore interstitialScheduleEnabled 同步；為 false 時不依時間 arm */
const interstitialScheduleEnabled = ref(false)
let unsubCanvasVideo: (() => void) | null = null
let interstitialArmTimer: ReturnType<typeof setInterval> | null = null

const showInterstitial = ref(false)
const videoLeftRef = ref<HTMLVideoElement | null>(null)
const videoRightRef = ref<HTMLVideoElement | null>(null)
const isCanvasReady = ref(false)
/** 使用者點「開始」後才啟動 Conductor／插播排程，以符合瀏覽器自動播放（有聲影片）政策 */
const hasUserStarted = ref(false)
let stopRecalcWatch: (() => void) | null = null
const interstitialPreloadMap = new Map<string, Promise<void>>()

const {
  startConductor,
  stopConductor,
  displayState,
  armInterstitialSlot,
  finishInterstitial,
  clearInterstitialArmQueue
} = useConductor()

/** 右側影片無音訊，依左側時間軸對齊 */
const onInterstitialPrimaryTimeUpdate = () => {
  const primary = videoLeftRef.value
  const secondary = videoRightRef.value
  if (!primary || !secondary) return
  if (Math.abs(secondary.currentTime - primary.currentTime) > 0.12) {
    secondary.currentTime = primary.currentTime
  }
}

const preloadVideo = (url: string): Promise<void> => {
  if (interstitialPreloadMap.has(url)) return interstitialPreloadMap.get(url)!

  const preloadPromise = new Promise<void>((resolve, reject) => {
    const video = document.createElement('video')
    let done = false
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, 12000)

    const cleanup = () => {
      if (done) return
      done = true
      window.clearTimeout(timeout)
      video.removeEventListener('canplaythrough', onReady)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
      video.src = ''
      video.load()
    }

    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('error'))
    }

    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.addEventListener('canplaythrough', onReady, { once: true })
    video.addEventListener('loadeddata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.src = url
    video.load()
  }).catch((e) => {
    interstitialPreloadMap.delete(url)
    throw e
  })

  interstitialPreloadMap.set(url, preloadPromise)
  return preloadPromise
}

const applyCanvasVideoConfig = (data?: {
  videoUrl?: string
  interstitialIntervalMinutes?: number
  interstitialScheduleEnabled?: boolean
}) => {
  if (!data) {
    interstitialSrc.value = null
    interstitialIntervalMinutes.value = clampInterstitialIntervalMinutes(undefined)
    interstitialScheduleEnabled.value = false
    clearInterstitialArmQueue()
    return
  }

  const u = data.videoUrl
  interstitialSrc.value = typeof u === 'string' && u.length > 0 ? u : null
  interstitialIntervalMinutes.value = clampInterstitialIntervalMinutes(
    data.interstitialIntervalMinutes
  )
  interstitialScheduleEnabled.value = parseInterstitialScheduleEnabled(
    data.interstitialScheduleEnabled
  )
  if (!interstitialScheduleEnabled.value) clearInterstitialArmQueue()
}

const isAutoplayNotAllowedError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === 'NotAllowedError'

const startInterstitialPlayback = async () => {
  if (interstitialSrc.value) {
    try {
      await preloadVideo(interstitialSrc.value)
    } catch (e) {
      console.warn('[canvas] 插播影片預載失敗，改為直接嘗試播放', e)
    }
  }
  await nextTick()
  const left = videoLeftRef.value
  const right = videoRightRef.value
  if (!left || !right || !interstitialSrc.value) return
  left.pause()
  right.pause()
  left.currentTime = 0
  right.currentTime = 0
  left.muted = false
  try {
    await left.play()
    await right.play()
  } catch (e) {
    if (!isAutoplayNotAllowedError(e)) {
      console.error('[canvas] 插播影片播放失敗', e)
      onInterstitialVideoEnded()
      return
    }
    try {
      left.muted = true
      await left.play()
      await right.play()
      console.warn(
        '[canvas] 插播改為靜音播放（瀏覽器自動播放政策：需使用者互動後才能自動有聲播放）'
      )
    } catch (e2) {
      console.error('[canvas] 插播影片播放失敗（靜音重試後仍失敗）', e2)
      onInterstitialVideoEnded()
    }
  }
}

const onInterstitialVideoEnded = () => {
  videoLeftRef.value?.pause()
  videoRightRef.value?.pause()
  showInterstitial.value = false
  finishInterstitial()
}

const canvasRef   = ref<HTMLElement | null>(null)
const liveZoneRef = ref<HTMLElement | null>(null)

/** 取得便利貼唯一 ID */
const getId = (item: any): string => item?.id ?? item?.token ?? ''

/* ══════════════════════════════════════════════
   隨機散落演算法 (Non-overlapping scatter)
   ══════════════════════════════════════════════ */

/** 已分配的位置快取 { flipId → { left, top, rot, size } } */
const positionMap = reactive<Record<string, { left: number; top: number; rot: number; size: number }>>({})

/** padding (px) 用於 live-zone 四邊內邊距 */
const PADDING = 20
/** live-zone 右側額外留白（px），便利貼不會出現在此區域 */
const PADDING_RIGHT = 40
/** live-zone 左側額外留白（px），便利貼不會出現在此區域 */
const PADDING_LEFT = 10

/** 虛擬座標系：便利貼邊長。先在此座標系排好，再整體縮放到 live-zone */
const VIRTUAL_ITEM_SIZE = 550
/** 便利貼間距：負值 = 更緊、正值 = 更鬆 */
const VIRTUAL_MARGIN = -50

/**
 * 為所有 liveGrid 便利貼分配不重疊位置。
 * 先用共用的散落演算法（~/utils/scatter-layout，與首頁同一套）在虛擬座標系排好，
 * 再依張數整體縮放到 live-zone 內，便利貼大小一併縮放。
 */
function recalcPositions() {
  const zone = liveZoneRef.value
  if (!zone) return
  const zoneW = zone.clientWidth - (PADDING + PADDING_LEFT) - (PADDING + PADDING_RIGHT) // 左右扣掉額外留白
  const zoneH = zone.clientHeight - PADDING * 2

  const items = displayState.value.liveGrid.map((n: any) => getId(n))
  for (const id of Object.keys(positionMap)) {
    if (!items.includes(id)) delete positionMap[id]
  }

  const count = items.length
  if (!count) return

  const positions = calculateScatterPositions(count, {
    itemSize: VIRTUAL_ITEM_SIZE,
    margin: VIRTUAL_MARGIN
  })

  let minX = positions[0]!.x - VIRTUAL_ITEM_SIZE / 2
  let maxX = positions[0]!.x + VIRTUAL_ITEM_SIZE / 2
  let minY = positions[0]!.y - VIRTUAL_ITEM_SIZE / 2
  let maxY = positions[0]!.y + VIRTUAL_ITEM_SIZE / 2
  for (let i = 1; i < positions.length; i++) {
    const p = positions[i]!
    minX = Math.min(minX, p.x - VIRTUAL_ITEM_SIZE / 2)
    maxX = Math.max(maxX, p.x + VIRTUAL_ITEM_SIZE / 2)
    minY = Math.min(minY, p.y - VIRTUAL_ITEM_SIZE / 2)
    maxY = Math.max(maxY, p.y + VIRTUAL_ITEM_SIZE / 2)
  }

  let virtualW = maxX - minX
  let virtualH = maxY - minY
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const zoneAspect = zoneW / zoneH
  const virtualAspect = virtualW / virtualH

  // 將虛擬佈局長寬比對齊 live-zone，減少留白、提高空間利用
  if (virtualAspect > zoneAspect) {
    const factor = (zoneW * virtualH) / (zoneH * virtualW)
    for (const p of positions) {
      p.x = centerX + (p.x - centerX) * factor
    }
    const halfW = (maxX - minX) / 2
    minX = centerX - halfW * factor
    maxX = centerX + halfW * factor
    virtualW = maxX - minX
  } else if (virtualAspect < zoneAspect) {
    const factor = (zoneH * virtualW) / (zoneW * virtualH)
    for (const p of positions) {
      p.y = centerY + (p.y - centerY) * factor
    }
    const halfH = (maxY - minY) / 2
    minY = centerY - halfH * factor
    maxY = centerY + halfH * factor
    virtualH = maxY - minY
  }

  // 所有 note 在同一次 recalcPositions 內尺寸完全一致，依張數軎小确保不重疊
  const scale = Math.min((zoneW / virtualW) || 1, (zoneH / virtualH) || 1)
  const size = Math.max(40, VIRTUAL_ITEM_SIZE * scale) * liveNoteScale.value

  items.forEach((id, index) => {
    const p = positions[index]!
    const existing = positionMap[id]
    const rot = existing ? existing.rot : (Math.random() - 0.5) * 12

    const centerX = (p.x - minX) * scale
    const centerY = (p.y - minY) * scale

    const left = centerX - size / 2
    const top = centerY - size / 2

    positionMap[id] = {
      left: Math.max(0, Math.min(left, zoneW - size)),
      top: Math.max(0, Math.min(top, zoneH - size)),
      rot,
      size
    }
  })
}

/** 返回每張便利貼的 inline style */
function getScatterStyle(flipId: string) {
  const pos = positionMap[flipId]
  const size = pos?.size ?? 100
  if (!pos) return { width: `${size}px`, height: `${size}px` }
  return {
    position: 'absolute' as const,
    left: `${PADDING + PADDING_LEFT + pos.left}px`,
    top: `${PADDING + pos.top}px`,
    width: `${pos.size}px`,
    height: `${pos.size}px`,
    transform: `rotate(${pos.rot}deg)`
  }
}

/* ══════════════════════════════════════════════
   FLIP 動畫相關
   ══════════════════════════════════════════════ */

let flipSnapshot: any = null
/** 這一輪正在跑的主時間軸；下一輪開始前要先讓它收尾，避免兩輪動畫互相覆蓋 */
let activeTimeline: gsap.core.Timeline | null = null
let capturedElements: {
  flipId: string; 
  rect: DOMRect; 
  offsetWidth: number; 
  offsetHeight: number; 
  transform: string; 
  clone: HTMLElement 
}[] = []

const beginCanvasSession = async () => {
  if (hasUserStarted.value) return
  hasUserStarted.value = true
  await nextTick()

  interstitialArmTimer = setInterval(() => {
    if (!interstitialScheduleEnabled.value) return
    const d = new Date()
    if (d.getSeconds() !== 0) return
    const n = interstitialIntervalMinutes.value
    const totalM = d.getHours() * 60 + d.getMinutes()
    if (totalM % n !== 0) return
    armInterstitialSlot(getInterstitialSlotKey(d, n))
  }, 1000)

  await startConductor({
    loopIntervalMs: displaySec.value * 1000,
    historyLimit:   maxNotes.value,
    animationMs:    ANIM_TOTAL_MS,
    getInterstitialVideoUrl: () => interstitialSrc.value,
    onInterstitialStart: () => {
      showInterstitial.value = true
      void startInterstitialPlayback()
    },

    /* ── BEFORE：拍快照 ── */
    onBeforeStateChange() {
      // 上一輪動畫還沒跑完就進到下一輪時，先讓它瞬間走到結尾再丟掉。
      // 不這樣做有兩個後果：這裡會拍到動畫中途的位置，下一輪就從錯的地方起飛；
      // 而且舊 timeline 末端「清掉 transform 殘留」那一步會在新動畫進行中才觸發，
      // 把元素硬拉回定位，畫面上看到的就是一次跳動。
      if (activeTimeline) {
        activeTimeline.progress(1).kill()
        activeTimeline = null
      }

      // 離場中的複製節點 class 仍是 p-canvas__note-wrap，若拍進快照，
      // Flip 會把這些 position:fixed 的殘影一起納入計算（下面收集
      // capturedElements 時是靠 data-flip-id 排除的，兩邊條件要一致）
      flipSnapshot = Flip.getState('.p-canvas__note-wrap:not(.is-leaving)')

      capturedElements = []
      document.querySelectorAll('.p-canvas__note-wrap:not(.is-leaving)').forEach(el => {
        const flipId = el.getAttribute('data-flip-id')
        if (flipId) {
          const rect = el.getBoundingClientRect()
          capturedElements.push({
            flipId,
            rect,
            offsetWidth: (el as HTMLElement).offsetWidth,
            offsetHeight: (el as HTMLElement).offsetHeight,
            transform: window.getComputedStyle(el).transform,
            clone: el.cloneNode(true) as HTMLElement
          })
        }
      })
    },

    /* ── AFTER：資料已修改，重算位置後執行動畫 ── */
    async onAfterStateChange() {
      // 重算散落位置（新的便利貼才會得到位置）
      recalcPositions()

      await nextTick()
      if (!flipSnapshot || !canvasRef.value) return

      // ▸ 手動 leave 動畫
      const currentIds = new Set<string>()
      document.querySelectorAll('.p-canvas__note-wrap').forEach(el => {
        const id = el.getAttribute('data-flip-id')
        if (id) currentIds.add(id)
      })

      // 動畫階層：1 進入 display > 2 display→live > 3 live 移出。先算出「之前在 display」的 ID
      const wasInDisplayIds = new Set<string>()
      for (const item of capturedElements) {
        if (item.clone.classList.contains('p-canvas__note-wrap--display')) {
          wasInDisplayIds.add(item.flipId)
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 情境 4：離場飛出 (Leave)
      //   - Phase 1：原地 scale 1→1.1（拿起感）
      //   - Phase 2：維持 1.1，透明度不變，飛往 live 上方離開畫面
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const liveLeaveRect = liveZoneRef.value!.getBoundingClientRect()
      const leaveTargetX = liveLeaveRect.left + liveLeaveRect.width / 2
      const leaveTargetY = -liveLeaveRect.height // 畫面上方完全超出視口

      for (const item of capturedElements) {
        if (!currentIds.has(item.flipId)) {
          const clone = item.clone
          clone.classList.add('is-leaving')
          clone.removeAttribute('data-flip-id')

          const centerX = item.rect.left + item.rect.width / 2
          const centerY = item.rect.top + item.rect.height / 2
          const fixedLeft = centerX - item.offsetWidth / 2
          const fixedTop = centerY - item.offsetHeight / 2

          clone.style.margin = '0'
          Object.assign(clone.style, {
            position: 'fixed',
            left: `${fixedLeft}px`,
            top: `${fixedTop}px`,
            width: `${item.offsetWidth}px`,
            height: `${item.offsetHeight}px`,
            transform: item.transform,
            zIndex: '50',
            pointerEvents: 'none',
          })
          canvasRef.value!.appendChild(clone)

          // Phase 1：原地放大到 1.1x（拿起感）
          gsap.to(clone, {
            scale: 1.1,
            duration: ANIM.scaleDuration,
            ease: 'power2.out',
            onComplete: () => {
              // Phase 2：維持 1.1，飛出畫面，透明度不變
              gsap.to(clone, {
                x: leaveTargetX - centerX,
                y: leaveTargetY - centerY,
                duration: ANIM.moveDuration,
                ease: 'power3.in',
                onComplete: () => clone.remove(),
              })
            },
          })
        }
      }

      // 依動畫類型設定 z-index（1 進入 display > 2 display→live > 靜態 live）
      document.querySelectorAll('.p-canvas__note-wrap:not(.is-leaving)').forEach(el => {
        const elEl = el as HTMLElement
        const flipId = el.getAttribute('data-flip-id')
        if (el.classList.contains('p-canvas__note-wrap--display')) {
          elEl.style.zIndex = '300' // 1. 進入 display：最上層
        } else if (flipId && wasInDisplayIds.has(flipId)) {
          elEl.style.zIndex = '200' // 2. display→live：中層
        } else {
          elEl.style.zIndex = '100' // 3. 靜態 live：底層
        }
      })

      // 找出所有需要 Flip 動畫的元素
      const flipTargets: Element[] = []
      const movingFlipTargets: Element[] = []       // 真正有產生位置變化的元素
      const enteringTargets: HTMLElement[] = []     // 這一輪才出現在 DOM 的新便利貼

      document.querySelectorAll('.p-canvas__note-wrap:not(.is-leaving)').forEach(el => {
        const flipId = el.getAttribute('data-flip-id')
        if (!flipId) return

        const captured = capturedElements.find(c => c.flipId === flipId)

        // 新進場的元素不交給 Flip：Flip 只在 onEnter 的「回傳值」會被併進它的
        // 時間軸，起點何時套用不由我們決定。改成自己設起點、自己排進 timeline，
        // 才能保證瀏覽器畫下一幀之前它已經在畫面外。
        if (!captured) {
          enteringTargets.push(el as HTMLElement)
          return
        }

        flipTargets.push(el)

        // 判斷是否真的有移動
        const cur = el.getBoundingClientRect()
        const hasMoved = (
          Math.abs(cur.left   - captured.rect.left)   > 1 ||
          Math.abs(cur.top    - captured.rect.top)    > 1 ||
          Math.abs(cur.width  - captured.rect.width)  > 1 ||
          Math.abs(cur.height - captured.rect.height) > 1
        )

        if (hasMoved) {
          movingFlipTargets.push(el)
        }
      })

      // ▸ 新進場元素：立刻擺到 display 區下方的畫面外
      //   必須在這裡同步做完。Vue 剛把元素插進 DOM 時它在最終位置（display 正中），
      //   晚一幀才移到起點就會看到它先閃一下再從下面飛上來。
      if (enteringTargets.length) {
        const dZone = document.querySelector('.p-canvas__display-zone') as HTMLElement
        const dRect = dZone.getBoundingClientRect()
        const displayCenterX = dRect.left + dRect.width / 2

        enteringTargets.forEach(el => {
          const inner = el.firstElementChild as HTMLElement
          if (inner) gsap.set(inner, { scale: 1.1 })
          const rect = el.getBoundingClientRect()
          gsap.set(el, {
            x: displayCenterX - (rect.left + rect.width / 2),
            y: dRect.bottom + rect.height - (rect.top + rect.height / 2)
          })
        })
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 主時間軸：1. 拿起(放大) → 2. 移動(既有的 Flip + 新便利貼飛入) → 3. 放下(縮小)
      // 每個步驟都用絕對時間定位，不用 '<' 之類的相對位置 ——
      // 相對位置會跟著「上一個被加進 timeline 的動畫」跑，改動順序就會錯位。
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (flipTargets.length || enteringTargets.length) {
        // 既有元素的位置變化，交給單一 Flip.from()
        const flipAnim = flipTargets.length
          ? Flip.from(flipSnapshot, {
              targets: flipTargets,
              duration: ANIM.moveDuration,
              ease: 'power2.inOut',
              absolute: true,
              scale: true, // 關鍵：讓元素以 transform scale 的方式變形，而非直接改 width/height，避免瞬間爆大
              paused: true // 先暫停，由下面的主時間軸控制
            })
          : null

        // 提取所有要移動的元素的內部節點（用來放大縮小）
        const flipInnerTargets = movingFlipTargets.map(el => (el as HTMLElement).firstElementChild as HTMLElement).filter(Boolean)
        const enteringInnerTargets = enteringTargets.map(el => el.firstElementChild as HTMLElement).filter(Boolean)

        // 沒有東西要「拿起」時，移動就不必等
        const moveStart = flipInnerTargets.length ? ANIM.scaleDuration : 0
        const moveEnd = moveStart + ANIM.moveDuration

        const tl = gsap.timeline()
        activeTimeline = tl

        // 步驟 1：所有要移動的元素原地放大 (拿起)
        if (flipInnerTargets.length) {
          tl.to(flipInnerTargets, {
            scale: 1.1,
            duration: ANIM.scaleDuration,
            ease: 'power2.out',
          }, 0)
        }

        // 步驟 2：既有元素的位置移動 (Live 重排 + 跨區移動)
        if (flipAnim) {
          tl.add(flipAnim.play(), moveStart)
        }

        // 步驟 2b：新便利貼從 display 區下方飛入（起點在上面已經設好）
        if (enteringTargets.length) {
          tl.to(enteringTargets, {
            x: 0,
            y: 0,
            duration: ANIM.moveDuration,
            ease: 'power3.out',
          }, moveStart)
        }

        // 步驟 3：抵達目的地後縮小 (放下)
        if (flipInnerTargets.length) {
          tl.to(flipInnerTargets, {
            scale: 1,
            duration: ANIM.scaleDuration,
            ease: 'power2.inOut',
          }, moveEnd)
        }
        if (enteringInnerTargets.length) {
          tl.to(enteringInnerTargets, {
            scale: 1,
            duration: ANIM.scaleDuration,
            ease: 'power2.inOut',
          }, moveEnd)
        }

        // 收尾：把 GSAP 寫進 transform 的殘留值清掉
        tl.call(() => {
          // display 區：CSS 沒有給 transform，歸零即可
          document.querySelectorAll('.p-canvas__note-wrap--display').forEach(el => {
            gsap.set(el, { x: 0, y: 0 })
          })
          // live 區：inline style 的 transform 只有 rotate()，但動畫期間會被 GSAP
          // 覆寫成帶 translate 的值。Vue 只在「綁定值」改變時才 patch style，
          // rot 沒變它就不會重寫，於是 translate 殘留下來，下一輪便從錯的位置起跳
          // —— 症狀就是便利貼先閃現在右下角，再飛向左半邊。
          document.querySelectorAll('.p-canvas__note-wrap:not(.p-canvas__note-wrap--display):not(.is-leaving)').forEach(el => {
            const flipId = el.getAttribute('data-flip-id')
            const pos = flipId ? positionMap[flipId] : null
            if (pos) gsap.set(el, { x: 0, y: 0, scale: 1, rotation: pos.rot })
          })
        })
      }

      flipSnapshot = null
      capturedElements = []
    }
  })

  stopRecalcWatch?.()
  stopRecalcWatch = watch(
    () => [displayState.value.liveGrid.length, liveNoteScale.value],
    () => { recalcPositions() },
    { immediate: true }
  )
}

onMounted(async () => {
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'

  try {
    const initialSnap = await getDoc(doc(db, 'system', 'canvas_video'))
    applyCanvasVideoConfig(initialSnap.exists() ? (initialSnap.data() as {
      videoUrl?: string
      interstitialIntervalMinutes?: number
      interstitialScheduleEnabled?: boolean
    }) : undefined)
  } catch (e) {
    console.warn('[canvas] 讀取初始插播設定失敗', e)
  }

  if (interstitialScheduleEnabled.value && interstitialSrc.value) {
    try {
      await preloadVideo(interstitialSrc.value)
    } catch (e) {
      console.warn('[canvas] 進入前預載插播影片失敗，略過等待', e)
    }
  }

  unsubCanvasVideo = onSnapshot(doc(db, 'system', 'canvas_video'), (snap) => {
    const data = snap.exists() ? (snap.data() as {
      videoUrl?: string
      interstitialIntervalMinutes?: number
      interstitialScheduleEnabled?: boolean
    }) : undefined
    applyCanvasVideoConfig(data)

    if (interstitialScheduleEnabled.value && interstitialSrc.value) {
      void preloadVideo(interstitialSrc.value).catch((e) => {
        console.warn('[canvas] 插播影片背景預載失敗', e)
      })
    }
  })

  isCanvasReady.value = true
})

onUnmounted(() => {
  // 動畫還在跑就離開頁面時，GSAP 的 ticker 會繼續驅動已經卸載的節點
  activeTimeline?.kill()
  activeTimeline = null
  stopRecalcWatch?.()
  stopRecalcWatch = null
  unsubCanvasVideo?.()
  unsubCanvasVideo = null
  if (interstitialArmTimer) {
    clearInterval(interstitialArmTimer)
    interstitialArmTimer = null
  }
  stopConductor()
  document.body.style.margin = ''
  document.body.style.overflow = ''
})
</script>