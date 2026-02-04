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
      <div class="p-editor__canvas-container">
        <div
          ref="canvasRef"
          class="p-editor__canvas"
          :style="canvasStyle"
          @click="deselectAll"
        >
          <!-- 文字區塊：可移動、縮放、旋轉 -->
          <div
            ref="textBlockRef"
            class="p-editor__text-block"
            :class="{ 
              'is-selected': textBlockSelected,
              'is-dragging': textBlockDragging,
              'is-transforming': textBlockTransforming
            }"
            :style="textBlockStyle"
            @click.stop="selectTextBlock"
          >
            <div 
              class="p-editor__text-block-drag-bar"
              @mousedown.stop="onTextBlockDragBarMouseDown"
              @touchstart.stop="onTextBlockDragBarTouchStart"
            >
              ⋮⋮
            </div>
            <div
              ref="contentEditableRef"
              class="p-editor__canvas-text"
              :style="textStyle"
              contenteditable
              @input="handleTextInput"
              @click.stop="selectTextBlock"
              @focus="selectTextBlock"
              data-placeholder="在這裡輸入文字..."
            >
            </div>
            <div
              v-if="textBlockSelected"
              class="p-editor__text-block-transform-handle"
              @mousedown.stop="onTextBlockTransformMouseDown"
              @touchstart.stop="onTextBlockTransformTouchStart"
            >
              ↻
            </div>
          </div>

          <!-- Stickers -->
          <div
            v-for="sticker in stickers"
            :key="sticker.id"
            class="p-editor__sticker"
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
            {{ STICKER_LIBRARY.find(s => s.id === sticker.type)?.content }}
            
            <!-- Delete Button (左上角) -->
            <button
              v-if="selectedStickerId === sticker.id"
              class="p-editor__sticker-delete"
              @click.stop="removeSticker(sticker.id)"
            >
              ✕
            </button>
            
            <!-- Transform Handle 右下角：按住可旋轉縮放 -->
            <div
              v-if="selectedStickerId === sticker.id"
              class="p-editor__sticker-transform-handle"
              @mousedown.stop="onTransformHandleMouseDown($event, sticker)"
              @touchstart.stop="onTransformHandleTouchStart($event, sticker)"
            >
              ↻
            </div>
          </div>
        </div>

        <!-- Character Count -->
        <div class="p-editor__character-count">
          {{ content.length }} / 200
        </div>
      </div>
    </div>

    <!-- Control Panel -->
    <div class="p-editor__control-panel">
      <!-- Background Color -->
      <div class="p-editor__control-section">
        <h3 class="p-editor__control-title">背景顏色</h3>
        <div class="p-editor__color-grid">
          <button
            v-for="color in backgroundColors"
            :key="color.value"
            class="p-editor__color-btn"
            :class="{ 'is-active': backgroundColor === color.value }"
            :style="{ background: color.value }"
            @click="backgroundColor = color.value"
          >
            <span v-if="backgroundColor === color.value" class="p-editor__color-check">✓</span>
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

      <!-- Font Size -->
      <div class="p-editor__control-section">
        <h3 class="p-editor__control-title">文字大小</h3>
        <input
          v-model.number="fontSize"
          type="range"
          min="16"
          max="48"
          step="2"
          class="p-editor__slider"
        />
        <span class="p-editor__slider-value">{{ fontSize }}px</span>
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
            {{ sticker.content }}
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
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({
  layout: false
})

const route = useRoute()
const router = useRouter()
const { saveDraft, loadDraft, clearDraft, saveToken, loadToken } = useStorage()

// Editor State
const content = ref('')
const backgroundColor = ref('#FFE97F')
const textColor = ref('#333333')
const fontSize = ref(24)
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

// Color Options
const backgroundColors = [
  { name: 'Yellow', value: '#FFE97F' },
  { name: 'Pink', value: '#FF9CEE' },
  { name: 'Blue', value: '#9CDDFF' },
  { name: 'Green', value: '#CAFFBF' },
  { name: 'Purple', value: '#FFC6FF' },
  { name: 'Holographic', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: 'Neon Pink', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { name: 'Neon Green', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
]

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

const canvasStyle = computed(() => {
  const fontPct = (fontSize.value / 600) * 100
  return {
    background: backgroundColor.value,
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
    backgroundColor: backgroundColor.value,
    textColor: textColor.value,
    fontSize: fontSize.value,
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
}

const deselectAll = () => {
  selectedStickerId.value = null
  textBlockSelected.value = false
}

// 文字區塊拖曳（從拖曳條）
const onTextBlockDragBarMouseDown = (e: MouseEvent) => {
  e.preventDefault()
  textBlockDragging.value = true
  selectTextBlock()

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
  textBlockDragging.value = true
  selectTextBlock()

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
    backgroundColor: backgroundColor.value,
    textColor: textColor.value,
    fontSize: fontSize.value,
    stickers: stickers.value,
    textTransform: { x: textX.value, y: textY.value, scale: textScale.value, rotation: textRotation.value },
    timestamp: Date.now()
  }
  saveDraft(draft)
}

const loadDraftData = (draft: DraftData) => {
  content.value = draft.content
  backgroundColor.value = draft.backgroundColor
  textColor.value = draft.textColor
  fontSize.value = draft.fontSize
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
  backgroundColor.value = '#FFE97F'
  textColor.value = '#333333'
  fontSize.value = 24
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
        backgroundColor: backgroundColor.value,
        textColor: textColor.value,
        fontSize: fontSize.value,
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
watch([backgroundColor, textColor, fontSize], () => {
  saveDraftData()
})
</script>


<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_editor.scss */
</style>
