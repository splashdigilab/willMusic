<template>
  <div class="c-style-picker">
    <div class="c-style-picker__grid">
      <button
        v-for="(style, index) in styles"
        :key="index"
        class="c-style-picker__item"
        :class="{ 'is-active': selectedIndex === index }"
        :style="{
          backgroundColor: style.backgroundColor,
          color: style.textColor
        }"
        @click="selectStyle(index)"
      >
        <span class="c-style-picker__preview">Aa</span>
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

<style scoped>
/* 所有樣式已移至 app/assets/scss/components/_style-picker.scss */
</style>
