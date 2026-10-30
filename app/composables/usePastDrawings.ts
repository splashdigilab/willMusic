/**
 * 之前幾輪的手繪（為什麼會分輪，見 sticky-note-style.ts 的 NOTE_LAYER_Z）。
 *
 * 目前這一輪在 Fabric 上，可以畫、可以 undo；之前那幾輪各收成一張圖，留在自己原本的前後位置。
 * 收起來的圖還是擦得掉：橡皮擦在 Fabric 上擦的每一段（useFabricBrush 的 onEraserSegment），
 * 這裡在每一張上照樣擦；undo／redo 一筆橡皮擦（onEraserStrokeToggle）時，這幾張也跟著拿掉、放回那一筆。
 * 不然回到 STEP 4 之後，之前畫的東西就再也擦不掉了。
 *
 * STEP 4 時每一張是一個 <canvas>（registerCanvas），擦的當下就看得到；
 * 其他步驟顯示匯出好的 PNG（layers 的 data），canvas 只在 STEP 4 存在，不多佔記憶體。
 */
import type { DrawingLayer } from '~/types'

/** 跟 Fabric 畫布同尺寸（editor.vue 的 fabricBrush.init） */
const SIZE = 600

/** 一筆橡皮擦在這一張上擦過的線段：x1, y1, x2, y2 一組 */
interface EraserMark {
  strokeId: number
  width: number
  segments: number[]
  /** undo 拿掉的是 false，redo 放回來又是 true */
  active: boolean
}

interface LayerState {
  id: string
  /** 收起來那一刻的圖（之後 bake 會換成擦過的結果） */
  base: string
  image: HTMLImageElement
  marks: EraserMark[]
  /** 擦過（或 undo／redo 過）、還沒重新匯出 */
  dirty: boolean
  canvas: HTMLCanvasElement | null
}

/** 畫面與存檔看的：整張擦光了 data 是 null（undo 還會回來，所以先不拿掉） */
export interface PastDrawingView {
  id: string
  data: string | null
}

const loadImage = (src: string) => {
  const img = new Image()
  img.src = src
  return img
}

const isReady = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0

/** 用 destination-out 把線段擦掉，畫法跟 Fabric 的橡皮擦路徑一樣（圓頭） */
const eraseSegments = (ctx: CanvasRenderingContext2D, width: number, segments: number[]) => {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000'
  ctx.beginPath()
  for (let i = 0; i + 3 < segments.length; i += 4) {
    ctx.moveTo(segments[i]!, segments[i + 1]!)
    ctx.lineTo(segments[i + 2]!, segments[i + 3]!)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * 這一段經過的地方，這一張上有沒有東西（看線段外框，寬一點沒關係）。
 * 沒碰到的那幾張就不記、不重新匯出：之前三輪的話，每擦一筆原本要多編三次 PNG。
 * 跳過是安全的：undo 是後進先出，之後要 undo 到「讓這裡又有東西」的那一筆之前，
 * 這一筆一定已經先被 undo 掉了
 */
const touchesInk = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) => {
  const pad = width / 2 + 1
  const left = Math.max(0, Math.floor(Math.min(x1, x2) - pad))
  const top = Math.max(0, Math.floor(Math.min(y1, y2) - pad))
  const w = Math.min(SIZE, Math.ceil(Math.max(x1, x2) + pad)) - left
  const h = Math.min(SIZE, Math.ceil(Math.max(y1, y2) + pad)) - top
  if (w <= 0 || h <= 0) return false
  const data = ctx.getImageData(left, top, w, h).data
  for (let i = 3; i < data.length; i += 4) if (data[i]) return true
  return false
}

const drawLayer = (ctx: CanvasRenderingContext2D, s: LayerState) => {
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.drawImage(s.image, 0, 0, SIZE, SIZE)
  for (const m of s.marks) if (m.active) eraseSegments(ctx, m.width, m.segments)
}

export function usePastDrawings(isBlank: (png: string) => boolean) {
  const layers = ref<PastDrawingView[]>([])
  const states = new Map<string, LayerState>()

  const paint = (s: LayerState) => {
    const ctx = s.canvas?.getContext('2d')
    if (!ctx) return
    if (!isReady(s.image)) {
      s.image.onload = () => paint(s)
      return
    }
    drawLayer(ctx, s)
  }

  const releaseCanvas = (s: LayerState) => {
    if (!s.canvas) return
    s.canvas.width = 0
    s.canvas.height = 0
    s.canvas = null
  }

  /** 收起一輪：它變成之前的一張，留在原本的前後位置 */
  const add = (id: string, data: string) => {
    states.set(id, { id, base: data, image: loadImage(data), marks: [], dirty: false, canvas: null })
    layers.value.push({ id, data })
  }

  const reset = () => {
    for (const s of states.values()) releaseCanvas(s)
    states.clear()
    layers.value = []
  }

  /** 還原草稿裡的那幾張 */
  const restore = (list: DrawingLayer[]) => {
    reset()
    for (const l of list) add(l.id, l.src)
  }

  /**
   * STEP 4 的 <canvas> 掛上來。Vue 的 function ref 每次重畫都會再呼叫一次，
   * 同一個元素就不重畫；拿掉時（null）不在這裡處理，見 releaseCanvases
   */
  const registerCanvas = (id: string, el: unknown) => {
    const s = states.get(id)
    if (!s || !(el instanceof HTMLCanvasElement) || s.canvas === el) return
    s.canvas = el
    el.width = SIZE
    el.height = SIZE
    // 第一次取 context 時決定：每擦一段都要讀像素（touchesInk），放在 CPU 上讀比較快
    el.getContext('2d', { willReadFrequently: true })
    paint(s)
  }

  /** 離開 STEP 4：canvas 要被拿掉了，先釋放 backing store（iOS 的 canvas 記憶體上限很緊） */
  const releaseCanvases = () => {
    for (const s of states.values()) releaseCanvas(s)
  }

  const eraseSegment = (strokeId: number, x1: number, y1: number, x2: number, y2: number, width: number) => {
    for (const s of states.values()) {
      // 畫面上還沒畫出來（圖還在解碼）就看不出碰到沒有，照樣記下來
      const ctx = isReady(s.image) ? s.canvas?.getContext('2d') : null
      if (ctx && !touchesInk(ctx, x1, y1, x2, y2, width)) continue
      let mark = s.marks[s.marks.length - 1]
      if (!mark || mark.strokeId !== strokeId) {
        mark = { strokeId, width, segments: [], active: true }
        s.marks.push(mark)
      }
      mark.segments.push(x1, y1, x2, y2)
      s.dirty = true
      if (ctx) eraseSegments(ctx, width, [x1, y1, x2, y2])
    }
  }

  const toggleStroke = (strokeId: number, present: boolean) => {
    for (const s of states.values()) {
      let changed = false
      for (const m of s.marks) {
        if (m.strokeId === strokeId && m.active !== present) {
          m.active = present
          changed = true
        }
      }
      if (!changed) continue
      s.dirty = true
      paint(s)
    }
  }

  /** 擦過的那幾張重新匯出成 PNG。有變動才回傳 true */
  const exportDirty = (): boolean => {
    let changed = false
    for (const s of states.values()) {
      if (!s.dirty || !isReady(s.image)) continue
      s.dirty = false
      let data: string | null = s.base
      if (s.marks.some(m => m.active)) {
        // STEP 4 畫面上那張 canvas 就是現在的樣子，直接匯出；不在 STEP 4 才另外畫一張
        const onScreen = s.canvas?.width === SIZE ? s.canvas : null
        const canvas = onScreen ?? document.createElement('canvas')
        if (!onScreen) {
          canvas.width = SIZE
          canvas.height = SIZE
          drawLayer(canvas.getContext('2d')!, s)
        }
        const png = canvas.toDataURL('image/png')
        if (!onScreen) {
          canvas.width = 0
          canvas.height = 0
        }
        data = isBlank(png) ? null : png
      }
      const view = layers.value.find(l => l.id === s.id)
      if (view && view.data !== data) {
        view.data = data
        changed = true
      }
    }
    return changed
  }

  /**
   * Fabric 的筆畫記錄要清掉了（開新的一輪）：擦過的部分定下來，之後不能再 undo。
   * 整張擦光的就拿掉
   */
  const bake = () => {
    exportDirty()
    for (const view of layers.value) {
      const s = states.get(view.id)
      if (!s) continue
      if (!view.data) {
        releaseCanvas(s)
        states.delete(view.id)
        continue
      }
      // 還沒匯出成功的（圖還在解碼，exportDirty 跳過了）不能清掉擦痕，不然擦掉的又會回來；
      // 留著的擦痕照樣作用，只是之後 undo 不到
      if (s.marks.length === 0 || s.dirty) continue
      s.base = view.data
      s.image = loadImage(view.data)
      s.marks = []
    }
    layers.value = layers.value.filter(l => l.data)
  }

  /** 要存草稿、要送出的那幾張：擦光的不算 */
  const saved = (): DrawingLayer[] =>
    layers.value.flatMap(l => (l.data ? [{ id: l.id, src: l.data }] : []))

  return {
    layers,
    saved,
    add,
    reset,
    restore,
    registerCanvas,
    releaseCanvases,
    eraseSegment,
    toggleStroke,
    exportDirty,
    bake
  }
}
