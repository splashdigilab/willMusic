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

          <!-- 被下架過、還沒到停權門檻的：提醒還剩幾次。停權的人上面已經寫了。
               到了門檻卻沒停權（店員解除了）的也不寫：「累計 3 張將停權」對他已經說不通 -->
          <p v-if="showStrikes" class="p-my-notes__strikes">{{ t.myNotes.strikes(strikes, STRIKE_LIMIT) }}</p>

          <NuxtLink v-if="canMakeMore" to="/editor" class="p-my-notes__btn">{{ t.myNotes.quota.makeNote }}</NuxtLink>
          <LineFriendPrompt />
        </section>

        <div v-if="notesLoading" class="p-my-notes__hint">{{ t.common.loading }}</div>

        <!-- 讀取失敗要跟「一張都沒有」分開：顯示成還沒送過，使用者會以為自己送的不見了 -->
        <div v-else-if="notesError" class="p-my-notes__empty" role="alert">
          <p class="p-my-notes__empty-title">{{ t.myNotes.loadError.title }}</p>
          <p class="p-my-notes__empty-text"><template v-for="(line, i) in t.myNotes.loadError.text" :key="i"><br v-if="i > 0">{{ line }}</template></p>
          <button type="button" class="p-my-notes__btn p-my-notes__btn--retry" @click="retryNotes">
            {{ t.myNotes.loadError.retry }}
          </button>
        </div>

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
                v-for="{ note, ahead } in pendingNotes"
                :key="note.id"
                class="p-my-notes__ticket"
                :class="{ 'is-now': ahead === 0 }"
              >
                <div class="p-my-notes__thumb">
                  <StickyNote :note="note" />
                </div>
                <div class="p-my-notes__ticket-meta">
                  <!-- 位置 0 可能是正在播、也可能是下一張：兩種都是「現在去看牆」 -->
                  <template v-if="ahead === 0">
                    <p class="p-my-notes__ticket-main">{{ t.myNotes.yourTurn }}</p>
                    <p class="p-my-notes__ticket-sub">{{ t.myNotes.watchScreen }}</p>
                  </template>
                  <!-- 位置還沒算出來（查詢失敗，下一輪會再算）就先不寫，不猜一個數字 -->
                  <template v-else-if="ahead !== undefined">
                    <!-- 張數要放大加粗，字拆成前後兩段（前後的空白在翻譯檔裡） -->
                    <p class="p-my-notes__ticket-main">{{ t.myNotes.aheadBefore }}<strong>{{ ahead }}</strong>{{ t.myNotes.aheadAfter(ahead) }}</p>
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
          <span class="p-my-notes__marketing-text">{{ t.myNotes.marketing }}</span>
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
  documentId,
  getCountFromServer,
  getDocs,
  onSnapshot,
  query,
  where
} from 'firebase/firestore'
import { STRIKE_LIMIT, type QueueHistoryItem, type QueuePendingItem } from '~/types'
import { chunkForInQuery, getDocsByIds } from '~/utils/firestore-batch'
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
 *   queue_history 依 ID 讀 → 已上牆的那幾張
 *   queue_pending 只監聽自己還沒上牆的那幾張 → 播完、被撤下時馬上知道
 *   排隊位置 → 數 queue_pending 裡比我早送出的有幾張（大螢幕依 timestamp 由舊到新播放，
 *     見 useConductor）。自己那張有變化時、以及每隔一段時間重算一次；
 *     快輪到時改成即時監聽前面那幾張（watchFront）
 * 兩邊都找不到的是被後台撤下的，直接不顯示（頁尾有一行說明）。
 *
 * 不監聽整條佇列：每份文件帶著頭貼最多約 30KB，每個開著這頁的人都讀一整條、
 * 之後每次有人送出或播完再讀一次，排隊的人一多就是一大筆讀取與流量。
 * count 查詢每 1000 筆才算一次讀取，也不傳文件內容。
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

// ── 違規次數 ──────────────────────────────────────────
const { getSelfStrikes } = useNoteModeration()
/** 被後台下架過幾張（恢復的不算）。讀不到當 0，見 getSelfStrikes */
const strikes = ref(0)

const loadStrikes = async (uid: string) => {
  const count = await getSelfStrikes()
  // 讀取途中換了帳號（或登出）：這份是上一個人的
  if (!isMember.value || user.value?.uid !== uid) return
  strikes.value = count
}

// 額度還在讀的時候不出現：停權的人讀完會換成停權的說明，先冒出來再消失很怪
const showStrikes = computed(() =>
  strikes.value > 0
  && strikes.value < STRIKE_LIMIT
  && quotaKind.value !== 'banned'
  && quotaKind.value !== 'loading'
)

// ── 便利貼 ────────────────────────────────────────────
type MyNote = (QueuePendingItem | QueueHistoryItem) & { id: string }

const toMillis = (ts: any): number => ts?.toMillis?.() ?? 0

const notesLoading = ref(false)
/** 讀取失敗。要跟「一張都沒有」分開顯示 */
const notesError = ref(false)
const myIds = ref<string[]>([])
const myPending = ref<Record<string, QueuePendingItem>>({})
const myHistory = ref<Record<string, QueueHistoryItem>>({})
/** 每張排隊中的便利貼前面還有幾張。還沒算出來的不在裡面 */
const aheadCounts = ref<Record<string, number>>({})

/** 排隊位置多久重算一次。自己那張播完會馬上重算，這個負責的是「前面的人播完了」 */
const AHEAD_REFRESH_MS = 25_000
/** 最前面那張的前面剩這麼多張以內，就改成即時監聽（見 watchFront） */
const NEAR_FRONT = 3

/**
 * 載入的世代。換帳號、按重試、離開頁面都會往前推一號；每個 await 回來先對一次，
 * 對不上就是過期的那一輪，不寫畫面也不掛監聽。
 * 少了這個，在讀取途中離開頁面的話，onUnmounted 早就跑完了，之後才掛上的監聽
 * 永遠不會被取消；讀取途中換帳號，也會把上一個人的便利貼寫進來。
 */
let loadGen = 0
let unsubPending: Array<() => void> = []
let aheadTimer: ReturnType<typeof setInterval> | null = null
/** 位置查詢的序號：快照與定時器可能同時在算，只收最後發出的那一次 */
let aheadRequest = 0
/** watchFront 正在即時盯著的那張與它的監聽 */
let frontId: string | null = null
let unsubFront: (() => void) | null = null

const stopFront = () => {
  unsubFront?.()
  unsubFront = null
  frontId = null
}

/** 停掉這一輪的監聽與定時重算 */
const stopWatching = () => {
  unsubPending.forEach(unsub => unsub())
  unsubPending = []
  stopFront()
  if (aheadTimer) {
    clearInterval(aheadTimer)
    aheadTimer = null
  }
}

const fetchHistory = async (ids: string[], gen: number) => {
  const docs = await getDocsByIds($firestore, cols.queueHistory, ids)
  if (gen !== loadGen) return
  docs.forEach((d) => { myHistory.value[d.id] = d.data() as QueueHistoryItem })
}

/**
 * 重算每張排隊中的便利貼前面還有幾張：queue_pending 裡比它早送出的張數。
 * 正在播的那張要等播完才搬走，所以也算在內 —— 位置 0 就是正在播或下一張。
 * 失敗就留著上一次的數字，下一輪再算。
 */
const refreshAhead = async (gen: number) => {
  const request = ++aheadRequest
  // watchFront 即時盯著的那張，數字由它的監聽更新，不必另外查
  const targets = Object.entries(myPending.value).filter(([id]) => id !== frontId)
  try {
    const counts = await Promise.all(targets.map(async ([id, note]) => {
      // 沒有送出時間的排不進順序（正常送出的都有），當作排在最前面
      if (!note.timestamp) return [id, 0] as const
      const snap = await getCountFromServer(
        query(collection($firestore, cols.queuePending), where('timestamp', '<', note.timestamp))
      )
      return [id, snap.data().count] as const
    }))
    if (gen !== loadGen || request !== aheadRequest) return
    const next: Record<string, number> = Object.fromEntries(counts)
    const frontAhead = frontId === null ? undefined : aheadCounts.value[frontId]
    if (frontId !== null && frontAhead !== undefined) next[frontId] = frontAhead
    aheadCounts.value = next
    watchFront(gen)
  } catch (err) {
    console.warn('[my-notes] 計算排隊位置失敗', err)
  }
}

/**
 * 自己最前面那張快輪到時（前面剩 NEAR_FRONT 張以內），改成即時監聽比它早送出的那幾張。
 * 一張只在大螢幕上播 15 秒左右，等定時重算的話，「輪到你了」可能在那張播完之後才出現。
 * 這個查詢的結果只會越來越少（之後送出的都比它晚），讀取就是那幾張、加上每播完一張一次。
 * 那張上牆或被撤下之後，換下一張重新判斷。
 */
const watchFront = (gen: number) => {
  const head = Object.entries(myPending.value)
    .sort(([, a], [, b]) => toMillis(a.timestamp) - toMillis(b.timestamp))[0]
  if (frontId !== null && frontId !== head?.[0]) stopFront()
  if (!head || frontId !== null) return

  const [id, note] = head
  const ahead = aheadCounts.value[id]
  if (!note.timestamp || ahead === undefined || ahead > NEAR_FRONT) return

  frontId = id
  let first = true
  unsubFront = onSnapshot(
    query(collection($firestore, cols.queuePending), where('timestamp', '<', note.timestamp)),
    (snap) => {
      // 快取來的可能只有其中幾張，張數會偏少、提早顯示「輪到你了」：只信伺服器回來的
      if (gen !== loadGen || frontId !== id || snap.metadata.fromCache) return
      aheadCounts.value = { ...aheadCounts.value, [id]: snap.size }
      if (first) {
        first = false
        return
      }
      // 前面少了一張，自己排在後面的其他幾張也跟著往前
      if (Object.keys(myPending.value).length > 1) void refreshAhead(gen)
    },
    (err) => {
      console.warn('[my-notes] 即時監聽前面的便利貼失敗，改回定時重算', err)
      if (frontId === id) {
        unsubFront = null
        frontId = null
      }
    }
  )
}

/**
 * 監聽自己還沒上牆的那幾張（documentId in，每 30 個一組）。
 * 回傳的 promise 在每一組都收到第一份快照時完成；第一份就失敗的話 reject。
 * 監聽一律登記在 unsubPending，由 stopWatching 收。
 */
/**
 * 監聽自己還在排隊的那幾張。第一份快照都到齊時 resolve，
 * 回傳的是「第一份快照全部來自伺服器」：離線時先到的是本機快取，空的不代表都播完了
 */
const watchPending = (ids: string[], gen: number): Promise<boolean> => {
  // 去歷史查過的不再查：被撤下的兩邊都找不到，之後每份快照都會再出現一次
  const lookedUp = new Set<string>()
  // 每一組都到齊之前，myPending 只有一部分：不重算位置，也不判斷「全部播完了」
  let allReady = false
  let allFromServer = true

  const chunks = chunkForInQuery(ids)

  const firstSnapshots = chunks.map(chunk => new Promise<void>((resolve, reject) => {
    let first = true
    unsubPending.push(onSnapshot(
      query(collection($firestore, cols.queuePending), where(documentId(), 'in', chunk)),
      (snap) => {
        if (gen !== loadGen) return
        const next = { ...myPending.value }
        chunk.forEach((id) => { delete next[id] })
        snap.docs.forEach((d) => { next[d.id] = d.data() as QueuePendingItem })
        myPending.value = next

        // 不在佇列、也還沒有歷史紀錄的：播完搬進歷史（搬移是同一個 transaction，
        // 這時候歷史紀錄已經在了），或被撤下。第一份快照也要查 ——
        // 讀完歷史到掛上監聽之間剛好播完的那張，不查的話兩邊都會漏掉。
        // 快取來的快照不查：它可能只是還沒拿到那張，記成查過的話，真的播完時就不會再查
        const left = snap.metadata.fromCache
          ? []
          : chunk.filter(id => !next[id] && !myHistory.value[id] && !lookedUp.has(id))
        if (left.length > 0) {
          left.forEach(id => lookedUp.add(id))
          fetchHistory(left, gen).catch(err => console.error('[my-notes] 讀取已上牆的便利貼失敗', err))
        }

        if (first) {
          first = false
          if (snap.metadata.fromCache) allFromServer = false
          resolve()
          return
        }
        if (!allReady) return
        // 自己那張播完或被撤下：排在後面的那幾張位置都變了
        void refreshAhead(gen)
        // 全部都離開佇列就收工，上牆的不會再回來。
        // 快取來的快照不算數：離線時它可能只是「還不知道」
        if (!snap.metadata.fromCache && Object.keys(next).length === 0) stopWatching()
      },
      (err) => {
        if (first) reject(err)
        else console.error('[my-notes] 監聽排隊中的便利貼失敗', err)
      }
    ))
  }))

  return Promise.all(firstSnapshots).then(() => {
    allReady = true
    return allFromServer
  })
}

const loadNotes = async (uid: string) => {
  const gen = ++loadGen
  notesLoading.value = true
  notesError.value = false
  try {
    const ownerSnap = await getDocs(query(collection($firestore, cols.noteOwners), where('uid', '==', uid)))
    if (gen !== loadGen) return
    myIds.value = ownerSnap.docs.map(d => d.id)

    await fetchHistory(myIds.value, gen)
    if (gen !== loadGen) return

    // 已經上牆的不會再回到佇列，只需要盯著剩下的。一張都不剩就不掛監聽、不算位置
    const waiting = myIds.value.filter(id => !myHistory.value[id])
    if (waiting.length > 0) {
      const fromServer = await watchPending(waiting, gen)
      if (gen !== loadGen) return
      // 位置算出來才算載完：先顯示的話，每張都會少一行「前面還有幾張」、過一下才冒出來
      await refreshAhead(gen)
      if (gen !== loadGen) return
      // 快取來的空結果不算數：離線時它可能只是還不知道。監聽留著，伺服器的回覆到了，
      // 真的全部離開佇列時監聽那邊會自己收工
      if (Object.keys(myPending.value).length > 0 || !fromServer) {
        // 分頁在背景時不查，回到分頁再馬上補一次（onVisibilityChange）
        aheadTimer = setInterval(() => {
          if (!document.hidden) void refreshAhead(gen)
        }, AHEAD_REFRESH_MS)
      } else {
        stopWatching()
      }
    }
    notesLoading.value = false
  } catch (err) {
    if (gen !== loadGen) return
    console.error('[my-notes] 讀取我的便利貼失敗', err)
    stopWatching()
    notesError.value = true
    notesLoading.value = false
  }
}

const clearNotes = () => {
  loadGen++
  stopWatching()
  notesLoading.value = false
  notesError.value = false
  myIds.value = []
  myPending.value = {}
  myHistory.value = {}
  aheadCounts.value = {}
}

/** 讀取失敗後的重試：整輪重來 */
const retryNotes = () => {
  const uid = isMember.value ? user.value?.uid : null
  if (!uid) return
  clearNotes()
  void loadNotes(uid)
}

/** 回到這個分頁時馬上重算一次位置：在背景時定時器不查，回來不必再等下一輪 */
const onVisibilityChange = () => {
  if (!document.hidden && aheadTimer) void refreshAhead(loadGen)
}

/** 兩邊都找不到的（被撤下）不顯示 */
const notes = computed<MyNote[]>(() => {
  const list: MyNote[] = []
  for (const id of myIds.value) {
    const data = myPending.value[id] ?? myHistory.value[id]
    if (data) list.push({ ...data, id })
  }
  return list
})

/**
 * 排隊中的，快輪到的在前（大螢幕依送出時間播放，送出時間的順序就是位置的順序）。
 * ahead 是前面還有幾張：0 是正在播或下一張，undefined 是還沒算出來。
 * 便利貼本身不另外複製一份：位置每次重算時，StickyNote 才不會跟著重畫
 */
const pendingNotes = computed(() =>
  notes.value
    .filter((n): n is QueuePendingItem & { id: string } => n.status !== 'played')
    .sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp))
    .map(note => ({ note, ahead: aheadCounts.value[note.id] as number | undefined }))
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

const loadMarketing = async (uid: string) => {
  const stored = await getProfile()
  // 讀取途中換了帳號（或登出）：這份是上一個人的
  if (!isMember.value || user.value?.uid !== uid) return
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
  strikes.value = 0
  if (!uid) return
  void loadNotes(uid)
  void loadQuota()
  void loadMarketing(uid)
  void loadStrikes(uid)
}, { immediate: true })

// ── 從這一頁登入 ──────────────────────────────────────
// 沒登入的人點頭像的「我的便利貼」、或直接打開這個網址，都會落在這裡。
// 只記「失敗了」，字在畫面上才查：存成字串的話，之後切換語言那句話不會跟著換。
const loginFailed = ref(false)

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (await completeLoginReturn() === 'error') {
    loginFailed.value = true
  }
})

onUnmounted(() => {
  // 世代往前推：還在讀取中的那一輪回來之後不會再掛監聽
  loadGen++
  stopWatching()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>
