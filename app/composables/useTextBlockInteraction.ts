import type { Ref } from 'vue'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface UseTextBlockInteractionOptions {
  canvasRef: Ref<HTMLElement | null>
  textX: Ref<number>
  textY: Ref<number>
  textScale: Ref<number>
  textRotation: Ref<number>
  textBlockDragging: Ref<boolean>
  textBlockTransforming: Ref<boolean>
  selectTextBlock: () => void
  onDragEnd: () => void
  onTransformEnd: () => void
}

/**
 * 文字區塊拖曳與旋轉縮放互動邏輯
 */
export function useTextBlockInteraction(options: UseTextBlockInteractionOptions) {
  const {
    canvasRef,
    textX,
    textY,
    textScale,
    textRotation,
    textBlockDragging,
    textBlockTransforming,
    selectTextBlock,
    onDragEnd,
    onTransformEnd
  } = options

  const setupDrag = (
    startX: number,
    startY: number,
    initX: number,
    initY: number,
    isTouch: boolean
  ) => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasRef.value) return
      const rect = canvasRef.value.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? startX : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY ?? startY : e.clientY
      const deltaX = ((clientX - startX) / rect.width) * 100
      const deltaY = ((clientY - startY) / rect.height) * 100
      textX.value = clamp(initX + deltaX, 5, 95)
      textY.value = clamp(initY + deltaY, 5, 95)
    }

    const onEnd = () => {
      textBlockDragging.value = false
      onDragEnd()
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, isTouch ? { capture: true } : undefined)
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any, isTouch ? undefined : undefined)
    }

    const addOpts = isTouch ? { capture: true, passive: false } : {}
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, addOpts)
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any)
  }

  const setupTransform = (
    centerX: number,
    centerY: number,
    cursorX: number,
    cursorY: number,
    initScale: number,
    initRotation: number,
    isTouch: boolean
  ) => {
    const dx = cursorX - centerX
    const dy = cursorY - centerY
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasRef.value) return
      const r = canvasRef.value.getBoundingClientRect()
      const curX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) - r.left : e.clientX - r.left
      const curY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) - r.top : e.clientY - r.top
      const cx = r.width * (textX.value / 100)
      const cy = r.height * (textY.value / 100)
      const ndx = curX - cx
      const ndy = curY - cy
      const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
      const newAngle = Math.atan2(ndy, ndx)
      const scaleRatio = newDist / distance
      const angleDelta = (newAngle - angle) * (180 / Math.PI)
      textScale.value = clamp(initScale * scaleRatio, 0.3, 3)
      textRotation.value = initRotation + angleDelta
    }

    const onEnd = () => {
      textBlockTransforming.value = false
      onTransformEnd()
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, isTouch ? { capture: true } : undefined)
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any, isTouch ? undefined : undefined)
    }

    const addOpts = isTouch ? { capture: true, passive: false } : {}
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, addOpts)
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any)
  }

  const onTextBlockDragBarMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    selectTextBlock()
    textBlockDragging.value = true
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return
    setupDrag(e.clientX, e.clientY, textX.value, textY.value, false)
  }

  const onTextBlockDragBarTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    e.preventDefault()
    selectTextBlock()
    textBlockDragging.value = true
    setupDrag(touch.clientX, touch.clientY, textX.value, textY.value, true)
  }

  const onTextBlockTransformMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    if (!canvasRef.value) return
    textBlockTransforming.value = true
    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (textX.value / 100)
    const centerY = rect.height * (textY.value / 100)
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top
    setupTransform(centerX, centerY, cursorX, cursorY, textScale.value, textRotation.value, false)
  }

  const onTextBlockTransformTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch || !canvasRef.value) return
    e.preventDefault()
    textBlockTransforming.value = true
    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (textX.value / 100)
    const centerY = rect.height * (textY.value / 100)
    const cursorX = touch.clientX - rect.left
    const cursorY = touch.clientY - rect.top
    setupTransform(centerX, centerY, cursorX, cursorY, textScale.value, textRotation.value, true)
  }

  const setupPinch = (
    touch1: { clientX: number; clientY: number } | undefined,
    touch2: { clientX: number; clientY: number } | undefined,
    initScale: number,
    initRotation: number,
    centerX: number,
    centerY: number
  ) => {
    const getMidpoint = (t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    })
    const getDistance = (t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) =>
      Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2) || 1
    const getAngle = (t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) =>
      Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX)

    if (!touch1 || !touch2) return
    const initialDistance = getDistance(touch1, touch2)
    const initialAngle = getAngle(touch1, touch2)

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!canvasRef.value || moveEvent.touches.length < 2) return
      const mt1 = moveEvent.touches[0]
      const mt2 = moveEvent.touches[1]
      moveEvent.preventDefault()
      const newDist = getDistance(mt1, mt2)
      const newAngle = getAngle(mt1, mt2)
      const scaleRatio = newDist / initialDistance
      const angleDelta = (newAngle - initialAngle) * (180 / Math.PI)
      textScale.value = clamp(initScale * scaleRatio, 0.3, 3)
      textRotation.value = initRotation + angleDelta
    }

    const onTouchEnd = () => {
      textBlockTransforming.value = false
      onTransformEnd()
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  const onTextBlockPinchTouchStart = (e: TouchEvent) => {
    const t1 = e.touches[0]
    const t2 = e.touches[1]
    if (!t1 || !t2 || !canvasRef.value) return
    e.preventDefault()
    selectTextBlock()
    textBlockTransforming.value = true
    const rect = canvasRef.value.getBoundingClientRect()
    setupPinch(
      t1,
      t2,
      textScale.value,
      textRotation.value,
      rect.left + rect.width * (textX.value / 100),
      rect.top + rect.height * (textY.value / 100)
    )
  }

  return {
    onTextBlockDragBarMouseDown,
    onTextBlockDragBarTouchStart,
    onTextBlockTransformMouseDown,
    onTextBlockTransformTouchStart,
    onTextBlockPinchTouchStart
  }
}
