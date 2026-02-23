<template>
  <div class="p-canvas" ref="canvasRef">

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

    <!-- ─── 右半：單張展示區 ─── -->
    <div class="p-canvas__display-zone">
      <div
        v-if="displayState.nowPlaying"
        :key="'display-' + getId(displayState.nowPlaying)"
        :data-flip-id="getId(displayState.nowPlaying)"
        class="p-canvas__note-wrap p-canvas__note-wrap--display"
      >
        <StickyNote :note="displayState.nowPlaying" />
      </div>
      <div v-else class="p-canvas__empty-state">
        <h2>等待便利貼中...</h2>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch, reactive } from 'vue'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { useRoute } from 'vue-router'
import StickyNote from '~/components/StickyNote.vue'
import { useConductor } from '~/composables/useConductor'

definePageMeta({ layout: false })
gsap.registerPlugin(Flip)

/* ─── URL 參數 ─── */
const route = useRoute()
const maxNotes   = computed(() => Number(route.query.count) || 16)
const displaySec = computed(() => Number(route.query.duration) || 5)

/* ─── Conductor ─── */
const { startConductor, stopConductor, displayState } = useConductor()
const canvasRef   = ref<HTMLElement | null>(null)
const liveZoneRef = ref<HTMLElement | null>(null)

/** 取得便利貼唯一 ID */
const getId = (item: any): string => item?.id ?? item?.token ?? ''

/* ══════════════════════════════════════════════
   隨機散落演算法 (Non-overlapping scatter)
   ══════════════════════════════════════════════ */

/** 已分配的位置快取 { flipId → { left, top, rotation } } */
const positionMap = reactive<Record<string, { left: number; top: number; rot: number }>>({})

/** padding (px) 用於 live-zone 內邊距 */
const PADDING = 8
/** note 之間最小間距 (px) */
const GAP = 16

/**
 * 根據 live-zone 尺寸和最大便利貼數量，計算每張便利貼邊長 (px)
 */
function calcNoteSize(): number {
  const zone = liveZoneRef.value
  if (!zone) return 100
  const w = zone.clientWidth - PADDING * 2
  const h = zone.clientHeight - PADDING * 2
  const count = Math.max(maxNotes.value, 1)

  // 找出剛好能放下 count 張的最佳行列數
  const cols = Math.ceil(Math.sqrt(count * (w / h)))
  const rows = Math.ceil(count / cols)

  const cellW = w / cols
  const cellH = h / rows

  // 取 cell 短邊的 78% 當作便利貼大小（留空間給隨機偏移）
  const raw = Math.min(cellW, cellH) * 0.78
  return Math.max(50, Math.min(raw, 300))
}

/**
 * 為所有 liveGrid 便利貼分配不重疊的隨機位置。
 *
 * 演算法：Grid-Cell Jitter
 * 1. 將 live-zone 切成虛擬網格（行列 ≥ 便利貼數量）
 * 2. 隨機打亂所有格子順序
 * 3. 每張便利貼被分配到一個唯一的格子
 * 4. 在格子範圍內隨機偏移 → 看起來隨機但保證不重疊
 */
function recalcPositions() {
  const zone = liveZoneRef.value
  if (!zone) return
  const zoneW = zone.clientWidth - PADDING * 2
  const zoneH = zone.clientHeight - PADDING * 2
  const size  = calcNoteSize()
  const count = Math.max(maxNotes.value, 1)

  // 計算最佳行列數
  const cols = Math.ceil(Math.sqrt(count * (zoneW / zoneH)))
  const rows = Math.ceil(count / cols)
  const cellW = zoneW / cols
  const cellH = zoneH / rows

  // 便利貼在格子裡可以偏移的最大距離
  const jitterX = Math.max(0, (cellW - size) / 2 - GAP / 2)
  const jitterY = Math.max(0, (cellH - size) / 2 - GAP / 2)

  // 取得目前 liveGrid 所有 ID（保持順序）
  const items = displayState.value.liveGrid.map((n: any) => getId(n))

  // 移除已不存在的 ID
  for (const id of Object.keys(positionMap)) {
    if (!items.includes(id)) delete positionMap[id]
  }

  // 產生所有可用格子（col, row）
  const allCells: { col: number; row: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      allCells.push({ col: c, row: r })
    }
  }

  // 收集已佔用的格子（已有位置的便利貼保留原格子）
  const usedCells = new Set<string>()
  const idToCellKey: Record<string, string> = {}

  for (const id of items) {
    const existing = positionMap[id]
    if (existing) {
      // 反推它在哪一個 cell
      const c = Math.floor((existing.left) / cellW)
      const r = Math.floor((existing.top) / cellH)
      const key = `${Math.min(c, cols - 1)},${Math.min(r, rows - 1)}`
      usedCells.add(key)
      idToCellKey[id] = key
    }
  }

  // 收集空閒格子，打亂順序
  const freeCells = allCells.filter(c => !usedCells.has(`${c.col},${c.row}`))
  for (let i = freeCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = freeCells[i]!
    freeCells[i] = freeCells[j]!
    freeCells[j] = temp
  }

  // 為沒有位置的便利貼分配空閒格子
  let freeCellIdx = 0
  for (const id of items) {
    if (positionMap[id]) continue
    if (freeCellIdx >= freeCells.length) break

    const cell = freeCells[freeCellIdx++]!
    const centerX = cell.col * cellW + cellW / 2 - size / 2
    const centerY = cell.row * cellH + cellH / 2 - size / 2

    // 在格子中心附近隨機偏移
    const offsetX = (Math.random() - 0.5) * 2 * jitterX
    const offsetY = (Math.random() - 0.5) * 2 * jitterY
    const rot = (Math.random() - 0.5) * 12  // -6° ~ +6°

    positionMap[id] = {
      left: Math.max(0, Math.min(centerX + offsetX, zoneW - size)),
      top:  Math.max(0, Math.min(centerY + offsetY, zoneH - size)),
      rot
    }
  }
}

/** 返回每張便利貼的 inline style */
function getScatterStyle(flipId: string) {
  const pos = positionMap[flipId]
  const size = calcNoteSize()
  if (!pos) return { width: `${size}px`, height: `${size}px` }
  return {
    position: 'absolute' as const,
    left:   `${PADDING + pos.left}px`,
    top:    `${PADDING + pos.top}px`,
    width:  `${size}px`,
    height: `${size}px`,
    transform: `rotate(${pos.rot}deg)`
  }
}

/* ══════════════════════════════════════════════
   FLIP 動畫相關
   ══════════════════════════════════════════════ */

let flipSnapshot: any = null
let capturedElements: { 
  flipId: string; 
  rect: DOMRect; 
  offsetWidth: number; 
  offsetHeight: number; 
  transform: string; 
  clone: HTMLElement 
}[] = []

onMounted(() => {
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'

  startConductor({
    loopIntervalMs: displaySec.value * 1000,
    historyLimit:   maxNotes.value,

    /* ── BEFORE：拍快照 ── */
    onBeforeStateChange() {
      flipSnapshot = Flip.getState('.p-canvas__note-wrap')

      capturedElements = []
      document.querySelectorAll('.p-canvas__note-wrap').forEach(el => {
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

      for (const item of capturedElements) {
        if (!currentIds.has(item.flipId)) {
          const clone = item.clone
          clone.classList.add('is-leaving')
          clone.removeAttribute('data-flip-id')
          
          // Calculate the visual center from the bounding box
          const centerX = item.rect.left + item.rect.width / 2
          const centerY = item.rect.top + item.rect.height / 2
          // Find the top/left of the un-transformed box so it stays centered
          const fixedLeft = centerX - item.offsetWidth / 2
          const fixedTop = centerY - item.offsetHeight / 2

          clone.style.margin = '0'

          Object.assign(clone.style, {
            position: 'fixed',
            left:   `${fixedLeft}px`,
            top:    `${fixedTop}px`,
            width:  `${item.offsetWidth}px`,
            height: `${item.offsetHeight}px`,
            transform: item.transform,
            zIndex: '50',
            pointerEvents: 'none'
          })
          canvasRef.value!.appendChild(clone)

          const lRect = liveZoneRef.value!.getBoundingClientRect()
          const targetLeaveX = lRect.left + lRect.width / 2
          const targetLeaveY = lRect.top - 150

          gsap.to(clone, {
            x: targetLeaveX - centerX,
            y: targetLeaveY - centerY,
            opacity: 0,
            scale: 0.3,
            duration: 1.2,
            ease: 'power3.in',
            onComplete: () => clone.remove()
          })
        }
      }

      // ▸ FLIP 動畫
      Flip.from(flipSnapshot, {
        targets: '.p-canvas__note-wrap:not(.is-leaving)',
        duration: 1.2,
        ease: 'power2.inOut',
        absolute: true,
        nested: true,
        zIndex: 100,

        onEnter(elements: Element[]) {
          return gsap.from(elements, {
            x: (i, el) => {
              const rect = el.getBoundingClientRect()
              const centerX = rect.left + rect.width / 2
              if (el.classList.contains('p-canvas__note-wrap--display')) {
                const dZone = document.querySelector('.p-canvas__display-zone') as HTMLElement
                const dRect = dZone.getBoundingClientRect()
                return (dRect.left + dRect.width / 2) - centerX
              } else {
                const lRect = liveZoneRef.value!.getBoundingClientRect()
                return (lRect.left + lRect.width / 2) - centerX
              }
            },
            y: (i, el) => {
              const rect = el.getBoundingClientRect()
              const centerY = rect.top + rect.height / 2
              if (el.classList.contains('p-canvas__note-wrap--display')) {
                const dZone = document.querySelector('.p-canvas__display-zone') as HTMLElement
                const dRect = dZone.getBoundingClientRect()
                return (dRect.bottom + 200) - centerY
              } else {
                const lRect = liveZoneRef.value!.getBoundingClientRect()
                return (lRect.top - 200) - centerY
              }
            },
            opacity: 0,
            scale: 0.3,
            duration: 1.2,
            ease: 'power3.out'
          })
        }
      })

      flipSnapshot = null
      capturedElements = []
    }
  })

  // 初始散落（Conductor 第一次 tick 後可能還沒有資料，監聽變化）
  watch(
    () => displayState.value.liveGrid.length,
    () => { recalcPositions() },
    { immediate: true }
  )
})

onUnmounted(() => {
  stopConductor()
  document.body.style.margin = ''
  document.body.style.overflow = ''
})
</script>