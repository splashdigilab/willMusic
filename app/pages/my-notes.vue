<template>
  <div class="p-my-notes">
    <div class="p-my-notes__container">
      <header class="p-my-notes__header">
        <NuxtLink to="/" class="p-index__icon-btn" aria-label="回到首頁">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6"></path>
          </svg>
        </NuxtLink>
        <h1 class="p-my-notes__title">我的便利貼</h1>
      </header>

      <div v-if="!authReady" class="p-my-notes__hint">載入中…</div>

      <!-- 直接打開這個網址、但沒登入的人 -->
      <section v-else-if="!isMember" class="p-my-notes__empty">
        <div class="p-my-notes__empty-art" aria-hidden="true"><i /><i /><i /></div>
        <p class="p-my-notes__empty-title">用 LINE 登入</p>
        <p class="p-my-notes__empty-text">就可以看到自己送出的便利貼<br>以及今天還能送幾張</p>
        <p v-if="loginError" class="p-my-notes__signin-error">{{ loginError }}</p>
        <button type="button" class="p-my-notes__btn p-my-notes__btn--line" @click="startLogin(route.path)">
          LINE 登入
        </button>
      </section>

      <template v-else>
        <!-- 額度：冷卻中每秒倒數 -->
        <section class="p-my-notes__quota">
          <template v-if="quotaKind === 'banned'">
            <p class="p-my-notes__quota-alert">這個帳號已停止投稿資格</p>
            <p class="p-my-notes__quota-note">如有疑問，請洽現場工作人員。</p>
          </template>

          <!-- 後台關掉頻率限制、或讀不到用量：不猜數字，只留一句話和按鈕 -->
          <p v-else-if="quotaKind === 'unlimited'" class="p-my-notes__quota-note">
            畫一張應援便利貼，送上 LED 大螢幕
          </p>

          <template v-else>
            <div class="p-my-notes__quota-row">
              <div>
                <p class="p-my-notes__quota-label">今天還能送</p>
                <p class="p-my-notes__quota-count" :class="{ 'is-loading': quotaKind === 'loading' }">
                  <strong>{{ quotaRemaining ?? '–' }}</strong>
                  <span v-if="quotaUsage">/ {{ quotaUsage.dailyLimit }} 張</span>
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

          <NuxtLink v-if="canMakeMore" to="/editor" class="p-my-notes__btn">＼ 製作便利貼 ／</NuxtLink>
        </section>

        <div v-if="notesLoading" class="p-my-notes__hint">載入中…</div>

        <div v-else-if="notes.length === 0" class="p-my-notes__empty">
          <div class="p-my-notes__empty-art" aria-hidden="true"><i /><i /><i /></div>
          <p class="p-my-notes__empty-title">{{ myIds.length ? '目前沒有可以顯示的便利貼' : '還沒有送出過便利貼' }}</p>
          <p class="p-my-notes__empty-text">送出的便利貼會出現在這裡<br>還能看到它排到第幾、什麼時候上牆</p>
        </div>

        <template v-else>
          <!-- 排隊中的在前：使用者最想知道的是「我那張什麼時候上牆」 -->
          <section v-if="pendingNotes.length" class="p-my-notes__section">
            <h2 class="p-my-notes__section-title">排隊中<span>{{ pendingNotes.length }}</span></h2>
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
                    <p class="p-my-notes__ticket-main">輪到你了！</p>
                    <p class="p-my-notes__ticket-sub">請看 LED 牆</p>
                  </template>
                  <template v-else>
                    <p class="p-my-notes__ticket-main">前面還有 <strong>{{ queueAhead(note) }}</strong> 張</p>
                  </template>
                  <p class="p-my-notes__time">送出於 {{ formatTime(note.timestamp) }}</p>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="playedNotes.length" class="p-my-notes__section">
            <h2 class="p-my-notes__section-title">已上牆<span>{{ playedNotes.length }}</span></h2>
            <ul class="p-my-notes__gallery">
              <li v-for="note in playedNotes" :key="note.id" class="p-my-notes__tile">
                <div class="p-my-notes__thumb">
                  <StickyNote :note="note" />
                </div>
                <p class="p-my-notes__time">{{ formatTime(note.playedAt) }} 上牆</p>
              </li>
            </ul>
          </section>
        </template>

        <!-- 還沒送過的人不需要先讀到「會被撤下」 -->
        <p v-if="myIds.length" class="p-my-notes__footnote">不符合活動規範的便利貼會被撤下，不會出現在這裡。</p>
      </template>
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

const route = useRoute()
const { $firestore } = useNuxtApp() as any
const cols = useCollections()
const { ready: authReady, isMember, user, startLogin, completeLoginReturn } = useMemberAuth()

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
    case 'exhausted': return '明天再來吧！'
    case 'cooldown': return `${quotaWaitText.value} 後可以送`
    case 'ready': return '現在就可以送'
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

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 今天的只寫時間；活動多半是當天，日期是多餘的 */
const formatTime = (ts: any): string => {
  const date: Date | undefined = ts?.toDate?.()
  if (!date) return '—'
  const hm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (date.toDateString() === new Date().toDateString()) return `今天 ${hm}`
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${hm}`
}

watch(() => (isMember.value ? user.value?.uid : null), (uid) => {
  clearNotes()
  resetQuota()
  if (!uid) return
  void loadNotes(uid)
  void loadQuota()
}, { immediate: true })

// ── 從這一頁登入 ──────────────────────────────────────
// 沒登入的人點頭像的「我的便利貼」、或直接打開這個網址，都會落在這裡。
const loginError = ref('')

onMounted(async () => {
  if (await completeLoginReturn() === 'error') {
    loginError.value = '登入沒有完成，請再試一次。'
  }
})

onUnmounted(() => {
  unsubPending?.()
  unsubPending = null
})
</script>
