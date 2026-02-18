import type { Ref } from 'vue'
import type { StickerInstance } from '~/types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface UseStickerInteractionOptions {
  canvasRef: Ref<HTMLElement | null>
  stickers: Ref<StickerInstance[]>
  selectedStickerId: Ref<string | null>
  draggingStickerId: Ref<string | null>
  transformingStickerId: Ref<string | null>
  selectSticker: (id: string) => void
  onDragEnd: () => void
  onTransformEnd: () => void
}

/**
 * 貼紙拖曳與旋轉縮放互動邏輯
 */
export function useStickerInteraction(options: UseStickerInteractionOptions) {
  const {
    canvasRef,
    stickers,
    selectedStickerId,
    draggingStickerId,
    transformingStickerId,
    selectSticker,
    onDragEnd,
    onTransformEnd
  } = options

  let dragState: { stickerId: string; startX: number; startY: number; initialX: number; initialY: number } | null = null
  let transformState: {
    stickerId: string
    centerX: number
    centerY: number
    initialDistance: number
    initialAngle: number
    initialScale: number
    initialRotation: number
  } | null = null

  const onStickerMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
    if ((e.target as HTMLElement).closest('.p-editor__edit-frame-delete, .p-editor__edit-frame-transform-handle')) return
    e.preventDefault()
    selectSticker(sticker.id)
    dragState = {
      stickerId: sticker.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: sticker.x,
      initialY: sticker.y
    }
    draggingStickerId.value = sticker.id

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragState || !canvasRef.value) return
      const rect = canvasRef.value.getBoundingClientRect()
      const deltaX = ((moveEvent.clientX - dragState.startX) / rect.width) * 100
      const deltaY = ((moveEvent.clientY - dragState.startY) / rect.height) * 100
      const s = stickers.value.find(st => st.id === dragState!.stickerId)
      if (s) {
        s.x = clamp(dragState.initialX + deltaX, 5, 95)
        s.y = clamp(dragState.initialY + deltaY, 5, 95)
      }
    }

    const onMouseUp = () => {
      if (dragState) onDragEnd()
      dragState = null
      draggingStickerId.value = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onStickerTouchStart = (e: TouchEvent, sticker: StickerInstance) => {
    if ((e.target as HTMLElement).closest('.p-editor__edit-frame-delete, .p-editor__edit-frame-transform-handle')) return
    if (e.touches.length >= 2) {
      onStickerPinchTouchStart(e, sticker)
      return
    }
    const touch = e.touches[0]
    if (!touch) return
    selectSticker(sticker.id)
    dragState = {
      stickerId: sticker.id,
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: sticker.x,
      initialY: sticker.y
    }
    draggingStickerId.value = sticker.id

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!dragState || !canvasRef.value || !moveEvent.touches[0]) return
      if (moveEvent.touches.length >= 2) return
      moveEvent.preventDefault()
      const t = moveEvent.touches[0]
      const rect = canvasRef.value.getBoundingClientRect()
      const deltaX = ((t.clientX - dragState.startX) / rect.width) * 100
      const deltaY = ((t.clientY - dragState.startY) / rect.height) * 100
      const s = stickers.value.find(st => st.id === dragState!.stickerId)
      if (s) {
        s.x = clamp(dragState.initialX + deltaX, 5, 95)
        s.y = clamp(dragState.initialY + deltaY, 5, 95)
      }
    }

    const onTouchEnd = () => {
      if (dragState) onDragEnd()
      dragState = null
      draggingStickerId.value = null
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  const onStickerPinchTouchStart = (e: TouchEvent, sticker: StickerInstance) => {
    if (e.touches.length < 2 || !canvasRef.value) return
    e.preventDefault()
    selectSticker(sticker.id)
    dragState = null
    draggingStickerId.value = null

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2) || 1
    const getAngle = (t1: Touch, t2: Touch) =>
      Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX)

    const t1 = e.touches[0]
    const t2 = e.touches[1]
    if (!t1 || !t2) return
    const initialDistance = getDistance(t1, t2)
    const initialAngle = getAngle(t1, t2)

    transformState = {
      stickerId: sticker.id,
      centerX: sticker.x,
      centerY: sticker.y,
      initialDistance,
      initialAngle,
      initialScale: sticker.scale,
      initialRotation: sticker.rotation
    }
    transformingStickerId.value = sticker.id

    const onTouchMove = (moveEvent: TouchEvent) => {
      const mt1 = moveEvent.touches[0]
      const mt2 = moveEvent.touches[1]
      if (!transformState || !canvasRef.value || !mt1 || !mt2) return
      moveEvent.preventDefault()
      const newDist = getDistance(mt1, mt2)
      const newAngle = getAngle(mt1, mt2)
      const scaleRatio = newDist / transformState.initialDistance
      const angleDelta = (newAngle - transformState.initialAngle) * (180 / Math.PI)
      const s = stickers.value.find(st => st.id === transformState!.stickerId)
      if (s) {
        s.scale = clamp(transformState.initialScale * scaleRatio, 0.3, 3)
        s.rotation = transformState.initialRotation + angleDelta
      }
    }

    const onTouchEnd = () => {
      if (transformState) onTransformEnd()
      transformState = null
      transformingStickerId.value = null
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  const onStickerClick = (id: string) => {
    if (draggingStickerId.value || transformingStickerId.value) return
    selectSticker(id)
  }

  const onTransformHandleMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
    e.preventDefault()
    if (!canvasRef.value) return

    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (sticker.x / 100)
    const centerY = rect.height * (sticker.y / 100)
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top
    const dx = cursorX - centerX
    const dy = cursorY - centerY
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)

    transformState = {
      stickerId: sticker.id,
      centerX: sticker.x,
      centerY: sticker.y,
      initialDistance: distance,
      initialAngle: angle,
      initialScale: sticker.scale,
      initialRotation: sticker.rotation
    }
    transformingStickerId.value = sticker.id

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!transformState || !canvasRef.value) return
      const r = canvasRef.value.getBoundingClientRect()
      const curX = moveEvent.clientX - r.left
      const curY = moveEvent.clientY - r.top
      const cx = r.width * (transformState.centerX / 100)
      const cy = r.height * (transformState.centerY / 100)
      const ndx = curX - cx
      const ndy = curY - cy
      const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
      const newAngle = Math.atan2(ndy, ndx)
      const scaleRatio = newDist / transformState.initialDistance
      const angleDelta = (newAngle - transformState.initialAngle) * (180 / Math.PI)
      const s = stickers.value.find(st => st.id === transformState!.stickerId)
      if (s) {
        s.scale = clamp(transformState.initialScale * scaleRatio, 0.3, 3)
        s.rotation = transformState.initialRotation + angleDelta
      }
    }

    const onMouseUp = () => {
      if (transformState) onTransformEnd()
      transformState = null
      transformingStickerId.value = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onTransformHandleTouchStart = (e: TouchEvent, sticker: StickerInstance) => {
    const touch = e.touches[0]
    if (!touch || !canvasRef.value) return
    e.preventDefault()

    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (sticker.x / 100)
    const centerY = rect.height * (sticker.y / 100)
    const cursorX = touch.clientX - rect.left
    const cursorY = touch.clientY - rect.top
    const dx = cursorX - centerX
    const dy = cursorY - centerY
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)

    transformState = {
      stickerId: sticker.id,
      centerX: sticker.x,
      centerY: sticker.y,
      initialDistance: distance,
      initialAngle: angle,
      initialScale: sticker.scale,
      initialRotation: sticker.rotation
    }
    transformingStickerId.value = sticker.id

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!transformState || !canvasRef.value || !moveEvent.touches[0]) return
      moveEvent.preventDefault()
      const t = moveEvent.touches[0]
      const r = canvasRef.value.getBoundingClientRect()
      const curX = t.clientX - r.left
      const curY = t.clientY - r.top
      const cx = r.width * (transformState.centerX / 100)
      const cy = r.height * (transformState.centerY / 100)
      const ndx = curX - cx
      const ndy = curY - cy
      const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
      const newAngle = Math.atan2(ndy, ndx)
      const scaleRatio = newDist / transformState.initialDistance
      const angleDelta = (newAngle - transformState.initialAngle) * (180 / Math.PI)
      const s = stickers.value.find(st => st.id === transformState!.stickerId)
      if (s) {
        s.scale = clamp(transformState.initialScale * scaleRatio, 0.3, 3)
        s.rotation = transformState.initialRotation + angleDelta
      }
    }

    const onTouchEnd = () => {
      if (transformState) onTransformEnd()
      transformState = null
      transformingStickerId.value = null
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  return {
    onStickerMouseDown,
    onStickerTouchStart,
    onStickerPinchTouchStart,
    onStickerClick,
    onTransformHandleMouseDown,
    onTransformHandleTouchStart
  }
}
