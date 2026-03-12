<template>
  <div class="p-admin">
    <div class="p-admin__container">
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

        <!-- Token 統計 -->
        <section class="p-admin__card">
          <h2 class="p-admin__card-title">Token 使用統計</h2>
          <div class="p-admin__stats-filter">
            <button
              class="p-admin__filter-btn"
              :class="{ 'p-admin__filter-btn--active': statsFilter === 'all' }"
              @click="setStatsFilter('all')"
            >全部</button>
            <button
              class="p-admin__filter-btn"
              :class="{ 'p-admin__filter-btn--active': statsFilter === 'date' }"
              @click="setStatsFilter('date')"
            >日期</button>
            <input
              v-if="statsFilter === 'date'"
              type="date"
              class="p-admin__date-input"
              v-model="customDate"
              :max="todayStr"
            />
          </div>
          <div v-if="statsLoading" class="p-admin__stats-loading">載入中…</div>
          <div v-else class="p-admin__stats-grid">
            <div class="p-admin__stat-card">
              <div class="p-admin__stat-value">{{ statsIssued }}</div>
              <div class="p-admin__stat-label">發出 Token 數</div>
            </div>
            <div class="p-admin__stat-card p-admin__stat-card--used">
              <div class="p-admin__stat-value">{{ statsUsed }}</div>
              <div class="p-admin__stat-label">已使用 Token 數</div>
            </div>
            <div class="p-admin__stat-card p-admin__stat-card--unused">
              <div class="p-admin__stat-value">{{ statsIssued - statsUsed }}</div>
              <div class="p-admin__stat-label">未使用 Token 數</div>
            </div>
          </div>
        </section>

        <!-- 所有便利貼 -->
        <section class="p-admin__card">
          <h2 class="p-admin__card-title">所有便利貼管理</h2>
          <div class="p-admin__notes-container">
            
            <div class="p-admin__notes-section">
              <h3 class="p-admin__notes-subtitle">待處理 ({{ pendingNotes.length }})</h3>
              <div v-if="pendingNotes.length === 0" class="p-admin__empty-state">目前沒有待處理的便利貼</div>
              <div v-else class="p-admin__note-grid">
                <div v-for="note in pendingNotes" :key="note.id" class="p-admin__note-card">
                  <div class="p-admin__note-visual">
                    <StickyNote :note="note" />
                  </div>
                  <div class="p-admin__note-meta">
                    <span class="p-admin__note-time">{{ formatTime(note.timestamp) }}</span>
                    <button 
                      @click="openDeleteModal(note.id, true)" 
                      class="p-admin__btn-delete"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-admin__notes-section">
              <h3 class="p-admin__notes-subtitle">歷史紀錄 ({{ historyNotes.length }})</h3>
              <div v-if="historyNotes.length === 0" class="p-admin__empty-state">目前沒有歷史紀錄</div>
              <div v-else class="p-admin__note-grid">
                <div v-for="note in historyNotes" :key="note.id" class="p-admin__note-card">
                  <div class="p-admin__note-visual">
                    <StickyNote :note="note" />
                  </div>
                  <div class="p-admin__note-meta">
                    <span class="p-admin__note-time">{{ formatTime(note.playedAt || note.timestamp) }}</span>
                    <button 
                      @click="openDeleteModal(note.id, false)" 
                      class="p-admin__btn-delete"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>

    <AppModal
      v-model="deleteModalOpen"
      title="確認刪除"
      message="確定要刪除這張便利貼嗎？刪除後無法復原。"
      confirmText="確定刪除"
      cancelText="取消"
      confirmButtonClass="c-button--danger"
      :loading="isDeleting"
      @confirm="confirmDelete"
      @cancel="deleteModalOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  where,
  Timestamp
} from 'firebase/firestore'
import QRCode from 'qrcode'
import AppModal from '~/components/AppModal.vue'

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
  
  // 廣播清除 Token
  try {
    setDoc(doc(db, 'system', 'active_token'), { token: null, expiresAt: null })
  } catch (e) { console.error('Error clearing active_token:', e) }
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

    // 廣播給 /qrcode 頁面
    try {
      await setDoc(doc(db, 'system', 'active_token'), {
        token: tokenId,
        expiresAt: Date.now() + 60000
      })
    } catch (e) { console.error('Error broadcasting active_token:', e) }

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

// ── Token 統計 ────────────────────────────────────────────
const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
const statsFilter = ref<'date' | 'all'>('date')
const customDate = ref(todayStr)
const statsLoading = ref(false)
const statsIssued = ref(0)
const statsUsed = ref(0)
let statsUnsubscribe: (() => void) | null = null

const setStatsFilter = (filter: 'date' | 'all') => {
  statsFilter.value = filter
  loadStats()
}

const loadStats = () => {
  if (statsUnsubscribe) {
    statsUnsubscribe()
    statsUnsubscribe = null
  }
  statsLoading.value = true

  let q: any
  if (statsFilter.value === 'all') {
    q = query(collection(db, 'tokens'), orderBy('createdAt', 'asc'))
  } else {
    const parts = customDate.value.split('-')
    const start = new Date(parseInt(parts[0] || '0'), parseInt(parts[1] || '1') - 1, parseInt(parts[2] || '1'), 0, 0, 0, 0)
    const end   = new Date(parseInt(parts[0] || '0'), parseInt(parts[1] || '1') - 1, parseInt(parts[2] || '1'), 23, 59, 59, 999)
    q = query(
      collection(db, 'tokens'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
      orderBy('createdAt', 'asc')
    )
  }

  statsUnsubscribe = onSnapshot(q, (snapshot: any) => {
    statsIssued.value = snapshot.size
    statsUsed.value = snapshot.docs.filter((d: any) => d.data().status === 'used').length
    statsLoading.value = false
  }, () => {
    statsLoading.value = false
  })
}

// Re-fetch when date changes
watch(customDate, () => {
  if (statsFilter.value === 'date') loadStats()
})

// 便利貼清單
const pendingNotes = ref<any[]>([])
const historyNotes = ref<any[]>([])
let notesUnsubscribes: Array<() => void> = []

const startNotesListeners = () => {
  const pendingQ = query(collection(db, 'queue_pending'), orderBy('timestamp', 'asc'))
  notesUnsubscribes.push(
    onSnapshot(pendingQ, (snapshot) => {
      pendingNotes.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    })
  )

  const historyQ = query(collection(db, 'queue_history'), orderBy('playedAt', 'desc'))
  notesUnsubscribes.push(
    onSnapshot(historyQ, (snapshot) => {
      historyNotes.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    })
  )
}

// Delete Modal State
const deleteModalOpen = ref(false)
const deleteModalData = ref<{ id: string, isPending: boolean } | null>(null)
const isDeleting = ref(false)

const openDeleteModal = (id: string, isPending: boolean) => {
  deleteModalData.value = { id, isPending }
  deleteModalOpen.value = true
}

const confirmDelete = async () => {
  if (!deleteModalData.value) return
  isDeleting.value = true
  try {
    const colName = deleteModalData.value.isPending ? 'queue_pending' : 'queue_history'
    await deleteDoc(doc(db, colName, deleteModalData.value.id))
    deleteModalOpen.value = false
  } catch (error) {
    console.error('Error deleting note:', error)
    alert('刪除失敗')
  } finally {
    isDeleting.value = false
  }
}

const formatTime = (ts: any) => {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

onMounted(() => {
  startNotesListeners()
  loadStats()
})

onUnmounted(() => {
  notesUnsubscribes.forEach(unsub => unsub())
  if (statsUnsubscribe) statsUnsubscribe()
  clearQrCode()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_admin.scss */
</style>
