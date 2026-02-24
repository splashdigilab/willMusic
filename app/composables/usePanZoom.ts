import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'

export interface PanZoomState {
    x: number
    y: number
    scale: number
}

interface UsePanZoomOptions {
    minScale?: number
    maxScale?: number
    initialX?: number
    initialY?: number
    initialScale?: number
    onTransformChange?: (state: PanZoomState) => void
}

/**
 * 處理 Element 的平移(Pan)與縮放(Zoom)
 * @param containerRef  外層容器（負責接收滑鼠/觸控事件）
 * @param contentRef    內層實際被 transform 的畫布
 * @param options       設定
 */
export function usePanZoom(
    containerRef: Ref<HTMLElement | null>,
    contentRef: Ref<HTMLElement | null>,
    options: UsePanZoomOptions = {}
) {
    const minScale = options.minScale ?? 0.1
    const maxScale = options.maxScale ?? 3

    const state = ref<PanZoomState>({
        x: options.initialX ?? 0,
        y: options.initialY ?? 0,
        scale: options.initialScale ?? 1
    })

    // 狀態
    const isDragging = ref(false)
    let startClientX = 0
    let startClientY = 0
    let startStateX = 0
    let startStateY = 0

    const updateTransform = () => {
        // Vue components like TransitionGroup return the component instance, not the DOM element directly.
        // We safely unpack the actual HTMLElement by checking for $el.
        const contentEl = contentRef.value ? ((contentRef.value as any).$el || contentRef.value) : null

        if (contentEl && contentEl.style) {
            contentEl.style.transform = `translate(${state.value.x}px, ${state.value.y}px) scale(${state.value.scale})`
            contentEl.style.transformOrigin = '0 0'
        } else {
            console.warn('[usePanZoom] contentRef failed to resolve to a valid HTMLElement', contentRef.value)
        }
        options.onTransformChange?.(state.value)
    }

    // watch 外部直接改變 state 的情況
    watch(state, updateTransform, { deep: true })

    // ─── Drag (Pan) ───
    const onPointerDown = (e: PointerEvent) => {
        // 忽略右鍵
        if (e.button !== 0 && e.pointerType === 'mouse') return

        // 若不是在此容器觸發（而是內部元素），可以透過 class 判斷是否要防止拖曳
        // 例如：點擊便利貼本身有可能是要別的操作，不過在此需求中，點擊背景拖曳最直覺
        // if ((e.target as Element).closest('.c-sticky-note')) return

        isDragging.value = true
        startClientX = e.clientX
        startClientY = e.clientY
        startStateX = state.value.x
        startStateY = state.value.y

        if (containerRef.value) {
            containerRef.value.setPointerCapture(e.pointerId)
            containerRef.value.style.cursor = 'grabbing'
        }
    }

    const onPointerMove = (e: PointerEvent) => {
        if (!isDragging.value) return

        const dx = e.clientX - startClientX
        const dy = e.clientY - startClientY

        state.value.x = startStateX + dx
        state.value.y = startStateY + dy
        updateTransform()
    }

    const onPointerUp = (e: PointerEvent) => {
        if (!isDragging.value) return
        isDragging.value = false
        if (containerRef.value) {
            containerRef.value.releasePointerCapture(e.pointerId)
            containerRef.value.style.cursor = 'grab'
        }
    }

    // ─── Wheel (Zoom) ───
    const onWheel = (e: WheelEvent) => {
        e.preventDefault()

        if (!containerRef.value) return

        const zoomSensitivity = 0.001
        const delta = -e.deltaY * zoomSensitivity
        let newScale = state.value.scale * Math.exp(delta)

        if (newScale < minScale) newScale = minScale
        if (newScale > maxScale) newScale = maxScale

        // 計算滑鼠位置相對於 content 的座標，以滑鼠為中心縮放
        const rect = containerRef.value.getBoundingClientRect()
        // 游標在 container 內的座標
        const clientX = e.clientX - rect.left
        const clientY = e.clientY - rect.top

        // 游標在 content 內的座標（考慮目前的 pan 和 scale）
        const contentTargetX = (clientX - state.value.x) / state.value.scale
        const contentTargetY = (clientY - state.value.y) / state.value.scale

        // 更新 scale
        state.value.scale = newScale

        // 重新計算 pan，保證游標下的 content 座標點在螢幕上不動
        state.value.x = clientX - contentTargetX * newScale
        state.value.y = clientY - contentTargetY * newScale

        updateTransform()
    }

    // 將中心點移至畫面中央
    const centerContent = () => {
        if (!containerRef.value) return
        const rect = containerRef.value.getBoundingClientRect()
        state.value.x = rect.width / 2
        state.value.y = rect.height / 2
        state.value.scale = 1
        updateTransform()
    }

    onMounted(() => {
        const el = containerRef.value
        if (el) {
            el.style.touchAction = 'none' // 防止移動端滾動
            el.style.cursor = 'grab'
            el.addEventListener('pointerdown', onPointerDown)
            el.addEventListener('pointermove', onPointerMove)
            el.addEventListener('pointerup', onPointerUp)
            el.addEventListener('pointercancel', onPointerUp)
            el.addEventListener('wheel', onWheel, { passive: false })

            updateTransform()
        }
    })

    onUnmounted(() => {
        const el = containerRef.value
        if (el) {
            el.removeEventListener('pointerdown', onPointerDown)
            el.removeEventListener('pointermove', onPointerMove)
            el.removeEventListener('pointerup', onPointerUp)
            el.removeEventListener('pointercancel', onPointerUp)
            el.removeEventListener('wheel', onWheel)
        }
    })

    return {
        state,
        centerContent,
        updateTransform
    }
}
