<template>
  <div class="p-editor">
    <!-- Header -->
    <header class="p-editor__header">
      <button class="p-editor__header-btn" @click="goBack">
        <span>← 返回</span>
      </button>
      <h1 class="p-editor__header-title">編輯便利貼</h1>
      <button class="p-editor__header-btn" @click="showPreview = true">
        <span>預覽</span>
      </button>
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
          <button class="btn btn--secondary" @click="handleDraftDecision(false)">
            重新開始
          </button>
          <button class="btn btn--primary" @click="handleDraftDecision(true)">
            使用草稿
          </button>
        </div>
      </div>
    </div>

    <!-- Canvas Area -->
    <div class="p-editor__canvas-section">
      <div ref="canvasRef" class="p-editor__canvas-container" @click="deselectAll">
        <!-- 可裁切層：背景、文字內容、貼紙圖片 -->
        <div class="p-editor__canvas p-editor__canvas--stage" :style="canvasStyle">
          <!-- 文字內容（可裁切） -->
          <div
            ref="textBlockRef"
            class="p-editor__text-content"
            :style="textBlockStyle"
            @click.stop="selectTextBlock"
          >
            <div
              ref="contentEditableRef"
              class="p-editor__canvas-text"
              :class="{ 'is-empty': !content.trim() }"
              :style="textStyle"
              contenteditable
              @input="handleTextInput"
              @click.stop="selectTextBlock"
              @focus="selectTextBlock"
              data-placeholder="在這裡輸入文字..."
            />
          </div>

          <!-- 貼紙圖片（可裁切） -->
          <div
            v-for="sticker in stickers"
            :key="sticker.id"
            class="p-editor__sticker-content"
            :style="getStickerStyle(sticker)"
          >
            <img 
              v-if="STICKER_LIBRARY.find(s => s.id === sticker.type)?.svgFile"
              :src="STICKER_LIBRARY.find(s => s.id === sticker.type)?.svgFile"
              :alt="STICKER_LIBRARY.find(s => s.id === sticker.type)?.id"
              class="p-editor__sticker-img"
            />
          </div>
        </div>

        <!-- UI 層：編輯框置頂，不被裁切 -->
        <div class="p-editor__canvas-ui">
          <!-- 文字區塊編輯框（與文字內容同位置、同尺寸） -->
          <div
            class="p-editor__edit-frame p-editor__edit-frame--text"
            :class="{ 
              'is-selected': textBlockSelected,
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
              class="p-editor__edit-frame-drag-bar"
              @mousedown.stop="onTextBlockDragBarMouseDown"
              @touchstart.stop="onTextBlockDragBarTouchStart"
              @click.stop="selectTextBlock"
            >
              ⋮⋮
            </div>
            <div
              v-if="textBlockSelected"
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTextBlockTransformMouseDown"
              @touchstart.stop="onTextBlockTransformTouchStart"
            >
              ↻
            </div>
          </div>

          <!-- 貼紙編輯框 -->
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
        </div>
      </div>

      <!-- Character Count -->
      <div class="p-editor__character-count">
        {{ content.length }} / 200
      </div>
    </div>

    <!-- Control Panel -->
    <div class="p-editor__control-panel">
      <!-- Background Image -->
      <div class="p-editor__control-section">
        <h3 class="p-editor__control-title">背景圖片</h3>
        <div class="p-editor__background-grid">
          <button
            v-for="bg in backgrounds"
            :key="bg.id"
            class="p-editor__background-btn"
            :class="{ 'is-active': backgroundImage === bg.url }"
            @click="backgroundImage = bg.url"
          >
            <img :src="bg.url" :alt="bg.id" class="p-editor__background-img" />
            <span v-if="backgroundImage === bg.url" class="p-editor__background-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Shape -->
      <div class="p-editor__control-section">
        <h3 class="p-editor__control-title">便利貼造型</h3>
        <div class="p-editor__shape-grid">
          <button
            v-for="shapeItem in shapes"
            :key="shapeItem.id"
            class="p-editor__shape-btn"
            :class="{ 'is-active': shape === shapeItem.id }"
            @click="shape = shapeItem.id"
          >
            <img 
              :src="shapeItem.svg" 
              :alt="shapeItem.id"
              class="p-editor__shape-preview"
            />
            <span v-if="shape === shapeItem.id" class="p-editor__shape-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Text Color -->
      <div class="p-editor__control-section">
        <h3 class="p-editor__control-title">文字顏色</h3>
        <div class="p-editor__color-grid">
          <button
            v-for="color in textColors"
            :key="color.value"
            class="p-editor__color-btn"
            :class="{ 'is-active': textColor === color.value }"
            :style="{ background: color.value }"
            @click="textColor = color.value"
          >
            <span v-if="textColor === color.value" class="p-editor__color-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Sticker Library -->
      <div class="p-editor__control-section">
        <h3 class="p-editor__control-title">貼紙</h3>
        <div class="p-editor__sticker-categories">
          <button
            v-for="category in categories"
            :key="category.id"
            class="p-editor__category-btn"
            :class="{ 'is-active': selectedCategory === category.id }"
            @click="selectedCategory = category.id"
          >
            {{ category.name }}
          </button>
        </div>
        <div class="p-editor__sticker-grid">
          <button
            v-for="sticker in filteredStickers"
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

    <!-- Bottom Actions -->
    <div class="p-editor__bottom-actions">
      <button class="p-editor__action-btn p-editor__action-btn--secondary" @click="clearAll">
        清空
      </button>
      <button 
        class="p-editor__action-btn p-editor__action-btn--primary" 
        :disabled="isSubmitting"
        @click="handleSubmit"
      >
        {{ isSubmitting ? '提交中...' : '提交便利貼' }}
      </button>
    </div>

    <!-- Preview Modal -->
    <div v-if="showPreview" class="p-editor__modal-overlay" @click="showPreview = false">
      <div class="p-editor__preview-modal" @click.stop>
        <div class="p-editor__preview-header">
          <h2>預覽</h2>
          <button class="p-editor__close-btn" @click="showPreview = false">✕</button>
        </div>
        <div class="p-editor__preview-content c-sticky-note-container--preview">
          <StickyNote :note="previewNote" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StickerInstance, DraftData } from '~/types'
import { STICKER_LIBRARY, getStickersByCategory, getStickerCategories } from '~/data/stickers'
import { BACKGROUND_IMAGES } from '~/data/backgrounds'
import { STICKY_NOTE_SHAPES, DEFAULT_SHAPE_ID, getShapeById } from '~/data/shapes'
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({
  layout: false
})

const route = useRoute()
const router = useRouter()
const { saveDraft, loadDraft, clearDraft, saveToken, loadToken } = useStorage()

// Editor State
const content = ref('')
const backgroundImage = ref(BACKGROUND_IMAGES[0].url) // 預設第一張背景
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

// 拖曳狀態
interface DragState {
  stickerId: string
  startX: number
  startY: number
  initialX: number
  initialY: number
}
const dragState = ref<DragState | null>(null)
const transformingStickerId = ref<string | null>(null)

interface TransformState {
  stickerId: string
  centerX: number
  centerY: number
  initialDistance: number
  initialAngle: number
  initialScale: number
  initialRotation: number
}
const transformState = ref<TransformState | null>(null)
const showDraftModal = ref(false)
const showPreview = ref(false)

// 資料來源
const backgrounds = BACKGROUND_IMAGES
const shapes = STICKY_NOTE_SHAPES

const textColors = [
  { name: 'Black', value: '#333333' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Red', value: '#f43f5e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' }
]

// Sticker Management
const selectedCategory = ref<'emoji' | 'icon' | 'shape' | 'kpop'>('emoji')
const categories = getStickerCategories()

const filteredStickers = computed(() => {
  return getStickersByCategory(selectedCategory.value)
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
  color: textColor.value
}))

const getStickerStyle = (sticker: StickerInstance) => ({
  left: `${sticker.x}%`,
  top: `${sticker.y}%`,
  transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`
})

const textBlockStyle = computed(() => ({
  left: `${textX.value}%`,
  top: `${textY.value}%`,
  transform: `translate(-50%, -50%) scale(${textScale.value}) rotate(${textRotation.value}deg)`
}))


const previewNote = computed(() => ({
  content: content.value,
  style: {
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textColor.value,
    stickers: stickers.value,
    textTransform: { x: textX.value, y: textY.value, scale: textScale.value, rotation: textRotation.value }
  },
  token: '',
  timestamp: null as any,
  status: 'waiting' as const
}))

// Methods
const handleTextInput = (e: Event) => {
  const target = e.target as HTMLElement
  const text = target.innerText.slice(0, 200)
  content.value = text
  if (target.innerText.length > 200) {
    target.innerText = text
    placeCaretAtEnd(target)
  }
  saveDraftData()
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
}

const selectSticker = (id: string) => {
  selectedStickerId.value = id
  textBlockSelected.value = false
}

const selectTextBlock = () => {
  textBlockSelected.value = true
  selectedStickerId.value = null
  nextTick(() => contentEditableRef.value?.focus())
}

const deselectAll = () => {
  selectedStickerId.value = null
  textBlockSelected.value = false
}

// 文字區塊拖曳（從拖曳條）- 點擊拖曳條等於選取文字圖層
const onTextBlockDragBarMouseDown = (e: MouseEvent) => {
  e.preventDefault()
  selectTextBlock()
  textBlockDragging.value = true

  const startX = e.clientX
  const startY = e.clientY
  const initX = textX.value
  const initY = textY.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!canvasRef.value) return
    const rect = canvasRef.value.getBoundingClientRect()
    const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100
    const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100
    textX.value = Math.min(95, Math.max(5, initX + deltaX))
    textY.value = Math.min(95, Math.max(5, initY + deltaY))
  }

  const onMouseUp = () => {
    textBlockDragging.value = false
    saveDraftData()
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onTextBlockDragBarTouchStart = (e: TouchEvent) => {
  const touch = e.touches[0]
  if (!touch) return
  e.preventDefault()
  selectTextBlock()
  textBlockDragging.value = true

  const startX = touch.clientX
  const startY = touch.clientY
  const initX = textX.value
  const initY = textY.value

  const onTouchMove = (moveEvent: TouchEvent) => {
    if (!canvasRef.value || !moveEvent.touches[0]) return
    moveEvent.preventDefault()
    const t = moveEvent.touches[0]
    const rect = canvasRef.value.getBoundingClientRect()
    const deltaX = ((t.clientX - startX) / rect.width) * 100
    const deltaY = ((t.clientY - startY) / rect.height) * 100
    textX.value = Math.min(95, Math.max(5, initX + deltaX))
    textY.value = Math.min(95, Math.max(5, initY + deltaY))
  }

  const onTouchEnd = () => {
    textBlockDragging.value = false
    saveDraftData()
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
    document.removeEventListener('touchend', onTouchEnd)
  }

  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
  document.addEventListener('touchend', onTouchEnd)
}

// 文字區塊旋轉縮放
const onTextBlockTransformMouseDown = (e: MouseEvent) => {
  e.preventDefault()
  if (!canvasRef.value) return
  textBlockTransforming.value = true

  const rect = canvasRef.value.getBoundingClientRect()
  const centerX = rect.width * (textX.value / 100)
  const centerY = rect.height * (textY.value / 100)
  const cursorX = e.clientX - rect.left
  const cursorY = e.clientY - rect.top

  const dx = cursorX - centerX
  const dy = cursorY - centerY
  const distance = Math.sqrt(dx * dx + dy * dy) || 1
  const angle = Math.atan2(dy, dx)

  const initScale = textScale.value
  const initRotation = textRotation.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!canvasRef.value) return
    const r = canvasRef.value.getBoundingClientRect()
    const curX = moveEvent.clientX - r.left
    const curY = moveEvent.clientY - r.top
    const cx = r.width * (textX.value / 100)
    const cy = r.height * (textY.value / 100)

    const ndx = curX - cx
    const ndy = curY - cy
    const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
    const newAngle = Math.atan2(ndy, ndx)

    const scaleRatio = newDist / distance
    const angleDelta = (newAngle - angle) * (180 / Math.PI)

    textScale.value = Math.min(3, Math.max(0.3, initScale * scaleRatio))
    textRotation.value = initRotation + angleDelta
  }

  const onMouseUp = () => {
    textBlockTransforming.value = false
    saveDraftData()
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onTextBlockTransformTouchStart = (e: TouchEvent) => {
  const touch = e.touches[0]
  if (!touch || !canvasRef.value) return
  e.preventDefault()
  textBlockTransforming.value = true

  const rect = canvasRef.value.getBoundingClientRect()
  const centerX = rect.width * (textX.value / 100)
  const centerY = rect.height * (textY.value / 100)
  const cursorX = touch.clientX - rect.left
  const cursorY = touch.clientY - rect.top

  const dx = cursorX - centerX
  const dy = cursorY - centerY
  const distance = Math.sqrt(dx * dx + dy * dy) || 1
  const angle = Math.atan2(dy, dx)

  const initScale = textScale.value
  const initRotation = textRotation.value

  const onTouchMove = (moveEvent: TouchEvent) => {
    if (!canvasRef.value || !moveEvent.touches[0]) return
    moveEvent.preventDefault()
    const t = moveEvent.touches[0]
    const r = canvasRef.value.getBoundingClientRect()
    const curX = t.clientX - r.left
    const curY = t.clientY - r.top
    const cx = r.width * (textX.value / 100)
    const cy = r.height * (textY.value / 100)

    const ndx = curX - cx
    const ndy = curY - cy
    const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
    const newAngle = Math.atan2(ndy, ndx)

    const scaleRatio = newDist / distance
    const angleDelta = (newAngle - angle) * (180 / Math.PI)

    textScale.value = Math.min(3, Math.max(0.3, initScale * scaleRatio))
    textRotation.value = initRotation + angleDelta
  }

  const onTouchEnd = () => {
    textBlockTransforming.value = false
    saveDraftData()
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
    document.removeEventListener('touchend', onTouchEnd)
  }

  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
  document.addEventListener('touchend', onTouchEnd)
}

// 貼紙拖曳邏輯
const onStickerMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
  if ((e.target as HTMLElement).closest('.p-editor__sticker-delete, .p-editor__sticker-transform-handle')) return
  e.preventDefault()
  selectSticker(sticker.id)
  dragState.value = {
    stickerId: sticker.id,
    startX: e.clientX,
    startY: e.clientY,
    initialX: sticker.x,
    initialY: sticker.y
  }
  draggingStickerId.value = sticker.id

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!dragState.value || !canvasRef.value) return
    const rect = canvasRef.value.getBoundingClientRect()
    const deltaX = ((moveEvent.clientX - dragState.value.startX) / rect.width) * 100
    const deltaY = ((moveEvent.clientY - dragState.value.startY) / rect.height) * 100

    const sticker = stickers.value.find(s => s.id === dragState.value!.stickerId)
    if (sticker) {
      sticker.x = Math.min(95, Math.max(5, dragState.value.initialX + deltaX))
      sticker.y = Math.min(95, Math.max(5, dragState.value.initialY + deltaY))
    }
  }

  const onMouseUp = () => {
    if (dragState.value) {
      saveDraftData()
    }
    dragState.value = null
    draggingStickerId.value = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onStickerTouchStart = (e: TouchEvent, sticker: StickerInstance) => {
  if ((e.target as HTMLElement).closest('.p-editor__sticker-delete, .p-editor__sticker-transform-handle')) return
  const touch = e.touches[0]
  if (!touch) return

  selectSticker(sticker.id)
  dragState.value = {
    stickerId: sticker.id,
    startX: touch.clientX,
    startY: touch.clientY,
    initialX: sticker.x,
    initialY: sticker.y
  }
  draggingStickerId.value = sticker.id

  const onTouchMove = (moveEvent: TouchEvent) => {
    if (!dragState.value || !canvasRef.value || !moveEvent.touches[0]) return
    moveEvent.preventDefault()
    const touch = moveEvent.touches[0]
    const rect = canvasRef.value.getBoundingClientRect()
    const deltaX = ((touch.clientX - dragState.value.startX) / rect.width) * 100
    const deltaY = ((touch.clientY - dragState.value.startY) / rect.height) * 100

    const s = stickers.value.find(st => st.id === dragState.value!.stickerId)
    if (s) {
      s.x = Math.min(95, Math.max(5, dragState.value.initialX + deltaX))
      s.y = Math.min(95, Math.max(5, dragState.value.initialY + deltaY))
    }
  }

  const onTouchEnd = () => {
    if (dragState.value) {
      saveDraftData()
    }
    dragState.value = null
    draggingStickerId.value = null
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
    document.removeEventListener('touchend', onTouchEnd)
  }

  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
  document.addEventListener('touchend', onTouchEnd)
}

const onStickerClick = (id: string) => {
  if (draggingStickerId.value || transformingStickerId.value) return
  selectSticker(id)
}

const onTransformHandleMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
  e.preventDefault()
  if (!canvasRef.value) return

  const rect = canvasRef.value.getBoundingClientRect()
  const centerX = rect.width * (sticker.x / 100)
  const centerY = rect.height * (sticker.y / 100)
  const cursorX = e.clientX - rect.left
  const cursorY = e.clientY - rect.top

  const dx = cursorX - centerX
  const dy = cursorY - centerY
  const distance = Math.sqrt(dx * dx + dy * dy) || 1
  const angle = Math.atan2(dy, dx)

  transformState.value = {
    stickerId: sticker.id,
    centerX: sticker.x,
    centerY: sticker.y,
    initialDistance: distance,
    initialAngle: angle,
    initialScale: sticker.scale,
    initialRotation: sticker.rotation
  }
  transformingStickerId.value = sticker.id

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!transformState.value || !canvasRef.value) return

    const r = canvasRef.value.getBoundingClientRect()
    const curX = moveEvent.clientX - r.left
    const curY = moveEvent.clientY - r.top
    const cx = r.width * (transformState.value.centerX / 100)
    const cy = r.height * (transformState.value.centerY / 100)

    const dx = curX - cx
    const dy = curY - cy
    const newDist = Math.sqrt(dx * dx + dy * dy) || 1
    const newAngle = Math.atan2(dy, dx)

    const scaleRatio = newDist / transformState.value.initialDistance
    const angleDelta = (newAngle - transformState.value.initialAngle) * (180 / Math.PI)

    const s = stickers.value.find(st => st.id === transformState.value!.stickerId)
    if (s) {
      s.scale = Math.min(3, Math.max(0.3, transformState.value.initialScale * scaleRatio))
      s.rotation = transformState.value.initialRotation + angleDelta
    }
  }

  const onMouseUp = () => {
    if (transformState.value) saveDraftData()
    transformState.value = null
    transformingStickerId.value = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onTransformHandleTouchStart = (e: TouchEvent, sticker: StickerInstance) => {
  const touch = e.touches[0]
  if (!touch || !canvasRef.value) return
  e.preventDefault()

  const rect = canvasRef.value.getBoundingClientRect()
  const centerX = rect.width * (sticker.x / 100)
  const centerY = rect.height * (sticker.y / 100)
  const cursorX = touch.clientX - rect.left
  const cursorY = touch.clientY - rect.top

  const dx = cursorX - centerX
  const dy = cursorY - centerY
  const distance = Math.sqrt(dx * dx + dy * dy) || 1
  const angle = Math.atan2(dy, dx)

  transformState.value = {
    stickerId: sticker.id,
    centerX: sticker.x,
    centerY: sticker.y,
    initialDistance: distance,
    initialAngle: angle,
    initialScale: sticker.scale,
    initialRotation: sticker.rotation
  }
  transformingStickerId.value = sticker.id

  const onTouchMove = (moveEvent: TouchEvent) => {
    if (!transformState.value || !canvasRef.value || !moveEvent.touches[0]) return
    moveEvent.preventDefault()

    const t = moveEvent.touches[0]
    const r = canvasRef.value.getBoundingClientRect()
    const curX = t.clientX - r.left
    const curY = t.clientY - r.top
    const cx = r.width * (transformState.value.centerX / 100)
    const cy = r.height * (transformState.value.centerY / 100)

    const dx = curX - cx
    const dy = curY - cy
    const newDist = Math.sqrt(dx * dx + dy * dy) || 1
    const newAngle = Math.atan2(dy, dx)

    const scaleRatio = newDist / transformState.value.initialDistance
    const angleDelta = (newAngle - transformState.value.initialAngle) * (180 / Math.PI)

    const s = stickers.value.find(st => st.id === transformState.value!.stickerId)
    if (s) {
      s.scale = Math.min(3, Math.max(0.3, transformState.value.initialScale * scaleRatio))
      s.rotation = transformState.value.initialRotation + angleDelta
    }
  }

  const onTouchEnd = () => {
    if (transformState.value) saveDraftData()
    transformState.value = null
    transformingStickerId.value = null
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
    document.removeEventListener('touchend', onTouchEnd)
  }

  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
  document.addEventListener('touchend', onTouchEnd)
}

const removeSticker = (id: string) => {
  stickers.value = stickers.value.filter(s => s.id !== id)
  selectedStickerId.value = null
  saveDraftData()
}

const saveDraftData = () => {
  const draft: DraftData = {
    content: content.value,
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textColor.value,
    stickers: stickers.value,
    textTransform: { x: textX.value, y: textY.value, scale: textScale.value, rotation: textRotation.value },
    timestamp: Date.now()
  }
  saveDraft(draft)
}

const loadDraftData = (draft: DraftData) => {
  content.value = draft.content
  backgroundImage.value = draft.backgroundImage
  shape.value = draft.shape
  textColor.value = draft.textColor
  stickers.value = draft.stickers
  if (draft.textTransform) {
    textX.value = draft.textTransform.x
    textY.value = draft.textTransform.y
    textScale.value = draft.textTransform.scale
    textRotation.value = draft.textTransform.rotation
  }
  syncContentToDom(draft.content)
}

const handleDraftDecision = (useDraft: boolean) => {
  if (useDraft) {
    const draft = loadDraft()
    if (draft) {
      loadDraftData(draft)
    }
  } else {
    clearDraft()
  }
  showDraftModal.value = false
}

const clearAll = () => {
  if (!confirm('確定要清空所有內容嗎？')) return
  
  content.value = ''
  backgroundImage.value = BACKGROUND_IMAGES[0].url
  shape.value = DEFAULT_SHAPE_ID
  textColor.value = '#333333'
  stickers.value = []
  textX.value = 50
  textY.value = 50
  textScale.value = 1
  textRotation.value = 0
  clearDraft()
  syncContentToDom('')
}

const isSubmitting = ref(false)

const handleSubmit = async () => {
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

    // 驗證 token
    const isValid = await validateToken(token)
    if (!isValid) {
      alert('Token 無效或已使用，請使用新的連結')
      return
    }

    // 建立便利貼表單資料
    const form = {
      content: content.value.trim(),
      style: {
        backgroundImage: backgroundImage.value,
        shape: shape.value,
        textColor: textColor.value,
        stickers: stickers.value,
        textTransform: { x: textX.value, y: textY.value, scale: textScale.value, rotation: textRotation.value }
      }
    }

    await createNote(form, token)

    // 成功後清除草稿
    clearDraft()

    // 導向到 queue status 頁面
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
onMounted(() => {
  // 處理 Token
  const tokenFromQuery = route.query.token as string
  if (tokenFromQuery) {
    saveToken(tokenFromQuery)
  }

  // 檢查草稿
  const existingDraft = loadDraft()
  if (existingDraft) {
    showDraftModal.value = true
  }
})

// Auto-save on changes
watch([backgroundImage, shape, textColor], () => {
  saveDraftData()
})
</script>


<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_editor.scss */
</style>
