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
            <div class="p-admin__form-group">
              <label class="p-admin__form-label">生成數量</label>
              <input
                v-model.number="generateCount"
                type="number"
                min="1"
                max="100"
                class="p-admin__form-input"
              />
            </div>
            <button
              @click="generateTokens"
              class="p-admin__btn p-admin__btn--primary"
              :disabled="isGenerating"
            >
              {{ isGenerating ? '生成中...' : '生成 Tokens' }}
            </button>

            <div v-if="generatedTokens.length > 0" class="p-admin__generated-tokens">
              <h3 class="p-admin__generated-title">已生成 Token（{{ generatedTokens.length }} 個）</h3>
              <div class="p-admin__token-list">
                <div
                  v-for="token in generatedTokens"
                  :key="token"
                  class="p-admin__token-item"
                >
                  <code class="p-admin__token-text">{{ token }}</code>
                  <button
                    @click="copyToken(token)"
                    class="p-admin__btn-copy"
                    title="複製"
                  >
                    📋
                  </button>
                </div>
              </div>
              <button @click="downloadTokens" class="p-admin__btn p-admin__btn--secondary">
                下載為 CSV
              </button>
            </div>
          </div>
        </section>

        <!-- 統計資訊 -->
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
          <button
            @click="loadStats"
            class="p-admin__btn p-admin__btn--secondary"
            :disabled="loadingStats"
          >
            {{ loadingStats ? '載入中...' : '重新整理' }}
          </button>
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
  writeBatch
} from 'firebase/firestore'

definePageMeta({
  layout: false
})

const { $firestore } = useNuxtApp()
const { createToken } = useFirestore()

const db = $firestore as any

// Token 生成
const generateCount = ref(5)
const isGenerating = ref(false)
const generatedTokens = ref<string[]>([])

const generateTokens = async () => {
  isGenerating.value = true
  generatedTokens.value = []

  try {
    for (let i = 0; i < generateCount.value; i++) {
      const tokenId = await createToken()
      generatedTokens.value.push(tokenId)
    }
    alert(`成功生成 ${generateCount.value} 個 Token！`)
  } catch (error) {
    console.error('Error generating tokens:', error)
    alert('生成 Token 失敗')
  } finally {
    isGenerating.value = false
  }
}

const copyToken = (token: string) => {
  navigator.clipboard.writeText(token)
  alert('Token 已複製到剪貼簿')
}

const downloadTokens = () => {
  const csv = 'Token\n' + generatedTokens.value.join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tokens-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// 統計資訊
const stats = ref({
  pendingCount: 0,
  historyCount: 0,
  unusedTokens: 0,
  usedTokens: 0
})

const loadingStats = ref(false)

const loadStats = async () => {
  loadingStats.value = true

  try {
    const pendingSnapshot = await getDocs(collection(db, 'queue_pending'))
    stats.value.pendingCount = pendingSnapshot.size

    const historySnapshot = await getDocs(collection(db, 'queue_history'))
    stats.value.historyCount = historySnapshot.size

    const tokensSnapshot = await getDocs(collection(db, 'tokens'))
    stats.value.unusedTokens = tokensSnapshot.docs.filter(
      d => d.data().status === 'unused'
    ).length
    stats.value.usedTokens = tokensSnapshot.docs.filter(
      d => d.data().status === 'used'
    ).length
  } catch (error) {
    console.error('Error loading stats:', error)
  } finally {
    loadingStats.value = false
  }
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
    loadStats()
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
    loadStats()
  } catch (error) {
    console.error('Error clearing history:', error)
    alert('清空失敗')
  } finally {
    isClearing.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_admin.scss */
</style>
