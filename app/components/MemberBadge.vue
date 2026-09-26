<template>
  <!-- 等登入狀態確定了才出現，否則已登入的人會先閃一下「還沒登入」 -->
  <div v-if="authReady" ref="rootRef" class="c-member-badge">
    <button
      type="button"
      class="c-member-badge__btn"
      :class="{ 'is-guest': !isMember }"
      :aria-label="isMember ? `LINE 帳號：${name}` : '還沒登入'"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggle"
    >
      <template v-if="isMember">
        <img
          v-if="profile?.linePicture && !avatarBroken"
          :src="profile.linePicture"
          alt=""
          class="c-member-badge__avatar"
          referrerpolicy="no-referrer"
          @error="avatarBroken = true"
        />
        <span v-else class="c-member-badge__initial" aria-hidden="true">{{ initial }}</span>
      </template>
      <!-- 還沒登入：通用的人像輪廓 -->
      <svg
        v-else
        class="c-member-badge__guest-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
      </svg>
    </button>

    <Transition name="member-pop">
      <div v-if="open && isMember" class="c-member-badge__card" role="dialog" aria-label="LINE 帳號">
        <p class="c-member-badge__name">{{ name }}</p>
        <p class="c-member-badge__status" :class="{ 'is-warning': quotaBlocked }">{{ statusText }}</p>
        <NuxtLink to="/my-notes" class="c-member-badge__link" @click="open = false">
          我的便利貼 <span aria-hidden="true">›</span>
        </NuxtLink>
        <button type="button" class="c-member-badge__logout" @click="onLogout">登出</button>
      </div>
      <div v-else-if="open" class="c-member-badge__card" role="dialog" aria-label="登入狀態">
        <p class="c-member-badge__name">還沒登入</p>
        <p class="c-member-badge__status">
          瀏覽和製作都不用登入，送出便利貼時才需要。登入後可以看到自己送出的便利貼，以及今天還能送幾張。
        </p>
        <button type="button" class="c-member-badge__login" @click="onLogin">LINE 登入</button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

/**
 * 右上角的登入狀態。兩種狀態都會出現：
 *
 *   已登入 → LINE 頭貼，點開是暱稱、今天還能送幾張（冷卻中每秒倒數）、
 *            我的便利貼、登出
 *   沒登入 → 人像輪廓，點開說明「送出時才需要登入」，附一顆 LINE 登入
 *
 * 原本只在已登入時出現，理由是怕在首頁暗示「要先登入才能玩」。
 * 實際上使用者因此看不出自己有沒有登入、也找不到自己的便利貼（2026-09-26），
 * 所以改成兩種狀態都顯示；沒登入的那張小卡第一句就講清楚瀏覽與製作不需要登入。
 *
 * 小卡裡最有用的是額度那一行：讓人在開始畫之前就知道今天還能不能送，
 * 而不是畫完按送出才被擋。
 */
const props = defineProps<{
  /**
   * 取代預設的登入動作（預設是登入完回到同一頁）。編輯器用它先同步存草稿、
   * 記下現在在第幾步，回來時才能接著編輯，而不是從活動規範頁重來。
   */
  customLogin?: () => void
}>()

const route = useRoute()
const { ready: authReady, isMember, profile, startLogin, logout } = useMemberAuth()
const {
  load: loadQuota,
  reset: resetQuota,
  kind: quotaKind,
  isBlocked: quotaBlocked,
  summary: quotaSummary
} = useQuotaStatus()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)
const avatarBroken = ref(false)

const name = computed(() => profile.value?.lineName || 'LINE 帳號')
// 暱稱可能以 emoji 開頭，用 Array.from 才不會切到半個字
const initial = computed(() => Array.from(name.value)[0] ?? '?')

watch(() => profile.value?.linePicture, () => { avatarBroken.value = false })

const statusText = computed(() => {
  if (quotaKind.value === 'loading') return '讀取中…'
  // 後台關掉頻率限制、或讀不到用量：不猜數字
  if (quotaKind.value === 'unlimited') return '送出便利貼時會使用這個帳號'
  return quotaSummary.value
})

// 打開時才讀：大部分人不會點它，沒必要每次進頁面都花兩次讀取。
// 收起來時停掉倒數（在下面的 watch(open)）
const toggle = () => {
  open.value = !open.value
  if (open.value && isMember.value) void loadQuota()
}

const onLogout = async () => {
  open.value = false
  await logout()
}

// 預設：登入完回到原本這一頁
const onLogin = () => {
  if (props.customLogin) props.customLogin()
  else startLogin(route.fullPath)
}

// 點外面或按 Esc 收起。只在打開時掛監聽
const onPointerDown = (e: PointerEvent) => {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = false
}
const detach = () => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
}
watch(open, (isOpen) => {
  if (!import.meta.client) return
  if (isOpen) {
    // capture：首頁的 usePanZoom 會在畫布上攔 pointerdown，冒泡階段收不到
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    detach()
    resetQuota()
  }
})
// 登出後元件整個收掉，小卡也要跟著關
watch(isMember, (member) => { if (!member) open.value = false })
onUnmounted(() => { if (import.meta.client) detach() })
</script>
