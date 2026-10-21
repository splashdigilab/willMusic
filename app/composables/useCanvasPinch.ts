import { ref } from 'vue'
import type { Ref } from 'vue'
import type { StickerInstance, TextBlockInstance } from '~/types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const SCALE_MIN = 1
const SCALE_MAX = 20
const RAD_TO_DEG = 180 / Math.PI

export interface UseCanvasPinchOptions {
  canvasRef: Ref<HTMLElement | null>
  drawMode: Ref<boolean>
  selectedTextBlockId: Ref<string | null>
  selectedStickerId: Ref<string | null>
  textBlocks: Ref<TextBlockInstance[]>
  stickers: Ref<StickerInstance[]>
  textBlockDragging: Ref<boolean>
  textBlockTransforming: Ref<boolean>
  draggingStickerId: Ref<string | null>
  transformingStickerId: Ref<string | null>
  onTextTransformEnd: () => void
  onStickerTransformEnd: () => void
  onTextDragEnd: () => void
  onStickerDragEnd: () => void
  /** 單擊文字區塊時呼叫（聚焦、可打字）；clientX/clientY 為觸碰座標，供呼叫端定位游標 */
  onTextTap?: (blockId: string, clientX: number, clientY: number) => void
  /** 在文字區塊上開始拖曳前呼叫（選取文字區塊，不聚焦） */
  onTextDragStart?: (blockId: string) => void
  /**
   * 按在貼紙上（不論是否已選取）時呼叫，要負責選取它；呼叫完就直接開始拖曳。
   * 沒給的話貼紙要先點一下選取、放開再按一次才拖得動。
   */
  onStickerPress?: (stickerId: string) => void
  /** 顯示垂直中心參考線（可選） */
  showVerticalCenterGuide?: Ref<boolean>
  /** 顯示水平中心參考線（可選） */
  showHorizontalCenterGuide?: Ref<boolean>
  /** 中心對齊 snap 門檻（百分比，預設 2%） */
  centerSnapThresholdPct?: number
  /** 旋轉 snap 門檻（角度，預設 5°） */
  rotationSnapThresholdDeg?: number
}

type PinchTarget = { textBlockId: string } | { stickerId: string }

interface PinchState {
  target: PinchTarget
  initDist: number
  initAngle: number
  initScale: number
  initRotation: number
}

type CanvasDragState =
  | {
    type: 'text'
    textBlockId: string
    startX: number
    startY: number
    initX: number
    initY: number
    halfWidthPct: number
    halfHeightPct: number
  }
  | {
    type: 'sticker'
    stickerId: string
    startX: number
    startY: number
    initX: number
    initY: number
    halfWidthPct: number
    halfHeightPct: number
  }

const EMPTY_AREA_SELECTORS = [
  '.p-editor__canvas-text',
  '.p-editor__sticker-content',
  'button'
]

const TEXT_AREA_SELECTORS = ['.p-editor__canvas-text']
/** 手指移動超過這個距離才算拖曳，以內算點一下（編輯框的刪除鈕也用這個值） */
export const DRAG_THRESHOLD_PX = 10
/**
 * 正在打字的文字區塊上，按住不動超過這個時間就算長按（交給瀏覽器移游標、選字），之後移動不算拖曳。
 * 要比系統的長按（iOS／Android 約 500ms）短：系統的放大鏡出來之後才搶著拖，兩邊會打架
 */
const TEXT_LONG_PRESS_MS = 400

/**
 * 畫布層級手勢：單指拖曳已選取物件、雙指縮放／旋轉（不改變位置）
 * 有選取時在空白處拖曳即可移動；雙指不需觸碰物件即可縮放旋轉。
 * 文字與貼紙不論是否已選取，按住就能直接拖（滑鼠也一樣）。
 * 滑鼠沒有雙指，改拖編輯框右下角的縮放旋轉鈕（onTransformHandlePointerDown）
 */
export function useCanvasPinch(options: UseCanvasPinchOptions) {
  const {
    canvasRef,
    drawMode,
    selectedTextBlockId,
    selectedStickerId,
    textBlocks,
    stickers,
    textBlockDragging,
    textBlockTransforming,
    draggingStickerId,
    transformingStickerId,
    onTextTransformEnd,
    onStickerTransformEnd,
    onTextDragEnd,
    onStickerDragEnd,
    onTextTap,
    onTextDragStart,
    onStickerPress,
    showVerticalCenterGuide,
    showHorizontalCenterGuide,
    centerSnapThresholdPct = 2,
    rotationSnapThresholdDeg = 5
  } = options

  let pinchState: PinchState | null = null
  let canvasDragState: CanvasDragState | null = null
  let pendingTextTouch: { startX: number; startY: number; blockId: string } | null = null
  const lastCanvasDragEndAt = ref(0)
  /** 雙指縮放／旋轉中：此期間不應因誤觸而切換選取其他物件 */
  const isTwoFingerGesture = ref(false)

  const hasSelection = () => {
    const id = selectedTextBlockId.value
    const block = id ? textBlocks.value.find(b => b.id === id) : undefined
    const hasUnlockedText = !!(block && !block.locked)
    return hasUnlockedText || selectedStickerId.value !== null
  }

  const clearCenterGuides = () => {
    if (showVerticalCenterGuide) showVerticalCenterGuide.value = false
    if (showHorizontalCenterGuide) showHorizontalCenterGuide.value = false
  }

  const isPointerOnEmptyArea = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement
    if (!el?.closest) return true
    return EMPTY_AREA_SELECTORS.every(sel => !el.closest(sel))
  }

  const isPointerOnTextArea = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement
    if (!el?.closest) return false
    return TEXT_AREA_SELECTORS.some(sel => el.closest(sel))
  }

  /** 從觸碰的 DOM 元素上提取 text block id */
  const getTextBlockIdFromTarget = (target: EventTarget | null): string | null => {
    const el = target as HTMLElement
    if (!el?.closest) return null
    const textEl = el.closest('[data-text-block-id]') as HTMLElement | null
    const id = textEl?.dataset.textBlockId ?? null
    if (!id) return null
    // 鎖定的文字區塊不啟動拖曳／縮放互動（僅能長按解鎖）
    const block = textBlocks.value.find(b => b.id === id)
    if (block?.locked) return null
    return id
  }

  /** 從觸碰的 DOM 元素上提取貼紙 id（畫布上的貼紙本體，不是編輯框）。貼紙只有 STEP 5 點得到 */
  const getStickerIdFromTarget = (target: EventTarget | null): string | null => {
    const el = target as HTMLElement
    if (!el?.closest) return null
    const stickerEl = el.closest('.p-editor__sticker-content[data-sticker-id]') as HTMLElement | null
    return stickerEl?.dataset.stickerId ?? null
  }

  const getSelectedBlock = (): TextBlockInstance | undefined => {
    const id = selectedTextBlockId.value
    return id ? textBlocks.value.find(b => b.id === id) : undefined
  }

  const getPinchTarget = (): PinchTarget | null => {
    const textId = selectedTextBlockId.value
    if (textId) {
      const block = textBlocks.value.find(b => b.id === textId)
      if (block && !block.locked) {
        return { textBlockId: textId }
      }
    }
    const id = selectedStickerId.value
    return id ? { stickerId: id } : null
  }

  const snapAngle = (angle: number): number => {
    const threshold = rotationSnapThresholdDeg
    if (threshold <= 0) return angle
    // 吸附到最近的 90 度倍數，保留原本的周次（-358 吸到 -360、-2 吸到 0）。
    // 原本先正規化到 0–360 再比，-2 會被當成 358 吸到「0」，結果多轉一圈變 -360
    const nearest = Math.round(angle / 90) * 90
    return Math.abs(angle - nearest) <= threshold ? nearest : angle
  }

  const applyPinch = (state: PinchState, scaleRatio: number, angleDelta: number) => {
    const scale = clamp(state.initScale * scaleRatio, SCALE_MIN, SCALE_MAX)
    const rotation = snapAngle(state.initRotation + angleDelta)
    if ('textBlockId' in state.target) {
      const target = state.target as { textBlockId: string }
      const block = textBlocks.value.find(b => b.id === target.textBlockId)
      if (block) {
        block.scale = scale
        block.rotation = rotation
      }
    } else {
      const s = stickers.value.find(st => st.id === (state.target as { stickerId: string }).stickerId)
      if (s) {
        s.scale = scale
        s.rotation = rotation
      }
    }
  }

  /**
   * 在「允許位置調整」的前提下，算出不超出畫布時允許的最大 scale。
   * 只要框的半寬/半高 <= 50%，就一定能找到一個位置讓整個框待在畫布裡。
   * 因此 maxScale 只由「框尺寸與畫布尺寸」決定，與目前 x/y 無關。
   */
  const getMaxScaleForBounds = (el: HTMLElement, target: PinchTarget): number => {
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return SCALE_MAX

    let currentScale: number, halfWidthPct: number, halfHeightPct: number

    if ('textBlockId' in target) {
      const block = textBlocks.value.find(b => b.id === target.textBlockId)
      if (!block) return SCALE_MAX
      currentScale = block.scale
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--text[data-text-block-id="${target.textBlockId}"]`
      ) as HTMLElement | null
      if (!frameEl) return SCALE_MAX
      const fr = frameEl.getBoundingClientRect()
      halfWidthPct = (fr.width / rect.width) * 50
      halfHeightPct = (fr.height / rect.height) * 50
    } else {
      const st = stickers.value.find(s => s.id === target.stickerId)
      if (!st) return SCALE_MAX
      currentScale = st.scale
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--sticker[data-sticker-id="${target.stickerId}"]`
      ) as HTMLElement | null
      if (!frameEl) return SCALE_MAX
      const fr = frameEl.getBoundingClientRect()
      halfWidthPct = (fr.width / rect.width) * 50
      halfHeightPct = (fr.height / rect.height) * 50
    }

    const eps = 1e-6
    // 框在目前 scale 下的半寬比例為 halfWidthPct，放大到 s 時會變成 halfWidthPct * (s / currentScale)
    // 限制在 <= 50%，即可保證左右仍可找到合法中心點；上下同理。
    const maxScaleX = halfWidthPct > eps ? (50 * currentScale) / halfWidthPct : SCALE_MAX
    const maxScaleY = halfHeightPct > eps ? (50 * currentScale) / halfHeightPct : SCALE_MAX
    return Math.min(maxScaleX, maxScaleY, SCALE_MAX)
  }

  /** 依目前 DOM 實際尺寸，強制把目標物完整限制在畫布內（給 pinch 縮放後使用） */
  const clampTargetWithinCanvas = (el: HTMLElement, target: PinchTarget) => {
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    if ('textBlockId' in target) {
      const id = target.textBlockId
      const block = textBlocks.value.find(b => b.id === id)
      if (!block) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--text[data-text-block-id="${id}"]`
      ) as HTMLElement | null
      if (!frameEl) return
      const fr = frameEl.getBoundingClientRect()
      const halfWidthPct = (fr.width / rect.width) * 50
      const halfHeightPct = (fr.height / rect.height) * 50
      const minX = halfWidthPct
      const maxX = 100 - halfWidthPct
      const minY = halfHeightPct
      const maxY = 100 - halfHeightPct
      block.x = clamp(block.x, minX, maxX)
      block.y = clamp(block.y, minY, maxY)
    } else {
      const id = target.stickerId
      const st = stickers.value.find(s => s.id === id)
      if (!st) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--sticker[data-sticker-id="${id}"]`
      ) as HTMLElement | null
      if (!frameEl) return
      const fr = frameEl.getBoundingClientRect()
      const halfWidthPct = (fr.width / rect.width) * 50
      const halfHeightPct = (fr.height / rect.height) * 50
      const minX = halfWidthPct
      const maxX = 100 - halfWidthPct
      const minY = halfHeightPct
      const maxY = 100 - halfHeightPct
      st.x = clamp(st.x, minX, maxX)
      st.y = clamp(st.y, minY, maxY)
    }
  }

  /**
   * 開始一次縮放旋轉，雙指捏合與編輯框的縮放旋轉鈕共用。
   * initDist／initAngle 是起始時「兩點」的距離與角度（雙指是兩根手指，縮放旋轉鈕是物件中心與鈕），
   * 之後每次 move 傳進新的距離與角度：距離變幾倍就放大幾倍，角度差多少就轉多少
   */
  const beginTransform = (el: HTMLElement, target: PinchTarget, initDist: number, initAngle: number) => {
    let initScale: number
    let initRotation: number
    if ('textBlockId' in target) {
      const block = textBlocks.value.find(b => b.id === target.textBlockId)
      if (!block) return null
      initScale = block.scale
      initRotation = block.rotation
      textBlockTransforming.value = true
    } else {
      const s = stickers.value.find(st => st.id === target.stickerId)
      if (!s) return null
      initScale = s.scale
      initRotation = s.rotation
      transformingStickerId.value = target.stickerId
    }
    const state: PinchState = { target, initDist, initAngle, initScale, initRotation }
    pinchState = state

    // 在開始時計算一次 maxScale（此值在過程中為常數，無需每 frame 重算）
    const cachedMaxScale = getMaxScaleForBounds(el, target)

    // RAF throttle：避免每個 move 都同步計算並更新 DOM
    let rafPending = false

    const move = (dist: number, angle: number) => {
      if (rafPending) return
      rafPending = true

      const scaleRatio = dist / state.initDist
      const angleDelta = (angle - state.initAngle) * RAD_TO_DEG
      const desiredScale = state.initScale * scaleRatio
      const effectiveScale = clamp(desiredScale, SCALE_MIN, Math.min(cachedMaxScale, SCALE_MAX))
      const effectiveRatio = effectiveScale / state.initScale

      requestAnimationFrame(() => {
        rafPending = false
        if (pinchState !== state) return
        applyPinch(state, effectiveRatio, angleDelta)
        clampTargetWithinCanvas(el, state.target)
      })
    }

    const end = () => {
      if (pinchState !== state) return
      if ('textBlockId' in state.target) {
        textBlockTransforming.value = false
        onTextTransformEnd()
      } else {
        transformingStickerId.value = null
        onStickerTransformEnd()
      }
      pinchState = null
    }

    return { move, end }
  }

  const attachPinchListeners = (el: HTMLElement, t0: Touch, t1: Touch) => {
    const target = getPinchTarget()
    if (!target) return

    const transform = beginTransform(
      el,
      target,
      Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1,
      Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX)
    )
    if (!transform) return

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      const a0 = e.touches[0]
      const a1 = e.touches[1]
      if (!a0 || !a1) return
      if (e.cancelable) e.preventDefault()
      transform.move(
        Math.hypot(a1.clientX - a0.clientX, a1.clientY - a0.clientY) || 1,
        Math.atan2(a1.clientY - a0.clientY, a1.clientX - a0.clientX)
      )
    }

    const onTouchEnd = () => {
      transform.end()
      isTwoFingerGesture.value = false
      el.removeEventListener('touchmove', onTouchMove, { capture: true })
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }

    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
  }

  const startCanvasDrag = (clientX: number, clientY: number, isTouch: boolean) => {
    const el = canvasRef.value
    if (!el) return
    clearCenterGuides()
    // 在拖曳開始時讀取一次 rect（避免在每個 touchmove 都觸發 forced layout）
    const cachedRect = el.getBoundingClientRect()
    if (!cachedRect.width || !cachedRect.height) return

    const getHalfSizePct = (frameEl: HTMLElement | null): { halfWidthPct: number; halfHeightPct: number } => {
      if (!frameEl) return { halfWidthPct: 5, halfHeightPct: 5 }
      const r = frameEl.getBoundingClientRect()
      return {
        halfWidthPct: (r.width / cachedRect.width) * 50,
        halfHeightPct: (r.height / cachedRect.height) * 50
      }
    }

    if (selectedTextBlockId.value) {
      const block = getSelectedBlock()
      // 鎖定的文字區塊不可被拖曳
      if (!block || block.locked) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--text[data-text-block-id="${block.id}"]`
      ) as HTMLElement | null
      const { halfWidthPct, halfHeightPct } = getHalfSizePct(frameEl)
      canvasDragState = {
        type: 'text',
        textBlockId: block.id,
        startX: clientX,
        startY: clientY,
        initX: block.x,
        initY: block.y,
        halfWidthPct,
        halfHeightPct
      }
      textBlockDragging.value = true
    } else if (selectedStickerId.value) {
      const s = stickers.value.find(st => st.id === selectedStickerId.value!)
      if (!s) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--sticker[data-sticker-id="${s.id}"]`
      ) as HTMLElement | null
      // 剛按下去才選取的貼紙，編輯框還沒顯示出來（v-show 下一輪才更新），量不到大小；
      // 改量畫布上的貼紙本體，兩者大小相同
      const sizeEl = frameEl?.getBoundingClientRect().width
        ? frameEl
        : el.querySelector(`.p-editor__sticker-content[data-sticker-id="${s.id}"]`) as HTMLElement | null
      const { halfWidthPct, halfHeightPct } = getHalfSizePct(sizeEl)
      canvasDragState = {
        type: 'sticker',
        stickerId: s.id,
        startX: clientX,
        startY: clientY,
        initX: s.x,
        initY: s.y,
        halfWidthPct,
        halfHeightPct
      }
      draggingStickerId.value = s.id
    } else return

    // RAF throttle：確保每幀最多更新一次，與螢幕刷新率同步（60fps）
    let dragRafPending = false

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasDragState || !el) return
      if ('touches' in e && e.touches.length >= 2) return

      if (dragRafPending) return
      dragRafPending = true

      const x = 'touches' in e ? e.touches[0]?.clientX ?? canvasDragState.startX : (e as MouseEvent).clientX
      const y = 'touches' in e ? e.touches[0]?.clientY ?? canvasDragState.startY : (e as MouseEvent).clientY
      // 使用拖曳開始時快取的 rect，避免 forced layout
      const deltaX = ((x - canvasDragState.startX) / cachedRect.width) * 100
      const deltaY = ((y - canvasDragState.startY) / cachedRect.height) * 100

      requestAnimationFrame(() => {
        dragRafPending = false
        if (!canvasDragState) return

        const center = 50
        const threshold = centerSnapThresholdPct

        const applyPosition = (pos: { x: number; y: number }, halfWidthPct: number, halfHeightPct: number) => {
          let { x, y } = pos

          // 垂直中心 snap
          if (Math.abs(x - center) <= threshold) {
            x = center
            if (showVerticalCenterGuide) showVerticalCenterGuide.value = true
          } else if (showVerticalCenterGuide) {
            showVerticalCenterGuide.value = false
          }

          // 水平中心 snap
          if (Math.abs(y - center) <= threshold) {
            y = center
            if (showHorizontalCenterGuide) showHorizontalCenterGuide.value = true
          } else if (showHorizontalCenterGuide) {
            showHorizontalCenterGuide.value = false
          }

          return {
            x: clamp(x, halfWidthPct, 100 - halfWidthPct),
            y: clamp(y, halfHeightPct, 100 - halfHeightPct)
          }
        }

        if (canvasDragState.type === 'text') {
          const block = textBlocks.value.find(b => b.id === (canvasDragState as any).textBlockId)
          if (block) {
            const next = applyPosition(
              {
                x: canvasDragState.initX + deltaX,
                y: canvasDragState.initY + deltaY
              },
              canvasDragState.halfWidthPct,
              canvasDragState.halfHeightPct
            )
            block.x = next.x
            block.y = next.y
          }
        } else if (canvasDragState.type === 'sticker') {
          const st = stickers.value.find(s => s.id === (canvasDragState as any).stickerId)
          if (st) {
            const next = applyPosition(
              {
                x: canvasDragState.initX + deltaX,
                y: canvasDragState.initY + deltaY
              },
              canvasDragState.halfWidthPct,
              canvasDragState.halfHeightPct
            )
            st.x = next.x
            st.y = next.y
          }
        }
      })
    }

    const onEnd = () => {
      if (canvasDragState) {
        lastCanvasDragEndAt.value = Date.now()
        clearCenterGuides()
        if (canvasDragState.type === 'text') {
          textBlockDragging.value = false
          onTextDragEnd()
        } else {
          draggingStickerId.value = null
          onStickerDragEnd()
        }
      }
      canvasDragState = null
      if (isTouch) {
        el.removeEventListener('touchmove', onMove as (e: TouchEvent) => void, { capture: true })
        el.removeEventListener('touchend', onEnd)
        el.removeEventListener('touchcancel', onEnd)
      } else {
        document.removeEventListener('mousemove', onMove as (e: MouseEvent) => void)
        document.removeEventListener('mouseup', onEnd)
      }
    }

    if (isTouch) {
      el.addEventListener('touchmove', onMove as (e: TouchEvent) => void, { capture: true, passive: false })
      el.addEventListener('touchend', onEnd)
      el.addEventListener('touchcancel', onEnd)
    } else {
      document.addEventListener('mousemove', onMove as (e: MouseEvent) => void)
      document.addEventListener('mouseup', onEnd)
    }
  }

    const onCanvasTouchStart = (e: TouchEvent) => {
    if (drawMode.value) return
    const el = canvasRef.value
    if (!el) return

    // 刪除 / 變形控制點、疊在畫布上的按鈕（data-canvas-control，例如右下角的全部重來）：
    // 交給各自元件處理，這裡不攔截，避免阻斷點擊事件
    const targetEl = e.target as HTMLElement | null
    if (targetEl?.closest('.p-editor__edit-frame-delete, .p-editor__edit-frame-transform-handle, [data-canvas-control]')) {
      return
    }

    if (e.touches.length === 1) {
      const t = e.touches[0]
      if (!t) return

      if (isPointerOnTextArea(e.target)) {
        const blockId = getTextBlockIdFromTarget(e.target)
        if (blockId) {
          // 不分「是否已選取」，一律比照貼紙邏輯：
          // - 單指 tap：選取文字區塊並進入編輯（由 onTextTap 處理）
          // - 單指拖曳：超過門檻後開始拖曳整個文字區塊
          // 例外是正在打字的那一塊（游標就在裡面）：touchstart 不攔，點一下定位游標、長按選字、
          // 叫出「貼上」選單都交給瀏覽器 —— 攔了這些就全部沒有，使用者沒辦法貼上別處複製的文字。
          // 這時照樣可以拖，但按住不動超過 TEXT_LONG_PRESS_MS 再移動，是在移游標或拉選取範圍，不算拖曳
          const textEl = (e.target as HTMLElement).closest('.p-editor__canvas-text')
          const isTyping = !!textEl && textEl === document.activeElement
          if (!isTyping && e.cancelable) e.preventDefault()
          e.stopPropagation()
          const pressedAt = e.timeStamp
          pendingTextTouch = { startX: t.clientX, startY: t.clientY, blockId }

          const detach = () => {
            el.removeEventListener('touchmove', onMove, { capture: true })
            el.removeEventListener('touchend', onEnd)
            el.removeEventListener('touchcancel', onEnd)
          }

          const onMove = (moveEvent: TouchEvent) => {
            if (!pendingTextTouch || !moveEvent.touches[0]) return
            const dx = moveEvent.touches[0].clientX - pendingTextTouch.startX
            const dy = moveEvent.touches[0].clientY - pendingTextTouch.startY
            if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return
            if (isTyping && moveEvent.timeStamp - pressedAt > TEXT_LONG_PRESS_MS) {
              pendingTextTouch = null
              detach()
              return
            }
            if (moveEvent.cancelable) moveEvent.preventDefault()
            onTextDragStart?.(pendingTextTouch.blockId)
            startCanvasDrag(pendingTextTouch.startX, pendingTextTouch.startY, true)
            pendingTextTouch = null
            detach()
          }

          const onEnd = () => {
            if (pendingTextTouch) {
              onTextTap?.(pendingTextTouch.blockId, pendingTextTouch.startX, pendingTextTouch.startY)
              pendingTextTouch = null
            }
            detach()
          }

          el.addEventListener('touchmove', onMove, { capture: true, passive: false })
          el.addEventListener('touchend', onEnd)
          el.addEventListener('touchcancel', onEnd)
          return
        }
      }

      // 按在貼紙上：選取它並直接開始拖（跟 IG 一樣按住就能拖，不必先點一下選取）。
      // 沒移動就放開也走這條，等於點一下選取
      const stickerId = getStickerIdFromTarget(e.target)
      if (stickerId && onStickerPress) {
        if (e.cancelable) e.preventDefault()
        e.stopPropagation()
        onStickerPress(stickerId)
        startCanvasDrag(t.clientX, t.clientY, true)
        return
      }

      if (hasSelection() && isPointerOnEmptyArea(e.target)) {
        if (e.cancelable) e.preventDefault()
        e.stopPropagation()
        startCanvasDrag(t.clientX, t.clientY, true)
      }
      return
    }

    if (e.touches.length !== 2) return
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (!t0 || !t1) return

    isTwoFingerGesture.value = true
    if (e.cancelable) e.preventDefault()
    e.stopPropagation()
    attachPinchListeners(el, t0, t1)
  }

  /** 補捉「先放一指再放第二指」時在 touchmove 才出現的雙指 */
  const onCanvasTouchMove = (e: TouchEvent) => {
    if (drawMode.value || pinchState) return
    if (e.touches.length !== 2 || !hasSelection()) return
    const el = canvasRef.value
    if (!el) return
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (!t0 || !t1) return

    isTwoFingerGesture.value = true
    if (e.cancelable) e.preventDefault()
    e.stopPropagation()
    attachPinchListeners(el, t0, t1)
  }

  const onCanvasTouchEnd = () => { }


  /**
   * 滑鼠按在文字上：跟觸控一樣（見 onCanvasTouchStart 的文字那段），移動超過門檻就拖整塊。
   * 沒移動就放開是一般的點擊，交給 click（selectTextBlock）。
   * 正在打字的那一塊 mousedown 不攔：點擊定位游標、拖選文字、右鍵的「貼上」都交給瀏覽器。
   * 這時一按下去就移動算拖整塊，按住不動超過 TEXT_LONG_PRESS_MS 才移動是在拖選文字
   */
  const startTextMousePress = (e: MouseEvent, blockId: string) => {
    const textEl = (e.target as HTMLElement).closest('.p-editor__canvas-text')
    const isTyping = !!textEl && textEl === document.activeElement
    if (!isTyping) e.preventDefault()
    const { clientX: startX, clientY: startY, timeStamp: pressedAt } = e

    const detach = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', detach)
    }

    const onMove = (moveEvent: MouseEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= DRAG_THRESHOLD_PX) return
      detach()
      if (isTyping && moveEvent.timeStamp - pressedAt > TEXT_LONG_PRESS_MS) return
      // 打字中按下去時瀏覽器已經開始拖選文字：文字被便利貼邊緣擋住、滑鼠繼續走的話會一路反白。
      // 選取是在 mousemove 之後才延伸的，所以排到下一幀、畫出來之前收成游標
      // （中途才加 user-select: none 擋不住，Chrome 照樣延伸）
      if (isTyping) {
        const collapseSelection = () => requestAnimationFrame(() => {
          const sel = window.getSelection()
          if (sel && !sel.isCollapsed) sel.collapseToEnd()
        })
        document.addEventListener('mousemove', collapseSelection)
        document.addEventListener('mouseup', () => document.removeEventListener('mousemove', collapseSelection), { once: true })
      }
      onTextDragStart?.(blockId)
      startCanvasDrag(startX, startY, false)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', detach)
  }

  /**
   * 編輯框右下角的縮放旋轉鈕（只有滑鼠的裝置才顯示，手機用雙指，見 _editor.scss）。
   * 圓心是物件中心：鈕離中心的距離變幾倍就放大幾倍，繞著中心轉多少就轉多少。
   * 上下限、不超出便利貼、接近正角度時吸附都跟雙指一樣（共用 beginTransform）
   */
  const onTransformHandlePointerDown = (e: PointerEvent, target: PinchTarget) => {
    if (e.button !== 0 || pinchState) return
    const el = canvasRef.value
    const frameEl = (e.currentTarget as HTMLElement | null)?.closest('.p-editor__edit-frame')
    if (!el || !frameEl) return
    // 也擋掉接在後面的相容 mousedown：不會開始選字，編輯框的拖曳也不會跟著啟動
    e.preventDefault()

    // 旋轉不會移動中心點：轉過之後的外接矩形，中心仍是物件的中心
    const fr = frameEl.getBoundingClientRect()
    const cx = fr.left + fr.width / 2
    const cy = fr.top + fr.height / 2
    const transform = beginTransform(
      el,
      target,
      Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
      Math.atan2(e.clientY - cy, e.clientX - cx)
    )
    if (!transform) return
    const { pointerId } = e

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      transform.move(
        Math.hypot(moveEvent.clientX - cx, moveEvent.clientY - cy) || 1,
        Math.atan2(moveEvent.clientY - cy, moveEvent.clientX - cx)
      )
    }

    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return
      transform.end()
      // 放開時游標可能已在便利貼外，接著的 click 落在畫布上會取消選取（見 deselectAll）
      lastCanvasDragEndAt.value = Date.now()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  const onCanvasMouseDown = (e: MouseEvent) => {
    if (drawMode.value) return
    // 只管左鍵：右鍵留給瀏覽器開選單（文字上的「貼上」在那裡）
    if (e.button !== 0) return
    // 疊在畫布上的按鈕不當成拖曳的起點（同 onCanvasTouchStart）
    if ((e.target as HTMLElement | null)?.closest('[data-canvas-control]')) return
    if (isPointerOnTextArea(e.target)) {
      const blockId = getTextBlockIdFromTarget(e.target)
      if (blockId) {
        startTextMousePress(e, blockId)
        return
      }
    }
    // 按在貼紙上：選取並直接開始拖（同 onCanvasTouchStart）
    const stickerId = getStickerIdFromTarget(e.target)
    if (stickerId && onStickerPress) {
      e.preventDefault()
      onStickerPress(stickerId)
      startCanvasDrag(e.clientX, e.clientY, false)
      return
    }
    if (!hasSelection()) return
    if (!isPointerOnEmptyArea(e.target)) return
    e.preventDefault()
    startCanvasDrag(e.clientX, e.clientY, false)
  }

  return {
    onCanvasTouchStart,
    onCanvasTouchMove,
    onCanvasTouchEnd,
    onCanvasMouseDown,
    onTransformHandlePointerDown,
    lastCanvasDragEndAt,
    isTwoFingerGesture
  }
}
