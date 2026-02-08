import { Canvas, PencilBrush } from 'fabric'

export function useFabricBrush(onPathCreated?: () => void) {
  let fabricCanvas: Canvas | null = null

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

    const brush = new PencilBrush(fabricCanvas)
    brush.color = '#333333'
    brush.width = 4
    fabricCanvas.freeDrawingBrush = brush

    return fabricCanvas
  }

  const setDrawingMode = (enabled: boolean) => {
    if (fabricCanvas) {
      fabricCanvas.isDrawingMode = enabled
    }
  }

  const setBrushColor = (color: string) => {
    if (fabricCanvas?.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = color
    }
  }

  const setBrushWidth = (width: number) => {
    if (fabricCanvas?.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.width = width
    }
  }

  const exportToDataURL = (): string | null => {
    if (!fabricCanvas) return null
    return fabricCanvas.toDataURL({ format: 'png', quality: 1 })
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
    setBrushColor,
    setBrushWidth,
    exportToDataURL,
    loadFromDataURL,
    clear,
    resize,
    dispose,
    isInitialized,
    getCanvas: () => fabricCanvas
  }
}
