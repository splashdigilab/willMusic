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
        <section class="p-admin__hero">
          <h1 class="p-admin__hero-title">後台管理</h1>
          <p class="p-admin__hero-subtitle">依照工作內容切換頁籤，快速完成日常設定與管理。</p>
        </section>

        <div class="p-admin__tabs" role="tablist" aria-label="後台功能分頁">
          <button
            v-for="tab in adminTabs"
            :key="tab.key"
            type="button"
            class="p-admin__tab"
            :class="{ 'p-admin__tab--active': activeAdminTab === tab.key }"
            role="tab"
            :aria-selected="activeAdminTab === tab.key"
            @click="setActiveAdminTab(tab.key)"
          >
            <span>{{ tab.label }}</span>
            <span v-if="tab.key === 'notes'" class="p-admin__tab-badge">{{ pendingNotesTotal + historyNotesTotal }}</span>
          </button>
        </div>

        <!-- Token 生成器（與 GPS 同列「上傳控管」分頁） -->
        <section v-show="activeAdminTab === 'uploadGate'" class="p-admin__card">
          <h2 class="p-admin__card-title">生成新 Token</h2>
          <label class="p-admin__switch-label p-admin__switch-label--block">
            <input
              v-model="tokenRequiredForSubmit"
              type="checkbox"
              class="p-admin__switch-input"
              :disabled="isSavingTokenRequirement"
              @change="onTokenRequirementToggle"
            />
            <span class="p-admin__switch-ui" aria-hidden="true" />
            <span class="p-admin__switch-text">上傳便利貼需要 Token</span>
          </label>
          <p class="p-admin__video-hint p-admin__video-hint--compact">
            關閉時，使用者可直接送出便利貼；開啟時，使用者必須帶 Token 才能上傳。
          </p>
          <div v-if="tokenRequiredForSubmit" class="p-admin__token-generator">
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
          <div v-else class="p-admin__empty-state p-admin__empty-state--compact">
            目前為免 Token 模式，使用者可直接上傳便利貼。
          </div>
        </section>

        <!-- 上傳營運統計 -->
        <section v-show="activeAdminTab === 'overview'" class="p-admin__card">
          <h2 class="p-admin__card-title">上傳營運統計</h2>
          <div class="p-admin__stats-filter">
            <button
              v-for="preset in statsPresets"
              :key="preset.key"
              type="button"
              class="p-admin__filter-btn"
              :class="{ 'p-admin__filter-btn--active': activeStatsPreset === preset.key }"
              @click="applyStatsPreset(preset.key)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="p-admin__stats-filter">
            <label class="p-admin__form-label" for="stats-start-date-input">統計區間</label>
            <input
              id="stats-start-date-input"
              v-model="statsStartDate"
              type="date"
              class="p-admin__date-input"
              :max="statsMaxDate"
            />
            <span class="p-admin__stats-range-sep">至</span>
            <input
              id="stats-end-date-input"
              v-model="statsEndDate"
              type="date"
              class="p-admin__date-input"
              :max="statsMaxDate"
            />
            <span class="p-admin__stats-range-hint">
              共 {{ statsRangeDays }} 天（上限 {{ STATS_MAX_RANGE_DAYS }} 天）
            </span>
          </div>
          <p v-if="statsPermissionDenied" class="p-admin__stats-empty">
            讀取 <code>stats_daily</code> 被 Firestore 規則拒絕。請在 Firebase Console 的
            Firestore Rules 加上這個集合：後台需要 read（已登入），上傳端需要 create／update
            （未登入，因為送出便利貼時不會登入）。規則生效後重新整理即可。
          </p>
          <template v-else>
            <div v-show="statsLoading" class="p-admin__stats-loading">載入中…</div>
            <!--
              這裡刻意用 v-show 而不是 v-if：改用 v-if 的話每次切換區間都會卸載 VChart，
              ECharts 實例要重新建立，區間一長（熱力圖上千格）就會明顯卡頓。
            -->
            <div
              v-show="!statsLoading"
              class="p-admin__stats-body"
            >
              <div class="p-admin__hourly-chart">
                <div class="p-admin__hourly-chart-head">
                  <h3 class="p-admin__hourly-chart-title">{{ statsTrendTitle }}</h3>
                  <span class="p-admin__hourly-chart-subtitle">{{ statsRangeLabel }}</span>
                </div>
                <ClientOnly>
                  <VChart
                    class="p-admin__hourly-echart"
                    :option="trendChartOption"
                    autoresize
                  />
                </ClientOnly>
              </div>

              <!-- 區間 ≥ 2 天才有意義：主圖看「哪天多」，這張看「幾點多」 -->
              <div v-if="statsShowHourBreakdown" class="p-admin__hourly-chart">
                <div class="p-admin__hourly-chart-head">
                  <h3 class="p-admin__hourly-chart-title">{{ statsBreakdownTitle }}</h3>
                  <span class="p-admin__hourly-chart-subtitle">{{ statsBreakdownSubtitle }}</span>
                </div>
                <ClientOnly>
                  <VChart
                    class="p-admin__hourly-echart"
                    :class="{ 'p-admin__hourly-echart--tall': statsUseHeatmap }"
                    :option="statsUseHeatmap ? heatmapChartOption : hourProfileChartOption"
                    autoresize
                  />
                </ClientOnly>
              </div>

              <div class="p-admin__stats-grid p-admin__stats-grid--top">
                <div class="p-admin__stat-card">
                  <div class="p-admin__stat-value">{{ statsRangeUploads }}</div>
                  <div class="p-admin__stat-label">區間上傳總數</div>
                </div>
                <div class="p-admin__stat-card">
                  <div class="p-admin__stat-value">{{ statsAvgPerDay }}</div>
                  <div class="p-admin__stat-label">日均上傳數</div>
                </div>
                <div class="p-admin__stat-card">
                  <div class="p-admin__stat-value">{{ statsPeakDay?.total ?? 0 }}</div>
                  <div class="p-admin__stat-label">
                    最高單日<span v-if="statsPeakDay && statsPeakDay.total > 0">（{{ statsPeakDay.date }}）</span>
                  </div>
                </div>
              </div>
              <div v-if="statsRangeIncludesToday" class="p-admin__stats-grid p-admin__stats-grid--bottom">
                <div class="p-admin__stat-card p-admin__stat-card--full">
                  <div class="p-admin__stat-value">{{ statsLastHourUploads }}</div>
                  <div class="p-admin__stat-label">近 1 小時上傳數（即時）</div>
                </div>
              </div>

              <p v-if="statsHasNoData" class="p-admin__stats-empty">
                這個區間沒有上傳紀錄。
              </p>
            </div>
          </template>
        </section>

        <!-- Editor GPS 合法區域 -->
        <section v-show="activeAdminTab === 'uploadGate'" class="p-admin__card">
          <h2 class="p-admin__card-title">Editor GPS 合法區域</h2>
          <p class="p-admin__video-hint">
            開啟後，使用者在「上傳大螢幕」前，必須位於指定經緯度的半徑範圍內才可送出。
          </p>
          <p class="p-admin__video-hint p-admin__video-hint--compact">
            「啟用 GPS 區域限制」開關會立即寫入後台；緯度、經度、半徑變更後請按下方「儲存 GPS 設定」。
          </p>

          <label class="p-admin__switch-label p-admin__switch-label--block">
            <input
              v-model="gpsFenceEnabled"
              type="checkbox"
              class="p-admin__switch-input"
              :disabled="isSavingGpsFence"
              @change="onGpsFenceToggle"
            />
            <span class="p-admin__switch-ui" aria-hidden="true" />
            <span class="p-admin__switch-text">啟用 GPS 區域限制</span>
          </label>

          <div class="p-admin__gps-grid">
            <div class="p-admin__form-group">
              <label class="p-admin__form-label" for="gps-latitude-input">中心緯度（Latitude）</label>
              <input
                id="gps-latitude-input"
                v-model.trim="gpsLatitudeInput"
                type="number"
                inputmode="decimal"
                class="p-admin__form-input"
                placeholder="例如 25.052297"
                :disabled="isSavingGpsFence"
              />
            </div>
            <div class="p-admin__form-group">
              <label class="p-admin__form-label" for="gps-longitude-input">中心經度（Longitude）</label>
              <input
                id="gps-longitude-input"
                v-model.trim="gpsLongitudeInput"
                type="number"
                inputmode="decimal"
                class="p-admin__form-input"
                placeholder="例如 121.520739"
                :disabled="isSavingGpsFence"
              />
            </div>
            <div class="p-admin__form-group">
              <label class="p-admin__form-label" for="gps-radius-input">合法半徑（公尺）</label>
              <input
                id="gps-radius-input"
                v-model.trim="gpsRadiusMetersInput"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                class="p-admin__form-input"
                placeholder="例如 150"
                :disabled="isSavingGpsFence"
              />
            </div>
          </div>

          <div class="p-admin__btn-row">
            <button
              type="button"
              class="p-admin__btn p-admin__btn--primary p-admin__btn--inline"
              :disabled="isSavingGpsFence"
              @click="saveGpsFenceSettings"
            >
              {{ isSavingGpsFence ? '儲存中…' : '儲存 GPS 設定' }}
            </button>
            <button
              type="button"
              class="p-admin__btn p-admin__btn--secondary p-admin__btn--inline"
              :disabled="isSavingGpsFence"
              @click="resetGpsFenceToDefaults"
            >
              回到預設
            </button>
          </div>
        </section>

        <!-- 插播影片 -->
        <section v-show="activeAdminTab === 'display'" class="p-admin__card">
          <h2 class="p-admin__card-title">插播影片</h2>
          <ul class="p-admin__video-checklist">
            <li>先上傳影片，再開啟「依時間觸發插播」。</li>
            <li>系統會按照你設定的分鐘數，自動在固定時間點插播。</li>
            <li>若當下正在播便利貼，會等這輪播完再播影片，播完後自動回到便利貼。</li>
          </ul>
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
              請選擇固定分鐘（例如每 5 分鐘），系統每小時都會在同樣的時間點插播。
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
        <section v-show="activeAdminTab === 'notes'" class="p-admin__card">
          <h2 class="p-admin__card-title">所有便利貼管理</h2>
          <div class="p-admin__notes-container">
            
            <div class="p-admin__notes-section">
              <h3 class="p-admin__notes-subtitle">待處理 ({{ pendingNotesTotal }})</h3>
              <div v-if="pendingNotesLoading" class="p-admin__empty-state">載入中...</div>
              <div v-else-if="pendingNotes.length === 0" class="p-admin__empty-state">目前沒有待處理的便利貼</div>
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
              <div v-if="pendingNotesTotal > 0" class="p-admin__note-pagination">
                <span class="p-admin__note-page-info">第 {{ pendingNotesPage }} 頁 · {{ pendingNotesRangeText }}</span>
                <div class="p-admin__note-page-actions">
                  <button
                    type="button"
                    class="p-admin__note-page-btn p-admin__note-page-btn--nav"
                    :disabled="pendingNotesLoading || pendingNotesPage === 1"
                    @click="changePendingNotesPage(-1)"
                  >
                    上一頁
                  </button>
                  <div class="p-admin__note-pages">
                    <template v-for="(item, idx) in pendingNotesPageItems" :key="`pending-${idx}-${item}`">
                      <button
                        v-if="typeof item === 'number'"
                        type="button"
                        class="p-admin__note-page-btn"
                        :class="{ 'p-admin__note-page-btn--active': item === pendingNotesPage }"
                        :disabled="pendingNotesLoading"
                        @click="goToPendingNotesPage(item)"
                      >
                        {{ item }}
                      </button>
                      <span v-else class="p-admin__note-page-ellipsis">…</span>
                    </template>
                  </div>
                  <button
                    type="button"
                    class="p-admin__note-page-btn p-admin__note-page-btn--nav"
                    :disabled="pendingNotesLoading || pendingNotesPage === pendingNotesTotalPages"
                    @click="changePendingNotesPage(1)"
                  >
                    下一頁
                  </button>
                </div>
              </div>
            </div>

            <div class="p-admin__notes-section">
              <h3 class="p-admin__notes-subtitle">歷史紀錄 ({{ historyNotesTotal }})</h3>
              <div v-if="historyNotesLoading" class="p-admin__empty-state">載入中...</div>
              <div v-else-if="historyNotes.length === 0" class="p-admin__empty-state">目前沒有歷史紀錄</div>
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
              <div v-if="historyNotesTotal > 0" class="p-admin__note-pagination">
                <span class="p-admin__note-page-info">第 {{ historyNotesPage }} 頁 · {{ historyNotesRangeText }}</span>
                <div class="p-admin__note-page-actions">
                  <button
                    type="button"
                    class="p-admin__note-page-btn p-admin__note-page-btn--nav"
                    :disabled="historyNotesLoading || historyNotesPage === 1"
                    @click="changeHistoryNotesPage(-1)"
                  >
                    上一頁
                  </button>
                  <div class="p-admin__note-pages">
                    <template v-for="(item, idx) in historyNotesPageItems" :key="`history-${idx}-${item}`">
                      <button
                        v-if="typeof item === 'number'"
                        type="button"
                        class="p-admin__note-page-btn"
                        :class="{ 'p-admin__note-page-btn--active': item === historyNotesPage }"
                        :disabled="historyNotesLoading"
                        @click="goToHistoryNotesPage(item)"
                      >
                        {{ item }}
                      </button>
                      <span v-else class="p-admin__note-page-ellipsis">…</span>
                    </template>
                  </div>
                  <button
                    type="button"
                    class="p-admin__note-page-btn p-admin__note-page-btn--nav"
                    :disabled="historyNotesLoading || historyNotesPage === historyNotesTotalPages"
                    @click="changeHistoryNotesPage(1)"
                  >
                    下一頁
                  </button>
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
  getCountFromServer,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  startAfter,
  limit,
  where,
  Timestamp
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import QRCode from 'qrcode'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import AppModal from '~/components/AppModal.vue'
import {
  clampInterstitialIntervalMinutes,
  CANVAS_INTERSTITIAL_DIVISORS_OF_60,
  parseInterstitialScheduleEnabled
} from '~/composables/useConductor'
import {
  countDaysInclusive,
  fetchDailyUploadStats,
  fetchDayUploadStat,
  isValidDateKey,
  shiftDateKey,
  STATS_MAX_RANGE_DAYS,
  toDateKey,
  type DailyUploadStat
} from '~/composables/useUploadStats'

definePageMeta({
  layout: false
})

const { $firestore, $storage } = useNuxtApp()
const { createToken } = useFirestore()
use([
  CanvasRenderer,
  LineChart,
  BarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent
])

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

type AdminTabKey = 'overview' | 'uploadGate' | 'display' | 'notes'

const adminTabs: Array<{ key: AdminTabKey; label: string }> = [
  { key: 'overview', label: '營運總覽' },
  { key: 'uploadGate', label: '上傳控管' },
  { key: 'display', label: '播放設定' },
  { key: 'notes', label: '便利貼管理' }
]
const activeAdminTab = ref<AdminTabKey>('overview')
const setActiveAdminTab = (tab: AdminTabKey) => {
  activeAdminTab.value = tab
}

// Token 生成（一次一個）
const isGenerating = ref(false)
const currentToken = ref<string | null>(null)
const qrCanvas = ref<HTMLCanvasElement | null>(null)
const qrTimeLeft = ref(60)
let qrTimer: ReturnType<typeof setInterval> | null = null
const tokenRequiredForSubmit = ref(true)
const isSavingTokenRequirement = ref(false)
let unsubTokenRequirement: (() => void) | null = null

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

const startTokenRequirementListener = () => {
  unsubTokenRequirement = onSnapshot(doc(db, 'system', 'editor_token_requirement'), (snap) => {
    if (!snap.exists()) {
      tokenRequiredForSubmit.value = true
      return
    }
    const data = snap.data() as { enabled?: boolean }
    tokenRequiredForSubmit.value = data.enabled !== false
  })
}

const onTokenRequirementToggle = async () => {
  isSavingTokenRequirement.value = true
  try {
    await setDoc(
      doc(db, 'system', 'editor_token_requirement'),
      {
        enabled: tokenRequiredForSubmit.value,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    )
    if (!tokenRequiredForSubmit.value) {
      clearQrCode()
    }
    loadStats()
    showAdminToast(
      'success',
      tokenRequiredForSubmit.value ? '已開啟：上傳需要 Token' : '已關閉：上傳不需要 Token'
    )
  } catch (err) {
    console.error('[admin] 儲存 Token 驗證開關失敗', err)
    showAdminToast('error', '儲存開關失敗，請稍後再試')
    tokenRequiredForSubmit.value = !tokenRequiredForSubmit.value
  } finally {
    isSavingTokenRequirement.value = false
  }
}

// ── 上傳營運統計 ──────────────────────────────────────────
// 資料來源是 stats_daily 預聚合集合（見 useUploadStats），
// 所以任何區間的成本都是「1 天 1 read」，不再逐筆掃便利貼。
const statsLoading = ref(false)
// 預設「今天」必須在掛載後用瀏覽器時區設定；若在 setup 用 new Date()，SSR（多為 UTC）與客戶端本地日曆日可能不同，會造成 hydration mismatch。
const statsStartDate = ref('')
const statsEndDate = ref('')
const statsMaxDate = ref('')
const statsDailyRows = ref<DailyUploadStat[]>([])
const statsLastHourUploads = ref(0)
const statsPermissionDenied = ref(false)
let statsRefreshTimer: ReturnType<typeof setInterval> | null = null
let statsRequestId = 0

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
const AXIS_LABEL_STYLE = { color: '#6b7280', fontSize: 11 }
const AXIS_LINE_STYLE = { lineStyle: { color: '#cbd5e1' } }
const SPLIT_LINE_STYLE = { lineStyle: { color: '#e5e7eb' } }

type StatsPresetKey = 'today' | 'last7' | 'last30' | 'thisMonth'

const statsPresets: Array<{ key: StatsPresetKey; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'last7', label: '近 7 天' },
  { key: 'last30', label: '近 30 天' },
  { key: 'thisMonth', label: '本月' }
]

const statsPresetRange = (key: StatsPresetKey): { start: string; end: string } => {
  const now = new Date()
  const today = toDateKey(now)
  if (key === 'today') return { start: today, end: today }
  if (key === 'last7') return { start: shiftDateKey(today, -6), end: today }
  if (key === 'last30') return { start: shiftDateKey(today, -29), end: today }
  return { start: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
}

const activeStatsPreset = computed<StatsPresetKey | null>(() => {
  for (const preset of statsPresets) {
    const range = statsPresetRange(preset.key)
    if (range.start === statsStartDate.value && range.end === statsEndDate.value) return preset.key
  }
  return null
})

const applyStatsPreset = (key: StatsPresetKey) => {
  const range = statsPresetRange(key)
  statsStartDate.value = range.start
  statsEndDate.value = range.end
}

/** 來自選取的區間而非已載入資料，避免載入期間閃「共 0 天」 */
const statsRangeDays = computed(() => {
  if (!isValidDateKey(statsStartDate.value) || !isValidDateKey(statsEndDate.value)) return 0
  return Math.max(0, countDaysInclusive(statsStartDate.value, statsEndDate.value))
})
const statsRangeLabel = computed(() =>
  statsStartDate.value === statsEndDate.value
    ? statsStartDate.value
    : `${statsStartDate.value} ~ ${statsEndDate.value}`
)
const statsRangeIncludesToday = computed(() => {
  const today = toDateKey(new Date())
  return statsStartDate.value <= today && today <= statsEndDate.value
})

/** 區間越長，主趨勢圖的粒度就越粗；攤成連續小時軸超過 3 天就完全讀不出東西 */
const statsGranularity = computed<'hour' | 'day' | 'week'>(() => {
  const days = statsRangeDays.value
  if (days <= 1) return 'hour'
  if (days <= 31) return 'day'
  return 'week'
})

/** 超過這個天數，熱力圖的欄位會擠成一團而且格數暴增，改用 24 格平均長條 */
const STATS_HEATMAP_MAX_DAYS = 120

const statsShowHourBreakdown = computed(() => statsRangeDays.value >= 2)
const statsUseHeatmap = computed(
  () => statsRangeDays.value >= 7 && statsRangeDays.value <= STATS_HEATMAP_MAX_DAYS
)

const statsTrendTitle = computed(() => {
  if (statsGranularity.value === 'hour') return '每小時上傳趨勢'
  if (statsGranularity.value === 'week') return '每週上傳趨勢'
  return '每日上傳趨勢'
})
const statsBreakdownTitle = computed(() => (statsUseHeatmap.value ? '上傳熱力圖' : '時段分佈'))
const statsBreakdownSubtitle = computed(() =>
  statsUseHeatmap.value ? '日期 × 時段' : '區間內每日平均'
)

const statsRangeUploads = computed(() =>
  statsDailyRows.value.reduce((sum, row) => sum + row.total, 0)
)
const statsAvgPerDay = computed(() => {
  const days = statsRangeDays.value
  if (!days) return 0
  return Math.round((statsRangeUploads.value / days) * 10) / 10
})
const statsPeakDay = computed<DailyUploadStat | null>(() => {
  let peak: DailyUploadStat | null = null
  for (const row of statsDailyRows.value) {
    if (!peak || row.total > peak.total) peak = row
  }
  return peak
})
const statsHasNoData = computed(
  () => statsDailyRows.value.length > 0 && statsRangeUploads.value === 0
)

const formatMonthDay = (dateKey: string) => dateKey.slice(5).replace('-', '/')

const statsTrendBuckets = computed<Array<{ label: string; value: number }>>(() => {
  const rows = statsDailyRows.value

  if (statsGranularity.value === 'hour') {
    const hours = rows[0]?.hours ?? Array.from({ length: 24 }, () => 0)
    return hours.map((value, hour) => ({ label: HOUR_LABELS[hour] ?? '', value }))
  }

  if (statsGranularity.value === 'day') {
    return rows.map(row => ({ label: formatMonthDay(row.date), value: row.total }))
  }

  const buckets: Array<{ label: string; value: number }> = []
  for (let offset = 0; offset < rows.length; offset += 7) {
    const chunk = rows.slice(offset, offset + 7)
    const first = chunk[0]
    const last = chunk[chunk.length - 1]
    if (!first || !last) continue
    buckets.push({
      label: `${formatMonthDay(first.date)}–${formatMonthDay(last.date)}`,
      value: chunk.reduce((sum, row) => sum + row.total, 0)
    })
  }
  return buckets
})

/** 區間內各時段的每日平均，回答「幾點最多人上傳」 */
const statsHourProfile = computed(() => {
  const rows = statsDailyRows.value
  const days = Math.max(1, rows.length)
  return Array.from({ length: 24 }, (_, hour) => {
    const sum = rows.reduce((acc, row) => acc + (row.hours[hour] ?? 0), 0)
    return Math.round((sum / days) * 10) / 10
  })
})

const trendChartOption = computed(() => {
  const buckets = statsTrendBuckets.value
  const granularity = statsGranularity.value
  return {
    grid: { left: 40, right: 18, top: 16, bottom: granularity === 'week' ? 58 : 28 },
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} 筆` },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: buckets.map(bucket => bucket.label),
      axisLabel: {
        ...AXIS_LABEL_STYLE,
        interval: granularity === 'hour' ? 3 : 'auto',
        rotate: granularity === 'week' ? 30 : 0
      },
      axisLine: AXIS_LINE_STYLE
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: AXIS_LABEL_STYLE,
      splitLine: SPLIT_LINE_STYLE
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: buckets.map(bucket => bucket.value),
        lineStyle: { width: 2, color: '#111' },
        itemStyle: { color: '#111' },
        areaStyle: { color: 'rgba(17, 17, 17, 0.08)' }
      }
    ]
  }
})

const hourProfileChartOption = computed(() => ({
  grid: { left: 40, right: 18, top: 16, bottom: 28 },
  tooltip: { trigger: 'axis', valueFormatter: (value: number) => `平均 ${value} 筆` },
  xAxis: {
    type: 'category',
    data: HOUR_LABELS,
    axisLabel: { ...AXIS_LABEL_STYLE, interval: 3 },
    axisLine: AXIS_LINE_STYLE
  },
  yAxis: { type: 'value', axisLabel: AXIS_LABEL_STYLE, splitLine: SPLIT_LINE_STYLE },
  series: [
    {
      type: 'bar',
      data: statsHourProfile.value,
      itemStyle: { color: '#111', borderRadius: [3, 3, 0, 0] }
    }
  ]
}))

const heatmapChartOption = computed(() => {
  const rows = statsDailyRows.value
  const data: Array<[number, number, number]> = []
  let max = 0
  rows.forEach((row, dayIndex) => {
    row.hours.forEach((count, hour) => {
      if (count > max) max = count
      data.push([dayIndex, hour, count])
    })
  })

  return {
    // 逐格進場動畫在上千格時很有感，直接關掉
    animation: false,
    grid: { left: 48, right: 18, top: 12, bottom: 68 },
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const [dayIndex, hour, count] = params.value as [number, number, number]
        return `${rows[dayIndex]?.date ?? ''} ${HOUR_LABELS[hour] ?? ''}<br/>${count} 筆`
      }
    },
    xAxis: {
      type: 'category',
      data: rows.map(row => formatMonthDay(row.date)),
      splitArea: { show: true },
      axisLabel: { ...AXIS_LABEL_STYLE, fontSize: 10, interval: 'auto', rotate: 45 }
    },
    yAxis: {
      type: 'category',
      data: HOUR_LABELS,
      splitArea: { show: true },
      axisLabel: { ...AXIS_LABEL_STYLE, fontSize: 10, interval: 2 }
    },
    visualMap: {
      min: 0,
      max: Math.max(1, max),
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 10,
      itemHeight: 90,
      text: ['多', '少'],
      textStyle: { ...AXIS_LABEL_STYLE, fontSize: 10 },
      inRange: { color: ['#f3f4f6', '#9ca3af', '#111'] }
    },
    series: [
      {
        type: 'heatmap',
        data,
        itemStyle: { borderColor: '#fff', borderWidth: 0.5 }
      }
    ]
  }
})

/** 近 1 小時是即時指標，只有在區間包含今天時才有意義 */
const fetchLastHourUploads = async (): Promise<number> => {
  if (!statsRangeIncludesToday.value) return 0
  const oneHourAgoTs = Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000))
  const [pendingSnapshot, historySnapshot] = await Promise.all([
    getCountFromServer(
      query(collection(db, 'queue_pending'), where('timestamp', '>=', oneHourAgoTs))
    ),
    getCountFromServer(
      query(collection(db, 'queue_history'), where('timestamp', '>=', oneHourAgoTs))
    )
  ])
  return pendingSnapshot.data().count + historySnapshot.data().count
}

const isPermissionDenied = (err: any) =>
  err?.code === 'permission-denied' ||
  String(err?.message || '').includes('Missing or insufficient permissions')

const loadStats = async () => {
  if (!isValidDateKey(statsStartDate.value) || !isValidDateKey(statsEndDate.value)) return

  const requestId = ++statsRequestId
  statsLoading.value = true
  try {
    const [rows, lastHour] = await Promise.all([
      fetchDailyUploadStats(db, statsStartDate.value, statsEndDate.value),
      fetchLastHourUploads()
    ])
    if (requestId !== statsRequestId) return
    statsDailyRows.value = rows
    statsLastHourUploads.value = lastHour
    statsPermissionDenied.value = false
  } catch (err) {
    console.error('[admin] 載入營運統計失敗', err)
    if (requestId !== statsRequestId) return
    // Rules 尚未開放 stats_daily 時，在卡片內說明修法，不用無意義的「請稍後再試」
    if (isPermissionDenied(err)) {
      statsPermissionDenied.value = true
      statsDailyRows.value = []
      statsLastHourUploads.value = 0
    } else {
      showAdminToast('error', '載入統計失敗，請稍後再試')
    }
  } finally {
    if (requestId === statsRequestId) statsLoading.value = false
  }
}

/** 自動刷新只補今天那一格 + 即時卡，成本固定 3 reads */
const refreshTodayStats = async () => {
  if (!statsRangeIncludesToday.value || statsLoading.value) return
  // 權限未開放時不必每 30 秒重試一次刷 console
  if (statsPermissionDenied.value) return
  const todayKey = toDateKey(new Date())
  try {
    const [today, lastHour] = await Promise.all([
      fetchDayUploadStat(db, todayKey),
      fetchLastHourUploads()
    ])
    const index = statsDailyRows.value.findIndex(row => row.date === todayKey)
    if (index >= 0) {
      const next = statsDailyRows.value.slice()
      next[index] = today
      statsDailyRows.value = next
    }
    statsLastHourUploads.value = lastHour
  } catch (err) {
    console.warn('[admin] 更新今日統計失敗', err)
  }
}

watch([statsStartDate, statsEndDate], () => {
  if (!isValidDateKey(statsStartDate.value) || !isValidDateKey(statsEndDate.value)) return

  let start = statsStartDate.value
  let end = statsEndDate.value
  // ISO 日期字串可直接字典序比較
  if (start > end) [start, end] = [end, start]
  if (countDaysInclusive(start, end) > STATS_MAX_RANGE_DAYS) {
    start = shiftDateKey(end, -(STATS_MAX_RANGE_DAYS - 1))
    showAdminToast('error', `統計區間最多 ${STATS_MAX_RANGE_DAYS} 天，已自動調整開始日期`)
  }
  if (start !== statsStartDate.value || end !== statsEndDate.value) {
    statsStartDate.value = start
    statsEndDate.value = end
    return // 修正後的值會再次觸發本 watcher
  }

  void loadStats()
})

// 便利貼清單
const NOTES_PAGE_SIZE = 20
const pendingNotes = ref<any[]>([])
const historyNotes = ref<any[]>([])
const pendingNotesTotal = ref(0)
const historyNotesTotal = ref(0)
const pendingNotesPage = ref(1)
const historyNotesPage = ref(1)
const pendingNotesLoading = ref(false)
const historyNotesLoading = ref(false)
let pendingNotesPageCursors: any[] = []
let historyNotesPageCursors: any[] = []

const pendingNotesTotalPages = computed(() => Math.max(1, Math.ceil(pendingNotesTotal.value / NOTES_PAGE_SIZE)))
const historyNotesTotalPages = computed(() => Math.max(1, Math.ceil(historyNotesTotal.value / NOTES_PAGE_SIZE)))
type NotePageItem = number | 'ellipsis'

const buildPageItems = (currentPage: number, totalPages: number): NotePageItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const anchors = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const pages = Array.from(anchors)
    .filter(page => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)

  const items: NotePageItem[] = []
  for (const page of pages) {
    const last = items[items.length - 1]
    if (typeof last === 'number' && page - last > 1) {
      items.push('ellipsis')
    }
    items.push(page)
  }
  return items
}

const pendingNotesPageItems = computed(() => buildPageItems(pendingNotesPage.value, pendingNotesTotalPages.value))
const historyNotesPageItems = computed(() => buildPageItems(historyNotesPage.value, historyNotesTotalPages.value))

const buildNotesQuery = (
  collectionName: 'queue_pending' | 'queue_history',
  orderField: 'timestamp' | 'playedAt',
  orderDirection: 'asc' | 'desc',
  cursor: any,
  fetchExtra = true
) => {
  const constraints: any[] = [orderBy(orderField, orderDirection)]
  if (cursor) constraints.push(startAfter(cursor))
  constraints.push(limit(fetchExtra ? NOTES_PAGE_SIZE + 1 : NOTES_PAGE_SIZE))
  return query(collection(db, collectionName), ...constraints)
}

const ensurePendingCursorForPage = async (targetPage: number) => {
  if (targetPage <= 1) return true

  while (pendingNotesPageCursors.length < targetPage - 1) {
    const knownPage = pendingNotesPageCursors.length + 1
    const cursor = knownPage > 1 ? pendingNotesPageCursors[knownPage - 2] : null
    const snapshot = await getDocs(buildNotesQuery('queue_pending', 'timestamp', 'asc', cursor, false))
    const docs = snapshot.docs
    if (docs.length === 0) return false
    pendingNotesPageCursors[knownPage - 1] = docs[docs.length - 1] || null
    if (docs.length < NOTES_PAGE_SIZE && pendingNotesPageCursors.length < targetPage - 1) return false
  }

  return true
}

const ensureHistoryCursorForPage = async (targetPage: number) => {
  if (targetPage <= 1) return true

  while (historyNotesPageCursors.length < targetPage - 1) {
    const knownPage = historyNotesPageCursors.length + 1
    const cursor = knownPage > 1 ? historyNotesPageCursors[knownPage - 2] : null
    const snapshot = await getDocs(buildNotesQuery('queue_history', 'playedAt', 'desc', cursor, false))
    const docs = snapshot.docs
    if (docs.length === 0) return false
    historyNotesPageCursors[knownPage - 1] = docs[docs.length - 1] || null
    if (docs.length < NOTES_PAGE_SIZE && historyNotesPageCursors.length < targetPage - 1) return false
  }

  return true
}

const loadPendingNotesPage = async () => {
  pendingNotesLoading.value = true
  try {
    const countSnap = await getCountFromServer(collection(db, 'queue_pending'))
    pendingNotesTotal.value = countSnap.data().count

    const cursor = pendingNotesPage.value > 1
      ? pendingNotesPageCursors[pendingNotesPage.value - 2]
      : null

    const snapshot = await getDocs(buildNotesQuery('queue_pending', 'timestamp', 'asc', cursor))
    const docs = snapshot.docs
    const pageDocs = docs.slice(0, NOTES_PAGE_SIZE)
    pendingNotes.value = pageDocs.map(d => ({ id: d.id, ...d.data() }))
    pendingNotesPageCursors[pendingNotesPage.value - 1] = pageDocs[pageDocs.length - 1] || null

    if (pendingNotesPage.value > 1 && pageDocs.length === 0) {
      pendingNotesPage.value--
      pendingNotesPageCursors = pendingNotesPageCursors.slice(0, pendingNotesPage.value)
      await loadPendingNotesPage()
    }
  } catch (err) {
    console.error('[admin] 載入待處理便利貼失敗', err)
    showAdminToast('error', '載入待處理便利貼失敗，請稍後再試')
  } finally {
    pendingNotesLoading.value = false
  }
}

const loadHistoryNotesPage = async () => {
  historyNotesLoading.value = true
  try {
    const countSnap = await getCountFromServer(collection(db, 'queue_history'))
    historyNotesTotal.value = countSnap.data().count

    const cursor = historyNotesPage.value > 1
      ? historyNotesPageCursors[historyNotesPage.value - 2]
      : null

    const snapshot = await getDocs(buildNotesQuery('queue_history', 'playedAt', 'desc', cursor))
    const docs = snapshot.docs
    const pageDocs = docs.slice(0, NOTES_PAGE_SIZE)
    historyNotes.value = pageDocs.map(d => ({ id: d.id, ...d.data() }))
    historyNotesPageCursors[historyNotesPage.value - 1] = pageDocs[pageDocs.length - 1] || null

    if (historyNotesPage.value > 1 && pageDocs.length === 0) {
      historyNotesPage.value--
      historyNotesPageCursors = historyNotesPageCursors.slice(0, historyNotesPage.value)
      await loadHistoryNotesPage()
    }
  } catch (err) {
    console.error('[admin] 載入歷史便利貼失敗', err)
    showAdminToast('error', '載入歷史便利貼失敗，請稍後再試')
  } finally {
    historyNotesLoading.value = false
  }
}

const changePendingNotesPage = async (delta: -1 | 1) => {
  if (pendingNotesLoading.value) return
  if (delta < 0) {
    await goToPendingNotesPage(pendingNotesPage.value - 1)
    return
  }
  await goToPendingNotesPage(pendingNotesPage.value + 1)
}

const goToPendingNotesPage = async (targetPage: number) => {
  if (pendingNotesLoading.value) return
  if (targetPage < 1 || targetPage > pendingNotesTotalPages.value) return
  if (targetPage === pendingNotesPage.value) return

  if (targetPage > pendingNotesPage.value) {
    const ok = await ensurePendingCursorForPage(targetPage)
    if (!ok) {
      showAdminToast('error', '指定頁面不存在')
      return
    }
  }

  pendingNotesPage.value = targetPage
  await loadPendingNotesPage()
}

const changeHistoryNotesPage = async (delta: -1 | 1) => {
  if (historyNotesLoading.value) return
  if (delta < 0) {
    await goToHistoryNotesPage(historyNotesPage.value - 1)
    return
  }
  await goToHistoryNotesPage(historyNotesPage.value + 1)
}

const goToHistoryNotesPage = async (targetPage: number) => {
  if (historyNotesLoading.value) return
  if (targetPage < 1 || targetPage > historyNotesTotalPages.value) return
  if (targetPage === historyNotesPage.value) return

  if (targetPage > historyNotesPage.value) {
    const ok = await ensureHistoryCursorForPage(targetPage)
    if (!ok) {
      showAdminToast('error', '指定頁面不存在')
      return
    }
  }

  historyNotesPage.value = targetPage
  await loadHistoryNotesPage()
}

const pendingNotesRangeText = computed(() => {
  if (pendingNotesTotal.value === 0 || pendingNotes.value.length === 0) return `0 / ${pendingNotesTotal.value}`
  const start = (pendingNotesPage.value - 1) * NOTES_PAGE_SIZE + 1
  const end = start + pendingNotes.value.length - 1
  return `${start}-${end} / ${pendingNotesTotal.value}`
})

const historyNotesRangeText = computed(() => {
  if (historyNotesTotal.value === 0 || historyNotes.value.length === 0) return `0 / ${historyNotesTotal.value}`
  const start = (historyNotesPage.value - 1) * NOTES_PAGE_SIZE + 1
  const end = start + historyNotes.value.length - 1
  return `${start}-${end} / ${historyNotesTotal.value}`
})

const startNotesListeners = () => {
  void loadPendingNotesPage()
  void loadHistoryNotesPage()
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
    if (deleteModalData.value.isPending) {
      await loadPendingNotesPage()
    } else {
      await loadHistoryNotesPage()
    }
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

// ── 插播影片 ───────────────────────────────────────────────
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

// ── Editor GPS 合法區域 ───────────────────────────────────
const DEFAULT_GPS_LATITUDE = 25.0549755043647
const DEFAULT_GPS_LONGITUDE = 121.51939758221091
const DEFAULT_GPS_RADIUS_METERS = 100

const gpsFenceEnabled = ref(false)
const gpsLatitudeInput = ref(String(DEFAULT_GPS_LATITUDE))
const gpsLongitudeInput = ref(String(DEFAULT_GPS_LONGITUDE))
const gpsRadiusMetersInput = ref(String(DEFAULT_GPS_RADIUS_METERS))
const isSavingGpsFence = ref(false)
let unsubGpsFence: (() => void) | null = null

const parseGpsNumber = (raw: unknown): number | null => {
  const normalized = String(raw ?? '').trim()
  if (!normalized) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

const areGpsFieldsFilled = () =>
  String(gpsLatitudeInput.value ?? '').trim() !== '' &&
  String(gpsLongitudeInput.value ?? '').trim() !== '' &&
  String(gpsRadiusMetersInput.value ?? '').trim() !== ''

/** 寫入 editor_geo_fence（merge）；關閉時只更新 enabled，保留既有座標欄位 */
const writeEditorGeoFenceDoc = async (payload: {
  enabled: boolean
  latitude?: number
  longitude?: number
  radiusMeters?: number
}) => {
  await setDoc(
    doc(db, 'system', 'editor_geo_fence'),
    {
      ...payload,
      updatedAt: Timestamp.now()
    },
    { merge: true }
  )
}

const onGpsFenceToggle = async () => {
  if (!gpsFenceEnabled.value) {
    isSavingGpsFence.value = true
    try {
      await writeEditorGeoFenceDoc({ enabled: false })
      showAdminToast('success', '已關閉並儲存 GPS 區域限制')
    } catch (err) {
      console.error('[admin] 關閉 GPS 失敗', err)
      gpsFenceEnabled.value = true
      showAdminToast('error', '儲存失敗，請稍後再試')
    } finally {
      isSavingGpsFence.value = false
    }
    return
  }

  if (!areGpsFieldsFilled()) {
    gpsFenceEnabled.value = false
    showAdminToast('error', '啟用 GPS 區域限制前，請先填寫緯度、經度與合法半徑')
    return
  }

  const latitude = parseGpsNumber(gpsLatitudeInput.value)
  const longitude = parseGpsNumber(gpsLongitudeInput.value)
  const radiusMeters = parseGpsNumber(gpsRadiusMetersInput.value)

  if (latitude === null || latitude < -90 || latitude > 90) {
    gpsFenceEnabled.value = false
    showAdminToast('error', '緯度格式錯誤，請輸入 -90 ~ 90 之間的數值')
    return
  }
  if (longitude === null || longitude < -180 || longitude > 180) {
    gpsFenceEnabled.value = false
    showAdminToast('error', '經度格式錯誤，請輸入 -180 ~ 180 之間的數值')
    return
  }
  if (radiusMeters === null || radiusMeters <= 0) {
    gpsFenceEnabled.value = false
    showAdminToast('error', '合法半徑需為大於 0 的數值（公尺）')
    return
  }

  isSavingGpsFence.value = true
  try {
    await writeEditorGeoFenceDoc({
      enabled: true,
      latitude,
      longitude,
      radiusMeters
    })
    showAdminToast('success', '已啟用並儲存 GPS 區域限制')
  } catch (err) {
    console.error('[admin] 啟用 GPS 失敗', err)
    gpsFenceEnabled.value = false
    showAdminToast('error', '儲存失敗，請稍後再試')
  } finally {
    isSavingGpsFence.value = false
  }
}

const startGpsFenceListener = () => {
  unsubGpsFence = onSnapshot(doc(db, 'system', 'editor_geo_fence'), (snap) => {
    if (!snap.exists()) {
      gpsFenceEnabled.value = false
      gpsLatitudeInput.value = String(DEFAULT_GPS_LATITUDE)
      gpsLongitudeInput.value = String(DEFAULT_GPS_LONGITUDE)
      gpsRadiusMetersInput.value = String(DEFAULT_GPS_RADIUS_METERS)
      return
    }

    const data = snap.data() as {
      enabled?: boolean
      latitude?: number
      longitude?: number
      radiusMeters?: number
    }

    gpsFenceEnabled.value = Boolean(data.enabled)
    gpsLatitudeInput.value = Number.isFinite(data.latitude) ? String(data.latitude) : String(DEFAULT_GPS_LATITUDE)
    gpsLongitudeInput.value = Number.isFinite(data.longitude) ? String(data.longitude) : String(DEFAULT_GPS_LONGITUDE)
    gpsRadiusMetersInput.value = Number.isFinite(data.radiusMeters) ? String(Math.round(data.radiusMeters as number)) : String(DEFAULT_GPS_RADIUS_METERS)
  })
}

const resetGpsFenceToDefaults = () => {
  gpsLatitudeInput.value = String(DEFAULT_GPS_LATITUDE)
  gpsLongitudeInput.value = String(DEFAULT_GPS_LONGITUDE)
  gpsRadiusMetersInput.value = String(DEFAULT_GPS_RADIUS_METERS)
  showAdminToast('success', '已套用預設 GPS 參數，記得按「儲存 GPS 設定」')
}

const saveGpsFenceSettings = async () => {
  if (!areGpsFieldsFilled()) {
    showAdminToast('error', '儲存 GPS 設定前，請先填寫緯度、經度與合法半徑')
    return
  }

  const latitude = parseGpsNumber(gpsLatitudeInput.value)
  const longitude = parseGpsNumber(gpsLongitudeInput.value)
  const radiusMeters = parseGpsNumber(gpsRadiusMetersInput.value)

  if (latitude === null || latitude < -90 || latitude > 90) {
    showAdminToast('error', '緯度格式錯誤，請輸入 -90 ~ 90 之間的數值')
    return
  }
  if (longitude === null || longitude < -180 || longitude > 180) {
    showAdminToast('error', '經度格式錯誤，請輸入 -180 ~ 180 之間的數值')
    return
  }
  if (radiusMeters === null || radiusMeters <= 0) {
    showAdminToast('error', '合法半徑需為大於 0 的數值（公尺）')
    return
  }

  isSavingGpsFence.value = true
  try {
    await writeEditorGeoFenceDoc({
      enabled: gpsFenceEnabled.value,
      latitude,
      longitude,
      radiusMeters
    })
    showAdminToast('success', 'GPS 區域設定已儲存')
  } catch (err) {
    console.error('[admin] 儲存 GPS 設定失敗', err)
    showAdminToast('error', '儲存 GPS 設定失敗，請稍後再試')
  } finally {
    isSavingGpsFence.value = false
  }
}

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
  if (interstitialScheduleEnabled.value && !canvasVideoUrl.value) {
    interstitialScheduleEnabled.value = false
    showAdminToast('error', '請先上傳插播影片，再開啟依時間觸發插播')
    return
  }

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

/** 依下載網址刪除 Storage 物件（舊版 SDK 亦支援將完整 HTTPS URL 傳入 ref） */
const deleteCanvasInterstitialVideoFromStorage = async (downloadUrl: string | null | undefined) => {
  if (!downloadUrl) return
  const r = storageRef(storage, downloadUrl)
  await deleteObject(r)
}

const MAX_VIDEO_FILE_SIZE_BYTES = 50 * 1024 * 1024

const onVideoFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('video/')) {
    showAdminToast('error', '請選擇影片檔（MP4 / WebM / MOV 等）')
    input.value = ''
    return
  }
  if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
    showAdminToast('error', '影片大小不得超過 50MB')
    input.value = ''
    return
  }
  const previousUrl = canvasVideoUrl.value
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
    if (previousUrl && previousUrl !== url) {
      try {
        await deleteCanvasInterstitialVideoFromStorage(previousUrl)
      } catch (delErr: unknown) {
        const code = typeof delErr === 'object' && delErr !== null && 'code' in delErr ? (delErr as { code?: string }).code : ''
        if (code !== 'storage/object-not-found') {
          console.warn('[admin] 已套用新影片，但刪除舊檔失敗', delErr)
        }
      }
    }
    showAdminToast('success', '影片已上傳並套用')
  } catch (err) {
    console.error('[admin] 影片上傳失敗', err)
    showAdminToast('error', '上傳失敗，請確認 Storage 已啟用且規則允許寫入')
  } finally {
    isUploadingVideo.value = false
    input.value = ''
  }
}

const clearCanvasVideo = async () => {
  if (!confirm('確定要移除插播影片？')) return
  const urlToDelete = canvasVideoUrl.value
  isClearingVideo.value = true
  try {
    if (urlToDelete) {
      try {
        await deleteCanvasInterstitialVideoFromStorage(urlToDelete)
      } catch (delErr: unknown) {
        const code = typeof delErr === 'object' && delErr !== null && 'code' in delErr ? (delErr as { code?: string }).code : ''
        if (code === 'storage/object-not-found') {
          // 檔案已不存在，仍繼續清除 Firestore 設定
        } else {
          console.error('[admin] 刪除 Storage 影片失敗', delErr)
          showAdminToast('error', '刪除雲端影片失敗，請稍後再試')
          return
        }
      }
    }
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
  const today = toDateKey(new Date())
  statsMaxDate.value = today
  if (!statsStartDate.value || !statsEndDate.value) {
    // 預設看今天，行為與改版前一致
    statsStartDate.value = today
    statsEndDate.value = today
  }
  startNotesListeners()
  statsRefreshTimer = setInterval(() => {
    void refreshTodayStats()
  }, 30000)
  startTokenRequirementListener()
  startGpsFenceListener()
  startCanvasVideoListener()
})

onUnmounted(() => {
  if (adminToastTimer) {
    clearTimeout(adminToastTimer)
    adminToastTimer = null
  }
  if (statsRefreshTimer) {
    clearInterval(statsRefreshTimer)
    statsRefreshTimer = null
  }
  unsubTokenRequirement?.()
  unsubTokenRequirement = null
  unsubCanvasVideo?.()
  unsubCanvasVideo = null
  unsubGpsFence?.()
  unsubGpsFence = null
  clearQrCode()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_admin.scss */
</style>
