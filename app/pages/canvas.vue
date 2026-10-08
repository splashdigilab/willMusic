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
  <div
    v-show="isCanvasReady && hasUserStarted"
    class="p-canvas"
    ref="canvasRef"
    :style="{ '--display-scale': displayNoteScale, '--flow-size': `${flowSize}px` }"
  >
    <!-- ─── 底層：流動便利貼牆，橫跨左右兩個螢幕，由左往右流（位置由 useNoteFlow 每幀寫入） ─── -->
    <div ref="flowLayerRef" class="p-canvas__flow" aria-hidden="true">
      <div
        v-for="item in wallNotes"
        :key="getId(item)"
        :ref="(el) => onFlowNoteRef(getId(item), el)"
        class="p-canvas__flow-note"
      >
        <StickyNote :note="item" />
      </div>
    </div>

    <!-- ─── 左側容器：頂層只有徽章動畫與插播影片 ─── -->
    <div class="p-canvas__half p-canvas__half--stack">
      <CanvasPromo v-if="showPromo" class="p-canvas__promo p-canvas__promo--left" />
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

    <!-- ─── 右側容器：頂層是 highlight 的那一張 ───
         換張時會同時有兩張：剛展示完、正在飛回牆上的，和剛拿起、正在飛過來的。
         飛回去的用本尊不用複製品：複製出來的圖片要重新解碼，起飛那一下貼紙與手繪會閃掉 -->
    <div class="p-canvas__half p-canvas__half--stack">
      <!-- 平常蓋在右螢幕牆面上的深色漸層；圓形提醒期間換成左右一樣的深色色塊（徽章自己的底色） -->
      <div class="p-canvas__dim" :class="{ 'is-off': promoDimming }" aria-hidden="true" />
      <div class="p-canvas__display-zone">
        <div
          v-for="item in displayItems"
          :key="'display-' + getId(item)"
          :data-note-id="getId(item)"
          class="p-canvas__note-wrap p-canvas__note-wrap--display"
        >
          <StickyNote :note="item" />
        </div>
      </div>
      <!-- 每輪播 promoEvery 張，左右兩個螢幕各插一次徽章動畫（同時掛上、同步播）。
           兩個的時間軸一樣長，只聽右邊這個的 finished -->
      <CanvasPromo
        v-if="showPromo"
        class="p-canvas__promo p-canvas__promo--right"
        @leaving="promoDimming = false"
        @finished="onPromoFinished"
      />
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
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { gsap } from 'gsap'
import { useRoute } from 'vue-router'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import StickyNote from '~/components/StickyNote.vue'
import CanvasPromo from '~/components/CanvasPromo.vue'
import {
  useConductor,
  getInterstitialSlotKey,
  clampInterstitialIntervalMinutes,
  parseInterstitialScheduleEnabled
} from '~/composables/useConductor'
import type { StateChangeInfo } from '~/composables/useConductor'
import { useNoteFlow, type FlowDirection, type FlowRect } from '~/composables/useNoteFlow'
import { WALL_LOOK } from '~/utils/wall-look'

definePageMeta({ layout: false })

/* ─── 動畫時間設定（秒）───────────────────────────────────────
   調整這裡可以統一改變所有動畫的快慢
   ─────────────────────────────────────────────────────────── */
const ANIM = {
  /**
   * 飛行時間（從左邊螢幕的牆飛到右邊、飛回牆上、新投稿飛入）依距離決定：
   * 距離 ÷ flightSpeed，夾在 moveDuration 與 maxMoveDuration 之間。
   * 拿起與放回都在左邊螢幕，每次都要橫跨接縫，固定時間的話遠的那幾次會飛得太快
   */
  moveDuration:    1.2,
  maxMoveDuration: 2.0,
  flightSpeed:     1100,
  /** 飛行的速度曲線：sine 中段最快只有平均的 1.57 倍（power2 是 2 倍），長距離飛起來比較從容 */
  flightEase:      'sine.inOut',
  /** 所有 scale 縮放（1→1.1 拿起 / 1.1→1 放下，時間相同）*/
  scaleDuration: 0.5,
  /** 從牆上消失（後台下架、超過張數被擠掉）的淡出 */
  fadeDuration:  0.4,
} as const

const flightDuration = (distance: number) =>
  Math.min(ANIM.maxMoveDuration, Math.max(ANIM.moveDuration, distance / ANIM.flightSpeed))

/**
 * 一輪動畫從頭到尾最久要多久：拿起 → 移動（最長的那種）→ 放下，外加一點緩衝。
 * 傳給 Conductor 當作「動畫進行中不要開始下一輪」的守衛長度。
 * 這個值必須跟著 ANIM 走，寫死就會在改動畫時間後悄悄失準。
 */
const ANIM_TOTAL_MS = (ANIM.scaleDuration * 2 + ANIM.maxMoveDuration) * 1000 + 50

/* ─── URL 參數 ─── */
const route = useRoute()
/**
 * 輪播的張數（載入最新的幾張）。沒填時依畫面大小算：排滿牆面再多每道一張在畫面外排隊，
 * 換道才換得起來、每張輪到左邊螢幕的機會才平均（見 useNoteFlow 的 recommendedCount）
 */
const maxNotesParam = computed(() => Number(route.query.count) || 0)
const displaySec = computed(() => Number(route.query.duration) || 15)
const displayNoteScale = computed(() => Number(route.query.displayScale) || 0.9)
/**
 * 流動牆：
 * - 方向：預設一欄一欄由下往上；?flow=left 改成一排一排由右往左
 * - 道數：由下往上看 ?cols（預設 6 欄，每個螢幕 3 欄）；由右往左看 ?rows（預設 3 排）
 * - ?flowScale：便利貼佔道寬的比例，往上流預設 0.85
 * - ?flowSpeed：流速（1080 高的畫面每秒幾 px）。往上流預設比較慢：畫面高只有 1080，
 *   照橫向的速度一張半分鐘就流完了，展示完它留下的空位也多半已經流出頂端、回不去原位
 * - ?mess：排列的雜亂程度，0 = 整齊磚牆、1 = 最亂（大小不變，前後左右的偏移差最多，
 *   會互相壓到一些），超過 1 當 1。預設 1
 * - ?speedVary：各道流速上下差多少（比例），例如 0.15 = 最慢 0.85 倍、最快 1.15 倍。預設 0 = 全部同速
 * - ?tilt：最多歪幾度（每張在 ±tilt 之間），0 = 完全不歪，最多 45。預設 5；只管角度，偏移看 mess
 *
 * mess、tilt、往上流的 flowScale 的預設值跟首頁的便利貼牆共用（WALL_LOOK），兩邊才是同一種凌亂感
 */
const flowDirection = computed<FlowDirection>(() => (route.query.flow === 'left' ? 'left' : 'up'))
const flowLanes = computed(() => {
  const n = flowDirection.value === 'up' ? Number(route.query.cols) || 6 : Number(route.query.rows) || 3
  return Math.max(1, Math.floor(n))
})
const flowScale = computed(() =>
  Number(route.query.flowScale) || (flowDirection.value === 'up' ? WALL_LOOK.scale : 0.8)
)
const flowSpeed = computed(() =>
  Number(route.query.flowSpeed) || (flowDirection.value === 'up' ? 30 : 45)
)
/** 0 是有意義的值（整齊），跟 promoEvery 一樣不能寫成 `||` */
const flowMess = computed(() => {
  const n = Number(route.query.mess)
  return route.query.mess != null && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : WALL_LOOK.mess
})
const flowSpeedVary = computed(() => {
  const n = Number(route.query.speedVary)
  return route.query.speedVary != null && Number.isFinite(n) ? Math.min(0.9, Math.max(0, n)) : 0
})
const flowTilt = computed(() => {
  const n = Number(route.query.tilt)
  return route.query.tilt != null && Number.isFinite(n) ? Math.min(45, Math.max(0, n)) : WALL_LOOK.tilt
})
/**
 * 右側每展示幾張便利貼插一次徽章動畫。?promoEvery=0 關閉。
 * 不能照上面寫成 `|| 10`：0 是有意義的值，會被當成沒填而變回 10
 */
const promoEvery = computed(() => {
  const n = Number(route.query.promoEvery)
  return route.query.promoEvery != null && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 10
})

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
const interstitialPreloadMap = new Map<string, Promise<void>>()

const {
  startConductor,
  stopConductor,
  displayState,
  armInterstitialSlot,
  finishInterstitial,
  clearInterstitialArmQueue,
  finishPromo
} = useConductor()

/* ─── 徽章動畫 ─── */
const showPromo = ref(false)
/**
 * 圓形提醒期間，右螢幕平常的漸層淡掉，換成徽章的深色色塊（左右一樣深）。
 * 跟著徽章淡入就關、開始淡出就開，兩層交叉淡換，中間不會有一段沒蓋東西
 */
const promoDimming = ref(false)
/**
 * 保底：動畫一輪約 10 秒，超過 15 秒還沒收到 finished 就當作播完。
 * 元件掛載失敗之類的狀況下 finished 永遠不會來，輪播會一直停在「右邊沒有便利貼」
 */
const PROMO_FALLBACK_MS = 15_000
let promoFallbackTimer: ReturnType<typeof setTimeout> | null = null

const onPromoStart = () => {
  showPromo.value = true
  promoDimming.value = true
  if (promoFallbackTimer) clearTimeout(promoFallbackTimer)
  promoFallbackTimer = setTimeout(onPromoFinished, PROMO_FALLBACK_MS)
}

const onPromoFinished = () => {
  if (promoFallbackTimer) {
    clearTimeout(promoFallbackTimer)
    promoFallbackTimer = null
  }
  showPromo.value = false
  promoDimming.value = false
  finishPromo()
}

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

const canvasRef = ref<HTMLElement | null>(null)
/** 底層流動牆的容器 */
const flowLayerRef = ref<HTMLElement | null>(null)

/** 取得便利貼唯一 ID */
const getId = (item: any): string => item?.id ?? item?.token ?? ''

/* ══════════════════════════════════════════════
   底層流動牆
   ══════════════════════════════════════════════ */

/**
 * 超過張數被擠出 liveGrid、但還在牆上流的舊便利貼。牆上一張都不憑空消失：
 * 它們繼續流，流出出口（左邊或上面）才真的拿掉（useNoteFlow 的 onRetired）
 */
const retiringNotes = ref<any[]>([])
/** 牆上要畫的：liveGrid 加上還在流出去途中的 */
const wallNotes = computed(() => {
  const ids = new Set(displayState.value.liveGrid.map(getId))
  return [...displayState.value.liveGrid, ...retiringNotes.value.filter(n => !ids.has(getId(n)))]
})

/**
 * 流出去途中的那幾張，各自盯著它的 Firestore 文件：不在 liveGrid 裡了，
 * conductor 不會再告訴我們它被刪，但後台下架必須當場從畫面上拿掉
 */
const cols = useCollections()
const retiringWatchers = new Map<string, () => void>()
const stopWatchingRetiring = (id: string) => {
  retiringWatchers.get(id)?.()
  retiringWatchers.delete(id)
}
const onRetired = (id: string) => {
  stopWatchingRetiring(id)
  retiringNotes.value = retiringNotes.value.filter(n => getId(n) !== id)
}
const watchRetiring = (id: string) => {
  if (retiringWatchers.has(id)) return
  retiringWatchers.set(id, onSnapshot(doc(db, cols.queueHistory, id), (snap) => {
    if (snap.exists()) return
    const el = flow.removeRetiring(id)
    if (el) {
      const copy = placeFadingCopy(el)
      gsap.to(copy, { opacity: 0, duration: ANIM.fadeDuration, ease: 'power1.out', onComplete: () => copy.remove() })
    }
    onRetired(id)
  }))
}

const flow = useNoteFlow({
  direction: flowDirection.value,
  lanes: flowLanes.value,
  scale: flowScale.value,
  speed: flowSpeed.value,
  speedVary: flowSpeedVary.value,
  mess: flowMess.value,
  tilt: flowTilt.value,
  // 左右兩台螢幕：便利貼不跨在中間的接縫上
  screens: 2,
  onRetired: id => onRetired(id)
})
/** 牆上便利貼的邊長（px），寫進 --flow-size 給 CSS */
const flowSize = ref(0)

const onFlowNoteRef = (id: string, el: unknown) => {
  flow.register(id, el instanceof Element ? el : null)
}

const liveGridIds = () => displayState.value.liveGrid.map(getId).filter(Boolean)

/**
 * 從牆上拿起、展示完放回，都只在左邊螢幕：右邊螢幕的頂層是 highlight，
 * 在它底下拿起放回看不清楚，而且左→右的飛行才有「從牆上被挑中」的感覺。
 * 範圍扣掉中間接縫的 30px，跟展示區、插播影片一致
 */
const SEAM = 30
const leftScreenRight = () => (canvasRef.value?.clientWidth ?? window.innerWidth) / 2 - SEAM

/** 按「開始」之後才切全螢幕之類的：牆照新的大小重排 */
const onResize = () => {
  const el = canvasRef.value
  if (!el || !el.clientWidth) return
  flowSize.value = flow.relayout(el.clientWidth, el.clientHeight)
}

/* ══════════════════════════════════════════════
   輪播動畫：牆上拿起一張 → 右邊 highlight → 展示完追著牆上的位置飛回去
   ══════════════════════════════════════════════ */

/** 這一輪正在跑的主時間軸；下一輪開始前要先讓它收尾，避免兩輪動畫互相覆蓋 */
let activeTimeline: gsap.core.Timeline | null = null

/**
 * 右邊展示區的便利貼。不直接用 nowPlaying：換張時上一張還要留著飛回牆上，
 * 飛完才從這裡拿掉，所以會短暫同時有兩張
 */
const displayItems = ref<any[]>([])
const removeDisplay = (id: string) => {
  displayItems.value = displayItems.value.filter(n => getId(n) !== id)
}
const findDisplayEl = (id: string) =>
  canvasRef.value?.querySelector<HTMLElement>(
    `.p-canvas__display-zone > [data-note-id="${CSS.escape(id)}"]`
  ) ?? null

/** 換張之前右邊那一張 */
let outgoing: { id: string; el: HTMLElement } | null = null

/**
 * 牆上被拿掉（下架、超過張數被擠掉）的便利貼：複製一份蓋在原位淡出。
 * 本尊馬上會被 Vue 從 DOM 拿掉，只能用複製品；淡出只有 0.4 秒，圖片重新解碼也不明顯
 */
const placeFadingCopy = (el: HTMLElement) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.classList.add('is-fading')
  // 放在牆那一層（本尊的 transform 原樣帶過來就是同一個位置），才會跟牆一起被右螢幕的漸層蓋住
  flowLayerRef.value!.appendChild(copy)
  return copy
}

/** highlight 那一張的起點（相對於它在右邊中間的最終位置） */
const getDisplayStart = (from: FlowRect | null, final: DOMRect) => {
  const cx = final.left + final.width / 2
  const cy = final.top + final.height / 2
  if (from) {
    return {
      x: from.x + from.size / 2 - cx,
      y: from.y + from.size / 2 - cy,
      scale: from.size / final.width,
      rotation: from.rotation
    }
  }
  // 新投稿（或借的那張剛好不在畫面上）：從右半邊下方的畫面外飛進來
  const canvasH = canvasRef.value?.clientHeight ?? window.innerHeight
  return { x: 0, y: canvasH + final.height / 2 - cy, scale: 1, rotation: 0 }
}

/** 改動前的 liveGrid：被擠掉的那張要留著它的資料，才能繼續畫在牆上流出去 */
let gridBefore = new Map<string, any>()

/* ── BEFORE：資料改動前，記下右邊那一張與 liveGrid ── */
const onBeforeStateChange = () => {
  // 上一輪動畫還沒跑完就進到下一輪時，先讓它瞬間走到結尾再丟掉。
  // 不這樣做，這裡會拍到飛行途中的位置；舊時間軸收尾的 land()／清 transform
  // 也會在新動畫進行中才觸發，畫面上看到的就是一次跳動
  if (activeTimeline) {
    activeTimeline.progress(1).kill()
    activeTimeline = null
  }
  // 第一輪 tick 時 liveGrid 才剛載入：在這裡把牆排好，
  // conductor 接下來挑第一張時（canBorrow）才判斷得出誰在畫面上
  if (!flow.isInitialized()) flow.init(liveGridIds())

  const current = displayState.value.nowPlaying
  const id = current ? getId(current) : null
  const el = id ? findDisplayEl(id) : null
  outgoing = id && el ? { id, el } : null
  gridBefore = new Map(displayState.value.liveGrid.map(n => [getId(n), n]))
}

/* ── AFTER：資料已修改，排這一輪的動畫 ── */
const onAfterStateChange = async (info: StateChangeInfo) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ids = liveGridIds()
  const next = displayState.value.nowPlaying
  const nextId = next ? getId(next) : null
  const out = outgoing
  outgoing = null
  // 右邊那張沒換（例如只是牆上有便利貼被下架）就不重播進場動畫
  const displayChanged = nextId !== (out?.id ?? null)

  // 上一張：還在 liveGrid 裡就飛回牆上（idle 借出的，或 live 剛展示完被推進牆的）；
  // 不在了（後台下架）就原地淡出
  const returning = displayChanged && out && ids.includes(out.id) ? out : null
  const vanishing = displayChanged && out && !returning ? out : null

  // 輪播換張時從 liveGrid 消失的，只會是超過張數被擠掉的最舊那張：讓它繼續流、流出畫面才離開。
  // 先把它的資料放進 retiringNotes（還在 nextTick 之前，Vue 不會拿掉它的 DOM），
  // 當下不在畫面上的 sync 會立刻 onRetired 把它拿回去
  const idSet = new Set(ids)
  const retire = info.source === 'tick'
    ? [...gridBefore.keys()].filter(id => !idSet.has(id))
    : []
  for (const id of retire) retiringNotes.value.push(gridBefore.get(id))

  // 對齊牆的成員。這段在 nextTick 之前，DOM 還沒被 Vue 更新，
  // 當場拿掉的（後台下架）趁現在複製一份在原地淡出
  const fading = flow
    .sync(ids, { hold: returning ? [returning.id] : [], retire })
    .map(placeFadingCopy)
  for (const id of retire) {
    if (retiringNotes.value.some(n => getId(n) === id)) watchRetiring(id)
  }

  // 這一張若是從牆上借的：從牆上拿起，原位變成它的空位跟著流
  const pickedFrom = displayChanged && nextId && displayState.value.borrowedId === nextId
    ? flow.take(nextId)
    : null
  if (displayChanged && next && nextId) {
    // 同一張還在飛回牆上的途中又被挑中（冷卻理論上會擋掉）：舊的那份直接收掉，key 才不會重複
    removeDisplay(nextId)
    displayItems.value.push(next)
  }

  await nextTick()

  // 每個步驟都用絕對時間定位，不用 '<' 之類的相對位置 ——
  // 相對位置會跟著「上一個被加進 timeline 的動畫」跑，改動順序就會錯位
  const lift = ANIM.scaleDuration
  const tl = gsap.timeline()
  activeTimeline = tl

  // ▸ 牆上消失的：原地淡出
  for (const copy of fading) {
    tl.to(copy, {
      opacity: 0,
      duration: ANIM.fadeDuration,
      ease: 'power1.out',
      onComplete: () => copy.remove()
    }, 0)
  }

  // ▸ 展示中那張被下架：原地淡出
  if (vanishing) {
    tl.to(vanishing.el, {
      opacity: 0,
      duration: ANIM.fadeDuration,
      ease: 'power1.out',
      onComplete: () => removeDisplay(vanishing.id)
    }, 0)
  }

  // ▸ 上一張飛回牆上：拿起 → 追著牆上保留給它的位置飛 → 落地交給牆接手。
  //   那個位置本身也在流動，所以終點每幀重算：飛到最後的速度就跟牆一致，交接時看不出接縫
  if (returning) {
    const { id, el } = returning
    const home = el.getBoundingClientRect()
    const cx = home.left + home.width / 2
    const cy = home.top + home.height / 2
    // 落點在左邊螢幕；原位不在了要另找位置時，挑靠右（離這裡近）的，飛行距離比較短。
    // 挑落點時用最長的飛行時間檢查「落地時還在左邊螢幕」，實際飛得比較快也只會更保險
    // 落點那格若有便利貼，它會順著流向滑一格讓位：滑的時間用最短的飛行時間，落地前一定讓開
    flow.reserveReturn(
      id,
      lift + ANIM.maxMoveDuration,
      leftScreenRight(),
      leftScreenRight() * 0.7,
      lift + ANIM.moveDuration
    )
    const aim = flow.rectOf(id, gsap.ticker.time + lift + ANIM.moveDuration)
    const move = aim
      ? flightDuration(Math.hypot(aim.x + aim.size / 2 - cx, aim.y + aim.size / 2 - cy))
      : ANIM.moveDuration
    const inner = el.firstElementChild as HTMLElement | null
    if (inner) {
      tl.to(inner, { scale: 1.1, duration: lift, ease: 'power2.out' }, 0)
      tl.to(inner, { scale: 1, duration: move, ease: 'power2.inOut' }, lift)
    }
    const progress = { k: 0 }
    tl.to(progress, {
      k: 1,
      duration: move,
      ease: ANIM.flightEase,
      onUpdate: () => {
        const target = flow.rectOf(id, gsap.ticker.time)
        if (!target) return
        const k = progress.k
        gsap.set(el, {
          x: (target.x + target.size / 2 - cx) * k,
          y: (target.y + target.size / 2 - cy) * k,
          scale: 1 + (target.size / home.width - 1) * k,
          rotation: target.rotation * k
        })
      }
    }, lift)
    tl.call(() => {
      flow.land(id)
      // 牆上那張這一幀就會現身；展示區這份留到下一幀才拿掉，重疊一幀、中間不會有空檔
      requestAnimationFrame(() => removeDisplay(id))
    }, [], lift + move)
  }

  // ▸ 這一張飛到右邊 highlight：從牆上的位置拿起（新投稿從下方飛入）→ 飛到中間放大 → 放下
  const displayEl = displayChanged && nextId ? findDisplayEl(nextId) : null
  if (displayEl) {
    const inner = displayEl.firstElementChild as HTMLElement | null
    // 起點必須在這裡同步設好：Vue 剛把它插進 DOM 時在最終位置（右邊正中），
    // 晚一幀才移到起點，就會看到它先閃一下再從牆上飛過來
    const start = getDisplayStart(pickedFrom, displayEl.getBoundingClientRect())
    gsap.set(displayEl, start)
    const move = pickedFrom ? flightDuration(Math.hypot(start.x, start.y)) : ANIM.moveDuration
    if (inner) {
      if (pickedFrom) tl.to(inner, { scale: 1.1, duration: lift, ease: 'power2.out' }, 0)
      else gsap.set(inner, { scale: 1.1 })
      tl.to(inner, { scale: 1, duration: lift, ease: 'power2.inOut' }, lift + move)
    }
    // 牆上那張墊在底下，直到展示這份開始飛（它剛掛上，頭幾幀可能還沒畫好）
    if (pickedFrom) tl.call(() => flow.release(nextId!), [], lift)
    tl.to(displayEl, {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      duration: move,
      ease: pickedFrom ? ANIM.flightEase : 'power3.out'
    }, lift)
    tl.call(() => { gsap.set(displayEl, { clearProps: 'transform' }) }, [], lift + move + lift)
  }
}

const beginCanvasSession = async () => {
  if (hasUserStarted.value) return
  hasUserStarted.value = true
  await nextTick()

  // 牆要先照畫面大小排好：沒指定張數時，就載入「排滿再多排一些」的張數（recommendedCount）
  const el = canvasRef.value!
  flowSize.value = flow.layout(el.clientWidth, el.clientHeight)
  flow.start()
  window.addEventListener('resize', onResize)

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
    historyLimit:   maxNotesParam.value || flow.recommendedCount(),
    animationMs:    ANIM_TOTAL_MS,
    getInterstitialVideoUrl: () => interstitialSrc.value,
    onInterstitialStart: () => {
      showInterstitial.value = true
      void startInterstitialPlayback()
    },
    promoEvery: promoEvery.value,
    onPromoStart,
    // 只借左邊螢幕上的；而且盡量挑展示完時留下的空位還在左邊螢幕的，才回得去原位
    canBorrow: id => flow.isPickable(id, leftScreenRight()),
    preferBorrow: id => flow.isPickable(id, leftScreenRight(), displaySec.value + ANIM_TOTAL_MS / 1000),
    onBeforeStateChange,
    onAfterStateChange
  })
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
  flow.stop()
  for (const id of [...retiringWatchers.keys()]) stopWatchingRetiring(id)
  window.removeEventListener('resize', onResize)
  unsubCanvasVideo?.()
  unsubCanvasVideo = null
  if (interstitialArmTimer) {
    clearInterval(interstitialArmTimer)
    interstitialArmTimer = null
  }
  if (promoFallbackTimer) {
    clearTimeout(promoFallbackTimer)
    promoFallbackTimer = null
  }
  stopConductor()
  document.body.style.margin = ''
  document.body.style.overflow = ''
})
</script>
