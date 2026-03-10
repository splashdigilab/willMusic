<template>
  <div class="p-editor">
    <!-- Loading Overlay -->
    <Transition name="fade">
      <div v-if="isLoadingFonts" class="p-editor__loading-overlay">
        <div class="p-editor__loading-spinner"></div>
        <p>載入字體中...</p>
      </div>
    </Transition>

    <template v-if="!isLoadingFonts">
      <!-- Header -->
      <AppHeader show-back show-help relative @back="goBack" @help="showTutorialModal = true" />

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
      :icon="alertIcon"
      :title="alertTitle"
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

    <!-- Clear All Confirmation Modal -->
    <AppModal
      v-model="showClearAllModal"
      icon="⚠️"
      title="確認清除"
      message="確定要清除畫面上所有的內容嗎？此動作無法復原。"
      confirmText="確定清除"
      cancelText="取消"
      @confirm="confirmClearAll"
      @cancel="showClearAllModal = false"
    />

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
            <!-- 文字內容（可裁切）— 多文字區塊 -->
          <div
            v-for="block in textBlocks"
            :key="block.id"
            :data-text-block-id="block.id"
            class="p-editor__text-content"
            :style="[getTextBlockStyleComputed(block), drawMode ? { pointerEvents: 'none' } : {}, { zIndex: getObjectZIndex(block.id) }]"
            @click.stop="() => { if (!drawMode) selectTextBlock(block.id) }"
          >
            <!-- 外層包裹器：接收 padding，點擊時觸發拖曳 -->
            <div
              class="p-editor__canvas-text-wrapper"
              :style="getTextStyleForBlock(block)"
            >
              <div
                :ref="(el: any) => setContentEditableRef(block.id, el)"
                class="p-editor__canvas-text"
                :class="{ 'is-empty': !block.content.trim() }"
                :contenteditable="!drawMode"
                @input="(e: Event) => handleTextInput(e, block.id)"
                @click.stop="() => { if (!drawMode) selectTextBlock(block.id) }"
                @focus="() => { if (!drawMode) selectTextBlock(block.id) }"
                data-placeholder="在這裡輸入文字..."
              />
            </div>
          </div>

          <!-- 貼紙圖片（可裁切）；便利貼/文字 tab 時點擊可進入貼紙編輯 -->
          <div
            v-for="sticker in stickers"
            :key="sticker.id"
            class="p-editor__sticker-content"
            :class="{ 'is-sticker-clickable': !drawMode }"
            :style="[getStickerStyle(sticker), { zIndex: getObjectZIndex(sticker.id) }]"
            @click.stop="selectSticker(sticker.id)"
            @touchstart.stop="() => { if (!isTwoFingerGesture) selectSticker(sticker.id) }"
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
            :style="{ 
              pointerEvents: drawMode ? 'auto' : 'none',
              zIndex: getObjectZIndex('drawing-layer')
            }"
          >
            <canvas ref="drawingCanvasRef" class="p-editor__drawing-canvas" />
          </div>
        </div>

        <!-- UI 層：編輯框置頂，不被裁切（繪圖模式時隱藏以便手繪） -->
        <div class="p-editor__canvas-ui" :style="{ pointerEvents: drawMode ? 'none' : undefined }">
          <!-- 文字區塊編輯框：僅在文字 tab 且該區塊被選取時顯示；按完成後消失 -->
          <div
            v-for="block in textBlocks"
            :key="`ui-text-${block.id}`"
            v-show="activeTab === 'text' && selectedTextBlockId === block.id"
            :data-text-block-id="block.id"
            class="p-editor__edit-frame p-editor__edit-frame--text"
            :class="{ 
              'is-selected': selectedTextBlockId === block.id,
              'is-dragging': textBlockDragging && selectedTextBlockId === block.id,
              'is-transforming': textBlockTransforming && selectedTextBlockId === block.id
            }"
            :style="[getTextBlockStyleComputed(block), { zIndex: getObjectZIndex(block.id) }]"
            @mousedown="() => selectTextBlock(block.id)"
            @touchstart="() => { if (!isTwoFingerGesture) selectTextBlock(block.id) }"
          >
            <!-- 隱藏 sizer：與 contenteditable 同字體/padding，讓編輯框寬高與文字一致；空白時用 placeholder 撐開寬度 -->
            <span class="p-editor__edit-frame-sizer" aria-hidden="true" :style="getTextStyleForBlock(block)">{{ block.content || '在這裡輸入文字...' }}</span>
            <!-- 刪除按鈕 -->
            <button
              v-if="selectedTextBlockId === block.id"
              class="p-editor__edit-frame-delete"
              @click.stop="removeTextBlock(block.id)"
              @touchstart.stop.prevent="removeTextBlock(block.id)"
              aria-label="刪除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 貼紙編輯框：在貼紙 tab，或 default 狀態且有選取貼紙時顯示 -->
          <div
            v-for="sticker in stickers"
            :key="`ui-${sticker.id}`"
            v-show="showStickerEditFrame && selectedStickerId === sticker.id"
            class="p-editor__edit-frame p-editor__edit-frame--sticker"
            :data-sticker-id="sticker.id"
            :class="{ 
              'is-selected': selectedStickerId === sticker.id,
              'is-dragging': draggingStickerId === sticker.id,
              'is-transforming': transformingStickerId === sticker.id
            }"
            :style="[getStickerStyle(sticker), { zIndex: getObjectZIndex(sticker.id) }]"
            @mousedown="onStickerMouseDown($event, sticker)"
            @touchstart="onStickerTouchStart($event, sticker)"
            @click.stop="onStickerClick(sticker.id)"
          >
            <button
              class="p-editor__edit-frame-delete"
              @click.stop="removeSticker(sticker.id)"
              @touchstart.stop.prevent="removeSticker(sticker.id)"
              aria-label="刪除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <!-- <div
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTransformHandleMouseDown($event, sticker)"
              @touchstart.stop="onTransformHandleTouchStart($event, sticker)"
            >
              ↻
            </div> -->
          </div>
        </div>
        </div>
      </div>
    </div>

    <!-- 一鍵清除：在 control-panel 外、tab 上方，與 tab 同顯示條件；v-if + transition 才有漸變 -->
    <transition name="p-editor-top-actions">
      <div
        v-if="!drawMode && activeTab !== 'text' && activeTab !== 'note' && activeTab !== 'sticker'"
        class="p-editor__top-actions"
      >
        <button
          type="button"
          class="p-editor__clear-btn"
          @click="handleClearAll"
          aria-label="清除全部"
        >
          <img src="/undo.svg" alt="清除全部" class="p-editor__clear-btn-icon" />
        </button>
      </div>
    </transition>

    <!-- Control Panel -->
    <div class="p-editor__control-panel">
      <!-- Tab Bar（操作文字或繪圖時隱藏；v-if + transition 才會有出現/消失動畫） -->
      <transition name="p-editor-tab-bar">
        <div v-if="!drawMode && activeTab !== 'text' && activeTab !== 'note' && activeTab !== 'sticker'" class="p-editor__tab-bar">
          <button
            v-for="tab in EDITOR_TABS"
            :key="tab.id"
            class="p-editor__tab-btn"
            :class="{ 'is-active': activeTab === tab.id }"
            @click="handleTabClick(tab.id)"
          >
            <img :src="tab.icon" :alt="tab.label" class="p-editor__tab-icon" />
            <span class="p-editor__tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </transition>

      <!-- Tab: 便利貼（v-if 才能觸發 leave 動畫，v-show 只切 display 不會跑 transition） -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'note'" class="p-editor__tab-content">
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
      </transition>

      <!-- Tab: 文字 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'text'" class="p-editor__tab-content">
          <template v-if="selectedBlock">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">選擇文字顏色</h3>
            <div class="p-editor__color-grid">
              <button
                v-for="color in TEXT_COLORS"
                :key="color.value"
                class="p-editor__color-btn"
                :class="{ 'is-active': selectedBlock.color === color.value }"
                :style="{ '--btn-color': color.value }"
                @click="selectedBlock.color = color.value; saveDraftData()"
              >
                <img v-if="selectedBlock.color === color.value" src="/check.svg" alt="" class="p-editor__color-check" />
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
                :class="{ 'is-active': selectedBlock.align === opt.value }"
                :aria-label="opt.value === 'left' ? '置左' : opt.value === 'center' ? '置中' : '置右'"
                @click="selectedBlock.align = opt.value; saveDraftData()"
              >
                <img :src="opt.svg" :alt="''" class="p-editor__align-icon" />
              </button>
            </div>
          </div>
          </template>
          <div v-else class="p-editor__control-section">
            <p style="text-align: center; opacity: 0.6;">請先選取一個文字區塊</p>
          </div>
        </div>
      </transition>

      <!-- Tab: 繪圖 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'draw'" class="p-editor__tab-content">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">選擇筆刷顏色</h3>
            <div class="p-editor__color-grid">
              <!-- 橡皮擦按鈕（第一個） -->
              <button
                class="p-editor__color-btn p-editor__color-btn--eraser"
                :class="{ 'is-active': eraserMode }"
                @click="eraserMode = true"
              >
                <img src="/erase.svg" alt="橡皮擦" class="p-editor__color-eraser-icon" />
              </button>
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
      </transition>

      <!-- Tab: 貼紙 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'sticker'" class="p-editor__tab-content">
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
      </transition>
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
          @click="activeTab = null"
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

      <!-- 文字模式：完成（回到 default，Tab Bar 會再出現） -->
      <template v-else-if="activeTab === 'text'">
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--full"
          @click="completeTextEditing"
        >
          完成
        </button>
      </template>

      <!-- 便利貼模式：完成（回到 default，Tab Bar 會再出現） -->
      <template v-else-if="activeTab === 'note'">
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--full"
          @click="activeTab = null"
        >
          完成
        </button>
      </template>

      <!-- 貼紙模式：完成（回到 default，編輯框消失） -->
      <template v-else-if="activeTab === 'sticker'">
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--full"
          @click="completeStickerEditing"
        >
          完成
        </button>
      </template>
      
      <!-- default 狀態：上傳大螢幕（草稿自動儲存） -->
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { StickerInstance, DraftData, StickyNoteStyle, TextBlockInstance } from '~/types'
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
const { saveDraft, loadDraft, clearDraft, saveToken, loadToken, clearToken } = useStorage()

const MAX_TEXT_BLOCKS = 3

// Loading state for fonts
const isLoadingFonts = ref(true)

// Editor State
const backgroundImage = ref(BACKGROUND_IMAGES?.[0]?.url ?? '') // 預設第一張背景
const shape = ref(DEFAULT_SHAPE_ID)
const stickers = ref<StickerInstance[]>([])
const selectedStickerId = ref<string | null>(null)
const draggingStickerId = ref<string | null>(null)

// 多文字區塊
const textBlocks = ref<TextBlockInstance[]>([])
const selectedTextBlockId = ref<string | null>(null)
const textBlockDragging = ref(false)
const textBlockTransforming = ref(false)

// 每個物件（文字區塊 / 貼紙）各自疊放順序：點選時 bringToFront，完成後該物件維持最頂層
const objectZOrder = ref<Record<string, number>>({})
let zOrderCounter = 0
const getObjectZIndex = (id: string) => objectZOrder.value[id] ?? 1
const bringToFront = (id: string) => {
  zOrderCounter += 1
  objectZOrder.value = { ...objectZOrder.value, [id]: zOrderCounter }
}

// 文字編輯時的原始內容快照（用於取消還原）
const textBlockInitialContents = new Map<string, string>()
// 這次文字編輯流程中新建立的文字區塊（用於判斷取消時要刪除還是還原）
const newTextBlockIds = new Set<string>()

const snapshotTextBlockInitial = (blockId: string) => {
  const block = textBlocks.value.find(b => b.id === blockId)
  if (block) {
    textBlockInitialContents.set(blockId, block.content)
  }
}

const hasCurrentTextEdits = () => {
  const id = selectedTextBlockId.value
  if (!id) return false
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return false
  const initial = textBlockInitialContents.get(id) ?? ''
  return block.content !== initial
}

// 文字模式「完成」：移除空白文字區塊，結束文字編輯流程；保留選取使該區塊維持最上層
const completeTextEditing = () => {
  // 將內容為空（或只含空白）的文字區塊直接刪除
  textBlocks.value = textBlocks.value.filter(b => b.content.trim())

  textBlockInitialContents.clear()
  newTextBlockIds.clear()
  // 若目前選取的區塊已被刪除（空白被濾掉）才清掉選取；否則保留選取，讓該區塊維持在最上層
  if (selectedTextBlockId.value && !textBlocks.value.some(b => b.id === selectedTextBlockId.value)) {
    selectedTextBlockId.value = null
  }
  activeTab.value = null
}

const completeStickerEditing = () => {
  selectedStickerId.value = null
  activeTab.value = null
}

// 計算屬性：當前選取的文字區塊
const selectedBlock = computed(() => {
  if (!selectedTextBlockId.value) return null
  return textBlocks.value.find(b => b.id === selectedTextBlockId.value) ?? null
})

// contenteditable ref map
const contentEditableRefs = new Map<string, HTMLDivElement | null>()
const setContentEditableRef = (blockId: string, el: HTMLDivElement | null) => {
  if (el) {
    contentEditableRefs.set(blockId, el)
  } else {
    contentEditableRefs.delete(blockId)
  }
}

const canvasRef = ref<HTMLElement | null>(null)
const drawingLayerRef = ref<HTMLElement | null>(null)
const drawingCanvasRef = ref<HTMLCanvasElement | null>(null)

// Tab: 便利貼 | 文字 | 繪圖 | 貼紙
const activeTab = ref<'note' | 'text' | 'draw' | 'sticker' | null>(null)

// 文字編輯模式：有選取文字區塊時
const isTextEditMode = computed(() => selectedTextBlockId.value !== null)

const transformingStickerId = ref<string | null>(null)
const showDraftModal = ref(false)
const showTutorialModal = ref(false)
const showExitModal = ref(false)
const showSubmitModal = ref(false)

const showAlertModal = ref(false)
const alertIcon = ref('⚠️')
const alertTitle = ref('提示')
const alertMessage = ref('')

const showAlert = (msg: string, title = '提示', icon = '⚠️') => {
  alertIcon.value = icon
  alertTitle.value = title
  alertMessage.value = msg
  showAlertModal.value = true
}

// Token 相關提示：標題、內文與 icon
const TOKEN_ALERT_TITLE = '只差最後一步！'
const TOKEN_ALERT_ICON = '🛍️'
const TOKEN_ALERT_MESSAGE = '目前您還沒有取得大螢幕的上傳權限。<br>請放心，剛剛的作品已經保存在您的手機裡了！<br>只要在店內消費，結帳時掃描店員提供的 QR Code，系統就會自動幫您一鍵發送上牆喔！'

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

// 是否顯示貼紙編輯框：有選取貼紙 且 非便利貼/繪圖狀態（便利貼或繪圖 tab 時編輯框消失）
const showStickerEditFrame = computed(() => {
  return !!selectedStickerId.value && activeTab.value !== 'note' && activeTab.value !== 'draw'
})

// Sticker Management

// 僅在有實際筆畫時更新 drawingData，避免空白繪圖讓 Reset 可觸發
const syncDrawingDataFromFabric = () => {
  if (!fabricBrush.canUndo()) {
    if (drawingData.value !== null) {
      drawingData.value = null
      saveDraftData()
    }
    return
  }
  const data = fabricBrush.exportToDataURL()
  if (data && data !== drawingData.value) {
    drawingData.value = data
    saveDraftData()
  }
}

const fabricBrush = useFabricBrush(() => {
  syncDrawingDataFromFabric()
})
// 切換 tab 時同步繪圖模式與文字選取狀態
watch(activeTab, (tab) => {
  // 繪圖：進入/退出繪圖模式
  if (tab === 'draw') {
    drawMode.value = true
    fabricBrush.setDrawingMode(true)
    bringToFront('drawing-layer')
  } else {
    if (drawMode.value) {
      syncDrawingDataFromFabric()
      fabricBrush.setDrawingMode(false)
      // 使用者剛離開繪圖模式（例如按下完成），清除所有物件選取，確保沒有殘留的編輯框
      selectedTextBlockId.value = null
      selectedStickerId.value = null
    }
    drawMode.value = false
  }
  // 文字：切到其他 tab（便利貼/繪圖/貼紙）時才取消文字選取；按「完成」時 tab 為 null，保留選取讓文字維持最上層
  if (tab !== 'text') {
    if (tab != null) {
      selectedTextBlockId.value = null
    }
    nextTick(() => {
      contentEditableRefs.forEach(el => el?.blur())
    })
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
    contentEditableRefs.forEach(el => el?.blur())
    if (fabricBrush.isInitialized()) {
      fabricBrush.setOnUndoRedoChange(() => {
        drawCanUndo.value = fabricBrush.canUndo()
        drawCanRedo.value = fabricBrush.canRedo()
        syncDrawingDataFromFabric()
      })
      drawCanUndo.value = fabricBrush.canUndo()
      drawCanRedo.value = fabricBrush.canRedo()
    }
  }
})

const noteStyleProps = computed<StickyNoteStyleProps>(() => ({
  shape: shape.value || DEFAULT_SHAPE_ID,
  textColor: '#ffffff', // 預設白色，各文字區塊有各自的顏色
  textAlign: 'center',
  backgroundImage: backgroundImage.value
}))

const { wrapperStyles, innerStyles: canvasStyle } = useStickyNoteStyle(noteStyleProps)

// 畫面是否有內容（文字 / 貼紙 / 繪圖任一存在，或背景/形狀已被更改）
const hasAnyContent = computed(() =>
  textBlocks.value.some(b => b.content.trim()) ||
  stickers.value.length > 0 ||
  !!drawingData.value ||
  backgroundImage.value !== (BACKGROUND_IMAGES?.[0]?.url ?? '') ||
  shape.value !== DEFAULT_SHAPE_ID
)

// 文字區塊位置/大小樣式（接受 TextBlockInstance）
const getTextBlockStyleComputed = (block: TextBlockInstance) => ({
  ...getTextBlockStyle(block.x, block.y, block.scale, block.rotation),
  textAlign: block.align
})

// 文字區塊文字樣式（顏色與對齊：針對單一文字物件）
const getTextStyleForBlock = (block: TextBlockInstance) => ({
  ...wrapperStyles.value,
  color: block.color,
  textAlign: block.align,
  '--text-color': block.color,
})


// 文字 scale 上下限（與 useCanvasPinch 一致）
const TEXT_SCALE_MIN = 1
const TEXT_SCALE_MAX = 5

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** 當輸入導致文字框超出畫布時：縮小 scale 並調整位置，使整個框留在邊界內 */
const clampSelectedTextBlockToCanvas = () => {
  const id = selectedTextBlockId.value
  const el = canvasRef.value
  if (!id || !el) return
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return
  const frameEl = el.querySelector(
    `.p-editor__edit-frame--text[data-text-block-id="${id}"]`
  ) as HTMLElement | null
  if (!frameEl) return
  const rect = el.getBoundingClientRect()
  const fr = frameEl.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const halfWidthPct = (fr.width / rect.width) * 50
  const halfHeightPct = (fr.height / rect.height) * 50
  const eps = 1e-6
  // 允許重新調整位置，因此只要半寬/半高 <= 50% 就一定能找到合法位置
  const maxScaleX = halfWidthPct > eps ? (50 * block.scale) / halfWidthPct : TEXT_SCALE_MAX
  const maxScaleY = halfHeightPct > eps ? (50 * block.scale) / halfHeightPct : TEXT_SCALE_MAX
  const maxScale = Math.min(maxScaleX, maxScaleY, TEXT_SCALE_MAX)
  const oldScale = block.scale
  if (block.scale > maxScale) {
    block.scale = clamp(maxScale, TEXT_SCALE_MIN, TEXT_SCALE_MAX)
  }
  const newHalfW = halfWidthPct * (block.scale / oldScale)
  const newHalfH = halfHeightPct * (block.scale / oldScale)
  block.x = clamp(block.x, newHalfW, 100 - newHalfW)
  block.y = clamp(block.y, newHalfH, 100 - newHalfH)
  saveDraftData()
}

// Methods
let textInputDebounceTimer: ReturnType<typeof setTimeout> | null = null
const handleTextInput = (e: Event, blockId: string) => {
  const target = e.target as HTMLElement
  const text = target.innerText.slice(0, MAX_CONTENT_LENGTH)
  const block = textBlocks.value.find(b => b.id === blockId)
  if (block) {
    block.content = text
  }
  if (target.innerText.length > MAX_CONTENT_LENGTH) {
    target.innerText = text
    placeCaretAtEnd(target)
  }
  saveDraftData()
  nextTick(() => clampSelectedTextBlockToCanvas())
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

/** 將游標放到指定座標位置（模擬手機點擊移動游標） */
const placeCaretAtPoint = (el: HTMLElement, clientX: number, clientY: number) => {
  let range: Range | null = null

  // Chrome / Safari / Edge
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY)
  }
  // Firefox
  else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(clientX, clientY)
    if (pos) {
      range = document.createRange()
      range.setStart(pos.offsetNode, pos.offset)
      range.collapse(true)
    }
  }

  if (range) {
    // 確保 range 在目標 contenteditable 元素內
    if (el.contains(range.startContainer)) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
  }

  // fallback：無法定位時放到最後
  placeCaretAtEnd(el)
}

const syncContentToDom = () => {
  nextTick(() => {
    textBlocks.value.forEach(block => {
      const el = contentEditableRefs.get(block.id)
      if (el) {
        el.innerText = block.content
      }
    })
  })
}

// 文字區塊管理
const addTextBlock = (): TextBlockInstance => {
  const newBlock: TextBlockInstance = {
    id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content: '',
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 20,
    scale: 2,
    rotation: 0,
    color: '#ffffff',
    align: 'center'
  }
  textBlocks.value.push(newBlock)
  snapshotTextBlockInitial(newBlock.id)
  newTextBlockIds.add(newBlock.id)
  saveDraftData()
  return newBlock
}

const removeTextBlock = (blockId: string) => {
  // Debug：確認事件有沒有進來、目前有幾個文字區塊
  // eslint-disable-next-line no-console
  console.log('[Editor] removeTextBlock clicked', { blockId, textBlocksCount: textBlocks.value.length })

  textBlocks.value = textBlocks.value.filter(b => b.id !== blockId)
  textBlockInitialContents.delete(blockId)
  newTextBlockIds.delete(blockId)
  if (selectedTextBlockId.value === blockId) {
    selectedTextBlockId.value = null
    // 刪除目前選取的文字區塊後，回到「無 tab 被選取」的預設狀態
    activeTab.value = null
  }
  saveDraftData()
}

// Tab 點擊處理：文字 tab 自動新增文字區塊
const handleTabClick = (tabId: string) => {
  if (tabId === 'text') {
    if (textBlocks.value.length < MAX_TEXT_BLOCKS) {
      const newBlock = addTextBlock()
      selectedTextBlockId.value = newBlock.id
      selectedStickerId.value = null
      bringToFront(newBlock.id)
      activeTab.value = 'text'
      nextTick(() => {
        const el = contentEditableRefs.get(newBlock.id)
        if (el) {
          el.focus()
          placeCaretAtEnd(el)
        }
      })
    } else {
      // 已經到達上限：改為直接選取最後一組文字區塊，不再顯示提示
      const lastBlock = textBlocks.value[textBlocks.value.length - 1]
      if (lastBlock) {
        snapshotTextBlockInitial(lastBlock.id)
        newTextBlockIds.delete(lastBlock.id)
        selectedTextBlockId.value = lastBlock.id
        selectedStickerId.value = null
        bringToFront(lastBlock.id)
        activeTab.value = 'text'
        nextTick(() => {
          const el = contentEditableRefs.get(lastBlock.id)
          if (el) {
            el.focus()
            placeCaretAtEnd(el)
          }
        })
      }
    }
  } else {
    activeTab.value = tabId as any
  }
}

// 文字模式「取消」：新增未輸入時 = 刪除；編輯時 = 還原到編輯前內容
const cancelTextEditing = () => {
  const id = selectedTextBlockId.value
  if (!id) {
    activeTab.value = null
    return
  }
  const block = textBlocks.value.find(b => b.id === id)
  const initial = textBlockInitialContents.get(id) ?? ''
  const isNew = newTextBlockIds.has(id)

  if (block && isNew) {
    // 新增的文字區塊：不論有沒有輸入內容，按取消都直接刪除
    removeTextBlock(id)
    activeTab.value = null
    return
  }

  if (block) {
    // 既有文字區塊：還原到編輯前內容
    block.content = initial
    syncContentToDom()
    saveDraftData()
  }

  textBlockInitialContents.delete(id)
  selectedTextBlockId.value = null
  activeTab.value = null
}

const MAX_STICKERS = 10

const addSticker = (stickerType: string) => {
  if (stickers.value.length >= MAX_STICKERS) {
    showAlert(
      `每張便利貼最多只能貼 ${MAX_STICKERS} 個貼紙喔！如果需要更多空間，可以先刪除一些。`,
      '貼紙數量達上限',
      '⚠️'
    )
    return
  }

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
  selectedTextBlockId.value = null
  bringToFront(newSticker.id)
  activeTab.value = 'sticker'
}

const selectSticker = (id: string) => {
  // 若正在文字編輯模式，自動完成之前的編輯
  if (activeTab.value === 'text' && selectedTextBlockId.value) {
    if (hasCurrentTextEdits()) {
      completeTextEditing()
    } else {
      cancelTextEditing()
    }
  }
  // 如果正在便利貼模式（選擇材質/形狀），點擊貼紙時回到 default tab（null）
  if (activeTab.value === 'note') {
    activeTab.value = null
  }
  
  selectedStickerId.value = id
  selectedTextBlockId.value = null
  bringToFront(id)
}

const selectTextBlock = (blockId: string) => {
  // 檢查在點擊之前，是否「已經在此文字區塊的編輯模式中」
  const isCurrentlyEditing = selectedTextBlockId.value === blockId && activeTab.value === 'text'

  // 進入文字編輯模式
  activeTab.value = 'text'

  // 若已經在編輯這個文字區塊，純粹是使用者點選不同位置來移動游標，不干涉瀏覽器
  if (isCurrentlyEditing) {
    bringToFront(blockId)
    return
  }

  // 若正在文字編輯模式，且切換到另一組文字，自動完成之前的編輯
  if (activeTab.value === 'text' && selectedTextBlockId.value && selectedTextBlockId.value !== blockId) {
    if (hasCurrentTextEdits()) {
      completeTextEditing()
    } else {
      cancelTextEditing()
    }
  }
  
  snapshotTextBlockInitial(blockId)
  selectedTextBlockId.value = blockId
  selectedStickerId.value = null
  bringToFront(blockId)
  
  nextTick(() => {
    const el = contentEditableRefs.get(blockId)
    if (el) {
      el.focus()
      placeCaretAtEnd(el)
    }
  })
}

const deselectAll = () => {
  if (lastCanvasDragEndAt.value && Date.now() - lastCanvasDragEndAt.value < 400) return
  selectedStickerId.value = null
  selectedTextBlockId.value = null
}

// saveDraftData 需在 composable 之前定義（作為 callback）
const saveDraftData = () => {
  const draft: DraftData = {
    content: textBlocks.value.map(b => b.content).join('\n'),
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textBlocks.value[0]?.color ?? '#ffffff',
    textAlign: textBlocks.value[0]?.align ?? 'center',
    stickers: stickers.value,
    textTransform: textBlocks.value[0] ? { x: textBlocks.value[0].x, y: textBlocks.value[0].y, scale: textBlocks.value[0].scale, rotation: textBlocks.value[0].rotation } : undefined,
    textBlocks: textBlocks.value,
    drawing: drawingData.value ?? undefined,
    objectLayerOrder: { ...objectZOrder.value },
    timestamp: Date.now()
  }
  saveDraft(draft)
}

const {
  onTextBlockTransformMouseDown,
  onTextBlockTransformTouchStart
} = useTextBlockInteraction({
  canvasRef,
  textBlocks,
  selectedTextBlockId,
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
  lastCanvasDragEndAt,
  isTwoFingerGesture
} = useCanvasPinch({
  canvasRef,
  drawMode,
  selectedTextBlockId,
  selectedStickerId,
  textBlocks,
  stickers,
  textBlockDragging,
  textBlockTransforming,
  draggingStickerId,
  transformingStickerId,
  onTextTransformEnd: saveDraftData,
  onStickerTransformEnd: saveDraftData,
  onTextDragEnd: saveDraftData,
  onStickerDragEnd: saveDraftData,
  onTextTap: (blockId: string, clientX: number, clientY: number) => {
    const alreadySelected = selectedTextBlockId.value === blockId
    selectTextBlock(blockId)
    if (!alreadySelected) {
      // 切換到新的文字區塊：游標放到最後（selectTextBlock 內部已處理）
    }
    // 已選取的文字區塊：不做任何操作，瀏覽器已在 touchstart 自然定位游標
  },
  onTextDragStart: (blockId: string) => selectTextBlock(blockId)
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
  onTransformEnd: saveDraftData,
  isTwoFingerGesture
})

const removeSticker = (id: string) => {
  stickers.value = stickers.value.filter(s => s.id !== id)
  selectedStickerId.value = null
  saveDraftData()
}

const loadDraftData = async (draft: DraftData) => {
  backgroundImage.value = draft.backgroundImage
  shape.value = draft.shape
  stickers.value = draft.stickers
  drawingData.value = draft.drawing ?? null

  // 多文字區塊：優先使用 textBlocks，否則從舊格式轉換
  if (draft.textBlocks && draft.textBlocks.length > 0) {
    textBlocks.value = draft.textBlocks
  } else if (draft.content) {
    // 向下相容：舊格式只有一個文字區塊
    const t = draft.textTransform
    textBlocks.value = [{
      id: `text-legacy-${Date.now()}`,
      content: draft.content,
      x: t?.x ?? 50,
      y: t?.y ?? 50,
      scale: t?.scale ?? 2,
      rotation: t?.rotation ?? 0,
      color: draft.textColor ?? '#ffffff',
      align: draft.textAlign ?? 'center'
    }]
  } else {
    textBlocks.value = []
  }

  await nextTick()
  syncContentToDom()
  if (draft.drawing) {
    await nextTick()
    fabricBrush.loadFromDataURL(draft.drawing)
  }
  // 還原物件前後順序：與編輯時一致；保證唯一 z 且強制更新視圖
  const textIds = textBlocks.value.map(b => b.id)
  const stickerIds = stickers.value.map(s => s.id)
  const allIds = new Set([...textIds, ...stickerIds])
  const orderFromDraft = draft.objectLayerOrder && Object.keys(draft.objectLayerOrder).length > 0
    ? { ...draft.objectLayerOrder }
    : null

  if (orderFromDraft) {
    const restored: Record<string, number> = {}
    for (const id of allIds) {
      const v = orderFromDraft[id]
      const n = typeof v === 'number' && !Number.isNaN(v) ? v : Number(v)
      if (!Number.isNaN(n)) restored[id] = n
    }
    if (Object.keys(restored).length > 0) {
      const textOrders = textIds.map(id => restored[id]).filter((n): n is number => n != null)
      const stickerOrders = stickerIds.map(id => restored[id]).filter((n): n is number => n != null)
      const legacyWrongOrder =
        textOrders.length > 0 &&
        stickerOrders.length > 0 &&
        Math.max(...textOrders) < Math.min(...stickerOrders)
      if (legacyWrongOrder) {
        const maxOrder = Math.max(...Object.values(restored))
        textIds.forEach(id => {
          if (restored[id] != null) restored[id] = (restored[id] as number) + maxOrder + 1
        })
      }
      for (const id of allIds) {
        if (restored[id] == null) {
          const maxVal = Math.max(0, ...Object.values(restored))
          restored[id] = maxVal + 1
        }
      }
      // 依數值升序重排為 1,2,3,…（同值時依 id 穩定排序），保證唯一且還原疊放
      const sorted = Object.entries(restored).sort(
        ([idA, a], [idB, b]) => (a !== b ? a - b : idA.localeCompare(idB))
      )
      const normalized: Record<string, number> = {}
      sorted.forEach(([id], i) => { normalized[id] = i + 1 })
      objectZOrder.value = { ...normalized }
      zOrderCounter = sorted.length
      await nextTick()
    } else {
      applyDefaultLayerOrder(textIds, stickerIds)
    }
  } else {
    applyDefaultLayerOrder(textIds, stickerIds)
  }
}

function applyDefaultLayerOrder(textIds: string[], stickerIds: string[]) {
  const ids = [...stickerIds, ...textIds]
  const next: Record<string, number> = {}
  ids.forEach((id, i) => { next[id] = i + 1 })
  objectZOrder.value = next
  zOrderCounter = ids.length
}

const resetEditorToInitial = () => {
  backgroundImage.value = BACKGROUND_IMAGES?.[0]?.url ?? ''
  shape.value = DEFAULT_SHAPE_ID
  stickers.value = []
  textBlocks.value = []
  selectedTextBlockId.value = null
  selectedStickerId.value = null
  activeTab.value = null
  drawingData.value = null
  objectZOrder.value = {}
  zOrderCounter = 0
  fabricBrush.clear()
  syncContentToDom()
}

const showClearAllModal = ref(false)

const handleClearAll = () => {
  if (!hasAnyContent.value) return
  showClearAllModal.value = true
}

const confirmClearAll = () => {
  resetEditorToInitial()
  clearDraft()
  showClearAllModal.value = false
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
  const hasContent = textBlocks.value.some(b => b.content.trim())
  if (!hasContent) {
    showAlert('請輸入文字內容')
    return
  }
  
  const token = loadToken()
  if (!token) {
    showAlert(TOKEN_ALERT_MESSAGE, TOKEN_ALERT_TITLE, TOKEN_ALERT_ICON)
    return
  }

  showSubmitModal.value = true
}

const previewNoteData = computed(() => {
  const style: StickyNoteStyle = {
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textBlocks.value[0]?.color ?? '#ffffff',
    textAlign: textBlocks.value[0]?.align ?? 'center',
    stickers: stickers.value,
    textTransform: textBlocks.value[0] ? { x: textBlocks.value[0].x, y: textBlocks.value[0].y, scale: textBlocks.value[0].scale, rotation: textBlocks.value[0].rotation } : undefined,
    textBlocks: textBlocks.value,
    objectLayerOrder: { ...objectZOrder.value }
  }
  if (drawingData.value) style.drawing = drawingData.value

  return {
    id: 'preview',
    content: textBlocks.value.map(b => b.content).join('\n').trim(),
    style: style,
    timestamp: Date.now(),
    status: 'waiting'
  } as any
})

const confirmSubmit = async () => {
  if (isSubmitting.value) return

  const token = loadToken()
  if (!token) {
    showAlert(TOKEN_ALERT_MESSAGE, TOKEN_ALERT_TITLE, TOKEN_ALERT_ICON)
    return
  }

  isSubmitting.value = true

  try {
    const { createNote, checkTokenStatus } = useFirestore()

    // 1. 先透過 checkTokenStatus 取得詳細錯誤原因
    const status = await checkTokenStatus(token).catch(() => 'unknown')
    
    // 中介檢查：OpenAI Moderation API 擋下不好的文字
    const allText = previewNoteData.value.content;
    if (allText.trim()) {
      try {
        const modRes: any = await $fetch('/api/moderation', {
          method: 'POST',
          body: { text: allText }
        });
        
        if (modRes.flagged) {
          showSubmitModal.value = false;
          showAlert('您的文字包含不妥適的內容，為維護良好環境，請修改後再試一次！', '內容安全檢查未通過', '🚫');
          isSubmitting.value = false;
          return;
        }
      } catch (err) {
        console.warn('Moderation check failed or bypassed, proceeding...', err);
      }
    }

    if (status === 'expired') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 已經超過 30 分鐘的有效期限囉！請向店員重新索取新的 QR Code。', 
        '時間到了！', 
        '⏳'
      )
      isSubmitting.value = false
      return
    }

    if (status === 'used') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 已經被使用過囉！如果還想再傳一張，請向店員重新索取新的 QR Code。', 
        '已經用過囉！', 
        '❌'
      )
      isSubmitting.value = false
      return
    }

    if (status === 'invalid') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 無效或不存在，請確認您掃描的是由店員提供的正確條碼。', 
        '無效代碼', 
        '❓'
      )
      isSubmitting.value = false
      return
    }

    // 2. 狀態正確(valid)或無法判別時，嘗試正式送出
    await createNote({ content: previewNoteData.value.content, style: previewNoteData.value.style }, token)

    // 上傳成功：清除草稿與快取的 Token
    clearDraft()
    clearToken() // 將 SessionStorage 中的 Token 刪除
    
    // 如果網址上有 Token，把網址也清乾淨，避免重新整理再次讀取
    const query = { ...route.query }
    if (query.token) {
      delete query.token
      // 使用 replace 避免在歷史紀錄中留存帶有 token 的網址
      await router.replace({ query })
    }

    showSubmitModal.value = false
    router.push('/queue-status')
  } catch (e: any) {
    showSubmitModal.value = false // 關閉「確認上傳」的 Modal，讓錯誤提示能正常顯示在最上層
    console.error('提交失敗:', e)
    
    // 如果因為 Firebase Rules 阻擋讀取 token 而拋錯，退回到這裡用泛用的錯誤提示
    if (e?.code === 'permission-denied' || e?.message?.includes('Missing or insufficient permissions')) {
      showAlert(
        '您的專屬 QR Code 可能已失效 (超過限時 30 分鐘) 或已經被使用過。請向店員重新索取新的 QR Code！', 
        '上傳授權失效', 
        '⏳'
      )
    } else {
      showAlert(`提交失敗：${e?.message || '請稍後再試'}`)
    }
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
  const hasContent = textBlocks.value.some(b => b.content.trim())
  if (hasContent || stickers.value.length > 0) {
    showExitModal.value = true
  } else {
    router.push('/')
  }
}

const handleExitConfirm = () => {
  saveDraftData()
  showExitModal.value = false
  router.push('/')
}

// Lifecycle
const initFabricBrush = () => {
  if (typeof window === 'undefined' || !canvasRef.value || !drawingCanvasRef.value || !drawingLayerRef.value) return
  fabricBrush.init(drawingCanvasRef.value, 600, 600)
  fabricBrush.setOnUndoRedoChange(() => {
    drawCanUndo.value = fabricBrush.canUndo()
    drawCanRedo.value = fabricBrush.canRedo()
    syncDrawingDataFromFabric()
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

onMounted(async () => {
  // 等待字體載入與最小延遲
  try {
    await Promise.all([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 800))
    ])
  } catch (e) {
    console.warn('Font loading error', e)
  }
  isLoadingFonts.value = false

  await nextTick()

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
watch([backgroundImage, shape], () => {
  saveDraftData()
})
</script>