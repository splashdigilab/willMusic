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
        />
      </div>
      <!-- 手繪圖層 -->
      <img
        v-if="props.note.style?.drawing"
        :src="props.note.style.drawing"
        alt=""
        class="c-sticky-note__drawing"
      />
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { gsap } from 'gsap'
import type { QueuePendingItem, QueueHistoryItem, StickerInstance, TextBlockInstance } from '~/types'
import { STICKER_LIBRARY } from '~/data/stickers'
import { getShapeById, DEFAULT_SHAPE_ID } from '~/data/shapes'
import { getTextBlockStyle, getStickerStyle } from '~/utils/sticky-note-style'
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

/** 預覽/上傳/display 與編輯器疊放順序一致；無則沿用預設（文字 1、貼紙 3） */
const objectLayerOrder = computed(() => props.note.style?.objectLayerOrder ?? {})

const getBlockWrapStyle = (block: TextBlockInstance) => {
  const base = getTextBlockStyle(block.x, block.y, block.scale, block.rotation)
  const z = objectLayerOrder.value[block.id] ?? 1
  return { ...base, zIndex: z }
}

const getStickerWrapStyle = (sticker: StickerInstance) => {
  const base = getStickerStyle(sticker)
  const z = objectLayerOrder.value[sticker.id] ?? 3
  return { ...base, zIndex: z }
}

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

// GSAP 動畫（如果需要）與縮放監聽
const scalerStyle = ref({ transform: 'scale(1)' })
const VIRTUAL_SIZE = 600
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (noteRef.value) {
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry && entry.contentRect.width > 0) {
        const scale = entry.contentRect.width / VIRTUAL_SIZE
        scalerStyle.value = { transform: `scale(${scale})` }
      }
    })
    resizeObserver.observe(noteRef.value)
  }

  if (props.animate && import.meta.client && noteRef.value) {
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
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/components/_sticky-note.scss */
</style>
