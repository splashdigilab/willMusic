<template>
  <div class="p-editor">
    <!-- Header -->
    <header class="p-editor__header">
      <button class="p-editor__header-back-btn" @click="goBack">
        <img src="/back-btn.svg" alt="">
      </button>
      <div class="p-editor__header-logo">
        <img src="/logo.svg" alt="logo" />
      </div>
    </header>

    <!-- Draft Modal -->
    <div v-if="showDraftModal" class="p-editor__modal-overlay" @click="handleDraftDecision(false)">
      <div class="p-editor__modal-content" @click.stop>
        <div class="p-editor__modal-icon">📝</div>
        <h2 class="p-editor__modal-title">發現草稿</h2>
        <p class="p-editor__modal-message">
          您有一份未完成的草稿，要繼續編輯還是重新開始？
        </p>
        <div class="p-editor__modal-actions">
          <button class="p-editor__action-btn p-editor__action-btn--secondary" @click="handleDraftDecision(false)">
            重新開始
          </button>
          <button class="p-editor__action-btn p-editor__action-btn--primary" @click="handleDraftDecision(true)">
            使用草稿
          </button>
        </div>
      </div>
    </div>

    <!-- Canvas Area -->
    <div class="p-editor__canvas-section">
      <div
        ref="canvasRef"
        class="p-editor__canvas-container"
        :class="{ 'is-draw-mode': drawMode }"
        @click="deselectAll"
        @touchstart.capture="onCanvasTouchStart"
        @touchmove.capture="onCanvasTouchMove"
        @touchend.capture="onCanvasTouchEnd"
        @touchcancel.capture="onCanvasTouchEnd"
      >
        <!-- 可裁切層：背景、文字內容、貼紙圖片 -->
        <div class="p-editor__canvas p-editor__canvas--stage" :style="canvasStyle">
          <!-- 文字內容（可裁切） -->
          <div
            ref="textBlockRef"
            class="p-editor__text-content"
            :style="[textBlockStyle, drawMode ? { pointerEvents: 'none' } : {}]"
            @click.stop="() => { if (!drawMode) selectTextBlock() }"
          >
            <div
              ref="contentEditableRef"
              class="p-editor__canvas-text"
              :class="{ 'is-empty': !content.trim() }"
              :style="textStyle"
              :contenteditable="!drawMode"
              @input="handleTextInput"
              @click.stop="() => { if (!drawMode) selectTextBlock() }"
              @focus="() => { if (!drawMode) selectTextBlock() }"
              data-placeholder="在這裡輸入文字..."
            />
          </div>

          <!-- 貼紙圖片（可裁切）；便利貼/文字 tab 時點擊可進入貼紙編輯 -->
          <div
            v-for="sticker in stickers"
            :key="sticker.id"
            class="p-editor__sticker-content"
            :class="{ 'is-sticker-clickable': !drawMode && (activeTab === 'note' || activeTab === 'text') }"
            :style="getStickerStyle(sticker)"
            @click.stop="selectSticker(sticker.id)"
            @touchstart.stop="selectSticker(sticker.id)"
          >
            <img 
              v-if="getStickerById(sticker.type)?.svgFile"
              :src="getStickerById(sticker.type)?.svgFile"
              :alt="getStickerById(sticker.type)?.id"
              class="p-editor__sticker-img"
            />
          </div>

          <!-- 手繪層 (Fabric.js) -->
          <div
            ref="drawingLayerRef"
            class="p-editor__drawing-layer"
            :class="{ 'is-active': drawMode }"
            :style="{ pointerEvents: drawMode ? 'auto' : 'none' }"
          >
            <canvas ref="drawingCanvasRef" class="p-editor__drawing-canvas" />
          </div>
        </div>

        <!-- UI 層：編輯框置頂，不被裁切（繪圖模式時隱藏以便手繪） -->
        <div class="p-editor__canvas-ui" :style="{ pointerEvents: drawMode ? 'none' : undefined }">
          <!-- 文字區塊編輯框（與文字內容同位置、同尺寸） -->
          <div
            class="p-editor__edit-frame p-editor__edit-frame--text"
            :class="{ 
              'is-selected': isTextEditMode,
              'is-dragging': textBlockDragging,
              'is-transforming': textBlockTransforming
            }"
            :style="textBlockStyle"
            @mousedown="selectTextBlock"
            @touchstart.stop="selectTextBlock"
          >
            <!-- 隱藏 sizer：與 contenteditable 同字體/padding，讓編輯框寬高與文字一致；空白時用 placeholder 撐開寬度 -->
            <span class="p-editor__edit-frame-sizer" aria-hidden="true">{{ content || '在這裡輸入文字...' }}</span>
            <div 
              v-show="isTextEditMode"
              class="p-editor__edit-frame-drag-bar"
              @mousedown.stop="onTextBlockDragBarMouseDown"
              @touchstart.stop="onTextBlockDragBarTouchStart"
              @click.stop="selectTextBlock"
            >
              ⋮⋮
            </div>
            <div
              v-if="isTextEditMode"
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTextBlockTransformMouseDown"
              @touchstart.stop="onTextBlockTransformTouchStart"
            >
              ↻
            </div>
          </div>

          <!-- 貼紙編輯框（僅在貼紙 tab 時顯示） -->
          <template v-if="activeTab === 'sticker'">
          <div
            v-for="sticker in stickers"
            :key="`ui-${sticker.id}`"
            class="p-editor__edit-frame p-editor__edit-frame--sticker"
            :class="{ 
              'is-selected': selectedStickerId === sticker.id,
              'is-dragging': draggingStickerId === sticker.id,
              'is-transforming': transformingStickerId === sticker.id
            }"
            :style="getStickerStyle(sticker)"
            @mousedown="onStickerMouseDown($event, sticker)"
            @touchstart="onStickerTouchStart($event, sticker)"
            @click.stop="onStickerClick(sticker.id)"
          >
            <button
              v-if="selectedStickerId === sticker.id"
              class="p-editor__edit-frame-delete"
              @click.stop="removeSticker(sticker.id)"
            >
              ✕
            </button>
            <div
              v-if="selectedStickerId === sticker.id"
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTransformHandleMouseDown($event, sticker)"
              @touchstart.stop="onTransformHandleTouchStart($event, sticker)"
            >
              ↻
            </div>
          </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Control Panel -->
    <div class="p-editor__control-panel">
      <!-- Tab Bar -->
      <div class="p-editor__tab-bar">
        <button
          v-for="tab in EDITOR_TABS"
          :key="tab.id"
          class="p-editor__tab-btn"
          :class="{ 'is-active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <img :src="tab.icon" :alt="tab.label" class="p-editor__tab-icon" />
          <span class="p-editor__tab-label">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab: 便利貼 -->
      <div v-show="activeTab === 'note'" class="p-editor__tab-content">
        <div class="p-editor__control-section">
          <h3 class="p-editor__control-title">選擇便利貼材質</h3>
          <div class="p-editor__background-grid">
            <button
              v-for="bg in backgrounds"
              :key="bg.id"
              class="p-editor__background-btn"
              :class="{ 'is-active': backgroundImage === bg.url }"
              @click="backgroundImage = bg.url"
            >
              <img :src="bg.url" :alt="bg.id" class="p-editor__background-img" />
              <img v-if="backgroundImage === bg.url" src="/check.svg" alt="" class="p-editor__background-check" />
            </button>
          </div>
        </div>
        <div class="p-editor__control-section">
          <h3 class="p-editor__control-title">選擇便利貼造型</h3>
          <div class="p-editor__shape-grid">
            <button
              v-for="shapeItem in shapes"
              :key="shapeItem.id"
              class="p-editor__shape-btn"
              :class="{ 'is-active': shape === shapeItem.id }"
              :style="{ '--shape-svg': `url(${shapeItem.svg})` }"
              @click="shape = shapeItem.id"
            >
              <span class="p-editor__shape-icon" :aria-label="shapeItem.id" />
              <img v-if="shape === shapeItem.id" src="/check.svg" alt="" class="p-editor__shape-check" />
            </button>
          </div>
        </div>
      </div>

      <!-- Tab: 文字 -->
      <div v-show="activeTab === 'text'" class="p-editor__tab-content">
        <div class="p-editor__control-section">
          <h3 class="p-editor__control-title">選擇文字顏色</h3>
          <div class="p-editor__color-grid">
            <button
              v-for="color in TEXT_COLORS"
              :key="color.value"
              class="p-editor__color-btn"
              :class="{ 'is-active': textColor === color.value }"
              :style="{ '--btn-color': color.value }"
              @click="textColor = color.value"
            >
              <img v-if="textColor === color.value" src="/check.svg" alt="" class="p-editor__color-check" />
            </button>
          </div>
        </div>
      </div>

      <!-- Tab: 繪圖 -->
      <div v-show="activeTab === 'draw'" class="p-editor__tab-content">
        <div class="p-editor__control-section">
          <h3 class="p-editor__control-title">選擇筆刷顏色</h3>
          <div class="p-editor__color-grid">
            <button
              v-for="c in BRUSH_COLORS"
              :key="c.value"
              class="p-editor__color-btn"
              :class="{ 'is-active': !eraserMode && brushColor === c.value }"
              :style="{ '--btn-color': c.value }"
              @click="() => { brushColor = c.value; eraserMode = false }"
            >
              <img v-if="!eraserMode && brushColor === c.value" src="/check.svg" alt="" class="p-editor__color-check" />
            </button>
            <!-- 橡皮擦按鈕 -->
            <button
              class="p-editor__color-btn p-editor__color-btn--eraser"
              :class="{ 'is-active': eraserMode }"
              @click="eraserMode = true"
            >
              <img src="/erase.svg" alt="橡皮擦" class="p-editor__color-eraser-icon" />
            </button>
          </div>
        </div>
        <div class="p-editor__control-section">
          <h3 class="p-editor__control-title">調整筆刷大小</h3>
          <input
            v-model.number="brushWidth"
            type="range"
            min="2"
            max="40"
            class="p-editor__brush-slider"
          />
        </div>
      </div>

      <!-- Tab: 貼紙 -->
      <div v-show="activeTab === 'sticker'" class="p-editor__tab-content">
        <div class="p-editor__control-section">
          <h3 class="p-editor__control-title">選擇貼紙</h3>
          <div class="p-editor__sticker-grid">
          <button
            v-for="sticker in STICKER_LIBRARY"
            :key="sticker.id"
            class="p-editor__sticker-btn"
            @click="addSticker(sticker.id)"
          >
            <img 
              v-if="sticker.svgFile"
              :src="sticker.svgFile"
              :alt="sticker.id"
              class="p-editor__sticker-btn-img"
            />
          </button>
        </div>
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div class="p-editor__bottom-actions">
      <!-- 繪圖模式：上一步 / 完成繪圖 / 下一步 -->
      <template v-if="drawMode">
        <button
          type="button"
          class="p-editor__draw-btn p-editor__draw-btn--undo"
          :disabled="!drawCanUndo"
          @click="fabricBrush.undo()"
        >
          <img src="/undo.svg" alt="上一步" class="p-editor__draw-btn-icon" />
        </button>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--complete"
          @click="activeTab = 'note'"
        >
          完成繪圖
        </button>
        <button
          type="button"
          class="p-editor__draw-btn p-editor__draw-btn--redo"
          :disabled="!drawCanRedo"
          @click="fabricBrush.redo()"
        >
          <img src="/undo.svg" alt="下一步" class="p-editor__draw-btn-icon p-editor__draw-btn-icon--redo" />
        </button>
      </template>
      
      <!-- 一般模式：備存草稿 / 上傳大螢幕 -->
      <template v-else>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--secondary"
          @click="saveDraftData"
        >
          儲存草稿
        </button>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary" 
          :disabled="isSubmitting"
          @click="handleSubmit"
        >
          {{ isSubmitting ? '提交中...' : '上傳大螢幕' }}
        </button>
      </template>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { StickerInstance, DraftData, StickyNoteStyle } from '~/types'
import { getStickerById, STICKER_LIBRARY } from '~/data/stickers'
import { BACKGROUND_IMAGES } from '~/data/backgrounds'
import { STICKY_NOTE_SHAPES, DEFAULT_SHAPE_ID, getShapeById } from '~/data/shapes'
import { EDITOR_TABS, TEXT_COLORS, BRUSH_COLORS, MAX_CONTENT_LENGTH } from '~/data/editor-config'
import { useTextBlockInteraction } from '~/composables/useTextBlockInteraction'
import { useStickerInteraction } from '~/composables/useStickerInteraction'
import { useCanvasPinch } from '~/composables/useCanvasPinch'
import { useStorage } from '~/composables/useStorage'
import { useFirestore } from '~/composables/useFirestore'
import { useFabricBrush } from '~/composables/useFabricBrush'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' }
  ],
  bodyAttrs: { class: 'is-editor-page' }
})

const route = useRoute()
const router = useRouter()
const { saveDraft, loadDraft, clearDraft, saveToken, loadToken } = useStorage()

// Editor State
const content = ref('')
const backgroundImage = ref(BACKGROUND_IMAGES?.[0]?.url ?? '') // 預設第一張背景
const shape = ref(DEFAULT_SHAPE_ID)
const textColor = ref('#333333')
const stickers = ref<StickerInstance[]>([])
const selectedStickerId = ref<string | null>(null)
const draggingStickerId = ref<string | null>(null)

// 文字區塊變換（位置、縮放、旋轉）
const textX = ref(50)
const textY = ref(50)
const textScale = ref(1)
const textRotation = ref(0)
const textBlockSelected = ref(false)
const textBlockDragging = ref(false)
const textBlockTransforming = ref(false)

const canvasRef = ref<HTMLElement | null>(null)
const textBlockRef = ref<HTMLElement | null>(null)
const contentEditableRef = ref<HTMLDivElement | null>(null)
const drawingLayerRef = ref<HTMLElement | null>(null)
const drawingCanvasRef = ref<HTMLCanvasElement | null>(null)

// Tab: 便利貼 | 文字 | 繪圖 | 貼紙
const activeTab = ref<'note' | 'text' | 'draw' | 'sticker' | null>('note')

// 文字編輯模式：點選文字或選到文字 tab 時才顯示選取狀態
const isTextEditMode = computed(() => textBlockSelected.value || activeTab.value === 'text')

const transformingStickerId = ref<string | null>(null)
const showDraftModal = ref(false)

// 手繪筆刷
const drawMode = ref(false)
const drawCanUndo = ref(false)
const drawCanRedo = ref(false)
const brushColor = ref('#333333')
const brushWidth = ref(8)
const eraserMode = ref(false)
const drawingData = ref<string | null>(null)
// 資料來源
const backgrounds = BACKGROUND_IMAGES
const shapes = STICKY_NOTE_SHAPES

// Sticker Management

// Fabric 手繪筆刷
const fabricBrush = useFabricBrush(() => {
  const data = fabricBrush.exportToDataURL()
  if (data) {
    drawingData.value = data
    saveDraftData()
  }
})
// 切換 tab 時同步繪圖模式與文字選取狀態
watch(activeTab, (tab) => {
  // 繪圖：進入/退出繪圖模式
  if (tab === 'draw') {
    drawMode.value = true
    fabricBrush.setDrawingMode(true)
  } else {
    if (drawMode.value) {
      const data = fabricBrush.exportToDataURL()
      if (data) drawingData.value = data
      fabricBrush.setDrawingMode(false)
      saveDraftData()
    }
    drawMode.value = false
  }
  // 貼紙：切換到非貼紙 tab 時移除貼紙編輯框與選取狀態
  if (tab !== 'sticker') {
    selectedStickerId.value = null
  }
  // 文字：切換到非文字 tab 時取消文字選取
  if (tab !== 'text') {
    textBlockSelected.value = false
    nextTick(() => contentEditableRef.value?.blur())
  }
}, { immediate: true })

watch(brushColor, (c) => {
  fabricBrush.setBrushColor(c)
}, { immediate: false })

watch(brushWidth, (w) => {
  fabricBrush.setBrushWidth(w)
  fabricBrush.setEraserWidth(w)
}, { immediate: false })

watch(eraserMode, (toEraser) => {
  fabricBrush.setEraserMode(toEraser)
}, { immediate: false })

watch(drawMode, (v) => {
  if (v) {
    contentEditableRef.value?.blur()
    if (fabricBrush.isInitialized()) {
      fabricBrush.setOnUndoRedoChange(() => {
        drawCanUndo.value = fabricBrush.canUndo()
        drawCanRedo.value = fabricBrush.canRedo()
      })
      drawCanUndo.value = fabricBrush.canUndo()
      drawCanRedo.value = fabricBrush.canRedo()
    }
  }
})

// mask-image 直接使用 Illustrator 輸出的 SVG（無需 clipPath），遮罩 = 形狀的填色區域
const shapeMaskUrl = computed(() => {
  const shapeData = getShapeById(shape.value)
  const s = shapeData ?? getShapeById(DEFAULT_SHAPE_ID)
  return s ? s.svg : '/svg/shapes/square.svg'
})

const canvasStyle = computed(() => {
  const fontPct = 4
  const maskUrl = shapeMaskUrl.value
  return {
    backgroundImage: `url(${backgroundImage.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    maskImage: `url(${maskUrl})`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskImage: `url(${maskUrl})`,
    WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    '--font-size-pct': fontPct
  }
})

const textStyle = computed(() => ({
  color: textColor.value,
  '--text-color': textColor.value
}))

const getStickerStyle = (sticker: StickerInstance) => ({
  left: `${sticker.x}%`,
  top: `${sticker.y}%`,
  transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
  '--inverse-scale': 1 / sticker.scale
})

const textBlockStyle = computed(() => ({
  left: '0',
  top: '0',
  transform: `translate(calc(${textX.value}cqw - 50%), calc(${textY.value}cqw - 50%)) scale(${textScale.value}) rotate(${textRotation.value}deg)`,
  '--inverse-scale': 1 / textScale.value,
  '--text-scale': textScale.value
}))


// Methods
let textInputDebounceTimer: ReturnType<typeof setTimeout> | null = null
const handleTextInput = (e: Event) => {
  const target = e.target as HTMLElement
  const text = target.innerText.slice(0, MAX_CONTENT_LENGTH)
  content.value = text
  if (target.innerText.length > MAX_CONTENT_LENGTH) {
    target.innerText = text
    placeCaretAtEnd(target)
  }
  saveDraftData()
  if (textInputDebounceTimer) clearTimeout(textInputDebounceTimer)
  textInputDebounceTimer = setTimeout(() => {
    textInputDebounceTimer = null
  }, 400)
}

const placeCaretAtEnd = (el: HTMLElement) => {
  const range = document.createRange()
  const sel = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

const syncContentToDom = (text: string) => {
  nextTick(() => {
    if (contentEditableRef.value) {
      contentEditableRef.value.innerText = text
    }
  })
}

const addSticker = (stickerType: string) => {
  const newSticker: StickerInstance = {
    id: `sticker-${Date.now()}`,
    type: stickerType,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 20,
    scale: 1,
    rotation: (Math.random() - 0.5) * 30
  }
  stickers.value.push(newSticker)
  saveDraftData()
  // 選取新貼紙並切到貼紙 tab，讓編輯框出現
  selectedStickerId.value = newSticker.id
  textBlockSelected.value = false
  activeTab.value = 'sticker'
}

const selectSticker = (id: string) => {
  selectedStickerId.value = id
  textBlockSelected.value = false
  activeTab.value = 'sticker'
}

const selectTextBlock = () => {
  textBlockSelected.value = true
  selectedStickerId.value = null
  activeTab.value = 'text'
  nextTick(() => contentEditableRef.value?.focus())
}

const deselectAll = () => {
  selectedStickerId.value = null
  textBlockSelected.value = false
}

// saveDraftData 需在 composable 之前定義（作為 callback）
const saveDraftData = () => {
  const draft: DraftData = {
    content: content.value,
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textColor.value,
    stickers: stickers.value,
    textTransform: { x: textX.value, y: textY.value, scale: textScale.value, rotation: textRotation.value },
    drawing: drawingData.value ?? undefined,
    timestamp: Date.now()
  }
  saveDraft(draft)
}

const {
  onTextBlockDragBarMouseDown,
  onTextBlockDragBarTouchStart,
  onTextBlockTransformMouseDown,
  onTextBlockTransformTouchStart
} = useTextBlockInteraction({
  canvasRef,
  textX,
  textY,
  textScale,
  textRotation,
  textBlockDragging,
  textBlockTransforming,
  selectTextBlock,
  onDragEnd: saveDraftData,
  onTransformEnd: saveDraftData
})

const {
  onCanvasTouchStart,
  onCanvasTouchMove,
  onCanvasTouchEnd
} = useCanvasPinch({
  canvasRef,
  drawMode,
  isTextEditMode,
  selectedStickerId,
  stickers,
  textScale,
  textRotation,
  textBlockTransforming,
  transformingStickerId,
  onTextTransformEnd: saveDraftData,
  onStickerTransformEnd: saveDraftData
})

const {
  onStickerMouseDown,
  onStickerTouchStart,
  onStickerClick,
  onTransformHandleMouseDown,
  onTransformHandleTouchStart
} = useStickerInteraction({
  canvasRef,
  stickers,
  selectedStickerId,
  draggingStickerId,
  transformingStickerId,
  selectSticker,
  onDragEnd: saveDraftData,
  onTransformEnd: saveDraftData
})

const removeSticker = (id: string) => {
  stickers.value = stickers.value.filter(s => s.id !== id)
  selectedStickerId.value = null
  saveDraftData()
}

const loadDraftData = async (draft: DraftData) => {
  content.value = draft.content
  backgroundImage.value = draft.backgroundImage
  shape.value = draft.shape
  textColor.value = draft.textColor
  stickers.value = draft.stickers
  drawingData.value = draft.drawing ?? null
  if (draft.textTransform) {
    textX.value = draft.textTransform.x
    textY.value = draft.textTransform.y
    textScale.value = draft.textTransform.scale
    textRotation.value = draft.textTransform.rotation
  }
  syncContentToDom(draft.content)
  if (draft.drawing) {
    await nextTick()
    fabricBrush.loadFromDataURL(draft.drawing)
  }
}

const resetEditorToInitial = () => {
  content.value = ''
  backgroundImage.value = BACKGROUND_IMAGES?.[0]?.url ?? ''
  shape.value = DEFAULT_SHAPE_ID
  textColor.value = '#333333'
  stickers.value = []
  drawingData.value = null
  fabricBrush.clear()
  textX.value = 50
  textY.value = 50
  textScale.value = 1
  textRotation.value = 0
  syncContentToDom('')
}

const handleDraftDecision = async (useDraft: boolean) => {
  if (useDraft) {
    showDraftModal.value = false
    const draft = loadDraft()
    if (draft) {
      await nextTick()
      await new Promise<void>(r => requestAnimationFrame(() => r()))
      await loadDraftData(draft)
    }
  } else {
    resetEditorToInitial()
    clearDraft()
    showDraftModal.value = false
  }
}

const isSubmitting = ref(false)

const handleSubmit = async () => {
  if (isSubmitting.value) return

  if (!content.value.trim()) {
    alert('請輸入文字內容')
    return
  }

  const token = loadToken()
  if (!token) {
    alert('缺少 Token，請使用正確的連結訪問')
    return
  }

  isSubmitting.value = true

  try {
    const { createNote, validateToken } = useFirestore()

    const isValid = await validateToken(token)
    if (!isValid) {
      alert('Token 無效或已使用，請使用新的連結')
      return
    }

    const style: StickyNoteStyle = {
      backgroundImage: backgroundImage.value,
      shape: shape.value,
      textColor: textColor.value,
      stickers: stickers.value,
      textTransform: { x: textX.value, y: textY.value, scale: textScale.value, rotation: textRotation.value }
    }
    if (drawingData.value) style.drawing = drawingData.value

    await createNote({ content: content.value.trim(), style }, token)

    clearDraft()
    router.push('/queue-status')
  } catch (e: any) {
    console.error('提交失敗:', e)
    alert(`提交失敗：${e?.message || '請稍後再試'}`)
  } finally {
    isSubmitting.value = false
  }
}

const goBack = () => {
  if (content.value || stickers.value.length > 0) {
    if (confirm('離開前要儲存草稿嗎？')) {
      saveDraftData()
    }
  }
  router.push('/home')
}

// Lifecycle
const initFabricBrush = () => {
  if (typeof window === 'undefined' || !canvasRef.value || !drawingCanvasRef.value || !drawingLayerRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const size = Math.min(rect.width, rect.height)
  if (size < 10) return
  fabricBrush.init(drawingCanvasRef.value, size, size)
  fabricBrush.setOnUndoRedoChange(() => {
    drawCanUndo.value = fabricBrush.canUndo()
    drawCanRedo.value = fabricBrush.canRedo()
  })
  fabricBrush.setBrushColor(brushColor.value)
  fabricBrush.setBrushWidth(brushWidth.value)
  fabricBrush.setEraserWidth(brushWidth.value)
  fabricBrush.setEraserMode(eraserMode.value)
  fabricBrush.setDrawingMode(drawMode.value)
  if (drawingData.value) {
    fabricBrush.loadFromDataURL(drawingData.value)
  }
  drawCanUndo.value = fabricBrush.canUndo()
  drawCanRedo.value = fabricBrush.canRedo()
}



onMounted(() => {
  // 處理 Token
  const tokenFromQuery = route.query.token as string
  if (tokenFromQuery) {
    saveToken(tokenFromQuery)
  }

  // 檢查草稿（僅顯示 modal，不預先載入內容；等使用者選擇「使用草稿」才載入）
  const existingDraft = loadDraft()
  if (existingDraft) {
    showDraftModal.value = true
  }

  // 初始化 Fabric 手繪
  nextTick(() => {
    initFabricBrush()
    const ro = canvasRef.value ? new ResizeObserver(() => {
      nextTick(() => {
        if (!canvasRef.value || !drawingCanvasRef.value) return
        const rect = canvasRef.value.getBoundingClientRect()
        const size = Math.min(rect.width, rect.height)
        if (fabricBrush.isInitialized()) {
          fabricBrush.resize(size, size)
        } else {
          initFabricBrush()
        }
      })
    }) : null
    if (canvasRef.value && ro) {
      ro.observe(canvasRef.value)
      onUnmounted(() => {
        ro.disconnect()
        fabricBrush.dispose()
      })
    }
  })
})

// Auto-save on changes
watch([backgroundImage, shape, textColor], () => {
  saveDraftData()
})
</script>