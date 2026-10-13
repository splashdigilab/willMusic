<template>
  <Teleport to="body">
    <!-- opened：進場動畫跑完才發。進場時 .c-modal 帶著 transform，
         裡面 position: fixed 的東西會被它框住，要等這之後才鋪得滿整個畫面 -->
    <Transition name="modal-fade" @after-enter="emit('opened')">
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
              v-if="cancelLabel"
              class="c-button c-button--secondary c-modal__cancel"
              @click="handleCancel"
              :disabled="loading"
            >
              {{ cancelLabel }}
            </button>
            <slot name="secondary-action"></slot>

            <!-- Primary/Confirm Button -->
            <button
              v-if="confirmLabel"
              class="c-button c-modal__confirm"
              :class="confirmButtonClass"
              @click="handleConfirm"
              :disabled="loading"
            >
              {{ loading ? loadingLabel : confirmLabel }}
            </button>
            <slot name="primary-action"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

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
  /**
   * 按鈕上的三種字（confirmText、cancelText、loadingText）預設值跟著介面語言走，
   * 而 props 的 default 裡呼叫不了 useI18n，所以 default 留 undefined，由下面的 computed 補上。
   * 沒傳（undefined）→ 用翻譯的預設字；傳了字串就照用，包括空字串 ——
   * 呼叫端靠 cancel-text="" 把取消鈕藏起來。
   */
  confirmText: {
    type: String,
    default: undefined
  },
  cancelText: {
    type: String,
    default: undefined
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
    default: undefined
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

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel', 'opened'])

// 後台這類只有中文的頁面，useI18n 自己會回繁中
const { t } = useI18n()
// 用 ?? 而不是 ||：空字串是「不要這顆按鈕」，不能被換回預設字
const confirmLabel = computed(() => props.confirmText ?? t.value.common.confirm)
const cancelLabel = computed(() => props.cancelText ?? t.value.common.cancel)
const loadingLabel = computed(() => props.loadingText ?? t.value.common.processing)

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
