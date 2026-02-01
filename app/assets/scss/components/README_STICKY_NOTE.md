# 便利貼組件 CSS 架構文件

## 檔案位置
`app/assets/scss/components/_sticky-note.scss`

## 設計原則

### 1. BEM 命名規範
- Block: `.c-sticky-note` (c- 前綴代表 component)
- Element: `.c-sticky-note__content`, `.c-sticky-note__sticker`
- Modifier: `.c-sticky-note-container--editor`, `.c-sticky-note-container--wall`

### 2. 等比例縮放系統
所有內部元素使用 `em` 單位，相對於容器的 `fontSize`：

```scss
.c-sticky-note {
  font-size: inherit; // 繼承傳入的 fontSize (例如 24px)
  padding: 1.33em;    // = 32px when fontSize=24px
  
  &__content {
    font-size: 1em;   // = 24px when fontSize=24px
  }
  
  &__sticker {
    font-size: 2em;   // = 48px when fontSize=24px
  }
}
```

**優點**：
- 只需調整容器的 `fontSize`，所有內部元素自動等比例縮放
- 文字、貼紙、內距在任何尺寸下保持相同視覺比例

### 3. 容器變體 (Modifiers)

不同頁面使用不同的容器 class 來控制尺寸：

| 變體 Class | 用途 | 最大寬度 |
|-----------|------|---------|
| `.c-sticky-note-container--editor` | 編輯器畫布 | 600px |
| `.c-sticky-note-container--wall` | Home 牆面 | 400px |
| `.c-sticky-note-container--display` | Display 大螢幕 | 600px |
| `.c-sticky-note-container--preview` | 預覽模式 | 600px |

## 使用方式

### 在 Vue 組件中

```vue
<template>
  <!-- 在容器上加上對應的變體 class -->
  <div class="c-sticky-note-container--wall">
    <StickyNote :note="item" />
  </div>
</template>
```

### 各頁面範例

#### Home 頁面 (牆面)
```vue
<div class="wall-item c-sticky-note-container--wall">
  <StickyNote :note="item" />
</div>
```

#### Display 頁面 (大螢幕)
```vue
<div class="current-note c-sticky-note-container--display">
  <StickyNote :note="currentItem" animate />
</div>
```

#### Editor 頁面 (預覽)
```vue
<div class="preview-content c-sticky-note-container--preview">
  <StickyNote :note="previewNote" />
</div>
```

## 維護指南

### 調整便利貼尺寸
修改 `_sticky-note.scss` 中的容器變體：

```scss
.c-sticky-note-container--wall {
  max-width: 400px; // 修改這裡
}
```

### 調整內部元素比例
修改 `em` 值：

```scss
.c-sticky-note {
  padding: 1.33em; // 調整內距比例
  
  &__sticker {
    font-size: 2em; // 調整貼紙大小比例
  }
}
```

### 新增背景圖案
在 `data-pattern` 屬性中新增：

```scss
.c-sticky-note[data-pattern="new-pattern"] {
  background-image: /* 你的背景 */;
}
```

## 比例一致性保證

無論容器實際寬度是 300px、600px 或 900px：
- ✅ 文字大小 24px 始終佔寬度的固定比例
- ✅ 貼紙始終是文字的 2 倍大小
- ✅ 內距始終是 1.33em
- ✅ 貼紙位置 (x%, y%) 在任何尺寸下都在相同相對位置

這確保了在 Editor、Display、Home 三個頁面中，便利貼的視覺比例完全一致。
