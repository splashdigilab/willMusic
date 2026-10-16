/**
 * 節慶主題（視覺皮膚）
 *
 * 主題只換「長相」，不換流程：開場、便利貼牆、編輯器的 UI/UX 與資料格式都不變。
 * 一個主題能決定的事情只有下面 ThemeConfig 列出的這幾項，加上
 * app/assets/scss/themes/ 底下以 [data-theme='<id>'] 限定範圍的樣式。
 *
 * ── 切換方式 ──────────────────────────────────────────────
 *   正式：後台「播放設定」→「節慶主題」，存在 system/site_theme（測試站 site_theme_dev，兩站各一份）。
 *        不必重新部署；伺服器每 30 秒重讀一次（見 server/api/site-theme.get.ts），新打開的頁面就會換上。
 *   後台沒設定過、存的是 null（舊版後台的「依部署設定」）、或存的主題這個版本不認得時：退回環境變數 NUXT_PUBLIC_THEME
 *        （none 或不設＝原本的主題）。
 *   預覽：任一頁網址加 ?theme=halloween，這個瀏覽器之後一小時內都會套用（cookie）；
 *        ?theme=default 看原本的樣子，?theme=reset 回到正式設定。只影響自己，
 *        可以在測試站或正式站先看效果。預覽的主題跟後台設定一樣時會自動清掉（見 useTheme）。
 *
 * ── 新增一個節慶 ──────────────────────────────────────────
 *   1. 這裡加一筆 ThemeConfig，ThemeId 加上它的 id
 *   2. 造型、貼紙加進 shapes.ts / stickers.ts 的「資料庫」（不是選單）—— 節慶結束後
 *      主題切回去，選單就不再列出，但已上牆的便利貼仍查得到
 *   3. 新造型要重跑 scripts/shapes/build_shadows.py 產生陰影；
 *      新貼紙要重跑 scripts/stickers/build_stickers.py 產生選單縮圖
 *   3b. ThemeId 加上新 id 之後，後台「節慶主題」的選項會自動多一個（照 THEMES 列出）
 *   4. 樣式寫在 app/assets/scss/themes/_<id>.scss，素材放 public/themes/<id>/
 *   5. 開場畫面若不是只改顏色，做一個 components/theme/<Name>Intro.vue，在 index.vue 掛上
 */
import { BACKGROUND_IMAGES, type BackgroundImage, type StickyNoteMaterial } from '~/data/backgrounds'
import { STICKY_NOTE_SHAPES, SELECTABLE_SHAPES, type StickyNoteShape } from '~/data/shapes'
import { STICKER_LIBRARY, type StickerType } from '~/data/stickers'

export type ThemeId = 'default' | 'halloween'

export interface ThemeConfig {
  id: ThemeId
  /** 後台選單上的名稱 */
  label: string
  /** 這個主題的節慶造型，排在 STEP 2 選單最前面（造型本身要先登記在 shapes.ts） */
  shapeIds: string[]
  /** 接在基本材質後面的節慶材質。不插在前面：第一個材質同時是預設值與「有沒有動過」的判斷基準 */
  extraMaterials: StickyNoteMaterial[]
  /** 這個主題的節慶貼紙，排在 STEP 5 貼圖庫最前面（貼紙本身要先登記在 stickers.ts） */
  stickerIds: string[]
  /** 便利貼牆底部橫條左邊放字標（原本的主題刻意拿掉了，見 index.vue） */
  wallBarLogo: boolean
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  default: {
    id: 'default',
    label: '原本的主題',
    shapeIds: [],
    extraMaterials: [],
    stickerIds: [],
    wallBarLogo: false
  },

  /**
   * 萬聖節。稿子：「(Draft) 萬聖節便利貼 - WillMusic.ai」畫板 01（開場）、02（便利貼牆）、
   * 03／04（大螢幕徽章的正反面，見 CanvasPromo.vue；大螢幕左上、右下另加蜘蛛網，見 canvas.vue）。
   * 南瓜、骷髏、幽靈的本體與臉取自稿子畫板上方的素材，已轉正（見 scripts/themes/README.md）。
   * 本體色就是下面兩個材質（幽靈用既有的白），臉做成貼紙，自己挑要不要貼。
   * 編輯器、確認彈窗、等待頁稿子沒有畫，按鈕與選中色照開場推（--theme-* 變數，見 themes/_halloween.scss）。
   */
  halloween: {
    id: 'halloween',
    label: '萬聖節',
    shapeIds: ['pumpkin', 'skull', 'ghost'],
    extraMaterials: [
      { id: 'pumpkin-orange', value: '#FF6100' },
      { id: 'skull-lime', value: '#DAE000' }
    ],
    stickerIds: [
      'halloween-pumpkin-face', 'halloween-skull-face', 'halloween-ghost-face',
      // 全像貼紙：字 → 角色 → 巫師道具 → 糖果 → 場景
      'halloween-boo', 'halloween-spooky-vibes', 'halloween-trick-or-treat',
      'halloween-ghost', 'halloween-jack-o-lantern', 'halloween-pumpkin', 'halloween-skull',
      'halloween-black-cat', 'halloween-spider', 'halloween-eyeball',
      'halloween-witch-hat', 'halloween-broom', 'halloween-moon-wand', 'halloween-crystal-ball',
      'halloween-death-note', 'halloween-cauldron', 'halloween-magic-cauldron', 'halloween-potion',
      'halloween-poison-apple', 'halloween-candle',
      'halloween-candy-bucket', 'halloween-candy-corn', 'halloween-skull-lollipop', 'halloween-cupcake',
      'halloween-spider-web', 'halloween-tombstone', 'halloween-coffin', 'halloween-cross',
      'halloween-dead-tree', 'halloween-scythe'
    ],
    // 稿子畫板 02 有字標，2026-10-12 改回按鈕撐滿橫條（跟原本的主題同一個版面，只換顏色）
    wallBarLogo: false
  }
}

export const DEFAULT_THEME_ID: ThemeId = 'default'

/** 認得的主題 id 就回傳它，不認得（空值、打錯字、這個版本還沒有的主題）回傳 null */
export const parseThemeId = (value: unknown): ThemeId | null => {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (Object.keys(THEMES) as ThemeId[]).includes(v as ThemeId) ? (v as ThemeId) : null
}

/** 外部給的值（環境變數、網址）轉成合法的主題 id；none、空值、打錯字一律是原本的主題 */
export const resolveThemeId = (value: unknown): ThemeId => parseThemeId(value) ?? DEFAULT_THEME_ID

/** 所有節慶專屬的造型／貼紙。它們只在自己的主題裡出現在選單上 */
export const FESTIVE_SHAPE_IDS = new Set(Object.values(THEMES).flatMap(t => t.shapeIds))
export const FESTIVE_STICKER_IDS = new Set(Object.values(THEMES).flatMap(t => t.stickerIds))

const isDefined = <T>(v: T | undefined): v is T => v !== undefined

/** 編輯器 STEP 2 的造型：節慶造型在前，接著是平常的選單 */
export const getThemeShapes = (theme: ThemeConfig): StickyNoteShape[] => [
  ...theme.shapeIds.map(id => STICKY_NOTE_SHAPES.find(s => s.id === id)).filter(isDefined),
  ...SELECTABLE_SHAPES.filter(s => !FESTIVE_SHAPE_IDS.has(s.id))
]

/** 編輯器 STEP 1 的材質：平常的材質在前（第一個是預設值），節慶材質接在後面 */
export const getThemeMaterials = (theme: ThemeConfig): BackgroundImage[] => [
  ...BACKGROUND_IMAGES,
  ...theme.extraMaterials.map(m => ({ id: m.id, url: m.value }))
]

/** 編輯器 STEP 5 的貼圖庫：節慶貼紙在前；其他節慶的貼紙不列出 */
export const getThemeStickers = (theme: ThemeConfig): StickerType[] => [
  ...theme.stickerIds.map(id => STICKER_LIBRARY.find(s => s.id === id)).filter(isDefined),
  ...STICKER_LIBRARY.filter(s => !FESTIVE_STICKER_IDS.has(s.id))
]
