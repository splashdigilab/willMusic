<template>
  <div class="p-my-notes">
    <div class="p-my-notes__container">
      <header class="p-my-notes__header">
        <NuxtLink to="/" class="p-index__icon-btn" :aria-label="t.myNotes.backHome">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6"></path>
          </svg>
        </NuxtLink>
        <h1 class="p-my-notes__title">{{ t.myNotes.title }}</h1>
      </header>

      <div v-if="!authReady" class="p-my-notes__hint">{{ t.common.loading }}</div>

      <!-- 直接打開這個網址、但沒登入的人 -->
      <section v-else-if="!isMember" class="p-my-notes__empty">
        <div class="p-my-notes__empty-art" aria-hidden="true"><i /><i /><i /></div>
        <p class="p-my-notes__empty-title">{{ t.myNotes.login.title }}</p>
        <p class="p-my-notes__empty-text"><template v-for="(line, i) in t.myNotes.login.text" :key="i"><br v-if="i > 0">{{ line }}</template></p>
        <p v-if="loginFailed" class="p-my-notes__signin-error">{{ t.myNotes.login.failed }}</p>
        <button type="button" class="p-my-notes__btn p-my-notes__btn--line" @click="startLogin(route.path)">
          {{ t.myNotes.login.button }}
        </button>
        <LoginDataNotice />
      </section>

      <template v-else>
        <!-- 額度：冷卻中每秒倒數 -->
        <section class="p-my-notes__quota">
          <template v-if="quotaKind === 'banned'">
            <p class="p-my-notes__quota-alert">{{ t.myNotes.quota.banned }}</p>
            <p class="p-my-notes__quota-note">{{ t.myNotes.quota.bannedNote }}</p>
          </template>

          <!-- 後台關掉頻率限制、或讀不到用量：不猜數字，只留一句話和按鈕 -->
          <p v-else-if="quotaKind === 'unlimited'" class="p-my-notes__quota-note">
            {{ t.myNotes.quota.unlimited }}
          </p>

          <template v-else>
            <div class="p-my-notes__quota-row">
              <div>
                <p class="p-my-notes__quota-label">{{ t.myNotes.quota.label }}</p>
                <p class="p-my-notes__quota-count" :class="{ 'is-loading': quotaKind === 'loading' }">
                  <strong>{{ quotaRemaining ?? '–' }}</strong>
                  <span v-if="quotaUsage">{{ t.myNotes.quota.of(quotaUsage.dailyLimit) }}</span>
                </p>
              </div>
              <span v-if="quotaChip" class="p-my-notes__chip" :class="{ 'is-warning': quotaBlocked }">
                {{ quotaChip }}
              </span>
            </div>
            <!-- 一格一張：用掉的變灰。上限太多格子會擠成一條線，就只留數字 -->
            <ol v-if="quotaPips" class="p-my-notes__pips" aria-hidden="true">
              <li v-for="n in quotaPips.total" :key="n" :class="{ 'is-used': n > quotaPips.left }" />
            </ol>
            <!-- 讀取中先佔住格子的高度，讀完卡片才不會往下長 -->
            <ol v-else-if="quotaKind === 'loading'" class="p-my-notes__pips" aria-hidden="true">
              <li class="is-used" />
            </ol>
          </template>

          <NuxtLink v-if="canMakeMore" to="/editor" class="p-my-notes__btn">{{ t.myNotes.quota.makeNote }}</NuxtLink>
          <LineFriendPrompt />
        </section>

        <div v-if="notesLoading" class="p-my-notes__hint">{{ t.common.loading }}</div>

        <div v-else-if="notes.length === 0" class="p-my-notes__empty">
          <div class="p-my-notes__empty-art" aria-hidden="true"><i /><i /><i /></div>
          <p class="p-my-notes__empty-title">{{ myIds.length ? t.myNotes.empty.hidden : t.myNotes.empty.none }}</p>
          <p class="p-my-notes__empty-text"><template v-for="(line, i) in t.myNotes.empty.text" :key="i"><br v-if="i > 0">{{ line }}</template></p>
        </div>

        <template v-else>
          <!-- 排隊中的在前：使用者最想知道的是「我那張什麼時候上牆」 -->
          <section v-if="pendingNotes.length" class="p-my-notes__section">
            <h2 class="p-my-notes__section-title">{{ t.myNotes.pending }}<span>{{ pendingNotes.length }}</span></h2>
            <ul class="p-my-notes__queue">
              <li
                v-for="note in pendingNotes"
                :key="note.id"
                class="p-my-notes__ticket"
                :class="{ 'is-now': queueAhead(note) === 0 }"
              >
                <div class="p-my-notes__thumb">
                  <StickyNote :note="note" />
                </div>
                <div class="p-my-notes__ticket-meta">
                  <!-- 位置 0 可能是正在播、也可能是下一張：兩種都是「現在去看牆」 -->
                  <template v-if="queueAhead(note) === 0">
                    <p class="p-my-notes__ticket-main">{{ t.myNotes.yourTurn }}</p>
                    <p class="p-my-notes__ticket-sub">{{ t.myNotes.watchScreen }}</p>
                  </template>
                  <template v-else>
                    <!-- 張數要放大加粗，字拆成前後兩段（前後的空白在翻譯檔裡） -->
                    <p class="p-my-notes__ticket-main">{{ t.myNotes.aheadBefore }}<strong>{{ queueAhead(note) }}</strong>{{ t.myNotes.aheadAfter(queueAhead(note)) }}</p>
                  </template>
                  <p class="p-my-notes__time">{{ t.myNotes.sentAt(formatTime(note.timestamp)) }}</p>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="playedNotes.length" class="p-my-notes__section">
            <h2 class="p-my-notes__section-title">{{ t.myNotes.played }}<span>{{ playedNotes.length }}</span></h2>
            <ul class="p-my-notes__gallery">
              <li v-for="note in playedNotes" :key="note.id" class="p-my-notes__tile">
                <div class="p-my-notes__thumb">
                  <StickyNote :note="note" />
                </div>
                <p class="p-my-notes__time">{{ t.myNotes.shownAt(formatTime(note.playedAt)) }}</p>
              </li>
            </ul>
          </section>
        </template>

        <!-- 行銷信的同意。隱私權政策寫的是「可以隨時取消」，
             只放在送出確認畫面的話，要取消就得先做一張便利貼，所以這裡也要有。
             沒有 email（LINE 沒給）就不出現：沒有地址，勾了也沒用 -->
        <label v-if="marketingEmail" class="p-my-notes__marketing">
          <input
            type="checkbox"
            class="p-my-notes__marketing-input"
            :checked="marketingOptIn"
            :disabled="marketingSaving"
            @change="onMarketingToggle"
          />
          <span class="p-my-notes__marketing-text">
            {{ t.myNotes.marketing }}
            <!-- data-clarity-mask：Clarity 錄頁面時遮掉 email（見 MemberBadge.vue） -->
            <span class="p-my-notes__marketing-email" data-clarity-mask="True">{{ t.myNotes.marketingTo(marketingEmail) }}</span>
          </span>
        </label>
      </template>

      <!-- 左上的圓鈕長得像「上一頁」，使用者認不出它會回首頁，所以頁尾再放一顆寫明的。
           未登入、空狀態也都要有：這頁本身沒有其他出口 -->
      <footer class="p-my-notes__footer">
        <NuxtLink to="/" class="p-my-notes__btn p-my-notes__btn--home">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 10.5L12 3l9 7.5"></path>
            <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9"></path>
          </svg>
          {{ t.myNotes.backHome }}
        </NuxtLink>
        <!-- 還沒送過的人不需要先讀到「會被撤下」 -->
        <p v-if="myIds.length" class="p-my-notes__footnote">{{ t.myNotes.footnote }}</p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, onMounted } from 'vue'
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where
} from 'firebase/firestore'
import type { QueueHistoryItem, QueuePendingItem } from '~/types'
import { getDocsByIds } from '~/utils/firestore-batch'
import { HTML_LANG } from '~/utils/i18n'
import StickyNote from '~/components/StickyNote.vue'

/**
 * 我的便利貼：這個 LINE 帳號送過的每一張，以及今天還能送幾張。
 *
 * 使用者真正想知道的是「我那張什麼時候上牆」—— 送出後的等待頁只在當下看得到，
 * 一離開就沒有線索了。所以每張都標「排隊中，前面還有 N 張」或「已上牆」，
 * 人才知道什麼時候該抬頭看 LED 牆。
 *
 * 資料來源：
 *   note_owners（where uid == 自己）→ 我的便利貼 ID
 *   queue_pending 即時監聽 → 排隊位置（大螢幕依 timestamp 由舊到新播放，見 useConductor）
 *   queue_history 依 ID 讀 → 已上牆的那幾張
 * 兩邊都找不到的是被後台撤下的，直接不顯示（頁尾有一行說明）。
 */
definePageMeta({ layout: false, ssr: false })

const { t, locale } = useI18n()
usePageSeo(() => t.value.seo.myNotes.title, () => t.value.seo.myNotes.description)

const route = useRoute()
const { $firestore } = useNuxtApp() as any
const cols = useCollections()
const { ready: authReady, isMember, user, profile, startLogin, completeLoginReturn } = useMemberAuth()
const { getProfile, setMarketingOptIn } = useMemberProfile()

// ── 額度 ──────────────────────────────────────────────
const {
  load: loadQuota,
  reset: resetQuota,
  usage: quotaUsage,
  kind: quotaKind,
  isBlocked: quotaBlocked,
  remaining: quotaRemaining,
  waitText: quotaWaitText
} = useQuotaStatus()

/** 張數旁邊的狀態標籤。停權與 unlimited 不走這一格（版面另外處理） */
const quotaChip = computed(() => {
  switch (quotaKind.value) {
    case 'exhausted': return t.value.myNotes.quota.exhausted
    case 'cooldown': return t.value.myNotes.quota.cooldown(quotaWaitText.value)
    case 'ready': return t.value.myNotes.quota.ready
    default: return ''
  }
})

/** 額度格子。上限超過這個數，格子會細到看不出是一格一張 */
const MAX_PIPS = 10
const quotaPips = computed(() => {
  const total = quotaUsage.value?.dailyLimit ?? 0
  if (total <= 0 || total > MAX_PIPS) return null
  return { total, left: quotaRemaining.value ?? 0 }
})

// 冷卻中還是可以先開始畫（畫完差不多就能送了）；停權或今天用完就不必
const canMakeMore = computed(() => quotaKind.value !== 'banned' && quotaKind.value !== 'exhausted')

// ── 便利貼 ────────────────────────────────────────────
type MyNote = (QueuePendingItem | QueueHistoryItem) & { id: string }

const notesLoading = ref(false)
const myIds = ref<string[]>([])
/** 整條待播佇列的 ID，依播放順序。算「前面還有幾張」用 */
const pendingOrder = ref<string[]>([])
const myPending = ref<Record<string, QueuePendingItem>>({})
const myHistory = ref<Record<string, QueueHistoryItem>>({})

let unsubPending: (() => void) | null = null

const fetchHistory = async (ids: string[]) => {
  const docs = await getDocsByIds($firestore, cols.queueHistory, ids)
  docs.forEach((d) => { myHistory.value[d.id] = d.data() as QueueHistoryItem })
}

const loadNotes = async (uid: string) => {
  notesLoading.value = true
  try {
    const ownerSnap = await getDocs(query(collection($firestore, cols.noteOwners), where('uid', '==', uid)))
    myIds.value = ownerSnap.docs.map(d => d.id)
    const mine = new Set(myIds.value)

    // 一張都沒送過：不必監聽整條佇列
    if (mine.size === 0) {
      notesLoading.value = false
      return
    }

    await fetchHistory(myIds.value)

    // 待播佇列即時監聽：位置會隨大螢幕播放往前推，播完的那張要換成歷史紀錄
    unsubPending?.()
    unsubPending = onSnapshot(
      query(collection($firestore, cols.queuePending), orderBy('timestamp', 'asc')),
      (snap) => {
        const leftQueue = Object.keys(myPending.value).filter(id => !snap.docs.some(d => d.id === id))
        pendingOrder.value = snap.docs.map(d => d.id)
        myPending.value = Object.fromEntries(
          snap.docs.filter(d => mine.has(d.id)).map(d => [d.id, d.data() as QueuePendingItem])
        )
        // 離開佇列 = 播完搬進歷史（或被撤下）。搬移是同一個 transaction，
        // 所以這時候歷史紀錄已經在了
        if (leftQueue.length > 0) void fetchHistory(leftQueue)
        // 第一份快照回來才算載完：之前只有歷史紀錄，還在排隊的那幾張會先被當成沒有，
        // 畫面閃一下「還沒有送出過便利貼」
        notesLoading.value = false
      },
      (err) => {
        console.error('[my-notes] 監聽待播佇列失敗', err)
        notesLoading.value = false
      }
    )
  } catch (err) {
    console.error('[my-notes] 讀取我的便利貼失敗', err)
    notesLoading.value = false
  }
}

const clearNotes = () => {
  unsubPending?.()
  unsubPending = null
  myIds.value = []
  pendingOrder.value = []
  myPending.value = {}
  myHistory.value = {}
}

const toMillis = (ts: any): number => ts?.toMillis?.() ?? 0

/** 兩邊都找不到的（被撤下）不顯示 */
const notes = computed<MyNote[]>(() => {
  const list: MyNote[] = []
  for (const id of myIds.value) {
    const data = myPending.value[id] ?? myHistory.value[id]
    if (data) list.push({ ...data, id })
  }
  return list
})

/** 前面還有幾張。位置 0 是正在播或下一張 */
const queueAhead = (note: MyNote): number => Math.max(0, pendingOrder.value.indexOf(note.id))

/** 快輪到的在前 */
const pendingNotes = computed(() =>
  notes.value
    .filter((n): n is QueuePendingItem & { id: string } => n.status !== 'played')
    .sort((a, b) => queueAhead(a) - queueAhead(b))
)

/** 最近上牆的在前 */
const playedNotes = computed(() =>
  notes.value
    .filter((n): n is QueueHistoryItem & { id: string } => n.status === 'played')
    .sort((a, b) => toMillis(b.playedAt) - toMillis(a.playedAt))
)

/**
 * 今天的只寫時間；活動多半是當天，日期是多餘的。
 *
 * 月日的寫法交給瀏覽器依介面語言決定（繁中、英、日是 10/12，韓文是 10. 12.）。
 * 時間一律 24 小時制：繁中、韓文預設是「下午 2:05」「오후 2:05」，比原本的 14:05 長，
 * 已上牆那一格只有半張卡寬。用 hourCycle 而不是 hour12: false —— 後者在部分瀏覽器會把午夜寫成 24:00。
 */
const formatTime = (ts: any): string => {
  const date: Date | undefined = ts?.toDate?.()
  if (!date) return '—'
  const lang = HTML_LANG[locale.value]
  const hm = date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  if (date.toDateString() === new Date().toDateString()) return t.value.myNotes.today(hm)
  return `${date.toLocaleDateString(lang, { month: '2-digit', day: '2-digit' })} ${hm}`
}

// ── 行銷信的同意 ──────────────────────────────────────
const storedEmail = ref<string | null>(null)
const marketingOptIn = ref(false)
const marketingSaving = ref(false)

/** 這次登入 LINE 有給就用這次的；沒給（同意畫面上取消了）就用之前存下來的 */
const marketingEmail = computed(() => profile.value?.lineEmail ?? storedEmail.value)

const loadMarketing = async () => {
  const stored = await getProfile()
  storedEmail.value = stored?.email ?? null
  // 正在存的時候不要被讀回來的舊值蓋掉
  if (!marketingSaving.value) marketingOptIn.value = stored?.marketingOptIn === true
}

/** 跟送出確認畫面同一套：先換畫面、再存，存失敗就退回去 */
const onMarketingToggle = async (e: Event) => {
  const email = marketingEmail.value
  if (!email) return
  const next = (e.target as HTMLInputElement).checked
  marketingOptIn.value = next
  marketingSaving.value = true
  const saved = await setMarketingOptIn(next, profile.value?.lineName ?? '', email)
  marketingSaving.value = false
  if (!saved) marketingOptIn.value = !next
}

watch(() => (isMember.value ? user.value?.uid : null), (uid) => {
  clearNotes()
  resetQuota()
  storedEmail.value = null
  marketingOptIn.value = false
  if (!uid) return
  void loadNotes(uid)
  void loadQuota()
  void loadMarketing()
}, { immediate: true })

// ── 從這一頁登入 ──────────────────────────────────────
// 沒登入的人點頭像的「我的便利貼」、或直接打開這個網址，都會落在這裡。
// 只記「失敗了」，字在畫面上才查：存成字串的話，之後切換語言那句話不會跟著換。
const loginFailed = ref(false)

onMounted(async () => {
  if (await completeLoginReturn() === 'error') {
    loginFailed.value = true
  }
})

onUnmounted(() => {
  unsubPending?.()
  unsubPending = null
})
</script>
