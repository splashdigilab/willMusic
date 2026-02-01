<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="browser-warning-overlay" @click="onClose">
        <div class="browser-warning-modal" @click.stop>
          <div class="browser-warning-icon">⚠️</div>
          
          <h2 class="browser-warning-title">
            請使用外部瀏覽器開啟
          </h2>
          
          <p class="browser-warning-message">
            偵測到您正在使用 <strong>{{ browserName }}</strong> 應用程式內建瀏覽器
          </p>
          
          <div class="browser-warning-instructions">
            <p class="instructions-title">請依照以下步驟操作：</p>
            <p class="instructions-text">{{ instructions }}</p>
          </div>
          
          <div class="browser-warning-reason">
            <p><strong>為什麼需要這樣做？</strong></p>
            <p>內建瀏覽器可能會導致資料儲存失效，造成您編輯的內容遺失。</p>
          </div>
          
          <button class="browser-warning-button" @click="onClose">
            我知道了（繼續使用）
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
interface Props {
  show: boolean
  browserName: string
  instructions: string
}

interface Emits {
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const onClose = () => {
  emit('close')
}
</script>

<style scoped lang="scss">
.browser-warning-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.browser-warning-modal {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 500px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.browser-warning-icon {
  font-size: 4rem;
  text-align: center;
  margin-bottom: 1rem;
}

.browser-warning-title {
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  color: #333;
  margin-bottom: 1rem;
}

.browser-warning-message {
  text-align: center;
  color: #666;
  margin-bottom: 1.5rem;
  font-size: 1rem;
  line-height: 1.6;

  strong {
    color: #f43f5e;
    font-weight: 600;
  }
}

.browser-warning-instructions {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border-left: 4px solid #667eea;
}

.instructions-title {
  font-weight: 600;
  color: #333;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.instructions-text {
  color: #666;
  line-height: 1.6;
  font-size: 0.875rem;
}

.browser-warning-reason {
  background: #fff3cd;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;

  p {
    margin: 0;
    color: #856404;
    line-height: 1.5;

    &:first-child {
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
  }
}

.browser-warning-button {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease;

  &:active {
    transform: scale(0.98);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
