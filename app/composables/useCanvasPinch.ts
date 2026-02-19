import type { Ref } from 'vue'
import type { StickerInstance } from '~/types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface UseCanvasPinchOptions {
  canvasRef: Ref<HTMLElement | null>
  drawMode: Ref<boolean>
  isTextEditMode: Ref<boolean>
  selectedStickerId: Ref<string | null>
  stickers: Ref<StickerInstance[]>
  textScale: Ref<number>
  textRotation: Ref<number>
  textBlockTransforming: Ref<boolean>
  transformingStickerId: Ref<string | null>
  onTextTransformEnd: () => void
  onStickerTransformEnd: () => void
}

/**
 * 畫布層級雙指縮放：只要在畫面上有雙指即縮放旋轉「已選取」的物件
 * 不需觸碰物件本身，成功率更高
 */
export function useCanvasPinch(options: UseCanvasPinchOptions) {
  const {
    canvasRef,
    drawMode,
    isTextEditMode,
    selectedStickerId,
    stickers,
    textScale,
    textRotation,
    textBlockTransforming,
    transformingStickerId,
    onTextTransformEnd,
    onStickerTransformEnd
  } = options

  type PinchTarget = 'text' | { stickerId: string }
  let pinchState: {
    target: PinchTarget
    initDist: number
    initAngle: number
    initScale: number
    initRotation: number
  } | null = null

  const hasSelection = () => isTextEditMode.value || selectedStickerId.value !== null

  const onCanvasTouchStart = (e: TouchEvent) => {
    if (drawMode.value || e.touches.length !== 2 || !hasSelection()) return
    const el = canvasRef.value
    if (!el) return

    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (!t0 || !t1) return

    const target: PinchTarget | null = isTextEditMode.value
      ? 'text'
      : selectedStickerId.value
        ? { stickerId: selectedStickerId.value }
        : null
    if (!target) return

    e.preventDefault()
    e.stopPropagation()

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
    } else {
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

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 2 || !pinchState) return
      const t0m = moveEvent.touches[0]
      const t1m = moveEvent.touches[1]
      if (!t0m || !t1m) return
      moveEvent.preventDefault()

      const d = Math.hypot(t1m.clientX - t0m.clientX, t1m.clientY - t0m.clientY) || 1
      const a = Math.atan2(t1m.clientY - t0m.clientY, t1m.clientX - t0m.clientX)
      const scaleRatio = d / pinchState.initDist
      const angleDelta = (a - pinchState.initAngle) * (180 / Math.PI)

      if (pinchState.target === 'text') {
        textScale.value = clamp(pinchState.initScale * scaleRatio, 0.3, 3)
        textRotation.value = pinchState.initRotation + angleDelta
      } else {
        const s = stickers.value.find(st => st.id === pinchState!.target.stickerId)
        if (s) {
          s.scale = clamp(pinchState.initScale * scaleRatio, 0.3, 3)
          s.rotation = pinchState.initRotation + angleDelta
        }
      }
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

  /** touchmove 時才偵測到 2 指（1 指先放、再加第 2 指） */
  const onCanvasTouchMove = (e: TouchEvent) => {
    if (drawMode.value || pinchState) return
    if (e.touches.length !== 2 || !hasSelection()) return
    const el = canvasRef.value
    if (!el) return

    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (!t0 || !t1) return

    const target: PinchTarget | null = isTextEditMode.value
      ? 'text'
      : selectedStickerId.value
        ? { stickerId: selectedStickerId.value }
        : null
    if (!target) return

    e.preventDefault()
    e.stopPropagation()

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
    } else {
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

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 2 || !pinchState) return
      const t0m = moveEvent.touches[0]
      const t1m = moveEvent.touches[1]
      if (!t0m || !t1m) return
      moveEvent.preventDefault()

      const d = Math.hypot(t1m.clientX - t0m.clientX, t1m.clientY - t0m.clientY) || 1
      const a = Math.atan2(t1m.clientY - t0m.clientY, t1m.clientX - t0m.clientX)
      const scaleRatio = d / pinchState.initDist
      const angleDelta = (a - pinchState.initAngle) * (180 / Math.PI)

      if (pinchState.target === 'text') {
        textScale.value = clamp(pinchState.initScale * scaleRatio, 0.3, 3)
        textRotation.value = pinchState.initRotation + angleDelta
      } else {
        const s = stickers.value.find(st => st.id === pinchState!.target.stickerId)
        if (s) {
          s.scale = clamp(pinchState.initScale * scaleRatio, 0.3, 3)
          s.rotation = pinchState.initRotation + angleDelta
        }
      }
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

  const onCanvasTouchEnd = () => {
    // pinchState 由 touchend 的 cleanup 清除，這裡僅作備援
  }

  return {
    onCanvasTouchStart,
    onCanvasTouchMove,
    onCanvasTouchEnd
  }
}
