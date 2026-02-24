<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="c-modal-overlay">
        <div class="c-modal" @click.stop>
          <template v-if="currentStepData">
            <div class="c-modal__icon">{{ currentStepData.icon }}</div>
            
            <h2 class="c-modal__title">{{ currentStepData.title }}</h2>
            <p class="c-modal__message">{{ currentStepData.message }}</p>
          </template>

          <!-- Step Indicators -->
          <div class="tutorial-steps">
            <span 
              v-for="(_, index) in steps" 
              :key="index"
              class="tutorial-step-dot"
              :class="{ 'is-active': currentStep === index }"
            ></span>
          </div>

          <div class="c-modal__actions">
            <!-- Secondary/Cancel Button -->
            <button 
              v-if="currentStep > 0"
              class="c-button c-button--secondary" 
              @click="prevStep"
            >
              上一步
            </button>
            <button 
              v-else
              class="c-button c-button--secondary" 
              @click="finish"
            >
              略過
            </button>

            <!-- Primary/Confirm Button -->
            <button 
              class="c-button c-button--primary" 
              @click="nextStep"
            >
              {{ currentStep === steps.length - 1 ? '開始體驗' : '下一步' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'finish'])

const currentStep = ref(0)

const steps = [
  {
    icon: '📝',
    title: '製作專屬便利貼',
    message: '從下方選單選擇你喜歡的材質與造型，為你的留言打好基礎！'
  },
  {
    icon: '✍️',
    title: '加入文字與貼紙',
    message: '輸入文字、調整顏色，並貼上可愛的預設貼紙，豐富你的版面。'
  },
  {
    icon: '🎨',
    title: '盡情揮灑創意',
    message: '切換到手繪模式，使用不同畫筆隨意塗鴉，畫出獨一無二的圖案！'
  },
  {
    icon: '🚀',
    title: '完成並分享',
    message: '全部完成後，點擊「上傳大螢幕」將便利貼送出，或是下載分享給朋友！'
  }
]

const currentStepData = computed(() => {
  return steps[currentStep.value] || steps[0]
})

const nextStep = () => {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  } else {
    finish()
  }
}

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

const finish = () => {
  emit('update:modelValue', false)
  emit('finish')
  if (typeof window !== 'undefined') {
    localStorage.setItem('hasSeenWillMusicTutorial', 'true')
  }
}
</script>

<style lang="scss" scoped>
.tutorial-steps {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  margin-bottom: 24px;
}

.tutorial-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #e2e8f0;
  transition: all 0.3s ease;

  &.is-active {
    background-color: #1a1a1a;
    transform: scale(1.2);
  }
}
</style>
