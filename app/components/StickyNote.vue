<template>
  <div
    ref="noteRef"
    class="c-sticky-note"
    :style="noteStyles"
    :data-pattern="note.style.pattern || 'solid'"
  >
    <div class="c-sticky-note__content">
      {{ note.content }}
    </div>
    <!-- 貼紙 -->
    <div
      v-for="sticker in stickers"
      :key="sticker.id"
      class="c-sticky-note__sticker"
      :style="getStickerStyle(sticker)"
    >
      {{ getStickerContent(sticker.type) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { gsap } from 'gsap'
import type { QueuePendingItem, QueueHistoryItem, StickerInstance } from '~/types'
import { STICKER_LIBRARY } from '~/data/stickers'

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

// 統一的便利貼樣式（使用 % 比例，確保各頁面一致）
// 基準：editor 容器 600px，fontSize 24 → 4% 寬度
const noteStyles = computed(() => {
  const fontSize = props.note.style.fontSize ?? 24
  const fontPct = (fontSize / 600) * 100
  return {
    backgroundColor: props.note.style.backgroundColor,
    color: props.note.style.textColor,
    fontFamily: props.note.style.fontFamily || 'inherit',
    '--font-size-pct': fontPct
  }
})

const getStickerContent = (type: string) => {
  return STICKER_LIBRARY.find(s => s.id === type)?.content || '⭐'
}

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
