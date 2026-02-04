# 背景圖片與造型系統實作完成

## 變更摘要

### ✅ 已完成項目
1. 便利貼背景改用圖片
2. 便利貼支援 SVG 造型（8 種基本造型）
3. 背景圖片 × 造型 = 獨立選擇（不是交叉組合排列）
4. 移除文字大小控制（統一由 transform scale 調整）
5. 貼紙資料結構更新（準備支援 SVG，目前仍用 emoji placeholder）

---

## 📂 新增檔案

### 1. `app/data/backgrounds.ts`
- **用途**：背景圖片資料庫
- **內容**：8 張 Unsplash placeholder 圖片
  - 5 張紙張質感（黃、粉、藍、綠、紫）
  - 3 張漸層背景
- **結構**：
  ```typescript
  interface BackgroundImage {
    id: string
    name: string
    url: string
    thumbnail?: string
    category?: string
  }
  ```

### 2. `app/data/shapes.ts`
- **用途**：便利貼造型 SVG 資料庫
- **內容**：8 種基本造型
  - 基本：方形、圓角、圓形
  - 趣味：雲朵、星形、愛心
  - 幾何：六角形、菱形
- **結構**：
  ```typescript
  interface StickyNoteShape {
    id: string
    name: string
    svgPath: string // SVG path data
    viewBox?: string
    category?: string
  }
  ```

---

## 🔧 修改檔案

### 1. `app/types/index.ts`

**移除**：
- `StickyNoteStyle.fontSize` → 改用 textTransform.scale
- `StickyNoteStyle.backgroundColor` → 改為 backgroundImage
- `StickyNoteStyle.pattern` → 改為 shape

**新增**：
```typescript
interface TextBlockTransform {
  x: number
  y: number
  scale: number
  rotation: number
}

interface StickyNoteStyle {
  backgroundImage: string // 圖片 URL
  shape: string // 造型 ID
  textColor: string
  stickers?: StickerInstance[]
  textTransform?: TextBlockTransform
}
```

### 2. `app/pages/editor.vue`

**UI 變更**：
- ✅ 移除「文字大小」slider
- ✅ 新增「背景圖片」選擇器（縮圖網格）
- ✅ 新增「便利貼造型」選擇器（SVG 預覽）
- ✅ 文字區塊可拖曳、縮放、旋轉

**Script 變更**：
```typescript
// 舊
const backgroundColor = ref('#FFE97F')
const fontSize = ref(24)

// 新
const backgroundImage = ref(BACKGROUND_IMAGES[0].url)
const shape = ref('rounded')
const textScale = ref(1) // 文字大小改用 scale
```

**草稿與提交**：
- saveDraftData：存 backgroundImage, shape, textTransform
- loadDraftData：讀 backgroundImage, shape, textTransform
- handleSubmit：送 backgroundImage, shape, textTransform

### 3. `app/components/StickyNote.vue`

**支援背景圖片**：
```vue
<div 
  class="c-sticky-note"
  :style="{
    backgroundImage: `url(${note.style.backgroundImage})`,
    backgroundSize: 'cover',
    clipPath: `url(#clip-${noteId})`
  }"
>
```

**支援 SVG 造型（clip-path）**：
```vue
<svg class="c-sticky-note__clip-svg">
  <clipPath :id="`clip-${noteId}`">
    <path :d="clipPath" />
  </clipPath>
</svg>
```

**文字區塊變換**：
```vue
<div 
  class="c-sticky-note__content-wrap"
  :style="{
    left: `${textTransform.x}%`,
    top: `${textTransform.y}%`,
    transform: `translate(-50%, -50%) scale(${textTransform.scale}) rotate(${textTransform.rotation}deg)`
  }"
>
```

### 4. `app/data/stickers.ts`

**新增 type 欄位**：
```typescript
interface StickerType {
  ...
  type: 'emoji' | 'svg'
  viewBox?: string
}
```

目前所有貼紙仍使用 `type: 'emoji'`，未來可逐步替換為 SVG path。

---

## 🎨 UI 操作說明

### Editor 頁面

1. **背景圖片**：點選縮圖切換背景
2. **便利貼造型**：點選造型圖示切換形狀
3. **文字顏色**：點選色塊切換顏色
4. **文字編輯**：
   - 點擊文字區塊可輸入
   - 拖曳頂部拖曳條（⋮⋮）可移動
   - 拖曳右下角旋轉按鈕（↻）可縮放與旋轉
5. **貼紙**：
   - 點擊貼紙庫新增貼紙
   - 拖曳貼紙可移動
   - 拖曳右下角旋轉按鈕（↻）可縮放與旋轉
   - 點擊左上角 ✕ 可刪除

### Display & Home 顯示

- 自動套用：背景圖片、造型、文字變換、貼紙位置

---

## 🔄 資料流程

```
Editor 選擇
├── 背景圖片（8 選 1）
├── 造型（8 選 1）
├── 文字顏色（5 選 1）
├── 文字內容 + 變換（x, y, scale, rotation）
└── 貼紙（多個，各有 x, y, scale, rotation）

↓ 提交

Firestore (queue_pending)
{
  content: string,
  style: {
    backgroundImage: string,
    shape: string,
    textColor: string,
    textTransform: { x, y, scale, rotation },
    stickers: [ { type, x, y, scale, rotation }, ... ]
  }
}

↓ Display 播放

Firestore (queue_history)

↓ Home 顯示

即時牆 / 典藏牆
```

---

## 🎯 技術細節

### Clip-Path 造型實作

使用 SVG `<clipPath>` 裁切便利貼形狀：

```vue
<svg width="0" height="0">
  <clipPath id="clip-xxx" clipPathUnits="objectBoundingBox">
    <path d="M 0 0 L 1 0 L 1 1 L 0 1 Z" />
  </clipPath>
</svg>

<div style="clip-path: url(#clip-xxx);">
  <!-- 內容 -->
</div>
```

**關鍵**：`clipPathUnits="objectBoundingBox"` 需要座標在 0-1 之間，所以 shapes.ts 的 0-100 座標需轉換。

### 背景圖片載入

使用 CSS `background-image` + `background-size: cover` 確保圖片填滿且不變形。

### Container Query 比例系統

- Editor canvas: `container-type: inline-size`
- 文字：`font-size: calc(var(--font-size-pct, 4) * 1cqw)`
- 貼紙：`font-size: calc(var(--font-size-pct, 4) * 2 * 1cqw)`

確保 Editor、Display、Home 的**文字與貼紙比例完全一致**。

---

## 📝 TODO: 未來可替換

### 背景圖片
目前使用 Unsplash placeholder，之後可替換為：
- 自製紙張質感圖片
- 品牌主題背景
- 音樂會照片背景

將圖片放在 `app/assets/images/backgrounds/`，並更新 `backgrounds.ts` 的 URL。

### 貼紙 SVG
目前仍使用 emoji 文字，之後可替換為：
1. 建立 SVG 檔案於 `app/assets/svg/stickers/`
2. 在 `stickers.ts` 更新：
   ```typescript
   {
     id: 'heart-svg',
     type: 'svg',
     content: 'M 50 90 Q 10 60 ...',
     viewBox: '0 0 100 100',
     ...
   }
   ```
3. 在 `StickyNote.vue` 中條件渲染：
   ```vue
   <svg v-if="sticker.type === 'svg'">
     <path :d="sticker.content" />
   </svg>
   <span v-else>{{ sticker.content }}</span>
   ```

---

## ✅ 測試檢查清單

- [ ] Editor 顯示 8 張背景縮圖
- [ ] 點擊背景可切換
- [ ] Editor 顯示 8 種造型圖示
- [ ] 點擊造型可切換
- [ ] 已移除「文字大小」slider
- [ ] 文字可用右下角旋轉按鈕縮放
- [ ] 提交後 Display 正確顯示背景與造型
- [ ] Home 即時牆/典藏牆正確顯示背景與造型
- [ ] 貼紙大小與文字比例一致（Editor = Display = Home）

---

**實作完成！** 🎉
