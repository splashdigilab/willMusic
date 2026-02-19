import { Canvas, PencilBrush, Path, FabricObject } from 'fabric'
import type { Point } from 'fabric'

type TSimplePathData = Parameters<PencilBrush['createPath']>[0]
type TBrushEventData = Parameters<PencilBrush['onMouseMove']>[1]

function segmentToPathData(p1: Point, p2: Point): TSimplePathData {
  return [['M', p1.x, p1.y], ['L', p2.x, p2.y]]
}

function drawBrushCursor(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** 標記橡皮擦路徑所屬的筆畫 ID，undo 時一次移除同筆畫 */
const ERASER_STROKE_KEY = '__eraserStrokeId'

class EraserBrush extends PencilBrush {
  private _currentStrokeId = 0

  override _setBrushStyles(ctx: CanvasRenderingContext2D) {
    super._setBrushStyles(ctx)
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)'
  }

  override _saveAndTransform(ctx: CanvasRenderingContext2D) {
    super._saveAndTransform(ctx)
    ctx.globalCompositeOperation = 'destination-out'
  }

  override _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    if (this._points.length > 0) {
      const p = this._points[this._points.length - 1]
      if (p) {
        this._saveAndTransform(ctx)
        ctx.globalCompositeOperation = 'source-over'
        drawBrushCursor(ctx, p.x, p.y, this.width / 2)
        ctx.restore()
      }
    }
  }

  override onMouseDown(pointer: Point, ev: TBrushEventData) {
    this._currentStrokeId += 1
    super.onMouseDown(pointer, ev)
    this.canvas.renderTop()
  }

  override onMouseMove(pointer: Point, ev: TBrushEventData) {
    super.onMouseMove(pointer, ev)
    if (this._points.length >= 2) {
      const p1 = this._points[this._points.length - 2]
      const p2 = this._points[this._points.length - 1]
      if (p1 && p2) {
        const pathData = segmentToPathData(p1, p2)
        const path = this.createPath(pathData)
        ;(path as unknown as Record<string, unknown>)[ERASER_STROKE_KEY] = this._currentStrokeId
        this.canvas.add(path)
      }
    }
    if (this._points.length > 0) {
      this.canvas.renderTop()
    }
    this.canvas.requestRenderAll()
  }

  override onMouseUp(ev: TBrushEventData) {
    if (!this.canvas._isMainEvent(ev.e)) {
      return true
    }
    this.drawStraightLine = false
    this.oldEnd = undefined
    this.canvas.clearContext(this.canvas.contextTop)
    this.canvas.requestRenderAll()
    this.canvas.fire('path:created', { path: undefined as unknown as FabricObject })
    return false
  }

  override createPath(pathData: TSimplePathData): Path {
    const path = super.createPath(pathData)
    path.set({
      fill: null,
      stroke: 'rgba(255, 255, 255, 1)',
      globalCompositeOperation: 'destination-out'
    })
    return path
  }
}

export function useFabricBrush(onPathCreated?: () => void) {
  let fabricCanvas: Canvas | null = null
  let pencilBrush: PencilBrush | null = null
  let eraserBrush: EraserBrush | null = null
  const redoStack: FabricObject[] = []
  let onUndoRedoChange: (() => void) | null = null
  let initialWidth = 0
  let initialHeight = 0

  const getPathObjects = (): FabricObject[] =>
    fabricCanvas?.getObjects().filter((obj) => obj?.isType?.('Path', 'path')) ?? []

  const init = (canvasEl: HTMLCanvasElement | null, width: number, height: number) => {
    if (!canvasEl || !import.meta.client) return

    initialWidth = width
    initialHeight = height

    fabricCanvas = new Canvas(canvasEl, {
      width,
      height,
      isDrawingMode: true,
      backgroundColor: 'transparent',
      selection: false,
      controlsAboveOverlay: false,
      preserveObjectStacking: true
    })

    fabricCanvas.on('path:created', () => {
      redoStack.length = 0
      onUndoRedoChange?.()
      if (onPathCreated) onPathCreated()
    })

    pencilBrush = new PencilBrush(fabricCanvas)
    pencilBrush.color = '#333333'
    pencilBrush.width = 4

    eraserBrush = new EraserBrush(fabricCanvas)
    eraserBrush.color = 'rgba(255, 255, 255, 1)'
    eraserBrush.width = 16

    fabricCanvas.freeDrawingBrush = pencilBrush

    return fabricCanvas
  }

  const setDrawingMode = (enabled: boolean) => {
    if (fabricCanvas) {
      fabricCanvas.isDrawingMode = enabled
    }
  }

  const setEraserMode = (enabled: boolean) => {
    if (!fabricCanvas || !pencilBrush || !eraserBrush) return
    fabricCanvas.freeDrawingBrush = enabled ? eraserBrush : pencilBrush
  }

  const setBrushColor = (color: string) => {
    if (pencilBrush) {
      pencilBrush.color = color
    }
  }

  const setBrushWidth = (width: number) => {
    if (pencilBrush) {
      pencilBrush.width = width
    }
  }

  const setEraserWidth = (width: number) => {
    if (eraserBrush) {
      eraserBrush.width = width
    }
  }

  const exportToDataURL = (): string | null => {
    if (!fabricCanvas) return null
    return fabricCanvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 })
  }

  const setOnUndoRedoChange = (cb: (() => void) | null) => {
    onUndoRedoChange = cb
  }

  const undo = () => {
    if (!fabricCanvas) return
    const paths = getPathObjects()
    const last = paths[paths.length - 1]
    if (!last) return
    const strokeId = (last as unknown as Record<string, unknown>)[ERASER_STROKE_KEY] as number | undefined
    if (strokeId !== undefined) {
      const toRemove = paths.filter((p) => (p as unknown as Record<string, unknown>)[ERASER_STROKE_KEY] === strokeId)
      toRemove.reverse()
      for (const p of toRemove) {
        fabricCanvas.remove(p)
        redoStack.push(p)
      }
    } else {
      fabricCanvas.remove(last)
      redoStack.push(last)
    }
    fabricCanvas.renderAll()
    onUndoRedoChange?.()
  }

  const redo = () => {
    if (!fabricCanvas || redoStack.length === 0) return
    const lastPopped = redoStack.pop()!
    const strokeId = (lastPopped as unknown as Record<string, unknown>)[ERASER_STROKE_KEY] as number | undefined
    const toAdd: FabricObject[] = [lastPopped]
    if (strokeId !== undefined) {
      while (redoStack.length > 0) {
        const next = redoStack[redoStack.length - 1]
        if ((next as unknown as Record<string, unknown>)[ERASER_STROKE_KEY] === strokeId) {
          toAdd.push(redoStack.pop()!)
        } else {
          break
        }
      }
      // redoStack 中同一筆畫的順序是 [first,...,last]，還原時要 [first,...,last] 加入 canvas
      toAdd.reverse()
    }
    for (const p of toAdd) {
      fabricCanvas.add(p)
    }
    fabricCanvas.renderAll()
    onUndoRedoChange?.()
  }

  const canUndo = () => getPathObjects().length > 0
  const canRedo = () => redoStack.length > 0

  const loadFromDataURL = async (dataUrl: string) => {
    if (!fabricCanvas) return
    try {
      redoStack.length = 0
      fabricCanvas.clear()
      fabricCanvas.backgroundColor = 'transparent'
      const { FabricImage } = await import('fabric')
      const img = await FabricImage.fromURL(dataUrl)
      if (img.width && img.height) {
        const w = fabricCanvas.getWidth()
        const h = fabricCanvas.getHeight()
        // 如果還沒初始化基準尺寸，以當前尺寸為基準
        if (initialWidth === 0 || initialHeight === 0) {
          initialWidth = w
          initialHeight = h
        }
        // 圖片按當前 canvas 尺寸縮放（與 init 時的基準一致）
        const scale = Math.min(w / img.width, h / img.height)
        img.set({
          left: w / 2,
          top: h / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false
        })
        fabricCanvas.add(img)
        fabricCanvas.renderAll()
      }
      onUndoRedoChange?.()
    } catch (e) {
      console.error('Failed to load drawing:', e)
    }
  }

  const clear = () => {
    if (fabricCanvas) {
      redoStack.length = 0
      fabricCanvas.clear()
      fabricCanvas.backgroundColor = 'transparent'
      initialWidth = fabricCanvas.getWidth()
      initialHeight = fabricCanvas.getHeight()
      fabricCanvas.renderAll()
      onUndoRedoChange?.()
    }
  }

  const resize = (width: number, height: number) => {
    if (!fabricCanvas || width <= 0 || height <= 0) return
    if (initialWidth === 0 || initialHeight === 0) {
      // 首次初始化，記錄尺寸
      initialWidth = width
      initialHeight = height
      fabricCanvas.setDimensions({ width, height })
      fabricCanvas.renderAll()
      return
    }

    // 計算縮放比例（canvas 是正方形，用 width 即可）
    const scaleRatio = width / initialWidth
    if (Math.abs(scaleRatio - 1) < 0.001) return // 幾乎沒變化，跳過

    // 縮放所有物件：scale 和 position 都要調整，讓畫的內容隨 canvas 尺寸縮放
    const objects = fabricCanvas.getObjects()
    for (const obj of objects) {
      const currentLeft = obj.left ?? 0
      const currentTop = obj.top ?? 0
      const currentScaleX = obj.scaleX ?? 1
      const currentScaleY = obj.scaleY ?? 1

      obj.set({
        left: currentLeft * scaleRatio,
        top: currentTop * scaleRatio,
        scaleX: currentScaleX * scaleRatio,
        scaleY: currentScaleY * scaleRatio
      })
      obj.setCoords() // 更新控制點座標
    }
    // 筆刷寬度保持用戶設定值，不隨 canvas 縮放（用戶設定的就是想要的視覺粗細）

    // 更新 canvas 尺寸
    initialWidth = width
    initialHeight = height
    fabricCanvas.setDimensions({ width, height })
    fabricCanvas.renderAll()
  }

  const isInitialized = () => !!fabricCanvas

  const dispose = () => {
    if (fabricCanvas) {
      redoStack.length = 0
      onUndoRedoChange = null
      fabricCanvas.dispose()
      fabricCanvas = null
    }
  }

  return {
    init,
    setDrawingMode,
    setEraserMode,
    setBrushColor,
    setBrushWidth,
    setEraserWidth,
    exportToDataURL,
    loadFromDataURL,
    clear,
    resize,
    dispose,
    isInitialized,
    getCanvas: () => fabricCanvas,
    undo,
    redo,
    canUndo,
    canRedo,
    setOnUndoRedoChange
  }
}
