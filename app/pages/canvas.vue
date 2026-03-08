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

  const scale = Math.min((zoneW / virtualW) || 1, (zoneH / virtualH) || 1)
  const baseSize = VIRTUAL_ITEM_SIZE * scale
  const size = Math.max(40, baseSize) * liveNoteScale.value

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
          const fixedTop  = centerY - item.offsetHeight / 2

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
          elEl.style.zIndex = '100' // 靜態 live 或其它
        }
      })

      // ── 分類所有便利貼目標 ────────────────────────────────────────────────
      const flipTargets = Array.from(
        document.querySelectorAll<HTMLElement>('.p-canvas__note-wrap:not(.is-leaving)')
      )

      const newEnterTargets: HTMLElement[] = []    // 情境 1：全新進場，不在 snapshot 中
      const crossZoneTargets: HTMLElement[] = []   // 情境 2：跨區移動（display↔live）
      const liveRepoTargets: HTMLElement[] = []    // 情境 3：純 live 區內重排

      flipTargets.forEach(el => {
        const flipId = el.getAttribute('data-flip-id')
        const captured = capturedElements.find(c => c.flipId === flipId)

        if (!captured) {
          newEnterTargets.push(el) // 不在 snapshot → 全新元素
          return
        }

        const cur = el.getBoundingClientRect()
        const hasMoved = (
          Math.abs(cur.left   - captured.rect.left)   > 1 ||
          Math.abs(cur.top    - captured.rect.top)    > 1 ||
          Math.abs(cur.width  - captured.rect.width)  > 1 ||
          Math.abs(cur.height - captured.rect.height) > 1
        )
        if (!hasMoved) return // 靜止不動，無需 Flip

        const wasDisplay = captured.clone.classList.contains('p-canvas__note-wrap--display')
        const isDisplay  = el.classList.contains('p-canvas__note-wrap--display')

        if (!wasDisplay && !isDisplay) {
          liveRepoTargets.push(el)  // 一直在 live 區 → 純重排
        } else {
          crossZoneTargets.push(el) // 跨越兩區 → 跨區移動
        }
      })

      // 計算跨區元素的 inner children，供 scale 動畫使用
      const crossInnerTargets = crossZoneTargets
        .map(el => el.firstElementChild as HTMLElement)
        .filter(Boolean)

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 全部動畫：ONE Flip.from() 統一驅動
      //
      // ★ 根本修正：多次 Flip.from() 共用同一 snapshot + absolute:true 時，
      //   第一次呼叫會改變 DOM 佈局（提升元素為 absolute），導致後續呼叫
      //   讀到錯誤位置而閃現。改為一次呼叫，Flip 統一計算所有元素。
      //
      //  情境 1 (新進場)  → onEnter 回調處理飛入邏輯
      //  情境 2 (跨區移動) → crossInner scale 另以 gsap.to 並行控制
      //  情境 3 (live重排) → Flip 直接計算位移
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // Phase 1：crossZone 子元素立即放大（與 Flip 移動同步發動）
      if (crossInnerTargets.length) {
        gsap.to(crossInnerTargets, {
          scale: 1.1,
          duration: ANIM.scaleDuration,
          ease: 'power2.out',
        })
      }

      // 單一 Flip.from()，targets 包含所有需要動畫的元素
      if (flipTargets.length) {
        Flip.from(flipSnapshot, {
          targets: flipTargets,
          duration: ANIM.moveDuration,
          ease: 'power2.inOut',
          absolute: true,

          // 情境 1：新進場元素的飛入動畫
          onEnter(elements: Element[]) {
            // 飛入前子元素先設為 1.1
            elements.forEach(el => {
              const inner = (el as HTMLElement).firstElementChild as HTMLElement
              if (inner) gsap.set(inner, { scale: 1.1 })
            })

            return gsap.from(elements, {
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
          },

          // 情境 2：crossZone 落地後 scale 縮回
          onComplete() {
            if (crossInnerTargets.length) {
              gsap.to(crossInnerTargets, {
                scale: 1,
                duration: ANIM.scaleDuration,
                ease: 'power2.inOut',
              })
            }
          },
        })
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