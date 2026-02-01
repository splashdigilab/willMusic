# CSS 結構化重構指南

## 完成項目 ✅

### Components
- ✅ `_sticky-note.scss` - 便利貼組件 (`.c-sticky-note`)
- ✅ `_browser-warning.scss` - 瀏覽器警告 (`.c-browser-warning`)
- ✅ `_style-picker.scss` - 樣式選擇器 (`.c-style-picker`)

### Pages
- ✅ `_index.scss` - 首頁重導向 (`.p-index`)
- ✅ `_home.scss` - Landing Page (`.p-home`)
- ✅ `_display.scss` - LED 顯示頁面 (`.p-display`)
- ✅ `_editor.scss` - 編輯器頁面 (`.p-editor`)
- ✅ `_admin.scss` - 管理後台 (`.p-admin`)
- ✅ `_queue-status.scss` - 佇列狀態 (`.p-queue-status`)

## 命名規範

### Component 組件
- **前綴**：`.c-`
- **範例**：`.c-sticky-note`, `.c-sticky-note__content`, `.c-sticky-note__sticker`
- **BEM 格式**：`.c-{component}`, `.c-{component}__{element}`, `.c-{component}--{modifier}`

### Page 頁面
- **前綴**：`.p-`
- **範例**：`.p-home`, `.p-home__header`, `.p-home__title`
- **BEM 格式**：`.p-{page}`, `.p-{page}__{element}`, `.p-{page}--{modifier}`

## 檔案結構

```
app/assets/scss/
├── components/
│   ├── _sticky-note.scss          ✅
│   ├── _browser-warning.scss      ✅
│   ├── _style-picker.scss         ✅
│   ├── _ar-camera.scss            (既有)
│   ├── _map.scss                  (既有)
│   └── component-index.scss       ✅ 更新
├── pages/
│   ├── _index.scss                ✅
│   ├── _home.scss                 ✅
│   ├── _display.scss              ✅
│   ├── _editor.scss               ✅
│   ├── _admin.scss                ✅
│   ├── _queue-status.scss         ✅
│   ├── _sky.scss                  (既有)
│   ├── _privacy-policy.scss       (既有)
│   └── page-index.scss            ✅ 更新
└── main.scss
```

## Vue 組件更新狀態

### Components (已完成)
- ✅ `BrowserWarning.vue` - 已更新為 `.c-browser-warning-*`
- ✅ `StylePicker.vue` - 已更新為 `.c-style-picker__*`
- ✅ `StickyNote.vue` - 已更新為 `.c-sticky-note`, 移除 scoped CSS

### Pages (需手動更新)
- ✅ `index.vue` - 已更新為 `.p-index-*`
- ⏳ `home.vue` - **需更新** 
- ⏳ `display.vue` - **需更新**
- ⏳ `editor.vue` - **需更新**
- ⏳ `admin.vue` - **需更新**
- ⏳ `queue-status.vue` - **需更新**

## 更新步驟（手動）

### 1. 更新 template 中的 class

**Before:**
```vue
<div class="landing-page">
  <header class="landing-header">
    <h1 class="landing-title">Title</h1>
  </header>
</div>
```

**After:**
```vue
<div class="p-home">
  <header class="p-home__header">
    <h1 class="p-home__title">Title</h1>
  </header>
</div>
```

### 2. 移除 `<style scoped>` 區塊

**Before:**
```vue
<style scoped lang="scss">
.landing-page {
  /* ... */
}
</style>
```

**After:**
```vue
<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_home.scss */
</style>
```

## 頁面對應表

| Vue 檔案 | SCSS 檔案 | 主要 Class 前綴 | 狀態 |
|---------|----------|---------------|------|
| `index.vue` | `pages/_index.scss` | `.p-index` | ✅ |
| `home.vue` | `pages/_home.scss` | `.p-home` | ⏳ |
| `display.vue` | `pages/_display.scss` | `.p-display` | ⏳ |
| `editor.vue` | `pages/_editor.scss` | `.p-editor` | ⏳ |
| `admin.vue` | `pages/_admin.scss` | `.p-admin` | ⏳ |
| `queue-status.vue` | `pages/_queue-status.scss` | `.p-queue-status` | ⏳ |

## Class 映射參考

### home.vue
| 舊 Class | 新 Class |
|---------|----------|
| `.landing-page` | `.p-home` |
| `.landing-header` | `.p-home__header` |
| `.landing-title` | `.p-home__title` |
| `.landing-subtitle` | `.p-home__subtitle` |
| `.landing-tabs` | `.p-home__tabs` |
| `.tabs-wrapper` | `.p-home__tabs-wrapper` |
| `.tab-item` | `.p-home__tab-item` |
| `.tab-icon` | `.p-home__tab-icon` |
| `.live-wall` | `.p-home__live-wall` |
| `.archive-wall` | `.p-home__archive-wall` |
| `.wall-grid` | `.p-home__wall-grid` |
| `.wall-item` | `.p-home__wall-item` |
| `.container` | `.p-home__container` |
| `.loading-state` | `.p-home__loading-state` |
| `.loading-spinner` | `.p-home__loading-spinner` |
| `.empty-state` | `.p-home__empty-state` |
| `.empty-icon` | `.p-home__empty-icon` |
| `.fab` | `.p-home__fab` |
| `.fab-icon` | `.p-home__fab-icon` |
| `.fab-text` | `.p-home__fab-text` |

### display.vue
| 舊 Class | 新 Class |
|---------|----------|
| `.display-page` | `.p-display` |
| `.queue-info` | `.p-display__queue-info` |
| `.queue-info__item` | `.p-display__queue-info-item` |
| `.queue-info__label` | `.p-display__queue-info-label` |
| `.queue-info__value` | `.p-display__queue-info-value` |
| `.display-area` | `.p-display__display-area` |
| `.current-note` | `.p-display__current-note` |
| `.idle-state` | `.p-display__idle-state` |
| `.idle-state__content` | `.p-display__idle-state-content` |
| `.idle-state__title` | `.p-display__idle-state-title` |
| `.floating-note` | `.p-display__floating-note` |
| `.queue-preview` | `.p-display__queue-preview` |

### editor.vue
所有 class 加上 `.p-editor__` 前綴，詳見 `pages/_editor.scss`

### admin.vue
所有 class 加上 `.p-admin__` 前綴，詳見 `pages/_admin.scss`

### queue-status.vue
所有 class 加上 `.p-queue-status__` 前綴，詳見 `pages/_queue-status.scss`

## 優點

1. **命名清晰**：一眼就能辨識是 component 還是 page
2. **避免衝突**：`.c-` 和 `.p-` 前綴確保不會有命名衝突
3. **易於維護**：所有樣式集中管理，不分散在各個 Vue 檔案
4. **BEM 規範**：統一使用 Block__Element--Modifier 命名
5. **效能優化**：減少 scoped CSS 的額外處理

## 注意事項

⚠️ **重要**：更新 Vue template 中的 class 名稱時，請確保：
1. 所有 class 都已在對應的 SCSS 檔案中定義
2. 動態 class (如 `:class="{ 'is-active': ... }"`) 也需要更新
3. 第三方組件或 Transition 的 class 不需要改動
4. 測試所有頁面確保樣式正常顯示
