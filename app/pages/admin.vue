<template>
  <div class="p-admin">
    <div class="p-admin__container">
      <header class="p-admin__header">
        <h1 class="p-admin__title">WillMusic Sky Memo - 管理後台</h1>
        <p class="p-admin__subtitle">Token 管理系統</p>
      </header>

      <div class="p-admin__content">
        <!-- Token 生成器 -->
        <section class="p-admin__card">
          <h2 class="p-admin__card-title">生成新 Token</h2>
          <div class="p-admin__token-generator">
            <button
              @click="generateToken"
              class="p-admin__btn p-admin__btn--primary"
              :disabled="isGenerating"
            >
              {{ isGenerating ? '生成中...' : '生成 Token' }}
            </button>

            <div v-if="currentToken" class="p-admin__generated-tokens">
              <div class="p-admin__qr-section">
                <p class="p-admin__qr-label">
                  掃描或點擊前往編輯頁
                  <span v-if="qrTimeLeft >= 0" class="p-admin__qr-timer">（{{ qrTimeLeft }}秒後消失）</span>
                </p>
                <NuxtLink 
                  :to="`/editor?token=${currentToken}`" 
                  target="_blank"
                  class="p-admin__qr-link"
                >
                  <canvas ref="qrCanvas" class="p-admin__qr-canvas"></canvas>
                </NuxtLink>
              </div>
              <div class="p-admin__token-item">
                <code class="p-admin__token-text">{{ currentToken }}</code>
                <button
                  @click="copyToken(currentToken)"
                  class="p-admin__btn-copy"
                  title="複製連結"
                >
                  📋
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 統計資訊（即時更新） -->
        <section class="p-admin__card">
          <h2 class="p-admin__card-title">系統統計</h2>
          <div class="p-admin__stats-grid">
            <div class="p-admin__stat-item">
              <div class="p-admin__stat-value">{{ stats.pendingCount }}</div>
              <div class="p-admin__stat-label">待處理佇列</div>
            </div>
            <div class="p-admin__stat-item">
              <div class="p-admin__stat-value">{{ stats.historyCount }}</div>
              <div class="p-admin__stat-label">歷史紀錄總數</div>
            </div>
            <div class="p-admin__stat-item">
              <div class="p-admin__stat-value">{{ stats.unusedTokens }}</div>
              <div class="p-admin__stat-label">未使用 Token</div>
            </div>
            <div class="p-admin__stat-item">
              <div class="p-admin__stat-value">{{ stats.usedTokens }}</div>
              <div class="p-admin__stat-label">已使用 Token</div>
            </div>
          </div>
        </section>

        <!-- 清理工具 -->
        <section class="p-admin__card">
          <h2 class="p-admin__card-title">清理工具</h2>
          <div class="p-admin__cleanup-tools">
            <p class="p-admin__warning-text">
              ⚠️ 危險操作：請謹慎使用以下功能
            </p>
            <button
              @click="clearPendingQueue"
              class="p-admin__btn p-admin__btn--danger"
              :disabled="isClearing"
            >
              清空待處理佇列
            </button>
            <button
              @click="clearHistory"
              class="p-admin__btn p-admin__btn--danger"
              :disabled="isClearing"
            >
              清空歷史紀錄
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  onSnapshot
} from 'firebase/firestore'
import QRCode from 'qrcode'

definePageMeta({
  layout: false
})

const { $firestore } = useNuxtApp()
const { createToken } = useFirestore()

const db = $firestore as any

// Token 生成（一次一個）
const isGenerating = ref(false)
const currentToken = ref<string | null>(null)
const qrCanvas = ref<HTMLCanvasElement | null>(null)
const qrTimeLeft = ref(60)
let qrTimer: ReturnType<typeof setInterval> | null = null

const clearQrCode = () => {
  if (qrTimer) {
    clearInterval(qrTimer)
    qrTimer = null
  }
  currentToken.value = null
  qrTimeLeft.value = 60
}

const generateToken = async () => {
  clearQrCode()
  isGenerating.value = true

  try {
    const tokenId = await createToken()
    currentToken.value = tokenId

    await nextTick()
    if (qrCanvas.value) {
      const url = `${window.location.origin}/editor?token=${tokenId}`
      await QRCode.toCanvas(qrCanvas.value, url, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      })
    }

    qrTimeLeft.value = 60
    qrTimer = setInterval(() => {
      qrTimeLeft.value--
      if (qrTimeLeft.value <= 0) {
        clearQrCode()
      }
    }, 1000)
  } catch (error) {
    console.error('Error generating token:', error)
    alert('生成 Token 失敗')
  } finally {
    isGenerating.value = false
  }
}

const copyToken = (token: string) => {
  const url = `${window.location.origin}/editor?token=${token}`
  navigator.clipboard.writeText(url)
  alert('編輯連結已複製到剪貼簿')
}

// 統計資訊（即時監聽）
const stats = ref({
  pendingCount: 0,
  historyCount: 0,
  unusedTokens: 0,
  usedTokens: 0
})

let statsUnsubscribes: Array<() => void> = []

// 保留以相容可能的殘留引用（統計已改為即時監聽）
const loadStats = () => {
  // 即時監聽中，無需手動載入
}

const startStatsListeners = () => {
  statsUnsubscribes.push(
    onSnapshot(collection(db, 'queue_pending'), (snapshot) => {
      stats.value.pendingCount = snapshot.size
    })
  )
  statsUnsubscribes.push(
    onSnapshot(collection(db, 'queue_history'), (snapshot) => {
      stats.value.historyCount = snapshot.size
    })
  )
  statsUnsubscribes.push(
    onSnapshot(collection(db, 'tokens'), (snapshot) => {
      stats.value.unusedTokens = snapshot.docs.filter(
        d => d.data().status === 'unused'
      ).length
      stats.value.usedTokens = snapshot.docs.filter(
        d => d.data().status === 'used'
      ).length
    })
  )
}

// 清理工具
const isClearing = ref(false)

const clearPendingQueue = async () => {
  if (!confirm('確定要清空待處理佇列嗎？此操作無法復原！')) return

  isClearing.value = true
  try {
    const snapshot = await getDocs(collection(db, 'queue_pending'))
    const batch = writeBatch(db)

    snapshot.docs.forEach(document => {
      batch.delete(doc(db, 'queue_pending', document.id))
    })

    await batch.commit()
    alert('待處理佇列已清空')
  } catch (error) {
    console.error('Error clearing queue:', error)
    alert('清空失敗')
  } finally {
    isClearing.value = false
  }
}

const clearHistory = async () => {
  if (!confirm('確定要清空歷史紀錄嗎？此操作無法復原！')) return

  isClearing.value = true
  try {
    const snapshot = await getDocs(collection(db, 'queue_history'))
    const batch = writeBatch(db)

    snapshot.docs.forEach(document => {
      batch.delete(doc(db, 'queue_history', document.id))
    })

    await batch.commit()
    alert('歷史紀錄已清空')
  } catch (error) {
    console.error('Error clearing history:', error)
    alert('清空失敗')
  } finally {
    isClearing.value = false
  }
}

onMounted(() => {
  startStatsListeners()
})

onUnmounted(() => {
  statsUnsubscribes.forEach(unsub => unsub())
  clearQrCode()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_admin.scss */
</style>
