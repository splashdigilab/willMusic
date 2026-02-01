<template>
  <div
    class="sticky-note"
    :style="noteStyles"
    :data-pattern="note.style.pattern || 'solid'"
  >
    <div class="sticky-note__content">
      {{ note.content }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueuePendingItem, QueueHistoryItem } from '~/types'

interface Props {
  note: QueuePendingItem | QueueHistoryItem
  animate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  animate: false
})

const noteStyles = computed(() => ({
  backgroundColor: props.note.style.backgroundColor,
  color: props.note.style.textColor,
  fontSize: `${props.note.style.fontSize}px`,
  fontFamily: props.note.style.fontFamily || 'inherit',
  transform: props.note.style.rotation
    ? `rotate(${props.note.style.rotation}deg)`
    : 'none'
}))

// GSAP 動畫（如果需要）
onMounted(() => {
  if (props.animate && import.meta.client) {
    const { gsap } = useNuxtApp()
    const el = document.querySelector('.sticky-note')
    
    if (el && gsap) {
      gsap.from(el, {
        scale: 0,
        rotation: -180,
        opacity: 0,
        duration: 0.6,
        ease: 'back.out(1.7)'
      })
    }
  }
})
</script>

<style scoped lang="scss">
.sticky-note {
  position: relative;
  width: 100%;
  max-width: 400px;
  min-height: 200px;
  padding: 2rem;
  border-radius: 4px;
  box-shadow: 
    0 4px 6px rgba(0, 0, 0, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 
      0 10px 20px rgba(0, 0, 0, 0.15),
      0 3px 6px rgba(0, 0, 0, 0.1);
  }

  &[data-pattern="lines"] {
    background-image: repeating-linear-gradient(
      transparent,
      transparent 24px,
      rgba(0, 0, 0, 0.1) 24px,
      rgba(0, 0, 0, 0.1) 25px
    );
  }

  &[data-pattern="dots"] {
    background-image: radial-gradient(
      circle,
      rgba(0, 0, 0, 0.1) 1px,
      transparent 1px
    );
    background-size: 20px 20px;
  }

  &[data-pattern="grid"] {
    background-image: 
      repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.05) 0,
        rgba(0, 0, 0, 0.05) 1px,
        transparent 1px,
        transparent 20px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.05) 0,
        rgba(0, 0, 0, 0.05) 1px,
        transparent 1px,
        transparent 20px
      );
  }

  &__content {
    word-wrap: break-word;
    white-space: pre-wrap;
    line-height: 1.6;
  }
}

@media (max-width: 768px) {
  .sticky-note {
    max-width: 100%;
    min-height: 150px;
    padding: 1.5rem;
  }
}
</style>
