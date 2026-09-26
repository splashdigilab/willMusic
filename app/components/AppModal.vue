<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="c-modal-overlay" @click="handleOverlayClick">
        <div class="c-modal" @click.stop>
          
          <div v-if="icon" class="c-modal__icon">{{ icon }}</div>
          
          <h2 v-if="title" class="c-modal__title">{{ title }}</h2>
          <p v-if="message" class="c-modal__message" v-html="message"></p>

          <!-- For injecting previews like StickyNote -->
          <div v-if="$slots.preview" class="c-modal__preview-wrapper">
            <slot name="preview"></slot>
          </div>

          <!-- 緊貼在按鈕上方的補充說明，例如「按下去會發生什麼事」 -->
          <div v-if="$slots.footnote" class="c-modal__footnote">
            <slot name="footnote"></slot>
          </div>

          <div class="c-modal__actions" :class="{ 'c-modal__actions--stacked': stackedActions }">
            <!-- Secondary/Cancel Button -->
            <button
              v-if="cancelText"
              class="c-button c-button--secondary c-modal__cancel"
              @click="handleCancel"
              :disabled="loading"
            >
              {{ cancelText }}
            </button>
            <slot name="secondary-action"></slot>

            <!-- Primary/Confirm Button -->
            <button
              v-if="confirmText"
              class="c-button c-modal__confirm"
              :class="confirmButtonClass"
              @click="handleConfirm"
              :disabled="loading"
            >
              {{ loading ? loadingText : confirmText }}
            </button>
            <slot name="primary-action"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '確認'
  },
  cancelText: {
    type: String,
    default: '取消'
  },
  confirmButtonClass: {
    type: String,
    default: 'c-button--primary'
  },
  loading: {
    type: Boolean,
    default: false
  },
  loadingText: {
    type: String,
    default: '處理中...'
  },
  closeOnOverlay: {
    type: Boolean,
    default: false
  },
  /**
   * 主按鈕獨佔第一列、加大，其餘按鈕縮成描邊排在下面。
   * 給「主要動作明顯比其他選項重要」的畫面用，例如送出確認。
   */
  stackedActions: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const handleOverlayClick = () => {
  if (props.closeOnOverlay && !props.loading) {
    emit('update:modelValue', false)
    emit('cancel')
  }
}

const handleCancel = () => {
  emit('update:modelValue', false)
  emit('cancel')
}

const handleConfirm = () => {
  emit('confirm')
}
</script>

<style lang="scss">
// Common styles injected into the app scope for the teleported modal
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
  
  .c-modal {
    transition: transform 0.2s ease;
  }
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  
  .c-modal {
    transform: scale(0.95);
  }
}
</style>
