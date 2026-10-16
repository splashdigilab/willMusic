import type { StickerInstance } from '~/types'

/**
 * 便利貼上三類東西的疊放順序：貼紙最上、手繪中間、文字最下。
 *
 * 這三類之間是固定的，不會因為點了哪個物件而改動 —— 原本那套動態順序（記在 objectLayerOrder）
 * 會因為來回切步驟而自己變動，而且編輯器、預覽、大螢幕三邊的還原規則容易對不上。
 * 這組值正好也是照流程走一遍（先打字、再畫圖、最後貼貼紙）自然會得到的結果。
 *
 * 同一類之間靠 DOM 順序（＝陣列順序）決定，後面的蓋前面的。貼紙之間可以換：
 * 碰到的那張會移到陣列最後面、浮到其他貼紙上面（編輯器的 bringStickerToFront），
 * 順序就存在陣列裡，不需要另外記。
 *
 * 唯一的例外是手繪可以整層移到貼紙上面（STEP 4 的「畫在貼紙上面」，存成
 * style.drawingAboveStickers），用來在貼紙上塗鴉。整層一起移，不是一筆一筆分開：
 * 手繪存成一張圖，拆成多層的話橡皮擦與 undo 都碰不到舊的那層。
 *
 * 署名（名牌）在所有東西上面：它是「這張是誰做的」，被貼紙蓋掉就失去意義。
 *
 * 舊便利貼另當別論：它們存了 objectLayerOrder，顯示端仍以那份記錄為準，
 * 所以已經上牆的內容不會因為這次改動而變樣。
 */
export const NOTE_LAYER_Z = {
  text: 1,
  drawing: 2,
  sticker: 3,
  /** 編輯器裡手指按住的那張貼紙：先浮到其他貼紙上面，放開才真的移到陣列最後（只在編輯器用） */
  liftedSticker: 4,
  drawingAboveStickers: 5,
  nameTag: 6
} as const

/** 手繪層的疊放值：預設在貼紙底下，打開「畫在貼紙上面」就移到貼紙上面（署名仍在最上） */
export function drawingLayerZ(aboveStickers: boolean | undefined) {
  return aboveStickers ? NOTE_LAYER_Z.drawingAboveStickers : NOTE_LAYER_Z.drawing
}

/** 舊便利貼記錄手繪層順序時用的鍵 */
export const DRAWING_LAYER_ID = 'drawing-layer'

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
