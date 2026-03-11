<template>
  <div class="p-canvas" ref="canvasRef" :style="{ '--display-scale': displayNoteScale }">

    <!-- ─── 左側容器 ─── -->
    <div class="p-canvas__half">
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
    </div>

    <!-- ─── 右側容器 ─── -->
    <div class="p-canvas__half">
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

/* ─── 動畫時間設定（秒）───────────────────────────────────────
   調整這裡可以統一改變所有動畫的快慢
   ─────────────────────────────────────────────────────────── */
const ANIM = {
  /** 所有移動 / 飛行動畫（進場飛入、跨區飛行、live 重排、離場飛出）*/
  moveDuration:  1.2,
  /** 所有 scale 縮放（1→1.1 拿起 / 1.1→1 放下，時間相同）*/
  scaleDuration: 0.5,
} as const

/* ─── URL 參數 ─── */
const route = useRoute()
const maxNotes   = computed(() => Number(route.query.count) || 16)
const displaySec = computed(() => Number(route.query.duration) || 5)
const liveNoteScale = computed(() => Number(route.query.liveScale) || 0.95)
const displayNoteScale = computed(() => Number(route.query.displayScale) || 1)

/* ─── Conductor ─── */
const { startConductor, stopConductor, displayState } = useConductor()
const canvasRef   = ref<HTMLElement | null>(null)
const liveZoneRef = ref<HTMLElement | null>(null)

/** 取得便利貼唯一 ID */
const getId = (item: any): string => item?.id ?? item?.token ?? ''

/* ══════════════════════════════════════════════
   隨機散落演算法 (Non-overlapping scatter)
   ══════════════════════════════════════════════ */

/** 已分配的位置快取 { flipId → { left, top, rot, size } } */
const positionMap = reactive<Record<string, { left: number; top: number; rot: number; size: number }>>({})

/** padding (px) 用於 live-zone 內邊距 */
const PADDING = 20

/** 虛擬座標系：便利貼邊長（用於 Fermat 螺旋 + 碰撞檢測，與 index 一致） */
const VIRTUAL_ITEM_SIZE = 550
/** 便利貼間距：負值 = 更緊、正值 = 更鬆。半徑 = (對角線 + MARGIN) / 2，與 index MARGIN=-20 同概念 */
const VIRTUAL_MARGIN = -50
const VIRTUAL_COLLISION_RADIUS = (VIRTUAL_ITEM_SIZE * Math.SQRT2 + VIRTUAL_MARGIN) / 2
const VIRTUAL_CELL_SIZE = VIRTUAL_COLLISION_RADIUS * 2
const SPIRAL_C = 35

interface VirtualPosition { x: number; y: number }

function getGridKey(x: number, y: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`
}

function isColliding(
  pos: VirtualPosition,
  grid: Map<string, VirtualPosition[]>,
  cellSize: number
): boolean {
  const cellX = Math.floor(pos.x / cellSize)
  const cellY = Math.floor(pos.y / cellSize)
  const diam = VIRTUAL_COLLISION_RADIUS * 2
  const diamSq = diam * diam
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const neighbors = grid.get(`${cellX + dx},${cellY + dy}`)
      if (neighbors) {
        for (const ex of neighbors) {
          const dx2 = pos.x - ex.x
          const dy2 = pos.y - ex.y
          if (dx2 * dx2 + dy2 * dy2 < diamSq) return true
        }
      }
    }
  }
  return false
}

/**
 * Fermat 螺旋 + 碰撞檢測：產生不重疊的虛擬座標（與 index.vue 相同邏輯）
 */
function calculatePositionsVirtual(itemCount: number): VirtualPosition[] {
  const positions: VirtualPosition[] = []
  const grid = new Map<string, VirtualPosition[]>()
  let spiralIndex = 0

  for (let i = 0; i < itemCount; i++) {
    if (i === 0) {
      const pos = { x: 0, y: 0 }
      positions.push(pos)
      const key = getGridKey(pos.x, pos.y, VIRTUAL_CELL_SIZE)
      grid.set(key, [pos])
      spiralIndex++
      continue
    }
    let found = false
    let currentPos: VirtualPosition = { x: 0, y: 0 }
    while (!found) {
      const r = SPIRAL_C * Math.sqrt(spiralIndex)
      const theta = spiralIndex * 137.508 * (Math.PI / 180)
      currentPos = {
        x: r * Math.cos(theta),
        y: r * Math.sin(theta)
      }
      if (!isColliding(currentPos, grid, VIRTUAL_CELL_SIZE)) found = true
      spiralIndex++
    }
    positions.push(currentPos)
    const key = getGridKey(currentPos.x, currentPos.y, VIRTUAL_CELL_SIZE)
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key)!.push(currentPos)
  }
  return positions
}

/**
 * 為所有 liveGrid 便利貼分配不重疊位置。
 * 演算法：Fermat 螺旋 + 碰撞檢測（與 index 一致），再依張數縮放到 live-zone 內，便利貼大小一併縮放。
 */
function recalcPositions() {
  const zone = liveZoneRef.value
  if (!zone) return
  const zoneW = zone.clientWidth - PADDING * 2
  const zoneH = zone.clientHeight - PADDING * 2

  const items = displayState.value.liveGrid.map((n: any) => getId(n))
  for (const id of Object.keys(positionMap)) {
    if (!items.includes(id)) delete positionMap[id]
  }

  const count = items.length
  if (!count) return

  const positions = calculatePositionsVirtual(count)

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
    left: `${PADDING + pos.left}px`,
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
      const crossInnerTargets: HTMLElement[] = [] // 跨區移動的元素，其內部元素需要額外縮放動畫
      const movingFlipTargets: Element[] = []     // 真正有產生位置變化的元素

      document.querySelectorAll('.p-canvas__note-wrap:not(.is-leaving)').forEach(el => {
        const flipId = el.getAttribute('data-flip-id')
        if (flipId) {
          flipTargets.push(el)

          // 判斷是否真的有移動
          const captured = capturedElements.find(c => c.flipId === flipId)
          let hasMoved = false

          if (captured) {
            const cur = el.getBoundingClientRect()
            hasMoved = (
              Math.abs(cur.left   - captured.rect.left)   > 1 ||
              Math.abs(cur.top    - captured.rect.top)    > 1 ||
              Math.abs(cur.width  - captured.rect.width)  > 1 ||
              Math.abs(cur.height - captured.rect.height) > 1
            )
          } else {
            hasMoved = true // 新進場的元素視同有移動
          }

          if (hasMoved) {
            movingFlipTargets.push(el)
          }

          if (hasMoved && wasInDisplayIds.has(flipId) && !el.classList.contains('p-canvas__note-wrap--display')) {
            // 從 display 區移動到 live 區的元素
            const inner = (el as HTMLElement).firstElementChild as HTMLElement
            if (inner) crossInnerTargets.push(inner)
          }
        }
      })

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 全部動畫：ONE Flip.from() 統一驅動
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // 單一 Flip.from()，targets 包含所有需要動畫的元素
      if (flipTargets.length) {
        // 先建立 Flip 動畫時間軸
        const flipAnim = Flip.from(flipSnapshot, {
          targets: flipTargets,
          duration: ANIM.moveDuration,
          ease: 'power2.inOut',
          absolute: true,
          scale: true, // 關鍵：讓元素以 transform scale 的方式變形，而非直接改 width/height，避免瞬間爆大
          paused: true, // 先暫停，由我們的手動時間軸控制
          // 情境 1：新進場元素的飛入動畫
          onEnter: (elements: Element[]) => {
            // 飛入前子元素先設為 1.1
            elements.forEach(el => {
              const inner = (el as HTMLElement).firstElementChild as HTMLElement
              if (inner) gsap.set(inner, { scale: 1.1 })
            })

            gsap.from(elements, {
              x: (i, el) => {
                const rect = el.getBoundingClientRect()
                const dZone = document.querySelector('.p-canvas__display-zone') as HTMLElement
                const dRect = dZone.getBoundingClientRect()
                return (dRect.left + dRect.width / 2) - (rect.left + rect.width / 2)
              },
              y: (i, el) => {
                const rect = el.getBoundingClientRect()
                const dZone = document.querySelector('.p-canvas__display-zone') as HTMLElement
                const dRect = dZone.getBoundingClientRect()
                const fromY = displayState.value.mode === 'live'
                  ? dRect.bottom + 200
                  : dRect.top - 200
                return fromY - (rect.top + rect.height / 2)
              },
              duration: ANIM.moveDuration,
              ease: 'power3.out',
              delay: flipTargets.length ? ANIM.scaleDuration : 0, // 等待拿起動作
              onComplete: () => {
                // 落地後：display 元素 scale 1.1→1
                elements.forEach(el => {
                  if (el.classList.contains('p-canvas__note-wrap--display')) {
                    const inner = (el as HTMLElement).firstElementChild as HTMLElement
                    if (inner) {
                      gsap.to(inner, {
                        scale: 1,
                        duration: ANIM.scaleDuration,
                        ease: 'power2.inOut',
                      })
                    }
                  }
                })
              },
            })
          }
        })

        // 提取所有要移動的元素的內部節點（用來放大縮小）
        const flipInnerTargets = movingFlipTargets.map(el => (el as HTMLElement).firstElementChild as HTMLElement).filter(Boolean)

        // 建立主時間軸，安排動畫順序： 1. 拿起(放大) -> 2. 移動(Flip) -> 3. 放下(縮小)
        const tl = gsap.timeline()

        // 步驟 1：所有要移動的元素原地放大 (拿起)
        if (flipInnerTargets.length) {
          tl.to(flipInnerTargets, {
            scale: 1.1,
            duration: ANIM.scaleDuration,
            ease: 'power2.out',
          })
        }

        // 步驟 2：執行所有位置移動 (Live重排 + 跨區移動)
        tl.add(flipAnim.play(), flipInnerTargets.length ? ANIM.scaleDuration : 0)

        // 步驟 3：所有移動的元素到達目的地後縮小 (放下)
        if (flipInnerTargets.length) {
          // `<` 代表對齊上一個動畫(也就是移動)的開端，加上移動時間代表「一抵達目標就馬上縮小」
          tl.to(flipInnerTargets, {
            scale: 1,
            duration: ANIM.scaleDuration,
            ease: 'power2.inOut',
          }, `<${ANIM.moveDuration}`)
        }

      }

      flipSnapshot = null
      capturedElements = []
    }
  })

  // 初始散落（Conductor 第一次 tick 後可能還沒有資料，監聽變化）
  watch(
    () => [displayState.value.liveGrid.length, liveNoteScale.value],
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