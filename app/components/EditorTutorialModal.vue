<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="c-modal-overlay">
        <div 
          class="c-modal c-modal--tutorial" 
          @click.stop
          @touchstart="handleTouchStart"
          @touchend="handleTouchEnd"
        >
          <template v-if="currentStepData">
            <h2 class="c-modal__title">{{ currentStepData.title }}</h2>
            <p class="c-modal__message">{{ currentStepData.message }}</p>
          </template>

          <!-- 示意區：與 editor 一致的被選取物件 + 雙指動畫 -->
          <div
            class="tutorial-demo"
            :class="`tutorial-demo--step-${currentStep}`"
          >
            <div class="tutorial-demo__stage">
              <!-- 編輯框 + scaleUp 圖：一起動畫 -->
              <div v-if="currentStepData" class="tutorial-demo__object-wrap">
                <img :src="currentStepData.image" class="tutorial-demo__guesture" alt="" />
                <div class="tutorial-demo__object">
                  <span class="tutorial-demo__object-text">{{ t.editor.tutorial.demoText }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="tutorial-steps">
            <span
              v-for="(_, index) in steps"
              :key="index"
              class="tutorial-step-dot"
              :class="{ 'is-active': currentStep === index }"
            />
          </div>

          <div class="c-modal__actions">
            <button
              v-if="currentStep > 0"
              class="c-button c-button--secondary"
              @click="prevStep"
            >
              {{ t.editor.prev }}
            </button>
            <button
              v-else
              class="c-button c-button--secondary"
              @click="finish"
            >
              {{ t.editor.tutorial.skip }}
            </button>
            <button
              class="c-button c-button--primary"
              @click="nextStep"
            >
              {{ currentStep === steps.length - 1 ? t.editor.tutorial.start : t.editor.next }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'finish'])

const { t } = useI18n()

const currentStep = ref(0)

/** 三頁的示意圖。標題與說明在翻譯檔的 t.editor.tutorial，以 id 對應 */
const steps = [
  { id: 'drag', image: '/tutorial-drag.svg' },
  { id: 'rotate', image: '/tutorial-rotate.svg' },
  { id: 'scale', image: '/tutorial-scale.svg' }
] as const

const currentStepData = computed(() => {
  const step = steps[currentStep.value] ?? steps[0]
  return { ...t.value.editor.tutorial[step.id], image: step.image }
})

const touchStartX = ref(0)
const touchEndX = ref(0)
const SWIPE_THRESHOLD = 50

const handleTouchStart = (e: TouchEvent) => {
  if (e.touches && e.touches.length > 0) {
    touchStartX.value = e.touches[0]?.clientX ?? 0
  }
}

const handleTouchEnd = (e: TouchEvent) => {
  if (!e.changedTouches || e.changedTouches.length === 0) return
  
  touchEndX.value = e.changedTouches[0]?.clientX ?? 0
  const deltaX = touchStartX.value - touchEndX.value
  
  if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
    if (deltaX > 0) {
      // 向左滑動 (Swiped left) -> 下一步
      nextStep()
    } else {
      // 向右滑動 (Swiped right) -> 上一步
      prevStep()
    }
  }
}

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  } else {
    finish()
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function finish() {
  emit('update:modelValue', false)
  emit('finish')
  if (typeof window !== 'undefined') {
    localStorage.setItem('hasSeenWillMusicTutorial', 'true')
  }
}

// 每次打開 modal 都從第一步開始
watch(() => props.modelValue, (open) => {
  if (open) currentStep.value = 0
})
</script>

<style lang="scss" scoped>
/* 樣式已移至 assets/scss/components/_editor-tutorial-modal.scss，由 component-index 載入 */
</style>
