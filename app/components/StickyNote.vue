<template>
  <div
    ref="noteRef"
    class="c-sticky-note"
    :style="noteStyles"
    :data-shape="note.style.shape || 'rounded'"
  >
    <div class="c-sticky-note__inner">
      <div 
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
        :style="getStickerStyle(sticker)"
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
</template>

<script setup lang="ts">
import { gsap } from 'gsap'
import type { QueuePendingItem, QueueHistoryItem, StickerInstance } from '~/types'
import { STICKER_LIBRARY } from '~/data/stickers'
import { getShapeById, DEFAULT_SHAPE_ID } from '~/data/shapes'

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

// mask-image 直接使用 Illustrator 輸出的 SVG（無需 clipPath），遮罩 = 形狀的填色區域
const shapeMaskUrl = computed(() => {
  const shapeData = getShapeById(props.note.style?.shape || DEFAULT_SHAPE_ID)
  const s = shapeData ?? getShapeById(DEFAULT_SHAPE_ID)
  return s ? s.svg : '/svg/shapes/square.svg'
})

// 統一的便利貼樣式（使用 % 比例，確保各頁面一致）
const noteStyles = computed(() => {
  const fontPct = 4
  const maskUrl = shapeMaskUrl.value
  return {
    backgroundImage: `url(${props.note.style.backgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: props.note.style.textColor,
    textAlign: props.note.style.textAlign || 'center',
    fontFamily: props.note.style.fontFamily || 'inherit',
    '--font-size-pct': fontPct,
    maskImage: `url(${maskUrl})`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskImage: `url(${maskUrl})`,
    WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center'
  }
})

const contentWrapStyle = computed(() => {
  const t = props.note.style?.textTransform
  const x = t?.x ?? 50
  const y = t?.y ?? 50
  const scale = t?.scale ?? 1
  const rotation = t?.rotation ?? 0
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
    '--text-scale': scale
  }
})

const getStickerData = (type: string) => STICKER_LIBRARY.find(s => s.id === type)

const getStickerStyle = (sticker: StickerInstance) => ({
  left: `${sticker.x}%`,
  top: `${sticker.y}%`,
  transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`
})

// GSAP 動畫（如果需要）
onMounted(() => {
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
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/components/_sticky-note.scss */
</style>
