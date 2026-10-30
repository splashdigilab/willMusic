import type { StickerInstance } from '~/types'

/**
 * 便利貼上東西的前後：新增的那一刻放到最上面，之後就不再變。
 *
 * 文字、貼紙、手繪都一樣，新增時各自拿到一個順序，存在 style.objectLayerOrder（越大越上面）。
 * 移動、修改、點選都不會改它：原本那套「點到哪個、哪個到最上層」的動態順序，
 * 會因為來回切步驟而讓東西自己跳位，所以現在順序只在新增時決定一次。
 * 在貼紙上畫的線因此蓋在貼紙上（線是後加的），之後移動貼紙，線留在原地。
 *
 * 手繪不是一筆一個物件：同一輪畫的筆畫是一張圖（Fabric 匯出的 PNG）。
 * 回到 STEP 4 時，如果上一輪畫完之後又加了文字或貼紙，就開新的一輪畫在最上面，
 * 之前那一輪留在原本的位置（見 editor.vue 的 startDrawingRound）。
 * 第一輪存在 style.drawing（鍵是 DRAWING_LAYER_ID），之後幾輪存在 style.drawingLayers。
 *
 * 署名（名牌）在所有東西上面：它是「這張是誰做的」，被蓋掉就失去意義。
 *
 * 沒有記錄順序的（舊便利貼，或舊版動態順序沒記到的物件）照下面的固定值：
 * 文字 1、手繪 2、貼紙 3，當時打開「畫在貼紙上面」的手繪是 5。已經上牆的內容照舊。
 */
export const NOTE_LAYER_Z = {
  text: 1,
  drawing: 2,
  sticker: 3,
  drawingAboveStickers: 5,
  /** 署名至少在這一層；有記錄順序的便利貼，署名放在最上面那個的再上一層 */
  nameTag: 6
} as const

/** 沒有記錄順序的手繪：看舊版的「畫在貼紙上面」有沒有打開 */
export function drawingLayerZ(aboveStickers: boolean | undefined) {
  return aboveStickers ? NOTE_LAYER_Z.drawingAboveStickers : NOTE_LAYER_Z.drawing
}

/** 第一輪手繪（style.drawing）在 objectLayerOrder 裡的鍵，舊便利貼也是這個 */
export const DRAWING_LAYER_ID = 'drawing-layer'

/**
 * 手繪最多幾輪：style.drawing 一張，加上 drawingLayers 三張。
 * firestore.rules 照這個數驗 drawingLayers，改的時候兩邊一起改
 */
export const MAX_DRAWING_LAYERS = 4

/**
 * 文字區塊定位與變換樣式（編輯器與顯示端共用）
 * 規則：left/top % 錨點 + translate(-50%,-50%) 置中，scale/rotate 由 --text-scale 控制換行寬
 */
export function getTextBlockStyle(x: number, y: number, scale: number, rotation: number) {
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
    '--inverse-scale': 1 / scale,
    '--text-scale': scale
  }
}

/**
 * 貼紙定位與變換樣式（編輯器與顯示端共用）。署名的名牌欄位與貼紙相同，也走這裡
 */
export function getStickerStyle(sticker: Pick<StickerInstance, 'x' | 'y' | 'scale' | 'rotation'>) {
  return {
    left: `${sticker.x}%`,
    top: `${sticker.y}%`,
    transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
    '--inverse-scale': 1 / sticker.scale
  }
}
