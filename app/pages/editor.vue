<template>
  <div class="p-editor">
    <!-- Header -->
    <AppHeader show-back relative @back="goBack">
      <template #trailing>
        <button
          type="button"
          class="p-editor__help-btn"
          aria-label="再次開啟教學"
          @click="showTutorialModal = true"
        >
          <img src="/question.svg" alt="">
        </button>
      </template>
    </AppHeader>

    <!-- Tutorial Modal -->
    <EditorTutorialModal v-model="showTutorialModal" />

    <!-- Draft Modal -->
    <AppModal
      v-model="showDraftModal"
      icon="📝"
      title="發現草稿"
      message="您有一份未完成的草稿，要繼續編輯還是重新開始？"
      confirmText="使用草稿"
      cancelText="重新開始"
      @confirm="handleDraftDecision(true)"
      @cancel="handleDraftDecision(false)"
    />

    <!-- Exit Confirmation Modal -->
    <AppModal
      v-model="showExitModal"
      title="確定離開？"
      message="目前的進度已經為您自動儲存為草稿。確定要離開編輯器嗎？"
      confirmText="確定離開"
      cancelText="留在本頁"
      @confirm="handleExitConfirm"
      @cancel="showExitModal = false"
    />

    <!-- Alert Modal -->
    <AppModal
      v-model="showAlertModal"
      icon="⚠️"
      title="提示"
      :message="alertMessage"
      confirmText="關閉"
      :cancelText="''"
      @confirm="showAlertModal = false"
    />

    <!-- Submit Confirmation Modal -->
    <AppModal
      v-model="showSubmitModal"
      title="確認上傳"
      message="請確認您的便利貼樣貌，上傳後將無法修改。"
      :loading="isSubmitting"
      @confirm="confirmSubmit"
      @cancel="showSubmitModal = false"
    >
      <template #preview>
        <StickyNote v-if="previewNoteData" :note="previewNoteData" />
      </template>
    </AppModal>

    <!-- Canvas Area -->
    <div class="p-editor__canvas-section">
      <div
        ref="canvasRef"
        class="p-editor__canvas-container"
        :class="{ 'is-draw-mode': drawMode }"
        @click="deselectAll"
        @mousedown="onCanvasMouseDown"
        @touchstart.capture="onCanvasTouchStart"
        @touchmove.capture="onCanvasTouchMove"
        @touchend.capture="onCanvasTouchEnd"
        @touchcancel.capture="onCanvasTouchEnd"
      >
        <!-- 虛擬縮放層：永遠固定 600px 大小 -->
        <div class="p-editor__canvas-scaler" :style="[scalerStyle, wrapperStyles]">
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
            <span class="p-editor__edit-frame-sizer" aria-hidden="true" :style="textStyle">{{ content || '在這裡輸入文字...' }}</span>
            <div 
              v-show="isTextEditMode"
              class="p-editor__edit-frame-drag-bar"
              @mousedown.stop="onTextBlockDragBarMouseDown"
              @touchstart.stop="onTextBlockDragBarTouchStart"
              @click.stop="selectTextBlock"
            >
              ⋮⋮
            </div>
            <!-- <div
              v-if="isTextEditMode"
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTextBlockTransformMouseDown"
              @touchstart.stop="onTextBlockTransformTouchStart"
            >
              ↻
            </div> -->
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
            <!-- <div
              v-if="selectedStickerId === sticker.id"
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTransformHandleMouseDown($event, sticker)"
              @touchstart.stop="onTransformHandleTouchStart($event, sticker)"
            >
              ↻
            </div> -->
          </div>
          </template>
        </div>
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
        <div class="p-editor__control-section">
          <h3 class="p-editor__control-title">文字對齊</h3>
          <div class="p-editor__align-row">
            <button
              v-for="opt in TEXT_ALIGN_OPTIONS"
              :key="opt.value"
              type="button"
              class="p-editor__align-btn"
              :class="{ 'is-active': textAlign === opt.value }"
              :aria-label="opt.value === 'left' ? '置左' : opt.value === 'center' ? '置中' : '置右'"
              @click="textAlign = opt.value"
            >
              <img :src="opt.svg" :alt="''" class="p-editor__align-icon" />
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

    <!-- Hidden node for high-res export (html-to-image) -->
    <div style="position: fixed; left: -9999px; top: -9999px; pointer-events: none;">
      <div ref="exportNodeRef" style="width: 1080px; height: 1080px; background: transparent; display: flex; justify-content: center; align-items: center;">
        <div style="width: 100%; height: 100%; position: relative;">
          <StickyNote v-if="previewNoteData" :note="previewNoteData" style="position: absolute; left: 0; top: 0; transform: none; width: 100%; height: 100%;" />
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
      
      <!-- 一般模式：上傳大螢幕（草稿自動儲存） -->
      <template v-else>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--share" 
          :disabled="isSubmitting || isSharing"
          @click="handleShare"
        >
          {{ isSharing ? '處理中...' : '下載 / 分享便利貼' }}
        </button>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--full" 
          :disabled="isSubmitting || isSharing"
          @click="openSubmitModal"
        >
          上傳大螢幕
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
import { EDITOR_TABS, TEXT_ALIGN_OPTIONS, TEXT_COLORS, BRUSH_COLORS, MAX_CONTENT_LENGTH } from '~/data/editor-config'
import { getTextBlockStyle, getStickerStyle } from '~/utils/sticky-note-style'
import { useStickyNoteStyle, type StickyNoteStyleProps } from '~/composables/useStickyNoteStyle'
import { useTextBlockInteraction } from '~/composables/useTextBlockInteraction'
import { useStickerInteraction } from '~/composables/useStickerInteraction'
import { useCanvasPinch } from '~/composables/useCanvasPinch'
import { useStorage } from '~/composables/useStorage'
import { useFirestore } from '~/composables/useFirestore'
import { useFabricBrush } from '~/composables/useFabricBrush'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import StickyNote from '~/components/StickyNote.vue'
import AppModal from '~/components/AppModal.vue'
import EditorTutorialModal from '~/components/EditorTutorialModal.vue'

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
const textColor = ref('#ffffff')
const textAlign = ref<'left' | 'center' | 'right'>('center')
const stickers = ref<StickerInstance[]>([])
const selectedStickerId = ref<string | null>(null)
const draggingStickerId = ref<string | null>(null)

// 文字區塊變換（位置、縮放、旋轉）
const textX = ref(50)
const textY = ref(50)
const textScale = ref(2)
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
const showTutorialModal = ref(false)
const showExitModal = ref(false)
const showSubmitModal = ref(false)

const showAlertModal = ref(false)
const alertMessage = ref('')

const showAlert = (msg: string) => {
  alertMessage.value = msg
  showAlertModal.value = true
}

const isSharing = ref(false)
const exportNodeRef = ref<HTMLElement | null>(null)

// 手繪筆刷
const drawMode = ref(false)
const drawCanUndo = ref(false)
const drawCanRedo = ref(false)
const brushColor = ref('#ffffff')
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

const noteStyleProps = computed<StickyNoteStyleProps>(() => ({
  shape: shape.value || DEFAULT_SHAPE_ID,
  textColor: textColor.value,
  textAlign: textAlign.value,
  backgroundImage: backgroundImage.value
}))

const { wrapperStyles, innerStyles: canvasStyle } = useStickyNoteStyle(noteStyleProps)

const textStyle = computed(() => ({
  ...wrapperStyles.value,
  '--text-color': textColor.value,
}))


const textBlockStyle = computed(() => ({
  ...getTextBlockStyle(textX.value, textY.value, textScale.value, textRotation.value),
  textAlign: textAlign.value
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
    scale: 3,
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
  if (lastCanvasDragEndAt.value && Date.now() - lastCanvasDragEndAt.value < 400) return
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
    textAlign: textAlign.value,
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
  onCanvasTouchEnd,
  onCanvasMouseDown,
  lastCanvasDragEndAt
} = useCanvasPinch({
  canvasRef,
  drawMode,
  isTextEditMode,
  selectedStickerId,
  stickers,
  textX,
  textY,
  textScale,
  textRotation,
  textBlockDragging,
  textBlockTransforming,
  draggingStickerId,
  transformingStickerId,
  onTextTransformEnd: saveDraftData,
  onStickerTransformEnd: saveDraftData,
  onTextDragEnd: saveDraftData,
  onStickerDragEnd: saveDraftData,
  onTextTap: () => {
    selectTextBlock()
    nextTick(() => contentEditableRef.value?.focus())
  },
  onTextDragStart: () => selectTextBlock()
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
  textAlign.value = draft.textAlign ?? 'center'
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
  textColor.value = '#ffffff'
  textAlign.value = 'center'
  stickers.value = []
  drawingData.value = null
  fabricBrush.clear()
  textX.value = 50
  textY.value = 50
  textScale.value = 2
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

const openSubmitModal = () => {
  if (!content.value.trim()) {
    showAlert('請輸入文字內容')
    return
  }
  
  const token = loadToken()
  if (!token) {
    showAlert('缺少 Token，請使用正確的連結訪問')
    return
  }

  showSubmitModal.value = true
}

const previewNoteData = computed(() => {
  const style: StickyNoteStyle = {
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textColor.value,
    textAlign: textAlign.value,
    stickers: stickers.value,
    textTransform: { x: textX.value, y: textY.value, scale: textScale.value, rotation: textRotation.value }
  }
  if (drawingData.value) style.drawing = drawingData.value

  return {
    id: 'preview',
    content: content.value.trim(),
    style: style,
    timestamp: Date.now(),
    status: 'waiting'
  } as any
})

const confirmSubmit = async () => {
  if (isSubmitting.value) return

  const token = loadToken()
  if (!token) {
    showAlert('缺少 Token，請使用正確的連結訪問')
    return
  }

  isSubmitting.value = true

  try {
    const { createNote, validateToken } = useFirestore()

    const isValid = await validateToken(token)
    if (!isValid) {
      showAlert('Token 無效或已使用，請使用新的連結')
      showSubmitModal.value = false
      return
    }

    await createNote({ content: previewNoteData.value.content, style: previewNoteData.value.style }, token)

    clearDraft()
    showSubmitModal.value = false
    router.push('/queue-status')
  } catch (e: any) {
    console.error('提交失敗:', e)
    showAlert(`提交失敗：${e?.message || '請稍後再試'}`)
  } finally {
    isSubmitting.value = false
  }
}

import { toPng } from 'html-to-image'

const handleShare = async () => {
  if (isSharing.value || !exportNodeRef.value) return
  isSharing.value = true

  try {
    await nextTick()

    // 1. 強制預載背景圖片，確保瀏覽器快取中已經具備該圖，防止 html-to-image 抓不到
    const bgUrl = previewNoteData.value?.style?.backgroundImage
    if (bgUrl) {
      await new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = resolve
        img.onerror = resolve
        img.src = bgUrl
      })
    }

    // 2. 針對 iOS 的預熱 Hack (Warm-up)
    // 多呼叫一次可以強迫 html-to-image 進行資源綁定，避免機率性破圖
    await toPng(exportNodeRef.value, { cacheBust: true, skipFonts: true }).catch(() => {})

    // 給予渲染緩衝時間
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // 3. 正式輸出
    const dataUrl = await toPng(exportNodeRef.value, {
      pixelRatio: 2, // 提升匯出畫質
      cacheBust: true,
      skipFonts: false
    })

    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], 'willmusic-note.png', { type: 'image/png' })

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'WillMusic 便利貼',
        text: '這是我剛畫好的便利貼！',
        files: [file]
      })
    } else {
      // Fallback
      const link = document.createElement('a')
      link.download = 'willmusic-note.png'
      link.href = dataUrl
      link.click()
    }
  } catch (error) {
    console.error('分享失敗:', error)
    showAlert('圖片生成失敗，請稍後再試')
  } finally {
    isSharing.value = false
  }
}

const goBack = () => {
  if (content.value || stickers.value.length > 0) {
    showExitModal.value = true
  } else {
    router.push('/')
  }
}

const handleExitConfirm = () => {
  saveDraftData()
  showExitModal.value = false
  router.push('/home')
}

// Lifecycle
const initFabricBrush = () => {
  if (typeof window === 'undefined' || !canvasRef.value || !drawingCanvasRef.value || !drawingLayerRef.value) return
  fabricBrush.init(drawingCanvasRef.value, 600, 600)
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

const scalerStyle = ref({ transform: 'scale(1)' })
const VIRTUAL_SIZE = 600
let resizeObserver: ResizeObserver | null = null

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
  } else {
    // 沒有草稿時，檢查是否看過教學
    const hasSeen = localStorage.getItem('hasSeenWillMusicTutorial')
    if (!hasSeen) {
      showTutorialModal.value = true
    }
  }

  // Scale observer
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry && entry.contentRect.width > 0) {
        const scale = entry.contentRect.width / VIRTUAL_SIZE
        scalerStyle.value = { transform: `scale(${scale})` }
      }
    })
    resizeObserver.observe(canvasRef.value)
  }

  // 初始化 Fabric 手繪
  nextTick(() => {
    initFabricBrush()
  })
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  fabricBrush.dispose()
})

// Auto-save on changes
watch([backgroundImage, shape, textColor], () => {
  saveDraftData()
})
</script>