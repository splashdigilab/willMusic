<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="uid"
        class="p-admin__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-member-panel-name"
      >
        <div class="p-admin__panel-backdrop" @click="close" />

        <div class="p-admin__panel-sheet">
          <header class="p-admin__panel-header">
            <div class="p-admin__member-identity">
              <img
                v-if="profile?.avatar"
                :src="profile.avatar"
                alt=""
                class="p-admin__member-avatar"
              />
              <span v-else class="p-admin__member-avatar" aria-hidden="true" />
              <div>
                <p id="admin-member-panel-name" class="p-admin__member-name">
                  {{ displayName }}
                  <span v-if="ban" class="p-admin__tag p-admin__tag--banned">已封鎖</span>
                </p>
                <p class="p-admin__member-uid">
                  {{ uid }}
                  <button type="button" class="p-admin__panel-copy" @click="copyUid">複製</button>
                </p>
                <p v-if="profile" class="p-admin__member-uid">
                  首次登入 {{ formatDateTime(profile.createdAt) }} · 最近登入 {{ formatDateTime(profile.updatedAt) }}
                </p>
              </div>
            </div>
            <button type="button" class="p-admin__panel-close" aria-label="關閉" @click="close">×</button>
          </header>

          <div v-if="loading" class="p-admin__empty-state">載入中…</div>

          <template v-else>
            <p v-if="!profile" class="p-admin__video-hint p-admin__video-hint--compact">
              查無會員資料：可能已刪除個人資料（刪除後也查不到這個人送過的便利貼），或編號有誤。
            </p>

            <div v-if="ban" class="p-admin__ban-status">
              <p class="p-admin__ban-status-title">
                已停止投稿資格 · {{ formatDateTime(ban.bannedAt) }}{{ ban.bannedBy ? ` · ${ban.bannedBy}` : '' }}
              </p>
              <p v-if="ban.reason" class="p-admin__ban-status-reason">備註：{{ ban.reason }}</p>
            </div>

            <h3 class="p-admin__panel-section-title">
              便利貼（待播 {{ pendingCount }}、已播 {{ historyCount }}）
            </h3>
            <div v-if="notes.length === 0" class="p-admin__empty-state p-admin__empty-state--compact">
              沒有便利貼
            </div>
            <div v-else class="p-admin__note-grid">
              <div v-for="note in notes" :key="note.id" class="p-admin__note-card">
                <div class="p-admin__note-visual">
                  <StickyNote :note="note" />
                </div>
                <div class="p-admin__note-meta">
                  <span class="p-admin__note-time">
                    {{ note.isPending ? '待播' : '已播' }} · {{ formatDateTime(note.timestamp) }}
                  </span>
                  <button
                    type="button"
                    class="p-admin__btn-delete"
                    :disabled="busy"
                    @click="noteToDelete = note"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>

            <h3 class="p-admin__panel-section-title">處置</h3>
            <div class="p-admin__btn-row">
              <button
                v-if="!ban"
                type="button"
                class="p-admin__btn p-admin__btn--primary p-admin__btn--inline"
                :disabled="busy"
                @click="openBanModal"
              >
                封鎖這個帳號
              </button>
              <button
                v-else
                type="button"
                class="p-admin__btn p-admin__btn--secondary p-admin__btn--inline"
                :disabled="busy"
                @click="handleUnban"
              >
                {{ busy ? '處理中…' : '解除封鎖' }}
              </button>
            </div>
            <p class="p-admin__video-hint p-admin__video-hint--compact">
              封鎖只擋「送出」：這個 LINE 帳號仍然可以瀏覽與製作便利貼，但送不上牆。可以隨時解除。
            </p>

            <h3 class="p-admin__panel-section-title">個人資料</h3>
            <p class="p-admin__video-hint p-admin__video-hint--compact">
              處理個資刪除請求用。「刪除個人資料」只清掉暱稱、頭貼與投稿額度紀錄，便利貼會留著（但就此無法追溯投稿者）。停權紀錄不會刪除。
            </p>
            <div class="p-admin__btn-row">
              <button
                type="button"
                class="p-admin__btn p-admin__btn--danger p-admin__btn--inline"
                :disabled="busy || !profile"
                @click="openProfileDelete(false)"
              >
                刪除個人資料
              </button>
              <button
                type="button"
                class="p-admin__btn p-admin__btn--danger p-admin__btn--inline"
                :disabled="busy || (!profile && notes.length === 0)"
                @click="openProfileDelete(true)"
              >
                刪除個人資料與所有便利貼
              </button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

  <AppModal
    v-model="banModalOpen"
    title="封鎖這個帳號？"
    message="封鎖後，這個 LINE 帳號無法再送出便利貼（仍可瀏覽與製作），隨時可以解除。"
    confirm-text="確定封鎖"
    cancel-text="取消"
    confirm-button-class="c-button--danger"
    :loading="busy"
    @confirm="confirmBan"
    @cancel="banModalOpen = false"
  >
    <template #footnote>
      <div class="p-admin__ban-form">
        <label class="p-admin__form-label" for="admin-ban-reason">備註（只有後台看得到）</label>
        <input
          id="admin-ban-reason"
          v-model="banReason"
          type="text"
          class="p-admin__form-input"
          placeholder="例如：多次上傳不雅圖片"
          maxlength="200"
        />
        <label class="p-admin__check">
          <input v-model="banRemovePending" type="checkbox" :disabled="pendingCount === 0" />
          同時撤下待播中的 {{ pendingCount }} 張（不撤的話仍會上 LED 牆）
        </label>
        <label class="p-admin__check">
          <input v-model="banRemoveHistory" type="checkbox" :disabled="historyCount === 0" />
          同時刪除已播放的 {{ historyCount }} 張（首頁牆上看得到）
        </label>
      </div>
    </template>
  </AppModal>

  <AppModal
    :model-value="!!noteToDelete"
    title="確認刪除"
    message="確定要刪除這張便利貼嗎？刪除後無法復原。"
    confirm-text="確定刪除"
    cancel-text="取消"
    confirm-button-class="c-button--danger"
    :loading="busy"
    @confirm="confirmDeleteNote"
    @cancel="noteToDelete = null"
  />

  <AppModal
    v-model="profileDeleteOpen"
    title="確認刪除個人資料"
    :message="profileDeleteMessage"
    confirm-text="確定刪除"
    cancel-text="取消"
    confirm-button-class="c-button--danger"
    :loading="busy"
    @confirm="confirmProfileDelete"
    @cancel="profileDeleteOpen = false"
  />
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { BannedUser, UserProfile } from '~/types'
import type { MemberNote } from '~/composables/useMemberAdmin'
import AppModal from '~/components/AppModal.vue'
import StickyNote from '~/components/StickyNote.vue'

/**
 * 後台的會員面板：這個人是誰、送過哪些便利貼、要不要封鎖、刪個資。
 *
 * 從兩個地方打開：「會員」分頁的清單，以及「便利貼管理」裡任一張卡片的投稿者。
 * 後者才是日常會走的路 —— 看到一張不妥的便利貼 → 點投稿者 → 看這個人其他張
 * → 全部撤下並封鎖，一個畫面內做完。
 */
const props = defineProps<{
  /** 要看的會員。null 代表面板關著 */
  uid: string | null
}>()

const emit = defineEmits<{
  'update:uid': [uid: string | null]
  /** 刪了便利貼、封鎖或刪了個資，外面的清單要重新整理 */
  changed: [uid: string]
  notify: [type: 'success' | 'error', message: string]
}>()

const { getProfile, findMemberNotes, deleteNote, deleteProfile } = useMemberAdmin()
const { getBan, ban: banMember, unban } = useBannedUsers()

const loading = ref(false)
const busy = ref(false)
const profile = ref<UserProfile | null>(null)
const ban = ref<BannedUser | null>(null)
const notes = ref<MemberNote[]>([])

const pendingCount = computed(() => notes.value.filter(n => n.isPending).length)
const historyCount = computed(() => notes.value.length - pendingCount.value)
const displayName = computed(() =>
  profile.value?.displayName || ban.value?.displayName || '（沒有暱稱）'
)

const formatDateTime = (ts: any): string => {
  const date = ts?.toDate?.()
  if (!date) return '—'
  return date.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// 載入序號：快速切換會員時，丟掉較早發出、較晚回來的結果
let loadRequest = 0

const load = async () => {
  const uid = props.uid
  if (!uid) return
  const request = ++loadRequest
  loading.value = true
  try {
    const [p, b, n] = await Promise.all([getProfile(uid), getBan(uid), findMemberNotes(uid)])
    if (request !== loadRequest) return
    profile.value = p
    ban.value = b
    notes.value = n
  } catch (err) {
    console.error('[admin] 載入會員資料失敗', err)
    if (request === loadRequest) emit('notify', 'error', '載入會員資料失敗，請確認編號是否正確')
  } finally {
    if (request === loadRequest) loading.value = false
  }
}

watch(() => props.uid, (uid) => {
  profile.value = null
  ban.value = null
  notes.value = []
  if (uid) void load()
}, { immediate: true })

const close = () => {
  if (busy.value) return
  emit('update:uid', null)
}

const onKeydown = (e: KeyboardEvent) => {
  // 確認視窗開著時 Esc 不要連面板一起關掉
  if (e.key !== 'Escape' || banModalOpen.value || noteToDelete.value || profileDeleteOpen.value) return
  close()
}
watch(() => !!props.uid, (open) => {
  if (!import.meta.client) return
  if (open) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
}, { immediate: true })
onUnmounted(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKeydown)
})

const copyUid = async () => {
  if (!props.uid) return
  try {
    await navigator.clipboard.writeText(props.uid)
    emit('notify', 'success', '編號已複製')
  } catch {
    emit('notify', 'error', '複製失敗，請手動選取')
  }
}

/** 逐張刪除，回傳失敗的張數。一張失敗不該讓其他張也跟著停下來 */
const deleteNotes = async (targets: MemberNote[]): Promise<number> => {
  const results = await Promise.allSettled(targets.map(note => deleteNote(note)))
  const failed = results.filter(r => r.status === 'rejected')
  failed.forEach(r => console.error('[admin] 刪除便利貼失敗', (r as PromiseRejectedResult).reason))
  return failed.length
}

const afterChange = async (uid: string) => {
  await load()
  emit('changed', uid)
}

// ── 封鎖 ──────────────────────────────────────────────
const banModalOpen = ref(false)
const banReason = ref('')
const banRemovePending = ref(true)
const banRemoveHistory = ref(false)

const openBanModal = () => {
  banReason.value = ''
  // 待播的預設一起撤：不撤的話，封鎖之後還是會照排程上 LED 牆
  banRemovePending.value = pendingCount.value > 0
  banRemoveHistory.value = false
  banModalOpen.value = true
}

const confirmBan = async () => {
  const uid = props.uid
  if (!uid) return
  busy.value = true
  try {
    // 先封鎖再撤便利貼：先擋住新的，再清舊的
    try {
      await banMember(uid, profile.value?.displayName ?? '', banReason.value.trim())
    } catch (err) {
      console.error('[admin] 封鎖失敗', err)
      emit('notify', 'error', '封鎖失敗，請稍後再試')
      return
    }

    const targets = notes.value.filter(n =>
      n.isPending ? banRemovePending.value : banRemoveHistory.value
    )
    const failed = await deleteNotes(targets)
    banModalOpen.value = false

    if (failed > 0) {
      emit('notify', 'error', `已封鎖，但有 ${failed} 張便利貼撤下失敗，請在面板裡再刪一次`)
    } else if (targets.length > 0) {
      emit('notify', 'success', `已封鎖，並撤下 ${targets.length} 張便利貼`)
    } else {
      emit('notify', 'success', '已封鎖這個帳號')
    }
    await afterChange(uid)
  } finally {
    busy.value = false
  }
}

const handleUnban = async () => {
  const uid = props.uid
  if (!uid) return
  busy.value = true
  try {
    await unban(uid)
    emit('notify', 'success', '已解除封鎖')
    await afterChange(uid)
  } catch (err) {
    console.error('[admin] 解除封鎖失敗', err)
    emit('notify', 'error', '解除封鎖失敗，請稍後再試')
  } finally {
    busy.value = false
  }
}

// ── 刪除單張便利貼 ────────────────────────────────────
const noteToDelete = ref<MemberNote | null>(null)

const confirmDeleteNote = async () => {
  const uid = props.uid
  const note = noteToDelete.value
  if (!uid || !note) return
  busy.value = true
  try {
    await deleteNote(note)
    noteToDelete.value = null
    emit('notify', 'success', '已刪除便利貼')
    await afterChange(uid)
  } catch (err) {
    console.error('[admin] 刪除便利貼失敗', err)
    emit('notify', 'error', '刪除失敗，請稍後再試')
  } finally {
    busy.value = false
  }
}

// ── 刪除個人資料 ──────────────────────────────────────
const profileDeleteOpen = ref(false)
const profileDeleteIncludesNotes = ref(false)

const profileDeleteMessage = computed(() => {
  const base = profileDeleteIncludesNotes.value
    ? `將刪除這位會員的暱稱、頭貼、投稿額度紀錄，以及這個帳號送出的 ${notes.value.length} 張便利貼。此操作無法復原。`
    : '將刪除這位會員的暱稱、頭貼與投稿額度紀錄。便利貼會保留，但之後無法再追溯投稿者。此操作無法復原。'
  return ban.value ? `${base}停權紀錄會保留。` : base
})

const openProfileDelete = (includeNotes: boolean) => {
  profileDeleteIncludesNotes.value = includeNotes
  profileDeleteOpen.value = true
}

const confirmProfileDelete = async () => {
  const uid = props.uid
  if (!uid) return
  busy.value = true
  try {
    if (profileDeleteIncludesNotes.value) {
      // 先刪便利貼再刪個資：反過來的話中途失敗會留下「查不到人的便利貼」，
      // 而那時已經沒有 users 文件可以再找到它們了
      const failed = await deleteNotes(notes.value)
      if (failed > 0) {
        emit('notify', 'error', `有 ${failed} 張便利貼刪除失敗，個人資料先保留，請再試一次`)
        await afterChange(uid)
        return
      }
    }
    await deleteProfile(uid)
    profileDeleteOpen.value = false
    emit('notify', 'success', '已刪除該會員的個人資料')
    await afterChange(uid)
  } catch (err) {
    console.error('[admin] 刪除會員資料失敗', err)
    emit('notify', 'error', '刪除失敗，請稍後再試')
  } finally {
    busy.value = false
  }
}
</script>
