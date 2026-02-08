import { Canvas, PencilBrush, Path } from 'fabric'

type TSimplePathData = Parameters<PencilBrush['createPath']>[0]

class EraserBrush extends PencilBrush {
  override _setBrushStyles(ctx: CanvasRenderingContext2D) {
    super._setBrushStyles(ctx)
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.6)'
  }

  override createPath(pathData: TSimplePathData): Path {
    const path = super.createPath(pathData)
    path.set({ globalCompositeOperation: 'destination-out' })
    return path
  }
}

export function useFabricBrush(onPathCreated?: () => void) {
  let fabricCanvas: Canvas | null = null
  let pencilBrush: PencilBrush | null = null
  let eraserBrush: EraserBrush | null = null

  const init = (canvasEl: HTMLCanvasElement | null, width: number, height: number) => {
    if (!canvasEl || !import.meta.client) return

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
      if (onPathCreated) onPathCreated()
    })

    pencilBrush = new PencilBrush(fabricCanvas)
    pencilBrush.color = '#333333'
    pencilBrush.width = 4

    eraserBrush = new EraserBrush(fabricCanvas)
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

  const loadFromDataURL = async (dataUrl: string) => {
    if (!fabricCanvas) return
    try {
      fabricCanvas.clear()
      fabricCanvas.backgroundColor = 'transparent'
      const { FabricImage } = await import('fabric')
      const img = await FabricImage.fromURL(dataUrl)
      if (img.width && img.height) {
        const w = fabricCanvas.getWidth()
        const h = fabricCanvas.getHeight()
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
    } catch (e) {
      console.error('Failed to load drawing:', e)
    }
  }

  const clear = () => {
    if (fabricCanvas) {
      fabricCanvas.clear()
      fabricCanvas.backgroundColor = 'transparent'
      fabricCanvas.renderAll()
    }
  }

  const resize = (width: number, height: number) => {
    if (fabricCanvas && width > 0 && height > 0) {
      fabricCanvas.setDimensions({ width, height })
      fabricCanvas.renderAll()
    }
  }

  const isInitialized = () => !!fabricCanvas

  const dispose = () => {
    if (fabricCanvas) {
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
    getCanvas: () => fabricCanvas
  }
}
