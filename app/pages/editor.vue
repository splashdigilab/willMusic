<template>
  <div class="editor-page">
    <!-- Header -->
    <header class="editor-header">
      <button class="header-btn" @click="goBack">
        <span>← 返回</span>
      </button>
      <h1 class="header-title">編輯便利貼</h1>
      <button class="header-btn" @click="showPreview = true">
        <span>預覽</span>
      </button>
    </header>

    <!-- Draft Modal -->
    <div v-if="showDraftModal" class="modal-overlay" @click="handleDraftDecision(false)">
      <div class="modal-content" @click.stop>
        <div class="modal-icon">📝</div>
        <h2 class="modal-title">發現草稿</h2>
        <p class="modal-message">
          您有一份未完成的草稿，要繼續編輯還是重新開始？
        </p>
        <div class="modal-actions">
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
    <div class="canvas-section">
      <div class="canvas-container">
        <div
          ref="canvasRef"
          class="canvas"
          :style="canvasStyle"
          @click="deselectSticker"
        >
          <!-- Content Text -->
          <div
            class="canvas-text"
            :style="textStyle"
            contenteditable
            @input="handleTextInput"
            @click.stop
            placeholder="在這裡輸入文字..."
          >
            {{ content }}
          </div>

          <!-- Stickers -->
          <div
            v-for="sticker in stickers"
            :key="sticker.id"
            class="sticker"
            :class="{ 
              'is-selected': selectedStickerId === sticker.id,
              'is-dragging': draggingStickerId === sticker.id 
            }"
            :style="getStickerStyle(sticker)"
            @mousedown="onStickerMouseDown($event, sticker)"
            @touchstart="onStickerTouchStart($event, sticker)"
            @click.stop="onStickerClick(sticker.id)"
          >
            {{ STICKER_LIBRARY.find(s => s.id === sticker.type)?.content }}
            
            <!-- Delete Button -->
            <button
              v-if="selectedStickerId === sticker.id"
              class="sticker-delete"
              @click.stop="removeSticker(sticker.id)"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Character Count -->
        <div class="character-count">
          {{ content.length }} / 200
        </div>
      </div>
    </div>

    <!-- Control Panel -->
    <div class="control-panel">
      <!-- Background Color -->
      <div class="control-section">
        <h3 class="control-title">背景顏色</h3>
        <div class="color-grid">
          <button
            v-for="color in backgroundColors"
            :key="color.value"
            class="color-btn"
            :class="{ 'is-active': backgroundColor === color.value }"
            :style="{ background: color.value }"
            @click="backgroundColor = color.value"
          >
            <span v-if="backgroundColor === color.value" class="color-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Text Color -->
      <div class="control-section">
        <h3 class="control-title">文字顏色</h3>
        <div class="color-grid">
          <button
            v-for="color in textColors"
            :key="color.value"
            class="color-btn"
            :class="{ 'is-active': textColor === color.value }"
            :style="{ background: color.value }"
            @click="textColor = color.value"
          >
            <span v-if="textColor === color.value" class="color-check">✓</span>
          </button>
        </div>
      </div>

      <!-- Font Size -->
      <div class="control-section">
        <h3 class="control-title">文字大小</h3>
        <input
          v-model.number="fontSize"
          type="range"
          min="16"
          max="48"
          step="2"
          class="slider"
        />
        <span class="slider-value">{{ fontSize }}px</span>
      </div>

      <!-- Sticker Library -->
      <div class="control-section">
        <h3 class="control-title">貼紙</h3>
        <div class="sticker-categories">
          <button
            v-for="category in categories"
            :key="category.id"
            class="category-btn"
            :class="{ 'is-active': selectedCategory === category.id }"
            @click="selectedCategory = category.id"
          >
            {{ category.name }}
          </button>
        </div>
        <div class="sticker-grid">
          <button
            v-for="sticker in filteredStickers"
            :key="sticker.id"
            class="sticker-btn"
            @click="addSticker(sticker.id)"
          >
            {{ sticker.content }}
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div class="bottom-actions">
      <button class="action-btn action-btn--secondary" @click="clearAll">
        清空
      </button>
      <button 
        class="action-btn action-btn--primary" 
        :disabled="isSubmitting"
        @click="handleSubmit"
      >
        {{ isSubmitting ? '提交中...' : '提交便利貼' }}
      </button>
    </div>

    <!-- Preview Modal -->
    <div v-if="showPreview" class="modal-overlay" @click="showPreview = false">
      <div class="preview-modal" @click.stop>
        <div class="preview-header">
          <h2>預覽</h2>
          <button class="close-btn" @click="showPreview = false">✕</button>
        </div>
        <div class="preview-content">
          <StickyNote :note="previewNote" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StickerInstance, DraftData } from '~/types'
import { STICKER_LIBRARY, getStickersByCategory, getStickerCategories } from '~/data/stickers'

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

const canvasRef = ref<HTMLElement | null>(null)

// 拖曳狀態
interface DragState {
  stickerId: string
  startX: number
  startY: number
  initialX: number
  initialY: number
}
const dragState = ref<DragState | null>(null)
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

const canvasStyle = computed(() => ({
  background: backgroundColor.value
}))

const textStyle = computed(() => ({
  color: textColor.value,
  fontSize: `${fontSize.value}px`
}))

const getStickerStyle = (sticker: StickerInstance) => ({
  left: `${sticker.x}%`,
  top: `${sticker.y}%`,
  transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
  fontSize: '3rem'
})

const previewNote = computed(() => ({
  content: content.value,
  style: {
    backgroundColor: backgroundColor.value,
    textColor: textColor.value,
    fontSize: fontSize.value,
    stickers: stickers.value
  },
  token: '',
  timestamp: null as any,
  status: 'waiting' as const
}))

// Methods
const handleTextInput = (e: Event) => {
  const target = e.target as HTMLElement
  content.value = target.innerText.slice(0, 200)
  saveDraftData()
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
}

const deselectSticker = () => {
  selectedStickerId.value = null
}

// 貼紙拖曳邏輯
const onStickerMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
  if ((e.target as HTMLElement).closest('.sticker-delete')) return
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
  if ((e.target as HTMLElement).closest('.sticker-delete')) return
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
  if (draggingStickerId.value) return
  selectSticker(id)
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
  clearDraft()
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
        stickers: stickers.value
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

<style scoped lang="scss">
.editor-page {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  color: #667eea;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: #764ba2;
  }
}

.header-title {
  font-size: 1.125rem;
  font-weight: bold;
  color: #333;
}

.canvas-section {
  padding: 2rem 1rem;
  flex: 1;
}

.canvas-container {
  max-width: 600px;
  margin: 0 auto;
  position: relative;
}

.canvas {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  position: relative;
  overflow: hidden;
  cursor: text;
}

.canvas-text {
  width: 100%;
  height: 100%;
  padding: 2rem;
  outline: none;
  word-wrap: break-word;
  white-space: pre-wrap;
  line-height: 1.6;
  
  &:empty:before {
    content: attr(placeholder);
    color: rgba(0, 0, 0, 0.3);
  }
}

.character-count {
  text-align: right;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #666;
}

.sticker {
  position: absolute;
  cursor: grab;
  user-select: none;
  transition: transform 0.1s ease;
  touch-action: none;

  &.is-selected {
    filter: drop-shadow(0 0 8px rgba(102, 126, 234, 0.8));
  }

  &.is-dragging {
    cursor: grabbing;
    transition: none;
    z-index: 10;
  }
}

.sticker-delete {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 24px;
  height: 24px;
  background: #f43f5e;
  color: white;
  border: none;
  border-radius: 50%;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-panel {
  padding: 2rem 1rem;
  background: white;
  border-top: 1px solid #e0e0e0;
  max-width: 600px;
  margin: 0 auto;
}

.control-section {
  margin-bottom: 2rem;
}

.control-title {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 1rem;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
  gap: 0.75rem;
}

.color-btn {
  aspect-ratio: 1;
  border: 3px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }

  &.is-active {
    border-color: #333;
    transform: scale(1.1);
  }
}

.color-check {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.5rem;
  color: white;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
}

.slider {
  width: 100%;
  margin-bottom: 0.5rem;
}

.slider-value {
  font-size: 0.875rem;
  color: #666;
}

.sticker-categories {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.category-btn {
  padding: 0.5rem 1rem;
  background: #f0f0f0;
  border: 2px solid transparent;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #e0e0e0;
  }

  &.is-active {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }
}

.sticker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
  gap: 0.75rem;
  max-height: 200px;
  overflow-y: auto;
}

.sticker-btn {
  aspect-ratio: 1;
  background: #f9f9f9;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 2rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #f0f0f0;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
}

.bottom-actions {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: white;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  position: sticky;
  bottom: 0;
}

.action-btn {
  flex: 1;
  padding: 1rem;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  &--secondary {
    background: #e0e0e0;
    color: #333;

    &:hover {
      background: #d0d0d0;
    }
  }

  &--primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
    }
  }
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 400px;
  width: 100%;
  text-align: center;
}

.modal-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: bold;
  color: #333;
  margin-bottom: 1rem;
}

.modal-message {
  color: #666;
  margin-bottom: 2rem;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  gap: 1rem;
}

.btn {
  flex: 1;
  padding: 1rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &--secondary {
    background: #e0e0e0;
    color: #333;
  }

  &--primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }
}

.preview-modal {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 500px;
  width: 100%;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;

  h2 {
    font-size: 1.25rem;
    font-weight: bold;
    color: #333;
  }
}

.close-btn {
  width: 32px;
  height: 32px;
  background: #e0e0e0;
  border: none;
  border-radius: 50%;
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #d0d0d0;
  }
}
</style>
