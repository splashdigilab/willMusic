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
          <button type="button" class="p-admin__logout" @click="handleLogout">登出</button>
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

        <!-- 投稿頻率限制 -->
        <section v-show="activeAdminTab === 'uploadGate'" class="p-admin__card">
          <h2 class="p-admin__card-title">投稿頻率限制</h2>
          <p class="p-admin__video-hint">
            限制每位 LINE 會員的投稿頻率。額度是綁在 LINE 帳號上的，清除瀏覽器資料或改用無痕視窗都繞不過。
          </p>
          <p class="p-admin__video-hint p-admin__video-hint--compact">
            每日額度以台灣時間的午夜為界重置。修改後請按下方「儲存頻率設定」。
          </p>

          <label class="p-admin__switch-label p-admin__switch-label--block">
            <input
              v-model="rateLimitEnabled"
              type="checkbox"
              class="p-admin__switch-input"
              :disabled="isSavingRateLimit"
            />
            <span class="p-admin__switch-ui" aria-hidden="true" />
            <span class="p-admin__switch-text">啟用投稿頻率限制</span>
          </label>

          <div class="p-admin__gps-grid">
            <div class="p-admin__form-group">
              <label class="p-admin__form-label" for="rate-cooldown-input">間隔時間（分鐘）</label>
              <input
                id="rate-cooldown-input"
                v-model.trim="rateCooldownInput"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                class="p-admin__form-input"
                placeholder="例如 5"
                :disabled="isSavingRateLimit"
              />
            </div>
            <div class="p-admin__form-group">
              <label class="p-admin__form-label" for="rate-daily-input">每人每日上限（張）</label>
              <input
                id="rate-daily-input"
                v-model.trim="rateDailyLimitInput"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                class="p-admin__form-input"
                placeholder="例如 3"
                :disabled="isSavingRateLimit"
              />
            </div>
          </div>

          <div class="p-admin__btn-row">
            <button
              type="button"
              class="p-admin__btn p-admin__btn--primary p-admin__btn--inline"
              :disabled="isSavingRateLimit"
              @click="saveRateLimitSettings"
            >
              {{ isSavingRateLimit ? '儲存中…' : '儲存頻率設定' }}
            </button>
            <button
              type="button"
              class="p-admin__btn p-admin__btn--secondary p-admin__btn--inline"
              :disabled="isSavingRateLimit"
              @click="resetRateLimitToDefaults"
            >
              回到預設（{{ DEFAULT_RATE_LIMIT.cooldownMinutes }} 分鐘／{{ DEFAULT_RATE_LIMIT.dailyLimit }} 張）
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
                      v-if="ownerOf(note)"
                      type="button"
                      class="p-admin__note-submitter p-admin__note-submitter--link"
                      :title="ownerOf(note)"
                      @click="memberPanelUid = ownerOf(note) ?? null"
                    >
                      <span v-if="bans.has(ownerOf(note) ?? '')" class="p-admin__tag p-admin__tag--banned">已封鎖</span>
                      {{ submitterLabel(note) }}
                    </button>
                    <span v-else class="p-admin__note-submitter">{{ submitterLabel(note) }}</span>
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
                      v-if="ownerOf(note)"
                      type="button"
                      class="p-admin__note-submitter p-admin__note-submitter--link"
                      :title="ownerOf(note)"
                      @click="memberPanelUid = ownerOf(note) ?? null"
                    >
                      <span v-if="bans.has(ownerOf(note) ?? '')" class="p-admin__tag p-admin__tag--banned">已封鎖</span>
                      {{ submitterLabel(note) }}
                    </button>
                    <span v-else class="p-admin__note-submitter">{{ submitterLabel(note) }}</span>
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

        <!-- 會員：清單＋編號查詢。點任何一位都打開 AdminMemberPanel，
             看他送過的便利貼、封鎖、刪個資都在那裡。 -->
        <section v-show="activeAdminTab === 'members'" class="p-admin__card">
          <h2 class="p-admin__card-title">會員</h2>
          <p class="p-admin__video-hint">
            點任一位會員，可以看這個帳號送過的所有便利貼、封鎖帳號，或處理個資刪除請求。
            在「便利貼管理」裡點卡片上的投稿者，也會打開同一個畫面。
          </p>

          <div class="p-admin__member-filters" role="tablist" aria-label="會員篩選">
            <button
              type="button"
              class="p-admin__member-filter"
              :class="{ 'is-active': memberFilter === 'all' }"
              role="tab"
              :aria-selected="memberFilter === 'all'"
              @click="memberFilter = 'all'"
            >
              全部（依最近登入）
            </button>
            <button
              type="button"
              class="p-admin__member-filter"
              :class="{ 'is-active': memberFilter === 'banned' }"
              role="tab"
              :aria-selected="memberFilter === 'banned'"
              @click="memberFilter = 'banned'"
            >
              已封鎖（{{ bans.size }}）
            </button>
          </div>

          <div v-if="memberListLoading && visibleMemberRows.length === 0" class="p-admin__empty-state">載入中...</div>
          <div v-else-if="visibleMemberRows.length === 0" class="p-admin__empty-state">
            {{ memberFilter === 'banned' ? '目前沒有封鎖的帳號' : '還沒有會員' }}
          </div>
          <ul v-else class="p-admin__member-list">
            <li v-for="row in visibleMemberRows" :key="row.uid">
              <button type="button" class="p-admin__member-row" @click="memberPanelUid = row.uid">
                <img v-if="row.avatar" :src="row.avatar" alt="" class="p-admin__member-avatar" />
                <span v-else class="p-admin__member-avatar" aria-hidden="true" />
                <span class="p-admin__member-row-text">
                  <span class="p-admin__member-name">
                    {{ row.name || '（沒有暱稱）' }}
                    <span v-if="bans.has(row.uid)" class="p-admin__tag p-admin__tag--banned">已封鎖</span>
                  </span>
                  <span class="p-admin__member-uid">{{ row.subtitle }}</span>
                </span>
                <span class="p-admin__member-row-chevron" aria-hidden="true">›</span>
              </button>
            </li>
          </ul>
          <div v-if="memberFilter === 'all' && memberHasMore" class="p-admin__btn-row p-admin__member-more">
            <button
              type="button"
              class="p-admin__btn p-admin__btn--secondary p-admin__btn--inline"
              :disabled="memberListLoading"
              @click="loadMembers(false)"
            >
              {{ memberListLoading ? '載入中…' : '載入更多' }}
            </button>
          </div>

          <h3 class="p-admin__panel-section-title">用編號查詢</h3>
          <div class="p-admin__form-group">
            <label class="p-admin__form-label" for="member-uid-input">使用者編號（uid）</label>
            <input
              id="member-uid-input"
              v-model.trim="memberUidInput"
              type="text"
              class="p-admin__form-input"
              placeholder="line:U xxxxxxxx…"
              @keyup.enter="openMemberByUid"
            />
          </div>
          <div class="p-admin__btn-row">
            <button
              type="button"
              class="p-admin__btn p-admin__btn--primary p-admin__btn--inline"
              :disabled="!memberUidInput"
              @click="openMemberByUid"
            >
              查詢
            </button>
          </div>
        </section>
      </div>
    </div>

    <AdminMemberPanel
      v-model:uid="memberPanelUid"
      @changed="onMemberChanged"
      @notify="showAdminToast"
    />

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
  getDoc,
  getDocs,
  doc,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  startAfter,
  limit,
  Timestamp,
  type QueryDocumentSnapshot
} from 'firebase/firestore'
import { DEFAULT_RATE_LIMIT, type BannedUser, type RateLimitConfig } from '~/types'
import type { MemberRow } from '~/composables/useMemberAdmin'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import QRCode from 'qrcode'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import AppModal from '~/components/AppModal.vue'
import AdminMemberPanel from '~/components/AdminMemberPanel.vue'
import {
  clampInterstitialIntervalMinutes,
  CANVAS_INTERSTITIAL_DIVISORS_OF_60,
  parseInterstitialScheduleEnabled
} from '~/composables/useConductor'
import { STATS_MAX_RANGE_DAYS } from '~/composables/useUploadStats'
import { useAdminStats } from '~/composables/useAdminStats'

definePageMeta({
  layout: false
})

const { $firestore, $storage } = useNuxtApp()
const { createToken } = useFirestore()
const { logout } = useAdminAuth()
const { listMembers, loadOwners, deleteNote } = useMemberAdmin()
const { listBans } = useBannedUsers()
const router = useRouter()

/**
 * 登出後主動導回 /login。
 *
 * 不倚賴 middleware 把人踢走：它只在「切換路由」時跑，登出後留在原地是不會觸發的，
 * 畫面會停在後台版面上（資料讀不到，但看起來像壞掉）。
 */
const handleLogout = async () => {
  await logout()
  await router.replace('/login')
}
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

const cols = useCollections()
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

type AdminTabKey = 'overview' | 'uploadGate' | 'display' | 'notes' | 'members'

const adminTabs: Array<{ key: AdminTabKey; label: string }> = [
  { key: 'overview', label: '營運總覽' },
  { key: 'uploadGate', label: '上傳控管' },
  { key: 'display', label: '播放設定' },
  { key: 'notes', label: '便利貼管理' },
  { key: 'members', label: '會員' }
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
    // 判定方式必須與 editor.vue 完全一致：editor 是真正執行驗證的那一側，
    // 它把「文件不存在」與「enabled 非 true」都視為不需要 Token。
    // 後台若各自解讀，會出現「後台顯示需要 Token，但前台其實放行所有人」。
    if (!snap.exists()) {
      tokenRequiredForSubmit.value = false
      return
    }
    const data = snap.data() as { enabled?: boolean }
    tokenRequiredForSubmit.value = data.enabled === true
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
// 實作在 ~/composables/useAdminStats；解構名稱與原本一致，template 無需改動。
const {
  loading: statsLoading,
  startDate: statsStartDate,
  endDate: statsEndDate,
  maxDate: statsMaxDate,
  lastHourUploads: statsLastHourUploads,
  permissionDenied: statsPermissionDenied,
  presets: statsPresets,
  activePreset: activeStatsPreset,
  applyPreset: applyStatsPreset,
  rangeDays: statsRangeDays,
  rangeLabel: statsRangeLabel,
  rangeIncludesToday: statsRangeIncludesToday,
  showHourBreakdown: statsShowHourBreakdown,
  useHeatmap: statsUseHeatmap,
  trendTitle: statsTrendTitle,
  breakdownTitle: statsBreakdownTitle,
  breakdownSubtitle: statsBreakdownSubtitle,
  rangeUploads: statsRangeUploads,
  avgPerDay: statsAvgPerDay,
  peakDay: statsPeakDay,
  hasNoData: statsHasNoData,
  trendChartOption,
  hourProfileChartOption,
  heatmapChartOption,
  load: loadStats
} = useAdminStats(db, {
  onError: (message) => showAdminToast('error', message)
})

// 便利貼清單
const NOTES_PAGE_SIZE = 20
const pendingNotes = ref<any[]>([])
const historyNotes = ref<any[]>([])

// ── 投稿者 ────────────────────────────────────────────────
// 便利貼上沒有投稿者（便利貼公開可讀），投稿者在 note_owners/{noteId}，
// 暱稱又在 users/{uid}。兩層都放快取：一頁 20 張的投稿者一次查完
// （getDocsByIds 每 30 個一組），暱稱則同一個人翻再多頁也只讀一次。
// 兩個快取都用空字串代表「查過了但沒有」，與「還沒查」（undefined）要分得開。
const noteOwnerUids = ref<Record<string, string>>({})
const submitterNames = ref<Record<string, string>>({})

const loadSubmitters = async (notes: Array<{ id?: string }>) => {
  const missingNotes = notes
    .map(note => note.id)
    .filter((id): id is string => !!id && noteOwnerUids.value[id] === undefined)
  if (missingNotes.length > 0) {
    try {
      const owners = await loadOwners(missingNotes)
      missingNotes.forEach((id) => { noteOwnerUids.value[id] = owners[id] ?? '' })
    } catch (e) {
      console.warn('[admin] 讀取投稿者失敗', e)
    }
  }

  const missingUids = [...new Set(
    notes
      .map(note => (note.id ? noteOwnerUids.value[note.id] : ''))
      .filter((uid): uid is string => !!uid && submitterNames.value[uid] === undefined)
  )]
  await Promise.all(missingUids.map(async (uid) => {
    try {
      const snap = await getDoc(doc(db, cols.users, uid))
      submitterNames.value[uid] = snap.exists() ? (snap.get('displayName') || '') : ''
    } catch (e) {
      console.warn('[admin] 讀取投稿者暱稱失敗', uid, e)
      submitterNames.value[uid] = ''
    }
  }))
}

/** 這張便利貼的投稿者 uid。undefined = 還在查；'' = 沒有紀錄 */
const ownerOf = (note: { id?: string }): string | undefined =>
  note.id ? noteOwnerUids.value[note.id] : ''

/**
 * 沒有投稿者紀錄的是 LINE 登入上線之前送出的便利貼（匿名時期），
 * 或投稿者已經申請刪除個資——這在後台是正常狀態，不是資料壞掉。
 */
const submitterLabel = (note: { id?: string }): string => {
  const uid = ownerOf(note)
  if (uid === undefined) return '載入中…'
  if (!uid) return '舊資料'
  const name = submitterNames.value[uid]
  if (name === undefined) return '載入中…'
  // 同名的人不少，末四碼讓店員分得出來；完整 uid 放在 title 供複製
  const shortId = uid.replace(/^line:/, '').slice(-4)
  return name ? `${name}（…${shortId}）` : `未命名（…${shortId}）`
}

watch([pendingNotes, historyNotes], ([pending, history]) => {
  void loadSubmitters([...pending, ...history])
})
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
  collectionName: string,
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
    const snapshot = await getDocs(buildNotesQuery(cols.queuePending, 'timestamp', 'asc', cursor, false))
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
    const snapshot = await getDocs(buildNotesQuery(cols.queueHistory, 'playedAt', 'desc', cursor, false))
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
    const countSnap = await getCountFromServer(collection(db, cols.queuePending))
    pendingNotesTotal.value = countSnap.data().count

    const cursor = pendingNotesPage.value > 1
      ? pendingNotesPageCursors[pendingNotesPage.value - 2]
      : null

    const snapshot = await getDocs(buildNotesQuery(cols.queuePending, 'timestamp', 'asc', cursor))
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
    const countSnap = await getCountFromServer(collection(db, cols.queueHistory))
    historyNotesTotal.value = countSnap.data().count

    const cursor = historyNotesPage.value > 1
      ? historyNotesPageCursors[historyNotesPage.value - 2]
      : null

    const snapshot = await getDocs(buildNotesQuery(cols.queueHistory, 'playedAt', 'desc', cursor))
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
    const { id, isPending } = deleteModalData.value
    const list = isPending ? pendingNotes.value : historyNotes.value
    // 連同 Storage 上的手繪圖一起刪（順序與理由見 useMemberAdmin.deleteNote）。
    // 圖片網址從記憶體裡的清單拿，不必重新查詢
    const style = list.find(note => note.id === id)?.style
    await deleteNote({ id, isPending, style })
    if (isPending) {
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

// ── 投稿頻率限制 ──────────────────────────────────────────
// 寫入 system/editor_rate_limit。**文件不存在時規則會套用預設值而不是放行**
// ——這與 GPS 圍籬相反，理由寫在 firestore.rules。所以這裡顯示的預設值
// 與規則裡寫死的那一組必須一致，兩邊都引用 DEFAULT_RATE_LIMIT。
const rateLimitEnabled = ref(DEFAULT_RATE_LIMIT.enabled)
const rateCooldownInput = ref(String(DEFAULT_RATE_LIMIT.cooldownMinutes))
const rateDailyLimitInput = ref(String(DEFAULT_RATE_LIMIT.dailyLimit))
const isSavingRateLimit = ref(false)
let unsubRateLimit: (() => void) | null = null

const startRateLimitListener = () => {
  unsubRateLimit = onSnapshot(doc(db, 'system', 'editor_rate_limit'), (snap) => {
    if (!snap.exists()) {
      rateLimitEnabled.value = DEFAULT_RATE_LIMIT.enabled
      rateCooldownInput.value = String(DEFAULT_RATE_LIMIT.cooldownMinutes)
      rateDailyLimitInput.value = String(DEFAULT_RATE_LIMIT.dailyLimit)
      return
    }
    const data = snap.data() as Partial<RateLimitConfig>
    rateLimitEnabled.value = data.enabled !== false
    rateCooldownInput.value = String(
      Number.isFinite(data.cooldownMinutes) ? data.cooldownMinutes : DEFAULT_RATE_LIMIT.cooldownMinutes
    )
    rateDailyLimitInput.value = String(
      Number.isFinite(data.dailyLimit) ? data.dailyLimit : DEFAULT_RATE_LIMIT.dailyLimit
    )
  })
}

const resetRateLimitToDefaults = () => {
  rateLimitEnabled.value = DEFAULT_RATE_LIMIT.enabled
  rateCooldownInput.value = String(DEFAULT_RATE_LIMIT.cooldownMinutes)
  rateDailyLimitInput.value = String(DEFAULT_RATE_LIMIT.dailyLimit)
  showAdminToast('success', '已套用預設值，記得按「儲存頻率設定」')
}

const saveRateLimitSettings = async () => {
  const cooldownMinutes = Number(rateCooldownInput.value)
  const dailyLimit = Number(rateDailyLimitInput.value)

  if (!Number.isInteger(cooldownMinutes) || cooldownMinutes < 0) {
    showAdminToast('error', '間隔時間需為 0 或正整數（分鐘）')
    return
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    showAdminToast('error', '每日上限需為大於 0 的整數')
    return
  }

  isSavingRateLimit.value = true
  try {
    await setDoc(
      doc(db, 'system', 'editor_rate_limit'),
      { enabled: rateLimitEnabled.value, cooldownMinutes, dailyLimit },
      { merge: true }
    )
    showAdminToast('success', '投稿頻率設定已儲存')
  } catch (err) {
    console.error('[admin] 儲存頻率設定失敗', err)
    showAdminToast('error', '儲存頻率設定失敗，請稍後再試')
  } finally {
    isSavingRateLimit.value = false
  }
}

// ── 會員 ─────────────────────────────────────────────────
// 清單在這裡，單一會員的所有操作（看便利貼、封鎖、刪個資）在 AdminMemberPanel。

/** 開著的會員面板。null = 關著 */
const memberPanelUid = ref<string | null>(null)
const memberUidInput = ref('')

const openMemberByUid = () => {
  const uid = memberUidInput.value.trim()
  if (uid) memberPanelUid.value = uid
}

/**
 * 整份停權名單。便利貼卡片與會員清單上的「已封鎖」都查這一份，
 * 不逐筆去讀 —— 名單很短，一次讀完比每個投稿者多讀一次便宜。
 */
const bans = ref<Map<string, BannedUser>>(new Map())

const loadBans = async () => {
  try {
    bans.value = await listBans()
  } catch (err) {
    console.error('[admin] 載入停權名單失敗', err)
  }
}

type MemberFilter = 'all' | 'banned'
const memberFilter = ref<MemberFilter>('all')
const memberRows = ref<MemberRow[]>([])
const memberHasMore = ref(false)
const memberListLoading = ref(false)
let memberCursor: QueryDocumentSnapshot | null = null
let memberListLoaded = false

const loadMembers = async (reset: boolean) => {
  if (memberListLoading.value) return
  memberListLoading.value = true
  try {
    const page = await listMembers(reset ? null : memberCursor)
    memberRows.value = reset ? page.members : [...memberRows.value, ...page.members]
    memberCursor = page.cursor
    memberHasMore.value = page.hasMore
    memberListLoaded = true
  } catch (err) {
    console.error('[admin] 載入會員清單失敗', err)
    showAdminToast('error', '載入會員清單失敗，請稍後再試')
  } finally {
    memberListLoading.value = false
  }
}

const formatShortUid = (uid: string) => `…${uid.replace(/^line:/, '').slice(-4)}`

interface MemberListRow {
  uid: string
  name: string
  avatar?: string
  subtitle: string
}

const visibleMemberRows = computed<MemberListRow[]>(() => {
  if (memberFilter.value === 'banned') {
    // 停權名單裡的人可能已經刪了個資，所以名字用封鎖當下存的快照；
    // 頭貼只有剛好也在上面清單裡的人才有
    const avatars = new Map(memberRows.value.map(m => [m.uid, m.avatar]))
    return [...bans.value].map(([uid, ban]) => ({
      uid,
      name: ban.displayName,
      avatar: avatars.get(uid),
      subtitle: `封鎖於 ${formatTime(ban.bannedAt)}${ban.reason ? ` · ${ban.reason}` : ''}`
    }))
  }
  return memberRows.value.map(m => ({
    uid: m.uid,
    name: m.displayName,
    avatar: m.avatar,
    subtitle: `最近登入 ${formatTime(m.updatedAt)} · ${formatShortUid(m.uid)}`
  }))
})

// 清單等第一次切到「會員」分頁才讀，沒打開過就不花這筆讀取
watch(activeAdminTab, (tab) => {
  if (tab === 'members' && !memberListLoaded) void loadMembers(true)
})

/** 面板裡做了任何變更（刪便利貼、封鎖、刪個資）之後，外面看得到的地方都要跟著更新 */
const onMemberChanged = async (uid: string) => {
  // 暱稱與投稿者紀錄都可能被刪掉了（刪除個資），這個人相關的快取全部作廢、重新查
  delete submitterNames.value[uid]
  for (const [noteId, ownerUid] of Object.entries(noteOwnerUids.value)) {
    if (ownerUid === uid) delete noteOwnerUids.value[noteId]
  }
  await Promise.all([
    loadBans(),
    loadPendingNotesPage(),
    loadHistoryNotesPage(),
    memberListLoaded ? loadMembers(true) : Promise.resolve()
  ])
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

// 統計的預設日期與 30 秒自動刷新由 useAdminStats 自行掛載／卸載
onMounted(() => {
  startNotesListeners()
  // 便利貼卡片上要標「已封鎖」，跟便利貼一起載
  void loadBans()
  startTokenRequirementListener()
  startGpsFenceListener()
  startRateLimitListener()
  startCanvasVideoListener()
})

onUnmounted(() => {
  if (adminToastTimer) {
    clearTimeout(adminToastTimer)
    adminToastTimer = null
  }
  unsubTokenRequirement?.()
  unsubTokenRequirement = null
  unsubCanvasVideo?.()
  unsubCanvasVideo = null
  unsubGpsFence?.()
  unsubGpsFence = null
  unsubRateLimit?.()
  unsubRateLimit = null
  clearQrCode()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_admin.scss */
</style>
