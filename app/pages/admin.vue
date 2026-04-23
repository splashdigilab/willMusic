<template>
  <div class="p-admin">
    <Transition name="admin-toast">
      <div
        v-if="adminToast.visible"
        class="p-admin__toast"
        :class="adminToast.type === 'success' ? 'p-admin__toast--success' : 'p-admin__toast--error'"
        :role="adminToast.type === 'error' ? 'alert' : 'status'"
      >
        {{ adminToast.message }}
      </div>
    </Transition>
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

        <!-- Canvas 插播影片 -->
        <section class="p-admin__card">
          <h2 class="p-admin__card-title">Canvas 插播影片</h2>
          <p class="p-admin__video-hint">
            上傳後會寫入 Firestore；大螢幕 Canvas 在<strong>下方開關開啟</strong>時，才會依<strong>插播間隔</strong>對齊時鐘排程（每段間隔起始分鐘的第 0 秒排程），並在<strong>當前便利貼展示完、轉場結束後</strong>左右同步播放，播完才繼續輪播便利貼。
          </p>
          <div class="p-admin__schedule-switch">
            <label class="p-admin__switch-label">
              <input
                v-model="interstitialScheduleEnabled"
                type="checkbox"
                class="p-admin__switch-input"
                :disabled="isSavingSchedule"
                @change="onInterstitialScheduleToggle"
              />
              <span class="p-admin__switch-ui" aria-hidden="true" />
              <span class="p-admin__switch-text">依時間觸發插播</span>
            </label>
            <p class="p-admin__video-hint p-admin__video-hint--compact p-admin__video-hint--switch">
              關閉時不會再排程；已排入佇列的插播會一併清除。未寫入過此欄位時預設為關閉。
            </p>
          </div>
          <div class="p-admin__interstitial-interval">
            <label class="p-admin__form-label" for="interstitial-interval-input">插播間隔（分鐘）</label>
            <p class="p-admin__video-hint p-admin__video-hint--compact">
              僅限<strong>60 的因數</strong>（1、2、3、4、5、6、10、12、15、20、30、60 分鐘），這樣每小時都會在<strong>同一組分鐘刻度</strong>觸發（例如 5 分鐘 → 每小時的 :00、:05、:10…）。舊資料若為其他數字，儲存時會自動改為最接近的合法值。
            </p>
            <div class="p-admin__interval-row">
              <select
                id="interstitial-interval-input"
                v-model.number="interstitialIntervalInput"
                class="p-admin__interval-select"
                :disabled="isSavingInterval"
              >
                <option
                  v-for="m in CANVAS_INTERSTITIAL_DIVISORS_OF_60"
                  :key="m"
                  :value="m"
                >
                  每 {{ m }} 分鐘
                </option>
              </select>
              <button
                type="button"
                class="p-admin__btn p-admin__btn--primary p-admin__btn--inline"
                :disabled="isSavingInterval"
                @click="saveInterstitialInterval"
              >
                {{ isSavingInterval ? '儲存中…' : '儲存間隔' }}
              </button>
            </div>
            <details class="p-admin__interval-tips">
              <summary>設定建議</summary>
              <ul>
                <li>間隔必須是 <strong>60 的因數</strong>，每小時才會固定在同一批分鐘（例如 12 分鐘 → :00、:12、:24…）。</li>
                <li><strong>1～2 分鐘</strong>：測試用；店內可能過於頻繁。</li>
                <li><strong>5～15 分鐘</strong>：常見店內節奏。</li>
                <li><strong>30／60 分鐘</strong>：半小時／每小時段落感。</li>
                <li>實際播放仍會<strong>等當前便利貼一輪播完</strong>，可能略晚於排程時刻。</li>
              </ul>
            </details>
          </div>
          <div class="p-admin__video-upload">
            <input
              ref="videoFileInput"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              class="p-admin__video-input"
              :disabled="isUploadingVideo"
              @change="onVideoFileSelected"
            />
            <button
              type="button"
              class="p-admin__btn p-admin__btn--secondary"
              :disabled="isUploadingVideo"
              @click="videoFileInput?.click()"
            >
              {{ isUploadingVideo ? '上傳中…' : '選擇影片檔' }}
            </button>
            <button
              v-if="canvasVideoUrl"
              type="button"
              class="p-admin__btn p-admin__btn--danger p-admin__btn--inline"
              :disabled="isUploadingVideo || isClearingVideo"
              @click="clearCanvasVideo"
            >
              {{ isClearingVideo ? '清除中…' : '移除影片' }}
            </button>
          </div>
          <div v-if="canvasVideoUrl" class="p-admin__video-preview">
            <p class="p-admin__video-preview-label">目前設定（預覽）</p>
            <video
              class="p-admin__video-preview-player"
              :src="canvasVideoUrl"
              controls
              playsinline
            />
            <p v-if="canvasVideoUpdatedLabel" class="p-admin__video-meta">{{ canvasVideoUpdatedLabel }}</p>
          </div>
          <div v-else class="p-admin__empty-state p-admin__empty-state--compact">尚未設定插播影片</div>
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
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import QRCode from 'qrcode'
import AppModal from '~/components/AppModal.vue'
import {
  clampInterstitialIntervalMinutes,
  CANVAS_INTERSTITIAL_DIVISORS_OF_60,
  parseInterstitialScheduleEnabled
} from '~/composables/useConductor'

definePageMeta({
  layout: false
})

const { $firestore, $storage } = useNuxtApp()
const { createToken } = useFirestore()

const db = $firestore as any
const storage = $storage as any

// 頁面內操作結果提示（取代 alert）
const adminToast = reactive({
  visible: false,
  type: 'success' as 'success' | 'error',
  message: ''
})
let adminToastTimer: ReturnType<typeof setTimeout> | null = null

const showAdminToast = (type: 'success' | 'error', message: string) => {
  if (adminToastTimer) {
    clearTimeout(adminToastTimer)
    adminToastTimer = null
  }
  adminToast.type = type
  adminToast.message = message
  adminToast.visible = true
  adminToastTimer = setTimeout(() => {
    adminToast.visible = false
    adminToastTimer = null
  }, 4200)
}

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
  void setDoc(doc(db, 'system', 'active_token'), { token: null, expiresAt: null }).catch((e) => {
    console.error('Error clearing active_token:', e)
    showAdminToast('error', '清除 QR 廣播失敗，請稍後再試')
  })
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
    let broadcastFailed = false
    try {
      await setDoc(doc(db, 'system', 'active_token'), {
        token: tokenId,
        expiresAt: Date.now() + 60000
      })
    } catch (e) {
      console.error('Error broadcasting active_token:', e)
      broadcastFailed = true
      showAdminToast('error', 'Token 已建立，但寫入 QR 廣播失敗，請檢查網路或 Firestore 權限')
    }

    qrTimeLeft.value = 60
    qrTimer = setInterval(() => {
      qrTimeLeft.value--
      if (qrTimeLeft.value <= 0) {
        clearQrCode()
      }
    }, 1000)
    if (!broadcastFailed) {
      showAdminToast('success', 'Token 已生成')
    }
  } catch (error) {
    console.error('Error generating token:', error)
    showAdminToast('error', '生成 Token 失敗，請稍後再試')
  } finally {
    isGenerating.value = false
  }
}

const copyToken = async (token: string) => {
  const url = `${window.location.origin}/editor?token=${token}`
  try {
    await navigator.clipboard.writeText(url)
    showAdminToast('success', '編輯連結已複製到剪貼簿')
  } catch {
    showAdminToast('error', '複製失敗，請手動選取連結複製')
  }
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
    showAdminToast('success', '已刪除便利貼')
  } catch (error) {
    console.error('Error deleting note:', error)
    showAdminToast('error', '刪除失敗，請稍後再試')
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

// ── Canvas 插播影片 ───────────────────────────────────────
const videoFileInput = ref<HTMLInputElement | null>(null)
const canvasVideoUrl = ref<string | null>(null)
const canvasVideoUpdatedLabel = ref('')
const isUploadingVideo = ref(false)
const isClearingVideo = ref(false)
const interstitialIntervalInput = ref(clampInterstitialIntervalMinutes(undefined))
const isSavingInterval = ref(false)
const interstitialScheduleEnabled = ref(false)
const isSavingSchedule = ref(false)
let unsubCanvasVideo: (() => void) | null = null

const startCanvasVideoListener = () => {
  unsubCanvasVideo = onSnapshot(doc(db, 'system', 'canvas_video'), (snap) => {
    if (!snap.exists()) {
      canvasVideoUrl.value = null
      canvasVideoUpdatedLabel.value = ''
      interstitialIntervalInput.value = clampInterstitialIntervalMinutes(undefined)
      interstitialScheduleEnabled.value = false
      return
    }
    const data = snap.data() as {
      videoUrl?: string
      updatedAt?: any
      interstitialIntervalMinutes?: number
      interstitialScheduleEnabled?: boolean
    }
    canvasVideoUrl.value = typeof data.videoUrl === 'string' && data.videoUrl ? data.videoUrl : null
    interstitialIntervalInput.value = clampInterstitialIntervalMinutes(data.interstitialIntervalMinutes)
    interstitialScheduleEnabled.value = parseInterstitialScheduleEnabled(data.interstitialScheduleEnabled)
    const ua = data.updatedAt
    if (ua && typeof ua.toDate === 'function') {
      canvasVideoUpdatedLabel.value = `上次更新：${formatTime(ua)}`
    } else {
      canvasVideoUpdatedLabel.value = ''
    }
  })
}

const onInterstitialScheduleToggle = async () => {
  isSavingSchedule.value = true
  try {
    await setDoc(
      doc(db, 'system', 'canvas_video'),
      {
        interstitialScheduleEnabled: interstitialScheduleEnabled.value,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    )
    showAdminToast(
      'success',
      interstitialScheduleEnabled.value ? '已開啟：依時間觸發插播' : '已關閉：不再依時間觸發插播'
    )
  } catch (err) {
    console.error('[admin] 儲存插播開關失敗', err)
    showAdminToast('error', '儲存開關失敗，請稍後再試')
    interstitialScheduleEnabled.value = !interstitialScheduleEnabled.value
  } finally {
    isSavingSchedule.value = false
  }
}

const saveInterstitialInterval = async () => {
  const minutes = clampInterstitialIntervalMinutes(interstitialIntervalInput.value)
  interstitialIntervalInput.value = minutes
  isSavingInterval.value = true
  try {
    await setDoc(
      doc(db, 'system', 'canvas_video'),
      { interstitialIntervalMinutes: minutes, updatedAt: Timestamp.now() },
      { merge: true }
    )
    showAdminToast('success', `已儲存插播間隔：每 ${minutes} 分鐘`)
  } catch (err) {
    console.error('[admin] 儲存插播間隔失敗', err)
    showAdminToast('error', '儲存間隔失敗，請稍後再試')
  } finally {
    isSavingInterval.value = false
  }
}

const onVideoFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('video/')) {
    showAdminToast('error', '請選擇影片檔（MP4 / WebM / MOV 等）')
    input.value = ''
    return
  }
  isUploadingVideo.value = true
  try {
    const safeName = file.name.replace(/[^\w.-]+/g, '_')
    const path = `canvas_interstitial/${Date.now()}_${safeName}`
    const fileRef = storageRef(storage, path)
    await uploadBytes(fileRef, file)
    const url = await getDownloadURL(fileRef)
    await setDoc(
      doc(db, 'system', 'canvas_video'),
      { videoUrl: url, updatedAt: Timestamp.now() },
      { merge: true }
    )
    showAdminToast('success', '影片已上傳並套用至 Canvas')
  } catch (err) {
    console.error('[admin] 影片上傳失敗', err)
    showAdminToast('error', '上傳失敗，請確認 Storage 已啟用且規則允許寫入')
  } finally {
    isUploadingVideo.value = false
    input.value = ''
  }
}

const clearCanvasVideo = async () => {
  if (!confirm('確定要移除 Canvas 插播影片？')) return
  isClearingVideo.value = true
  try {
    await setDoc(
      doc(db, 'system', 'canvas_video'),
      { videoUrl: null, updatedAt: Timestamp.now() },
      { merge: true }
    )
    showAdminToast('success', '已移除插播影片')
  } catch (err) {
    console.error('[admin] 清除影片失敗', err)
    showAdminToast('error', '移除影片失敗，請稍後再試')
  } finally {
    isClearingVideo.value = false
  }
}

onMounted(() => {
  startNotesListeners()
  loadStats()
  startCanvasVideoListener()
})

onUnmounted(() => {
  if (adminToastTimer) {
    clearTimeout(adminToastTimer)
    adminToastTimer = null
  }
  notesUnsubscribes.forEach(unsub => unsub())
  if (statsUnsubscribe) statsUnsubscribe()
  unsubCanvasVideo?.()
  unsubCanvasVideo = null
  clearQrCode()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_admin.scss */
</style>
