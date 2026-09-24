<template>
  <div
    ref="noteRef"
    class="c-sticky-note"
    :data-shape="note.style.shape || 'rounded'"
  >
    <div class="c-sticky-note__scaler" :style="[scalerStyle, wrapperStyles]">
      <div class="c-sticky-note__inner" :style="innerStyles">
      <!-- 多文字區塊：每個區塊各自位置、顏色、對齊 -->
      <template v-if="textBlocks.length">
        <div
          v-for="block in textBlocks"
          :key="block.id"
          class="c-sticky-note__content-wrap"
          :style="getBlockWrapStyle(block)"
        >
          <div
            class="c-sticky-note__content"
            :style="{ color: block.color, textAlign: block.align }"
          >
            {{ block.content }}
          </div>
        </div>
      </template>
      <!-- 單一文字（舊格式） -->
      <div
        v-else
        class="c-sticky-note__content-wrap"
        :style="contentWrapStyle"
      >
        <div class="c-sticky-note__content">
          {{ note.content }}
        </div>
      </div>
      <!-- 貼紙 -->
      <div
        v-for="sticker in stickers"
        :key="sticker.id"
        class="c-sticky-note__sticker"
        :style="getStickerWrapStyle(sticker)"
      >
        <img 
          v-if="getStickerData(sticker.type)?.svgFile"
          :src="getStickerData(sticker.type)?.svgFile"
          :alt="getStickerData(sticker.type)?.id"
          class="c-sticky-note__sticker-img"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
        />
      </div>
      <!-- 手繪圖層。疊放順序要跟編輯器一致：編輯器裡每回進繪圖步驟都會把它移到最上層，
           所以它可能在文字與貼紙之上。這裡若寫死 z-index，回頭再畫一次的便利貼
           在預覽與大螢幕上就會與畫布長得不一樣。 -->
      <img
        v-if="props.note.style?.drawing"
        :src="props.note.style.drawing"
        alt=""
        class="c-sticky-note__drawing"
        :style="drawingStyle"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
      />
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueuePendingItem, QueueHistoryItem, StickerInstance, TextBlockInstance } from '~/types'
import { STICKER_LIBRARY } from '~/data/stickers'
import { getShapeById, DEFAULT_SHAPE_ID } from '~/data/shapes'
import { getTextBlockStyle, getStickerStyle, NOTE_LAYER_Z, DRAWING_LAYER_ID } from '~/utils/sticky-note-style'
import { useStickyNoteStyle, type StickyNoteStyleProps } from '~/composables/useStickyNoteStyle'

interface Props {
  note: QueuePendingItem | QueueHistoryItem
  animate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  animate: false
})

const noteRef = ref<HTMLElement | null>(null)

const stickers = computed(() => {
  return props.note.style?.stickers || []
})

const textBlocks = computed<TextBlockInstance[]>(() => props.note.style?.textBlocks ?? [])

/**
 * 疊放順序。新的便利貼不再存這份記錄，一律走 NOTE_LAYER_Z 的固定順序；
 * 舊的便利貼存過，就以它自己的記錄為準，這次改動不會讓已經上牆的內容變樣。
 */
const objectLayerOrder = computed(() => props.note.style?.objectLayerOrder ?? {})

const getBlockWrapStyle = (block: TextBlockInstance) => {
  const base = getTextBlockStyle(block.x, block.y, block.scale, block.rotation)
  const z = objectLayerOrder.value[block.id] ?? NOTE_LAYER_Z.text
  return { ...base, zIndex: z }
}

const getStickerWrapStyle = (sticker: StickerInstance) => {
  const base = getStickerStyle(sticker)
  const z = objectLayerOrder.value[sticker.id] ?? NOTE_LAYER_Z.sticker
  return { ...base, zIndex: z }
}

const drawingStyle = computed(() => ({
  zIndex: objectLayerOrder.value[DRAWING_LAYER_ID] ?? NOTE_LAYER_Z.drawing
}))

const noteStyleProps = computed<StickyNoteStyleProps>(() => ({
  shape: props.note.style.shape || DEFAULT_SHAPE_ID,
  textColor: props.note.style.textColor,
  textAlign: props.note.style.textAlign || 'center',
  fontFamily: props.note.style.fontFamily || 'inherit',
  backgroundImage: props.note.style.backgroundImage
}))

const { wrapperStyles, innerStyles } = useStickyNoteStyle(noteStyleProps)

const contentWrapStyle = computed(() => {
  const t = props.note.style?.textTransform
  const x = t?.x ?? 50
  const y = t?.y ?? 50
  const scale = t?.scale ?? 1
  const rotation = t?.rotation ?? 0
  return getTextBlockStyle(x, y, scale, rotation)
})

const getStickerData = (type: string) => STICKER_LIBRARY.find(s => s.id === type)

// GSAP 動畫（如果需要）與縮放
const VIRTUAL_SIZE = 600

// scaler 是固定 600×600，要縮到多小得先量到容器寬度，而那要等 onMounted。
// 在那之前先不要畫出來：否則新便利貼的第一幀會以 600px 全尺寸、
// 從左上角（transform-origin: 0 0）展開，看起來就是閃一下。
// 量到寬度後（含 ResizeObserver 的後續變化）才切回 visible。
const scalerStyle = ref<Record<string, string>>({
  transform: 'scale(1)',
  visibility: 'hidden'
})

function updateScale() {
  if (noteRef.value) {
    const width = noteRef.value.clientWidth
    if (width > 0) {
      scalerStyle.value = {
        transform: `scale(${width / VIRTUAL_SIZE})`,
        visibility: 'visible'
      }
    }
  }
}

let ro: ResizeObserver | null = null

onMounted(async () => {
  updateScale()

  // 使用 ResizeObserver 監聽大小變化，保證 GSAP Flip 重排後 scale 始終正確
  if (noteRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { updateScale() })
    ro.observe(noteRef.value)
  }

  if (props.animate && import.meta.client && noteRef.value) {
    // 只在實際需要動畫時才載入 GSAP，減少不需要動畫時的記憶體與解析成本
    const { gsap } = await import('gsap')
    gsap.from(noteRef.value, {
      scale: 0,
      rotation: -180,
      opacity: 0,
      duration: 0.6,
      ease: 'back.out(1.7)'
    })
  }
})

onUnmounted(() => {
  ro?.disconnect()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/components/_sticky-note.scss */
</style>
