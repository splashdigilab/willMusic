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
      <section v-else-if="!isMember" class="p-my-notes__card p-my-notes__signin">
        <p class="p-my-notes__signin-text">用 LINE 登入後，可以看到自己送出的便利貼，以及今天還能送幾張。</p>
        <p v-if="loginError" class="p-my-notes__signin-error">{{ loginError }}</p>
        <button type="button" class="p-my-notes__btn p-my-notes__btn--line" @click="startLogin(route.path)">
          LINE 登入
        </button>
      </section>

      <template v-else>
        <!-- 額度：冷卻中每秒倒數 -->
        <section class="p-my-notes__card p-my-notes__quota">
          <p v-if="quotaHeadline" class="p-my-notes__quota-main" :class="{ 'is-warning': quotaBlocked }">
            {{ quotaHeadline }}
          </p>
          <p v-if="quotaSub" class="p-my-notes__quota-sub">{{ quotaSub }}</p>
          <NuxtLink v-if="canMakeMore" to="/editor" class="p-my-notes__btn">＼ 製作便利貼 ／</NuxtLink>
        </section>

        <div v-if="notesLoading" class="p-my-notes__hint">載入中…</div>
        <div v-else-if="notes.length === 0" class="p-my-notes__hint">還沒有送出過便利貼</div>
        <ul v-else class="p-my-notes__list">
          <li v-for="note in notes" :key="note.id" class="p-my-notes__item">
            <div class="p-my-notes__thumb">
              <StickyNote :note="note" />
            </div>
            <div class="p-my-notes__meta">
              <p class="p-my-notes__status" :class="`is-${statusKind(note)}`">{{ statusText(note) }}</p>
              <p class="p-my-notes__time">送出於 {{ formatTime(note.timestamp) }}</p>
            </div>
          </li>
        </ul>

        <p class="p-my-notes__footnote">不符合活動規範的便利貼會被撤下，不會出現在這裡。</p>
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

const quotaHeadline = computed(() => {
  switch (quotaKind.value) {
    case 'loading': return '讀取中…'
    case 'banned': return '這個帳號已停止投稿資格'
    case 'exhausted': return `今天的 ${quotaUsage.value?.dailyLimit} 張已經送完了`
    case 'cooldown': return `${quotaWaitText.value} 後可以送下一張`
    case 'ready': return '現在就可以送'
    // 後台關掉頻率限制、或讀不到用量：不猜數字，只留下面的按鈕
    default: return ''
  }
})

const quotaSub = computed(() => {
  switch (quotaKind.value) {
    case 'banned': return '如有疑問，請洽現場工作人員。'
    case 'exhausted': return '明天再來吧！'
    case 'cooldown':
    case 'ready': return `今天還能送 ${quotaRemaining.value} 張`
    default: return ''
  }
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
      },
      (err) => console.error('[my-notes] 監聽待播佇列失敗', err)
    )
  } catch (err) {
    console.error('[my-notes] 讀取我的便利貼失敗', err)
  } finally {
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

/** 新送出的在前。兩邊都找不到的（被撤下）不顯示 */
const notes = computed<MyNote[]>(() => {
  const list: MyNote[] = []
  for (const id of myIds.value) {
    const data = myPending.value[id] ?? myHistory.value[id]
    if (data) list.push({ ...data, id })
  }
  return list.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
})

const statusKind = (note: MyNote): 'now' | 'waiting' | 'played' => {
  if (note.status === 'played') return 'played'
  return pendingOrder.value.indexOf(note.id) <= 0 ? 'now' : 'waiting'
}

const statusText = (note: MyNote): string => {
  if (note.status === 'played') {
    return `已上牆 · ${formatTime((note as QueueHistoryItem).playedAt)}`
  }
  // 位置 0 可能是正在播、也可能是下一張：兩種都是「現在去看牆」
  const ahead = pendingOrder.value.indexOf(note.id)
  return ahead <= 0 ? '輪到你了，請看 LED 牆！' : `排隊中，前面還有 ${ahead} 張`
}

const formatTime = (ts: any): string => {
  const date = ts?.toDate?.()
  if (!date) return '—'
  return date.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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
