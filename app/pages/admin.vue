<template>
  <div class="admin-page">
    <div class="container">
      <header class="admin-header">
        <h1>WillMusic Sky Memo - 管理後台</h1>
        <p class="subtitle">Token 管理系統</p>
      </header>

      <div class="admin-content">
        <!-- Token 生成器 -->
        <section class="card">
          <h2 class="card-title">生成新 Token</h2>
          <div class="token-generator">
            <div class="form-group">
              <label class="form-label">生成數量</label>
              <input
                v-model.number="generateCount"
                type="number"
                min="1"
                max="100"
                class="form-input"
              />
            </div>
            <button
              @click="generateTokens"
              class="btn btn--primary"
              :disabled="isGenerating"
            >
              {{ isGenerating ? '生成中...' : '生成 Tokens' }}
            </button>

            <div v-if="generatedTokens.length > 0" class="generated-tokens">
              <h3>已生成 Token（{{ generatedTokens.length }} 個）</h3>
              <div class="token-list">
                <div
                  v-for="token in generatedTokens"
                  :key="token"
                  class="token-item"
                >
                  <code>{{ token }}</code>
                  <button
                    @click="copyToken(token)"
                    class="btn-copy"
                    title="複製"
                  >
                    📋
                  </button>
                </div>
              </div>
              <button @click="downloadTokens" class="btn btn--secondary">
                下載為 CSV
              </button>
            </div>
          </div>
        </section>

        <!-- 統計資訊 -->
        <section class="card">
          <h2 class="card-title">系統統計</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{{ stats.pendingCount }}</div>
              <div class="stat-label">待處理佇列</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ stats.historyCount }}</div>
              <div class="stat-label">歷史紀錄總數</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ stats.unusedTokens }}</div>
              <div class="stat-label">未使用 Token</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ stats.usedTokens }}</div>
              <div class="stat-label">已使用 Token</div>
            </div>
          </div>
          <button
            @click="loadStats"
            class="btn btn--secondary"
            :disabled="loadingStats"
          >
            {{ loadingStats ? '載入中...' : '重新整理' }}
          </button>
        </section>

        <!-- 清理工具 -->
        <section class="card">
          <h2 class="card-title">清理工具</h2>
          <div class="cleanup-tools">
            <p class="warning-text">
              ⚠️ 危險操作：請謹慎使用以下功能
            </p>
            <button
              @click="clearPendingQueue"
              class="btn btn--danger"
              :disabled="isClearing"
            >
              清空待處理佇列
            </button>
            <button
              @click="clearHistory"
              class="btn btn--danger"
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
  deleteDoc,
  doc,
  query,
  where,
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
    // 待處理佇列
    const pendingSnapshot = await getDocs(collection(db, 'queue_pending'))
    stats.value.pendingCount = pendingSnapshot.size

    // 歷史紀錄
    const historySnapshot = await getDocs(collection(db, 'queue_history'))
    stats.value.historyCount = historySnapshot.size

    // Tokens
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

// 初始化時載入統計
onMounted(() => {
  loadStats()
})
</script>

<style scoped lang="scss">
.admin-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 2rem 1rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}

.admin-header {
  text-align: center;
  margin-bottom: 3rem;

  h1 {
    font-size: 2.5rem;
    color: #333;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    font-size: 1.25rem;
    color: #666;
  }
}

.admin-content {
  display: grid;
  gap: 2rem;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  &-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 1.5rem;
    color: #333;
  }
}

.token-generator {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-weight: 600;
  color: #333;
}

.form-input {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  max-width: 200px;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
}

.btn {
  padding: 1rem 2rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
    }
  }

  &--secondary {
    background: #e0e0e0;
    color: #333;

    &:hover:not(:disabled) {
      background: #d0d0d0;
    }
  }

  &--danger {
    background: #f43f5e;
    color: white;

    &:hover:not(:disabled) {
      background: #dc2626;
    }
  }
}

.generated-tokens {
  margin-top: 2rem;
  padding: 1.5rem;
  background: #f9f9f9;
  border-radius: 8px;

  h3 {
    margin-bottom: 1rem;
    color: #333;
  }
}

.token-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  max-height: 300px;
  overflow-y: auto;
}

.token-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;

  code {
    flex: 1;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 0.875rem;
    color: #667eea;
  }
}

.btn-copy {
  padding: 0.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.2);
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  text-align: center;
  padding: 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 0.875rem;
  opacity: 0.9;
}

.cleanup-tools {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.warning-text {
  padding: 1rem;
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
  color: #856404;
  font-weight: 600;
}

@media (max-width: 768px) {
  .admin-header h1 {
    font-size: 1.75rem;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
