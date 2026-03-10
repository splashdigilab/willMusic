import { ref, watch, onMounted, onUnmounted, unref, type Ref } from 'vue'
import { gsap } from 'gsap'

export interface PanZoomState {
    x: number
    y: number
    scale: number
}

export interface PanZoomBounds {
    minX: number
    maxX: number
    minY: number
    maxY: number
}

interface UsePanZoomOptions {
    minScale?: number
    maxScale?: number
    initialX?: number
    initialY?: number
    initialScale?: number
    initialCenter?: boolean
    disabled?: Ref<boolean> | boolean
    bounds?: Ref<PanZoomBounds | null>
    boundsPadding?: number // 0.0 ~ 1.0 螢幕比例緩衝
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

    // Touch ( Pinch Zoom ) 狀態
    let activeTouches = 0
    let initialPinchDistance = 0
    let initialPinchScale = 1
    let initialPinchCenterX = 0
    let initialPinchCenterY = 0
    let pinchStartStateX = 0
    let pinchStartStateY = 0

    const updateTransform = () => {
        // Vue components like TransitionGroup return the component instance, not the DOM element directly.
        // We safely unpack the actual HTMLElement by checking for $el.
        const contentEl = contentRef.value ? ((contentRef.value as any).$el || contentRef.value) : null

        if (contentEl && contentEl.style) {
            // Apply bounding constraints before updating style
            const boundsVal = unref(options.bounds)
            if (boundsVal && containerRef.value) {
                const rect = containerRef.value.getBoundingClientRect()
                const paddingMult = options.boundsPadding ?? 0.5
                const padX = rect.width * paddingMult
                const padY = rect.height * paddingMult

                // Elements in index.vue are centered using left: 50%, top: 50%
                // Therefore, a raw coordinate of (0,0) in unscaled space actually renders at (rect.width / 2, rect.height / 2) in the container.
                // The scaled visual boundaries of the content relative to the container's (0,0) point are:
                const visualMinX = (rect.width / 2 + boundsVal.minX) * state.value.scale
                const visualMaxX = (rect.width / 2 + boundsVal.maxX) * state.value.scale
                const visualMinY = (rect.height / 2 + boundsVal.minY) * state.value.scale
                const visualMaxY = (rect.height / 2 + boundsVal.maxY) * state.value.scale

                // 1. Right edge shouldn't go further left than `padX`
                // => state.value.x + visualMaxX >= padX
                const minAllowedX = padX - visualMaxX
                
                // 2. Left edge shouldn't go further right than `rect.width - padX`
                // => state.value.x + visualMinX <= rect.width - padX
                const maxAllowedX = rect.width - padX - visualMinX

                // 3. Bottom edge shouldn't go further UP than `padY`
                // => state.value.y + visualMaxY >= padY
                const minAllowedY = padY - visualMaxY

                // 4. Top edge shouldn't go further DOWN than `rect.height - padY`
                // => state.value.y + visualMinY <= rect.height - padY
                const maxAllowedY = rect.height - padY - visualMinY

                // If content is smaller than the allowed drag area, center it or just clamp safely
                if (minAllowedX <= maxAllowedX) {
                    state.value.x = Math.max(minAllowedX, Math.min(state.value.x, maxAllowedX))
                } else {
                    state.value.x = (minAllowedX + maxAllowedX) / 2
                }
                
                if (minAllowedY <= maxAllowedY) {
                    state.value.y = Math.max(minAllowedY, Math.min(state.value.y, maxAllowedY))
                } else {
                    state.value.y = (minAllowedY + maxAllowedY) / 2
                }
            }

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
        if (unref(options.disabled)) return

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
        if (unref(options.disabled)) return
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

    // ─── Touch (Pinch Zoom & Pan) ───
    const getPinchDistance = (touches: TouchList) => {
        if (!touches[0] || !touches[1]) return 0
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        )
    }

    const getPinchCenter = (touches: TouchList) => {
        if (!touches[0] || !touches[1]) return { x: 0, y: 0 }
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        }
    }

    const onTouchStart = (e: TouchEvent) => {
        if (unref(options.disabled)) return
        if (!containerRef.value) return
        activeTouches = e.touches.length

        if (activeTouches === 1 && e.touches[0]) {
            // 單指平移
            isDragging.value = true
            startClientX = e.touches[0].clientX
            startClientY = e.touches[0].clientY
            startStateX = state.value.x
            startStateY = state.value.y
        } else if (activeTouches === 2) {
            // 雙指縮放
            isDragging.value = false // 停止單指拖曳
            initialPinchDistance = getPinchDistance(e.touches)
            initialPinchScale = state.value.scale
            const center = getPinchCenter(e.touches)
            initialPinchCenterX = center.x
            initialPinchCenterY = center.y
            pinchStartStateX = state.value.x
            pinchStartStateY = state.value.y
        }
    }

    const onTouchMove = (e: TouchEvent) => {
        if (unref(options.disabled)) return
        e.preventDefault() // 防止滾動與預設雙指縮放
        if (!containerRef.value) return

        if (activeTouches === 1 && isDragging.value && e.touches[0]) {
            // 單指平移
            const dx = e.touches[0].clientX - startClientX
            const dy = e.touches[0].clientY - startClientY
            state.value.x = startStateX + dx
            state.value.y = startStateY + dy
            updateTransform()
        } else if (activeTouches === 2) {
            // 雙指縮放與平移
            const currentDistance = getPinchDistance(e.touches)
            const currentCenter = getPinchCenter(e.touches)

            // 計算縮放比例
            if (initialPinchDistance === 0) return
            const scaleRatio = currentDistance / initialPinchDistance
            let newScale = initialPinchScale * scaleRatio

            if (newScale < minScale) newScale = minScale
            if (newScale > maxScale) newScale = maxScale

            // 像 wheel 一樣以雙指中心進行縮放
            const rect = containerRef.value.getBoundingClientRect()
            const centerClientX = initialPinchCenterX - rect.left
            const centerClientY = initialPinchCenterY - rect.top

            const contentTargetX = (centerClientX - pinchStartStateX) / initialPinchScale
            const contentTargetY = (centerClientY - pinchStartStateY) / initialPinchScale

            state.value.scale = newScale
            state.value.x = centerClientX - contentTargetX * newScale
            state.value.y = centerClientY - contentTargetY * newScale

            // 加上雙指原點的位移 (雙指一起移動也是 Pan)
            const panDx = currentCenter.x - initialPinchCenterX
            const panDy = currentCenter.y - initialPinchCenterY
            state.value.x += panDx
            state.value.y += panDy

            updateTransform()
        }
    }

    const onTouchEnd = (e: TouchEvent) => {
        if (unref(options.disabled)) return
        activeTouches = e.touches.length
        if (activeTouches === 0) {
            isDragging.value = false
        } else if (activeTouches === 1 && e.touches[0]) {
            // 從雙指變回單指，重設單指拖曳起點，無縫接軌
            isDragging.value = true
            startClientX = e.touches[0].clientX
            startClientY = e.touches[0].clientY
            startStateX = state.value.x
            startStateY = state.value.y
        }
    }

    // 將中心點移至畫面中央
    const centerContent = () => {
        if (!containerRef.value) return
        const rect = containerRef.value.getBoundingClientRect()
        const targetScale = options.initialScale ?? 1
        // 因為 transform-origin 左上角，所以置中時的 x/y 位移就是螢幕的一半乘上 (1 - scale)
        gsap.to(state.value, {
            x: (rect.width / 2) * (1 - targetScale),
            y: (rect.height / 2) * (1 - targetScale),
            scale: targetScale,
            duration: 0.8,
            ease: 'power3.out'
        })
    }

    onMounted(() => {
        const el = containerRef.value
        if (el) {
            el.style.touchAction = 'none' // 防止移動端滾動
            el.style.cursor = 'grab'

            // Mouse/Pointer events
            el.addEventListener('pointerdown', onPointerDown)
            el.addEventListener('pointermove', onPointerMove)
            el.addEventListener('pointerup', onPointerUp)
            el.addEventListener('pointercancel', onPointerUp)
            el.addEventListener('wheel', onWheel, { passive: false })

            // Touch events for Pinch Zoom
            el.addEventListener('touchstart', onTouchStart, { passive: false })
            el.addEventListener('touchmove', onTouchMove, { passive: false })
            el.addEventListener('touchend', onTouchEnd)
            el.addEventListener('touchcancel', onTouchEnd)

            if (options.initialCenter) {
                const rect = el.getBoundingClientRect()
                state.value.x = (rect.width / 2) * (1 - state.value.scale)
                state.value.y = (rect.height / 2) * (1 - state.value.scale)
            }

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

            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchmove', onTouchMove)
            el.removeEventListener('touchend', onTouchEnd)
            el.removeEventListener('touchcancel', onTouchEnd)
        }
    })

    return {
        state,
        centerContent,
        updateTransform
    }
}
