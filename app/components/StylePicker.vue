<template>
  <div class="style-picker">
    <div class="style-picker__grid">
      <button
        v-for="(style, index) in styles"
        :key="index"
        class="style-picker__item"
        :class="{ 'is-active': selectedIndex === index }"
        :style="{
          backgroundColor: style.backgroundColor,
          color: style.textColor
        }"
        @click="selectStyle(index)"
      >
        <span class="style-picker__preview">Aa</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StickyNoteStyle } from '~/types'
import { DEFAULT_STYLES } from '~/types'

interface Props {
  modelValue: StickyNoteStyle
  styles?: StickyNoteStyle[]
}

interface Emits {
  (e: 'update:modelValue', value: StickyNoteStyle): void
}

const props = withDefaults(defineProps<Props>(), {
  styles: () => DEFAULT_STYLES
})

const emit = defineEmits<Emits>()

const selectedIndex = ref(0)

const selectStyle = (index: number) => {
  selectedIndex.value = index
  emit('update:modelValue', props.styles[index])
}

// 初始化選擇第一個樣式
onMounted(() => {
  emit('update:modelValue', props.styles[0])
})
</script>

<style scoped lang="scss">
.style-picker {
  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
    gap: 1rem;
  }

  &__item {
    aspect-ratio: 1;
    border: 3px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    &.is-active {
      border-color: #333;
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
    }
  }

  &__preview {
    opacity: 0.8;
  }
}
</style>
