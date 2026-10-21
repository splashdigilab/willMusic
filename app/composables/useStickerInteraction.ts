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
  /** 雙指手勢中時不切換選取（由 useCanvasPinch 提供） */
  isTwoFingerGesture?: Ref<boolean>
}

/**
 * 貼紙編輯框的拖曳。縮放旋轉（雙指、縮放旋轉鈕）在 useCanvasPinch
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
    isTwoFingerGesture
  } = options

  let dragState: { stickerId: string; startX: number; startY: number; initialX: number; initialY: number } | null = null

  const onStickerMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
    // 只管左鍵：右鍵留給瀏覽器開選單（同 useCanvasPinch 的 onCanvasMouseDown）
    if (e.button !== 0) return
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
    if (isTwoFingerGesture?.value) return
    const touch = e.touches[0]
    if (!touch || e.touches.length > 1) return
    selectSticker(sticker.id)
    dragState = {
      stickerId: sticker.id,
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: sticker.x,
      initialY: sticker.y
    }
    draggingStickerId.value = sticker.id

    const el = canvasRef.value
    if (!el) return

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!dragState || !moveEvent.touches[0] || moveEvent.touches.length > 1) return
      if (moveEvent.touches.length === 1 && canvasRef.value) {
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
    }

    const onTouchEnd = () => {
      if (dragState) onDragEnd()
      dragState = null
      draggingStickerId.value = null
      el.removeEventListener('touchmove', onTouchMove, { capture: true })
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }

    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
  }

  const onStickerClick = (id: string) => {
    if (draggingStickerId.value || transformingStickerId.value) return
    selectSticker(id)
  }

  return {
    onStickerMouseDown,
    onStickerTouchStart,
    onStickerClick
  }
}
