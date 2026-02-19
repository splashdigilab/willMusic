import { ref } from 'vue'
import type { Ref } from 'vue'
import type { StickerInstance } from '~/types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const SCALE_MIN = 0.3
const SCALE_MAX = 3
const RAD_TO_DEG = 180 / Math.PI

export interface UseCanvasPinchOptions {
  canvasRef: Ref<HTMLElement | null>
  drawMode: Ref<boolean>
  isTextEditMode: Ref<boolean>
  selectedStickerId: Ref<string | null>
  stickers: Ref<StickerInstance[]>
  textX: Ref<number>
  textY: Ref<number>
  textScale: Ref<number>
  textRotation: Ref<number>
  textBlockDragging: Ref<boolean>
  textBlockTransforming: Ref<boolean>
  draggingStickerId: Ref<string | null>
  transformingStickerId: Ref<string | null>
  onTextTransformEnd: () => void
  onStickerTransformEnd: () => void
  onTextDragEnd: () => void
  onStickerDragEnd: () => void
  /** 單擊文字區塊時呼叫（聚焦、可打字） */
  onTextTap?: () => void
  /** 在文字區塊上開始拖曳前呼叫（選取文字區塊，不聚焦） */
  onTextDragStart?: () => void
}

type PinchTarget = 'text' | { stickerId: string }

interface PinchState {
  target: PinchTarget
  initDist: number
  initAngle: number
  initScale: number
  initRotation: number
}

type CanvasDragState =
  | { type: 'text'; startX: number; startY: number; initX: number; initY: number }
  | { type: 'sticker'; stickerId: string; startX: number; startY: number; initX: number; initY: number }

const EMPTY_AREA_SELECTORS = [
  '.p-editor__edit-frame',
  '.p-editor__canvas-text',
  '.p-editor__sticker-content',
  'button'
]

const TEXT_AREA_SELECTORS = ['.p-editor__canvas-text', '.p-editor__edit-frame--text']
const DRAG_THRESHOLD_PX = 10

/**
 * 畫布層級手勢：單指拖曳已選取物件、雙指縮放／旋轉（不改變位置）
 * 有選取時在空白處拖曳即可移動；雙指不需觸碰物件即可縮放旋轉
 */
export function useCanvasPinch(options: UseCanvasPinchOptions) {
  const {
    canvasRef,
    drawMode,
    isTextEditMode,
    selectedStickerId,
    stickers,
    textX,
    textY,
    textScale,
    textRotation,
    textBlockDragging,
    textBlockTransforming,
    draggingStickerId,
    transformingStickerId,
    onTextTransformEnd,
    onStickerTransformEnd,
    onTextDragEnd,
    onStickerDragEnd,
    onTextTap,
    onTextDragStart
  } = options

  let pinchState: PinchState | null = null
  let canvasDragState: CanvasDragState | null = null
  let pendingTextTouch: { startX: number; startY: number } | null = null
  const lastCanvasDragEndAt = ref(0)

  const hasSelection = () => isTextEditMode.value || selectedStickerId.value !== null

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

  const getPinchTarget = (): PinchTarget | null => {
    if (isTextEditMode.value) return 'text'
    const id = selectedStickerId.value
    return id ? { stickerId: id } : null
  }

  const applyPinch = (state: PinchState, scaleRatio: number, angleDelta: number) => {
    const scale = clamp(state.initScale * scaleRatio, SCALE_MIN, SCALE_MAX)
    const rotation = state.initRotation + angleDelta
    if (state.target === 'text') {
      textScale.value = scale
      textRotation.value = rotation
    } else {
      const target = state.target
      if ('stickerId' in target) {
        const s = stickers.value.find(st => st.id === target.stickerId)
        if (s) {
          s.scale = scale
          s.rotation = rotation
        }
      }
    }
  }

  const attachPinchListeners = (el: HTMLElement, t0: Touch, t1: Touch) => {
    const target = getPinchTarget()
    if (!target) return

    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1
    const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX)

    if (target === 'text') {
      pinchState = {
        target: 'text',
        initDist: dist,
        initAngle: angle,
        initScale: textScale.value,
        initRotation: textRotation.value
      }
      textBlockTransforming.value = true
    } else if ('stickerId' in target) {
      const s = stickers.value.find(st => st.id === target.stickerId)
      if (!s) return
      pinchState = {
        target: { stickerId: target.stickerId },
        initDist: dist,
        initAngle: angle,
        initScale: s.scale,
        initRotation: s.rotation
      }
      transformingStickerId.value = target.stickerId
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchState) return
      const a0 = e.touches[0]
      const a1 = e.touches[1]
      if (!a0 || !a1) return
      e.preventDefault()
      const d = Math.hypot(a1.clientX - a0.clientX, a1.clientY - a0.clientY) || 1
      const a = Math.atan2(a1.clientY - a0.clientY, a1.clientX - a0.clientX)
      const scaleRatio = d / pinchState.initDist
      const angleDelta = (a - pinchState.initAngle) * RAD_TO_DEG
      applyPinch(pinchState, scaleRatio, angleDelta)
    }

    const onTouchEnd = () => {
      if (pinchState) {
        if (pinchState.target === 'text') {
          textBlockTransforming.value = false
          onTextTransformEnd()
        } else {
          transformingStickerId.value = null
          onStickerTransformEnd()
        }
      }
      pinchState = null
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
    if (isTextEditMode.value) {
      canvasDragState = {
        type: 'text',
        startX: clientX,
        startY: clientY,
        initX: textX.value,
        initY: textY.value
      }
      textBlockDragging.value = true
    } else if (selectedStickerId.value) {
      const s = stickers.value.find(st => st.id === selectedStickerId.value!)
      if (!s) return
      canvasDragState = {
        type: 'sticker',
        stickerId: s.id,
        startX: clientX,
        startY: clientY,
        initX: s.x,
        initY: s.y
      }
      draggingStickerId.value = s.id
    } else return

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasDragState || !el) return
      if ('touches' in e && e.touches.length >= 2) return
      const rect = el.getBoundingClientRect()
      const x = 'touches' in e ? e.touches[0]?.clientX ?? canvasDragState.startX : (e as MouseEvent).clientX
      const y = 'touches' in e ? e.touches[0]?.clientY ?? canvasDragState.startY : (e as MouseEvent).clientY
      const deltaX = ((x - canvasDragState.startX) / rect.width) * 100
      const deltaY = ((y - canvasDragState.startY) / rect.height) * 100
      if (canvasDragState.type === 'text') {
        textX.value = clamp(canvasDragState.initX + deltaX, -30, 130)
        textY.value = clamp(canvasDragState.initY + deltaY, -30, 130)
      } else if (canvasDragState.type === 'sticker') {
        const state = canvasDragState
        const st = stickers.value.find(s => s.id === state.stickerId)
        if (st) {
          st.x = clamp(state.initX + deltaX, 5, 95)
          st.y = clamp(state.initY + deltaY, 5, 95)
        }
      }
    }

    const onEnd = () => {
      if (canvasDragState) {
        lastCanvasDragEndAt.value = Date.now()
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

    if (e.touches.length === 1) {
      const t = e.touches[0]
      if (!t) return

      if (isPointerOnTextArea(e.target)) {
        e.preventDefault()
        e.stopPropagation()
        pendingTextTouch = { startX: t.clientX, startY: t.clientY }

        const onMove = (moveEvent: TouchEvent) => {
          if (!pendingTextTouch || !moveEvent.touches[0]) return
          const dx = moveEvent.touches[0].clientX - pendingTextTouch.startX
          const dy = moveEvent.touches[0].clientY - pendingTextTouch.startY
          if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return
          moveEvent.preventDefault()
          onTextDragStart?.()
          startCanvasDrag(pendingTextTouch.startX, pendingTextTouch.startY, true)
          pendingTextTouch = null
          el.removeEventListener('touchmove', onMove, { capture: true })
          el.removeEventListener('touchend', onEnd)
          el.removeEventListener('touchcancel', onEnd)
        }

        const onEnd = () => {
          if (pendingTextTouch) {
            onTextTap?.()
            pendingTextTouch = null
          }
          el.removeEventListener('touchmove', onMove, { capture: true })
          el.removeEventListener('touchend', onEnd)
          el.removeEventListener('touchcancel', onEnd)
        }

        el.addEventListener('touchmove', onMove, { capture: true, passive: false })
        el.addEventListener('touchend', onEnd)
        el.addEventListener('touchcancel', onEnd)
        return
      }

      if (hasSelection() && isPointerOnEmptyArea(e.target)) {
        e.preventDefault()
        e.stopPropagation()
        startCanvasDrag(t.clientX, t.clientY, true)
      }
      return
    }

    if (e.touches.length !== 2) return
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (!t0 || !t1) return

    e.preventDefault()
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

    e.preventDefault()
    e.stopPropagation()
    attachPinchListeners(el, t0, t1)
  }

  const onCanvasTouchEnd = () => {}

  const onCanvasMouseDown = (e: MouseEvent) => {
    if (drawMode.value || !hasSelection()) return
    if (!isPointerOnEmptyArea(e.target)) return
    e.preventDefault()
    startCanvasDrag(e.clientX, e.clientY, false)
  }

  return {
    onCanvasTouchStart,
    onCanvasTouchMove,
    onCanvasTouchEnd,
    onCanvasMouseDown,
    lastCanvasDragEndAt
  }
}
