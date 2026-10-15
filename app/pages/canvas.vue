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
    <!-- ─── 底層：流動便利貼牆，橫跨左右兩個螢幕，由下往上流（位置由 useNoteFlow 每幀寫入） ─── -->
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

    <!-- ─── 深色底：蓋在流動牆上、徽章與 highlight 底下，橫跨兩個螢幕，兩種樣子交叉淡換 ───
         平常：左螢幕由左到右的漸層（左緣最深、到接縫透明），右螢幕沒有底色，拿起、放回都看得清楚；
         highlight 時：左右兩個螢幕一樣深、沒有漸層。濃淡由輪播動畫調（見 dimTo） -->
    <div ref="dimIdleRef" class="p-canvas__dim p-canvas__dim--idle" aria-hidden="true" />
    <div ref="dimHighlightRef" class="p-canvas__dim p-canvas__dim--highlight" aria-hidden="true" />

    <!-- 萬聖節：整面的左上、右下角各一張白色蜘蛛網（稿子畫板 03、04，樣式在 themes/_halloween.scss） -->
    <template v-if="themeId === 'halloween'">
      <i class="t-hw-canvas-web t-hw-canvas-web--tl" aria-hidden="true" />
      <i class="t-hw-canvas-web t-hw-canvas-web--br" aria-hidden="true" />
    </template>

    <!-- ─── 左側容器：常駐的徽章動畫與插播影片 ───
         按「開始」才掛上，徽章的彈出才會跟著牆一起出現 -->
    <div class="p-canvas__half p-canvas__half--stack">
      <CanvasPromo v-if="hasUserStarted" class="p-canvas__promo" />
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
          @ended="endInterstitial"
          @error="onInterstitialVideoError"
        />
      </div>
    </div>

    <!-- ─── 右側容器：頂層是 highlight 的那一張 ───
         換張時會短暫同時有兩張：剛展示完、正在飛回牆上的，和下一張（等前一張落地才從牆上拿起，之前藏著）。
         飛回去的用本尊不用複製品：複製出來的圖片要重新解碼，起飛那一下貼紙與手繪會閃掉 -->
    <div class="p-canvas__half p-canvas__half--stack">
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
      <div
        v-show="showInterstitial && interstitialSrc"
        class="p-canvas__interstitial p-canvas__interstitial--right"
        aria-hidden="true"
      >
        <!-- 右邊不另外解碼一份：把左邊影片的每一格畫過來（見 useVideoMirror） -->
        <canvas ref="videoMirrorRef" class="p-canvas__interstitial__video" />
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
  assignNoteData,
  getInterstitialSlotKey,
  clampInterstitialIntervalMinutes,
  parseInterstitialScheduleEnabled
} from '~/composables/useConductor'
import type { StateChangeInfo } from '~/composables/useConductor'
import { useNoteFlow, type FlowDirection, type FlowRect, type FlowXRange } from '~/composables/useNoteFlow'
import { useVideoMirror } from '~/composables/useVideoMirror'
import { WALL_LOOK } from '~/utils/wall-look'

definePageMeta({ layout: false, zhOnly: true })

/** 節慶主題：萬聖節時四角加蜘蛛網（徽章本身換長相由 CanvasPromo 自己看） */
const { themeId } = useTheme()

/* ─── 動畫時間設定（秒）───────────────────────────────────────
   調整這裡可以統一改變所有動畫的快慢
   ─────────────────────────────────────────────────────────── */
const ANIM = {
  /**
   * 飛行時間（從牆上飛到右邊螢幕中間、飛回牆上、新投稿飛入）依距離決定：
   * 距離 ÷ flightSpeed，夾在 moveDuration 與 maxMoveDuration 之間。
   * 牆上的位置有近有遠，固定時間的話遠的那幾次會飛得太快
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

/** 上一張飛回牆上最久要多久（拿起 → 移動），下一張要等它落地才從牆上拿起 */
const RETURN_MAX_SEC = ANIM.scaleDuration + ANIM.maxMoveDuration

/**
 * 一輪動畫從頭到尾最久要多久：上一張飛回牆上 → 下一張拿起 → 移動（都是最長的那種）→ 放下，
 * 外加一點緩衝。傳給 Conductor 當作「動畫進行中不要開始下一輪」的守衛長度。
 * 這個值必須跟著 ANIM 走，寫死就會在改動畫時間後悄悄失準。
 */
const ANIM_TOTAL_MS = (RETURN_MAX_SEC + ANIM.scaleDuration * 2 + ANIM.maxMoveDuration) * 1000 + 50

/* ─── URL 參數 ─── */
const route = useRoute()
/**
 * 數值的網址參數：沒填、不是數字、不是正數就用預設值；有填就夾在 [min, max]。
 * 一定要擋掉負數、0 與 Infinity：流速 ≤ 0 時牆的進場時間不會往後推，
 * useNoteFlow 每幀的進場迴圈就停不下來，整頁卡死；道數是 Infinity 也一樣
 */
const numParam = (key: string, fallback: number, min: number, max: number) => {
  const n = Number(route.query[key])
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback
}
/**
 * 輪播的張數（載入最新的幾張）。沒填時依畫面大小算：排滿牆面再多每道一張在畫面外排隊，
 * 換道才換得起來、每張輪到右邊螢幕的機會才平均（見 useNoteFlow 的 recommendedCount）
 */
const maxNotesParam = computed(() => Math.floor(numParam('count', 0, 1, 200)))
const displaySec = computed(() => numParam('duration', 15, 1, 3600))
const displayNoteScale = computed(() => numParam('displayScale', 0.9, 0.1, 1.5))
/**
 * 流動牆：
 * - 方向：預設一欄一欄由下往上；?flow=left 改成一排一排由右往左
 * - 道數：由下往上看 ?cols（預設 6 欄，每個螢幕 3 欄）；由右往左看 ?rows（預設 3 排）
 * - ?flowScale：便利貼佔道寬的比例，預設 0.85
 * - ?flowSpeed：流速（1080 高的畫面每秒幾 px）。往上流預設比較慢：畫面高只有 1080，
 *   照橫向的速度一張半分鐘就流完了，展示完它留下的空位也多半已經流出頂端、回不去原位
 * - ?mess：排列的雜亂程度，0 = 整齊磚牆、1 = 最亂（大小不變，前後左右的偏移差最多，
 *   會互相壓到一些），超過 1 當 1。預設 1
 * - ?speedVary：各道流速上下差多少（比例），例如 0.15 = 最慢 0.85 倍、最快 1.15 倍。預設 0 = 全部同速
 * - ?tilt：最多歪幾度（每張在 ±tilt 之間），0 = 完全不歪，最多 45。預設 5；只管角度，偏移看 mess
 *
 * mess、tilt、flowScale 的預設值跟首頁的便利貼牆共用（WALL_LOOK），兩邊才是同一種凌亂感
 */
const flowDirection = computed<FlowDirection>(() => (route.query.flow === 'left' ? 'left' : 'up'))
const flowLanes = computed(() => Math.floor(
  flowDirection.value === 'up' ? numParam('cols', 6, 1, 24) : numParam('rows', 3, 1, 24)
))
const flowScale = computed(() => numParam('flowScale', WALL_LOOK.scale, 0.1, 0.95))
const flowSpeed = computed(() => numParam('flowSpeed', flowDirection.value === 'up' ? 30 : 45, 1, 600))
/** 0 是有意義的值（整齊），不能寫成 `||`，會被當成沒填而變回預設 */
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
const videoMirrorRef = ref<HTMLCanvasElement | null>(null)
const videoMirror = useVideoMirror(videoLeftRef, videoMirrorRef)
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
  clearInterstitialArmQueue
} = useConductor()

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
  const prevSrc = interstitialSrc.value
  if (!data) {
    interstitialSrc.value = null
    interstitialIntervalMinutes.value = clampInterstitialIntervalMinutes(undefined)
    interstitialScheduleEnabled.value = false
  } else {
    const u = data.videoUrl
    interstitialSrc.value = typeof u === 'string' && u.length > 0 ? u : null
    interstitialIntervalMinutes.value = clampInterstitialIntervalMinutes(
      data.interstitialIntervalMinutes
    )
    interstitialScheduleEnabled.value = parseInterstitialScheduleEnabled(
      data.interstitialScheduleEnabled
    )
  }
  // 沒有影片時排著的插播也不會播，留著的話等後台補上影片才一口氣播
  if (!interstitialScheduleEnabled.value || !interstitialSrc.value) clearInterstitialArmQueue()
  // 插播中換了影片（或拿掉了）：<video> 會改載新的網址，這一次的 ended 不會來了，直接結束
  if (interstitialActive && interstitialSrc.value !== prevSrc) endInterstitial()
}

const isAutoplayNotAllowedError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === 'NotAllowedError'

/*
 * 插播的結束：只靠 <video> 的 ended 的話，影片載入失敗、播到一半卡住、插播中換了影片，
 * ended 都不會來，conductor 的封鎖不會解除，輪播就永遠停在插播。
 * 所以 ended、error、逾時保護、換影片都走 endInterstitial，用 interstitialActive 確保只結束一次
 */
let interstitialActive = false
/** 第幾次插播：上一次的 startInterstitialPlayback 還卡在 await 時這次已經結束，回來時才認得出自己過期了 */
let interstitialSession = 0
let interstitialGuard: number | null = null
/** 逾時保護：影片長度再多等這麼久還沒結束就當作卡住 */
const INTERSTITIAL_GRACE_MS = 15_000
/** 還不知道影片多長（預載、開始播放之前）時最多等多久 */
const INTERSTITIAL_UNKNOWN_MAX_MS = 3 * 60_000

const armInterstitialGuard = (ms: number) => {
  if (interstitialGuard !== null) window.clearTimeout(interstitialGuard)
  interstitialGuard = window.setTimeout(() => {
    interstitialGuard = null
    console.warn('[canvas] 插播影片逾時沒有結束，跳過')
    endInterstitial()
  }, ms)
}

const clearInterstitialGuard = () => {
  if (interstitialGuard !== null) window.clearTimeout(interstitialGuard)
  interstitialGuard = null
}

const onInterstitialStart = () => {
  interstitialActive = true
  const session = ++interstitialSession
  showInterstitial.value = true
  armInterstitialGuard(INTERSTITIAL_UNKNOWN_MAX_MS)
  void startInterstitialPlayback(session)
}

const startInterstitialPlayback = async (session: number) => {
  const stale = () => session !== interstitialSession || !interstitialActive
  if (interstitialSrc.value) {
    try {
      await preloadVideo(interstitialSrc.value)
    } catch (e) {
      console.warn('[canvas] 插播影片預載失敗，改為直接嘗試播放', e)
    }
  }
  await nextTick()
  if (stale()) return
  const left = videoLeftRef.value
  if (!left || !interstitialSrc.value) {
    endInterstitial()
    return
  }
  left.pause()
  left.currentTime = 0
  left.muted = false
  /** 開始播了：逾時改成照影片長度算 */
  const onPlaying = () => {
    // 等 play() 的途中這次插播已經結束（逾時、換影片）：已經開始的聲音要停掉
    if (stale()) {
      if (!interstitialActive) left.pause()
      return
    }
    videoMirror.start()
    const sec = left.duration
    armInterstitialGuard(Number.isFinite(sec) && sec > 0
      ? sec * 1000 + INTERSTITIAL_GRACE_MS
      : INTERSTITIAL_UNKNOWN_MAX_MS)
  }
  try {
    await left.play()
    onPlaying()
  } catch (e) {
    if (stale()) return
    if (!isAutoplayNotAllowedError(e)) {
      console.error('[canvas] 插播影片播放失敗', e)
      endInterstitial()
      return
    }
    try {
      left.muted = true
      await left.play()
      onPlaying()
      console.warn(
        '[canvas] 插播改為靜音播放（瀏覽器自動播放政策：需使用者互動後才能自動有聲播放）'
      )
    } catch (e2) {
      if (stale()) return
      console.error('[canvas] 插播影片播放失敗（靜音重試後仍失敗）', e2)
      endInterstitial()
    }
  }
}

const endInterstitial = () => {
  if (!interstitialActive) return
  interstitialActive = false
  clearInterstitialGuard()
  videoLeftRef.value?.pause()
  videoMirror.stop()
  showInterstitial.value = false
  finishInterstitial()
}

/** 載入或解碼失敗。預載階段（還沒輪到插播）也會觸發，那時不用理 */
const onInterstitialVideoError = () => {
  if (!interstitialActive) return
  console.error('[canvas] 插播影片錯誤，跳過這次插播', videoLeftRef.value?.error)
  endInterstitial()
}

const canvasRef = ref<HTMLElement | null>(null)
/** 底層流動牆的容器 */
const flowLayerRef = ref<HTMLElement | null>(null)
/** 深色底的兩種樣子：平常（左螢幕漸層）與 highlight（左右一樣深） */
const dimIdleRef = ref<HTMLElement | null>(null)
const dimHighlightRef = ref<HTMLElement | null>(null)

/**
 * 深色底換成 highlight 的樣子（on）或平常的樣子（off）：兩層同時一淡一濃，交叉淡換。
 * 兩層都是半透明黑，疊起來不是直線內插：左緣（0.8 → 0.55）途中最淺到 0.53，
 * 比終點只淺 0.02、而且是一路變化中經過，看不出來；接縫那側沒有漸層層，就是直線內插
 */
const dimTo = (tl: gsap.core.Timeline, on: boolean, duration: number, at: number) => {
  const idle = dimIdleRef.value
  const highlight = dimHighlightRef.value
  if (!idle || !highlight) return
  tl.to(idle, { opacity: on ? 0 : 1, duration, ease: 'sine.inOut' }, at)
  tl.to(highlight, { opacity: on ? 1 : 0, duration, ease: 'sine.inOut' }, at)
}

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
    const fromCache = snap.metadata.fromCache
    if (snap.exists()) {
      // 內容被改了（後台「刪除個人資料」拿掉署名）：流出去途中的也要換
      const fresh = { id, ...snap.data() }
      for (const n of retiringNotes.value) if (getId(n) === id) assignNoteData(n, fresh)
      return
    }
    // 斷線時第一筆是本機快取：快取裡沒有這份文件不代表被刪了，等伺服器的回覆
    if (fromCache) return
    const el = flow.removeRetiring(id)
    if (el) {
      const copy = placeFadingCopy(el)
      gsap.to(copy, { opacity: 0, duration: ANIM.fadeDuration, ease: 'power1.out', onComplete: () => copy.remove() })
    }
    onRetired(id)
  }, (error) => {
    // 監聽斷了頂多是流出去途中被下架的那張晚一點才消失（流出畫面就離開了），不重掛
    console.error('[canvas] 流出去途中的便利貼監聽中斷', id, error)
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
  // 左右兩台螢幕：直排時便利貼不跨在中間的接縫上（橫排本來就會一路流過接縫）
  screens: 2,
  // 展示的便利貼從右邊螢幕挑：直排時右邊那幾欄從隊伍接最久沒展示的
  pickScreen: 1,
  onRetired: id => onRetired(id)
})
/** 牆上便利貼的邊長（px），寫進 --flow-size 給 CSS */
const flowSize = ref(0)

const onFlowNoteRef = (id: string, el: unknown) => {
  flow.register(id, el instanceof Element ? el : null)
}

const liveGridIds = () => displayState.value.liveGrid.map(getId).filter(Boolean)

/**
 * 從牆上拿起、展示完放回，都只在右邊螢幕（使用者指定）：左邊螢幕常駐徽章，
 * 右邊螢幕平常沒有深色底，拿起與放回都看得清楚；highlight 期間才換成左右一樣深的深色底。
 * 範圍扣掉中間接縫的 30px，跟展示區、插播影片一致
 */
const SEAM = 30
const rightScreen = (): FlowXRange => {
  const w = canvasRef.value?.clientWidth ?? window.innerWidth
  return [w / 2 + SEAM, w]
}

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
/**
 * 拿掉展示區的某一份，認物件本身、不認 id。延後執行的移除（落地後下一幀、淡出完）都用這個：
 * 分頁在背景時 requestAnimationFrame 不跑、conductor 的 setTimeout 照跑，同一張可能在這段期間
 * 又被挑中、展示區放了新的一份；切回來才執行的移除若照 id 刪，會連新的那份一起刪掉，
 * 下一輪找不到它就不會飛回牆上，那張便利貼從此從牆上消失。
 * 內容被改時（onNoteUpdated）是就地換資料，物件不變，這裡照樣認得出來
 */
const removeDisplayItem = (item: unknown) => {
  displayItems.value = displayItems.value.filter(n => n !== item)
}
const findDisplayEl = (id: string) =>
  canvasRef.value?.querySelector<HTMLElement>(
    `.p-canvas__display-zone > [data-note-id="${CSS.escape(id)}"]`
  ) ?? null

/** 展示區裡的一份：id、DOM、資料物件本身（延後移除時認它） */
interface DisplayEntry { id: string; el: HTMLElement; item: unknown }

/** 換張之前右邊那一張 */
let outgoing: DisplayEntry | null = null
/** 正在飛回牆上的那一份：飛行途中被後台刪掉時要原地淡出，不然落地那一刻才直接消失 */
let flyingBack: DisplayEntry | null = null
/** 正在淡出的展示區那幾份：落地時不要搶先拿掉，等淡出完自己拿 */
const fadingDisplay = new Set<unknown>()
/**
 * 這次改動不打斷正在跑的這一輪動畫（後台刪的不是展示中那張）：右邊不會換，
 * 打斷的話飛行中的會直接跳到終點。onBefore 決定、onAfter 照著做
 */
let keepTimeline = false

const fadeOutDisplay = (entry: DisplayEntry) => {
  fadingDisplay.add(entry.item)
  gsap.to(entry.el, {
    opacity: 0,
    duration: ANIM.fadeDuration,
    ease: 'power1.out',
    onComplete: () => {
      fadingDisplay.delete(entry.item)
      removeDisplayItem(entry.item)
    }
  })
}

/**
 * 便利貼的內容被改了（後台「刪除個人資料」拿掉署名）：liveGrid 與 nowPlaying 已由 conductor 換好，
 * 這裡換 conductor 管不到的 —— 展示區正在飛回牆上的那份、被擠掉還在流出去的。就地換資料，不重播任何動畫
 */
const onNoteUpdated = (id: string, note: Record<string, any>) => {
  for (const n of displayItems.value) if (getId(n) === id) assignNoteData(n, note)
  for (const n of retiringNotes.value) if (getId(n) === id) assignNoteData(n, note)
}

/**
 * 牆上被拿掉（下架、超過張數被擠掉）的便利貼：複製一份蓋在原位淡出。
 * 本尊馬上會被 Vue 從 DOM 拿掉，只能用複製品；淡出只有 0.4 秒，圖片重新解碼也不明顯
 */
const placeFadingCopy = (el: HTMLElement) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.classList.add('is-fading')
  // 放在牆那一層（本尊的 transform 原樣帶過來就是同一個位置），才會跟牆一起被深色底蓋住
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
  // 新投稿（或借的那張剛好不在畫面上）：從右半邊下方的畫面外飛進來。
  // 現身後要停 lift 秒才開始飛，起點得整張都在畫面外：這時已放大 1.1 倍，陰影又比便利貼外擴一圈
  // （_sticky-note.scss 的 $sticky-note-shadow-margin，約 5%），上緣離中心約 0.61 張高，抓 0.75 留餘裕。
  // 只算到半張的話，底邊會先露出一條（1080 高的畫面約 29px）停在那裡
  const canvasH = canvasRef.value?.clientHeight ?? window.innerHeight
  return { x: 0, y: canvasH + final.height * 0.75 - cy, scale: 1, rotation: 0 }
}

/** 改動前的 liveGrid：被擠掉的那張要留著它的資料，才能繼續畫在牆上流出去 */
let gridBefore = new Map<string, any>()

/* ── BEFORE：資料改動前，記下右邊那一張與 liveGrid ── */
const onBeforeStateChange = (info: StateChangeInfo) => {
  const current = displayState.value.nowPlaying
  const id = current ? getId(current) : null
  // 後台刪掉的不是展示中那張（牆上的、或正在飛回牆上的）：右邊不會換，這一輪動畫照跑，
  // 被刪的那張各自淡出就好（見 onAfterStateChange）
  keepTimeline = info.source === 'remote' && !!info.removed && !(id && info.removed.includes(id))
  // 上一輪動畫還沒跑完就進到下一輪時，先讓它瞬間走到結尾再丟掉。
  // 不這樣做，這裡會拍到飛行途中的位置；舊時間軸收尾的 land()／清 transform
  // 也會在新動畫進行中才觸發，畫面上看到的就是一次跳動
  if (activeTimeline && !keepTimeline) {
    activeTimeline.progress(1).kill()
    activeTimeline = null
  }
  // 第一輪 tick 時 liveGrid 才剛載入：在這裡把牆排好，
  // conductor 接下來挑第一張時（canBorrow）才判斷得出誰在畫面上
  if (!flow.isInitialized()) flow.init(liveGridIds())

  const el = id ? findDisplayEl(id) : null
  const item = id ? displayItems.value.find(n => getId(n) === id) : null
  outgoing = id && el && item ? { id, el, item } : null
  gridBefore = new Map(displayState.value.liveGrid.map(n => [getId(n), n]))
}

/* ── AFTER：資料已修改，排這一輪的動畫 ── */
const onAfterStateChange = async (info: StateChangeInfo) => {
  const keep = keepTimeline
  keepTimeline = false
  const canvas = canvasRef.value
  if (!canvas) return
  const ids = liveGridIds()
  const next = displayState.value.nowPlaying
  const nextId = next ? getId(next) : null
  const out = outgoing
  outgoing = null
  // 右邊那張沒換（例如只是牆上有便利貼被下架）就不重播進場動畫
  const displayChanged = !keep && nextId !== (out?.id ?? null)

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
  // 流出去途中又回到 liveGrid 的（補位補回來的）不再算流出去的；
  // 已經在名單上的不重複放：同一個 id 兩份，牆上的 v-for 就有重複的 key
  if (retiringNotes.value.some(n => idSet.has(getId(n)))) {
    for (const n of retiringNotes.value) if (idSet.has(getId(n))) stopWatchingRetiring(getId(n))
    retiringNotes.value = retiringNotes.value.filter(n => !idSet.has(getId(n)))
  }
  for (const id of retire) {
    if (!retiringNotes.value.some(n => getId(n) === id)) retiringNotes.value.push(gridBefore.get(id))
  }

  // 對齊牆的成員。這段在 nextTick 之前，DOM 還沒被 Vue 更新，
  // 當場拿掉的（後台下架）趁現在複製一份在原地淡出
  const fading = flow
    .sync(ids, { hold: returning ? [returning.id] : [], retire })
    .map(placeFadingCopy)
  for (const id of retire) {
    if (retiringNotes.value.some(n => getId(n) === id)) watchRetiring(id)
  }

  // 這一張是不是從牆上借的（新投稿就不是）。真正從牆上拿起要等上一張落地，見下面
  const fromWall = !!(displayChanged && nextId && displayState.value.borrowedId === nextId)
  if (displayChanged && next && nextId) {
    // 同一張還在飛回牆上的途中又被挑中（冷卻理論上會擋掉）：舊的那份直接收掉，key 才不會重複
    removeDisplay(nextId)
    displayItems.value.push(next)
  }

  await nextTick()

  // 不打斷正在跑的這一輪（後台刪的不是展示中那張）：被刪的各自淡出，不開新的時間軸。
  // 正在飛回牆上的那張被刪了：它在牆上保留的位置已經拿掉，原地停住淡出
  if (keep) {
    for (const copy of fading) {
      gsap.to(copy, { opacity: 0, duration: ANIM.fadeDuration, ease: 'power1.out', onComplete: () => copy.remove() })
    }
    if (flyingBack && !idSet.has(flyingBack.id)) {
      fadeOutDisplay(flyingBack)
      flyingBack = null
    }
    return
  }

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
      onComplete: () => removeDisplayItem(vanishing.item)
    }, 0)
  }

  // ▸ 上一張飛回牆上：拿起 → 追著牆上保留給它的位置飛 → 落地交給牆接手。
  //   那個位置本身也在流動，所以終點每幀重算：飛到最後的速度就跟牆一致，交接時看不出接縫
  /** 上一張落地的時間（沒有要飛回去的就是 0）：下一張這時才從牆上拿起 */
  let returnEnd = 0
  if (returning) {
    const { id, el } = returning
    const home = el.getBoundingClientRect()
    const cx = home.left + home.width / 2
    const cy = home.top + home.height / 2
    // 落點在右邊螢幕：回原位，回不去就補空位，沒有空位才插隊（見 reserveReturn）。
    // 挑落點時用最長的飛行時間檢查「落地時還在右邊螢幕」，實際飛得比較快也只會更保險
    // 插隊時那格的便利貼會往後退一格讓位：退的時間用最短的飛行時間，落地前一定讓開。
    // 等一下要拿起的那張不能被推走，告訴它是哪一張
    flow.reserveReturn(
      id,
      lift + ANIM.maxMoveDuration,
      rightScreen(),
      fromWall ? nextId : null,
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
    flyingBack = returning
    tl.call(() => {
      flow.land(id)
      if (flyingBack === returning) flyingBack = null
      // 飛行途中被刪、正在淡出的：淡出完自己會拿掉
      if (fadingDisplay.has(returning.item)) return
      // 牆上那張這一幀就會現身；展示區這份留到下一幀才拿掉，重疊一幀、中間不會有空檔。
      // 認物件本身，不認 id（見 removeDisplayItem）
      requestAnimationFrame(() => removeDisplayItem(returning.item))
    }, [], lift + move)
    returnEnd = lift + move
  }

  // ▸ 這一張飛到右邊 highlight：等上一張落地，從牆上的位置拿起（新投稿從下方飛入）→ 飛到中間放大 → 放下
  const displayEl = displayChanged && nextId ? findDisplayEl(nextId) : null
  if (displayEl && nextId) {
    const pickAt = returnEnd
    const inner = displayEl.firstElementChild as HTMLElement | null
    const final = displayEl.getBoundingClientRect()
    // 拿起之前先藏著：Vue 剛把它插進 DOM 時在最終位置（右邊正中），不藏就會先在那裡閃一下。
    // 用 opacity 不用 visibility（StickyNote 內層會自己設 visible，見 useNoteFlow 的 setShown）
    gsap.set(displayEl, { opacity: 0 })
    // 飛行時間依距離，距離用拿起那時它會流到的位置先算好
    const aim = fromWall ? flow.rectOf(nextId, gsap.ticker.time + pickAt) : null
    const aimStart = getDisplayStart(aim, final)
    const move = aim ? flightDuration(Math.hypot(aimStart.x, aimStart.y)) : ANIM.moveDuration
    // 到點才從牆上拿起：早拿的話，牆上那張會定在原地墊底，看起來就是卡住不流了。
    // 起點與現身在同一幀設好，不會先在別的地方閃一下
    tl.call(() => {
      const from = fromWall ? flow.take(nextId) : null
      gsap.set(displayEl, { ...getDisplayStart(from, final), opacity: 1 })
    }, [], pickAt)
    if (inner) {
      if (fromWall) tl.to(inner, { scale: 1.1, duration: lift, ease: 'power2.out' }, pickAt)
      else gsap.set(inner, { scale: 1.1 })
      tl.to(inner, { scale: 1, duration: lift, ease: 'power2.inOut' }, pickAt + lift + move)
    }
    // 牆上那張墊在底下，直到展示這份開始飛
    if (fromWall) tl.call(() => flow.release(nextId), [], pickAt + lift)
    tl.to(displayEl, {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      duration: move,
      ease: fromWall ? ANIM.flightEase : 'power3.out'
    }, pickAt + lift)
    tl.call(() => { gsap.set(displayEl, { clearProps: 'transform' }) }, [], pickAt + lift + move + lift)

    // 深色底：上一張飛回去的途中換回平常的樣子（落地時右螢幕沒有底色），
    // 這一張拿起、飛到中間的途中換成 highlight 的樣子（左右一樣深）
    if (returning) dimTo(tl, false, returnEnd, 0)
    dimTo(tl, true, lift + move, pickAt)
  } else if (returning || vanishing) {
    // 沒有下一張（插播影片、牆上沒便利貼了）：深色底跟著上一張飛回去或淡出一起換回平常的樣子
    dimTo(tl, false, returning ? returnEnd : ANIM.fadeDuration, 0)
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

  // 時段一換就排入插播。原本是「秒數剛好是 0 而且分鐘整除」才排：setInterval 跑幾個小時會漂，
  // 偶爾整個跳過 :00 那一秒，那個時段的插播就漏了。
  // 開場當下所在的時段不排（跟原本一樣，要等到下一個整點才開始）；
  // 後台改了間隔時也只重新對齊、不立刻插播 —— 間隔一變，時段編號就跟著變。
  let lastSlotN = interstitialIntervalMinutes.value
  let lastSlotKey = getInterstitialSlotKey(new Date(), lastSlotN)
  interstitialArmTimer = setInterval(() => {
    const n = interstitialIntervalMinutes.value
    const key = getInterstitialSlotKey(new Date(), n)
    if (n !== lastSlotN) {
      lastSlotN = n
      lastSlotKey = key
      return
    }
    if (key === lastSlotKey) return
    lastSlotKey = key
    // 沒有影片就不排（conductor 那邊也會擋）
    if (!interstitialScheduleEnabled.value || !interstitialSrc.value) return
    armInterstitialSlot(key)
  }, 1000)

  await startConductor({
    loopIntervalMs: displaySec.value * 1000,
    historyLimit:   maxNotesParam.value || flow.recommendedCount(),
    animationMs:    ANIM_TOTAL_MS,
    getInterstitialVideoUrl: () => interstitialSrc.value,
    onInterstitialStart,
    onNoteUpdated,
    isRetiring: id => retiringNotes.value.some(n => getId(n) === id),
    // 只借右邊螢幕上的，而且等上一張飛回去、真正拿起時也還在右邊螢幕；
    // 盡量挑展示完時還回得去原位的（見 useNoteFlow 的 fitsHome）
    canBorrow: id => flow.isPickable(id, rightScreen(), RETURN_MAX_SEC),
    preferBorrow: id => flow.canReturnHome(id, rightScreen(), displaySec.value + RETURN_MAX_SEC),
    // 右邊螢幕上的剛好都卡在畫面上下緣時，放寬成中心在右邊螢幕上，不要挑到左邊螢幕的
    canBorrowFallback: id => flow.isPickable(id, rightScreen(), RETURN_MAX_SEC, true),
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

  if (!disposed) subscribeCanvasVideo()

  isCanvasReady.value = true
})

/** 頁面已卸載：監聽出錯後排好的重掛不要再掛回去 */
let disposed = false
let canvasVideoResubTimer: number | null = null
let canvasVideoErrors = 0

const subscribeCanvasVideo = () => {
  unsubCanvasVideo = onSnapshot(doc(db, 'system', 'canvas_video'), (snap) => {
    canvasVideoErrors = 0
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
  }, (error) => {
    // 監聽出錯之後就不會再收到更新，後台改的插播設定都不會生效：隔一段時間重掛（5 秒起跳加倍，最多 1 分鐘）
    console.error('[canvas] 插播設定監聽中斷', error)
    unsubCanvasVideo = null
    if (disposed) return
    if (canvasVideoResubTimer !== null) window.clearTimeout(canvasVideoResubTimer)
    canvasVideoResubTimer = window.setTimeout(() => {
      canvasVideoResubTimer = null
      if (!disposed && !unsubCanvasVideo) subscribeCanvasVideo()
    }, Math.min(60_000, 5_000 * 2 ** canvasVideoErrors++))
  })
}

onUnmounted(() => {
  disposed = true
  // 動畫還在跑就離開頁面時，GSAP 的 ticker 會繼續驅動已經卸載的節點
  activeTimeline?.kill()
  activeTimeline = null
  flow.stop()
  for (const id of [...retiringWatchers.keys()]) stopWatchingRetiring(id)
  window.removeEventListener('resize', onResize)
  unsubCanvasVideo?.()
  unsubCanvasVideo = null
  if (canvasVideoResubTimer !== null) window.clearTimeout(canvasVideoResubTimer)
  canvasVideoResubTimer = null
  clearInterstitialGuard()
  interstitialActive = false
  if (interstitialArmTimer) {
    clearInterval(interstitialArmTimer)
    interstitialArmTimer = null
  }
  stopConductor()
  document.body.style.margin = ''
  document.body.style.overflow = ''
})
</script>
