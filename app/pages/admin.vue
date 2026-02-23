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

        <!-- 所有便利貼 -->
        <section class="p-admin__card">
          <h2 class="p-admin__card-title">所有便利貼管理</h2>
          <div class="p-admin__notes-container">
            
            <div class="p-admin__notes-section">
              <h3 class="p-admin__notes-subtitle">待處理 ({{ pendingNotes.length }})</h3>
              <div v-if="pendingNotes.length === 0" class="p-admin__empty-state">目前沒有待處理的便利貼</div>
              <ul v-else class="p-admin__note-list">
                <li v-for="note in pendingNotes" :key="note.id" class="p-admin__note-item">
                  <div class="p-admin__note-info">
                    <span class="p-admin__note-text">{{ note.content }}</span>
                    <span class="p-admin__note-time">{{ formatTime(note.timestamp) }}</span>
                  </div>
                  <button @click="deleteNote(note.id, true)" class="p-admin__btn-delete">刪除</button>
                </li>
              </ul>
            </div>

            <div class="p-admin__notes-section">
              <h3 class="p-admin__notes-subtitle">歷史紀錄 ({{ historyNotes.length }})</h3>
              <div v-if="historyNotes.length === 0" class="p-admin__empty-state">目前沒有歷史紀錄</div>
              <ul v-else class="p-admin__note-list">
                <li v-for="note in historyNotes" :key="note.id" class="p-admin__note-item">
                  <div class="p-admin__note-info">
                    <span class="p-admin__note-text">{{ note.content }}</span>
                    <span class="p-admin__note-time">{{ formatTime(note.playedAt || note.timestamp) }}</span>
                  </div>
                  <button @click="deleteNote(note.id, false)" class="p-admin__btn-delete">刪除</button>
                </li>
              </ul>
            </div>

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
  deleteDoc,
  query,
  orderBy,
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

const deleteNote = async (id: string, isPending: boolean) => {
  if (!confirm('確定要刪除這張便利貼嗎？')) return
  try {
    const colName = isPending ? 'queue_pending' : 'queue_history'
    await deleteDoc(doc(db, colName, id))
  } catch (error) {
    console.error('Error deleting note:', error)
    alert('刪除失敗')
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
})

onUnmounted(() => {
  notesUnsubscribes.forEach(unsub => unsub())
  clearQrCode()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_admin.scss */
</style>
