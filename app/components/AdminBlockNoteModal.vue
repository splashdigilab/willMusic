<template>
  <AppModal
    :model-value="!!noteId"
    title="下架這張便利貼？"
    message="下架後立刻從 LED 牆與首頁消失，移到「已下架」分頁。誤判可以在那裡恢復。"
    confirm-text="確定下架"
    cancel-text="取消"
    confirm-button-class="c-button--danger"
    :loading="busy || checking"
    :loading-text="checking ? '查詢中…' : '處理中…'"
    @confirm="confirm"
    @cancel="close"
  >
    <template #footnote>
      <div class="p-admin__ban-form">
        <p class="p-admin__strike-hint" :class="{ 'is-final': willAutoBan }">{{ strikeHint }}</p>
        <label v-if="willAutoBan && otherPending.length > 0" class="p-admin__check">
          <input v-model="removeOthers" type="checkbox" />
          同時撤下此人待播中的其他 {{ otherPending.length }} 張（直接刪除、不計次；不撤的話仍會上 LED 牆）
        </label>
        <label class="p-admin__form-label" for="admin-block-reason">備註（只有後台看得到）</label>
        <input
          id="admin-block-reason"
          v-model="reason"
          type="text"
          class="p-admin__form-input"
          placeholder="例如：不雅圖片"
          maxlength="200"
        />
      </div>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModal from '~/components/AppModal.vue'
import { STRIKE_LIMIT } from '~/types'
import type { MemberNote } from '~/composables/useMemberAdmin'
import { NoteGoneError, type BlockResult } from '~/composables/useNoteModeration'

/**
 * 「下架」的確認視窗，便利貼管理的卡片與會員面板共用。
 *
 * 打開時先查投稿者目前違規幾次，店員按下去之前就知道這是第幾次 ——
 * 尤其是會觸發自動停權的那一次。這裡的數字只是提示，
 * 實際的次數在 blockNote 的 transaction 裡重新算；查不到也照樣可以下架。
 */
const props = defineProps<{
  /** 要下架的便利貼。null = 視窗關著 */
  noteId: string | null
}>()

const emit = defineEmits<{
  'update:noteId': [id: string | null]
  /** 下架了（或發現它早就不在了），外面的清單要重新整理 */
  changed: [info: { noteId: string, uid: string | null, autoBanned: boolean }]
  notify: [type: 'success' | 'error', message: string]
}>()

const { getOwner, getStrikes, blockNote } = useNoteModeration()
const { getBan } = useBannedUsers()
const { findMemberNotes, deleteNote } = useMemberAdmin()

const reason = ref('')
const checking = ref(false)
const busy = ref(false)
/** undefined = 還沒查到；null = 匿名時期的便利貼，沒有投稿者 */
const ownerUid = ref<string | null | undefined>(undefined)
/** 下架前的違規次數。null = 還沒查到或查不到 */
const currentStrikes = ref<number | null>(null)
const alreadyBanned = ref(false)
const checkFailed = ref(false)
/** 會觸發自動停權時，此人排隊中的其他張 */
const otherPending = ref<MemberNote[]>([])
const removeOthers = ref(true)

// 查詢序號：快速關掉再開另一張時，丟掉較早發出、較晚回來的結果
let checkRequest = 0

const check = async (noteId: string) => {
  const request = ++checkRequest
  checking.value = true
  try {
    const uid = await getOwner(noteId)
    if (request !== checkRequest) return
    ownerUid.value = uid
    if (!uid) return

    const [strikes, ban] = await Promise.all([getStrikes(uid), getBan(uid)])
    if (request !== checkRequest) return
    currentStrikes.value = strikes
    alreadyBanned.value = !!ban

    // 這一下會觸發停權的話，此人排隊中的其他張也要能一起撤下，否則停權之後照樣上 LED 牆
    if (strikes + 1 >= STRIKE_LIMIT && !ban) {
      const notes = await findMemberNotes(uid)
      if (request !== checkRequest) return
      otherPending.value = notes.filter(n => n.isPending && n.id !== noteId)
    }
  } catch (err) {
    console.warn('[admin] 查詢違規次數失敗', err)
    if (request === checkRequest) checkFailed.value = true
  } finally {
    if (request === checkRequest) checking.value = false
  }
}

watch(() => props.noteId, (id) => {
  reason.value = ''
  ownerUid.value = undefined
  currentStrikes.value = null
  alreadyBanned.value = false
  checkFailed.value = false
  otherPending.value = []
  removeOthers.value = true
  if (id) {
    void check(id)
  } else {
    checkRequest++
    checking.value = false
  }
}, { immediate: true })

const nextStrike = computed(() => (currentStrikes.value ?? 0) + 1)

const willAutoBan = computed(() =>
  !!ownerUid.value
  && currentStrikes.value !== null
  && !alreadyBanned.value
  && nextStrike.value >= STRIKE_LIMIT
)

const strikeHint = computed(() => {
  if (checking.value) return '正在查詢投稿者的違規次數…'
  if (checkFailed.value) return '查不到投稿者的違規次數。仍然可以下架，次數會照常累計。'
  if (ownerUid.value === null) return '這張是匿名時期的便利貼，查不到投稿者，不計違規次數。'
  if (alreadyBanned.value) return `此帳號已停權。下架後違規累計 ${nextStrike.value} 次。`
  if (willAutoBan.value) return `這是此帳號第 ${nextStrike.value} 次違規，下架後將自動停止投稿資格。`
  return `這是此帳號第 ${nextStrike.value} 次違規（累計 ${STRIKE_LIMIT} 次自動停止投稿資格）。`
})

const close = () => {
  if (busy.value) return
  emit('update:noteId', null)
}

const resultMessage = (result: BlockResult, removed: number, removeFailed: number): string => {
  if (result.alreadyBlocked) return '這張已經下架過了'
  if (!result.uid || result.strikes === null) return '已下架（匿名便利貼，不計次）'
  if (result.autoBanned) {
    let text = `已下架。此帳號違規累計 ${result.strikes} 次，已自動停止投稿資格`
    if (removed > 0) text += `，並撤下待播中的 ${removed} 張`
    if (removeFailed > 0) text += `；有 ${removeFailed} 張撤下失敗，請在會員面板裡再刪一次`
    return text
  }
  if (result.strikes >= STRIKE_LIMIT) return `已下架（此帳號已停權，違規累計 ${result.strikes} 次）`
  return `已下架（此帳號違規 ${result.strikes}/${STRIKE_LIMIT} 次）`
}

const confirm = async () => {
  const noteId = props.noteId
  if (!noteId || busy.value) return
  busy.value = true
  try {
    let result: BlockResult
    try {
      result = await blockNote(noteId, reason.value.trim())
    } catch (err) {
      if (err instanceof NoteGoneError) {
        emit('notify', 'error', '找不到這張便利貼，可能剛被刪除或下架了')
        emit('changed', { noteId, uid: null, autoBanned: false })
        emit('update:noteId', null)
        return
      }
      console.error('[admin] 下架失敗', err)
      emit('notify', 'error', '下架失敗，請稍後再試')
      return
    }

    // 停權之後，此人排隊中的其他張直接刪除、不計次：不是每一張都違規，只是不該再上牆
    const others = result.autoBanned && removeOthers.value ? otherPending.value : []
    let removeFailed = 0
    if (others.length > 0) {
      const results = await Promise.allSettled(others.map(note => deleteNote(note)))
      const failed = results.filter(r => r.status === 'rejected')
      failed.forEach(r => console.error('[admin] 撤下待播便利貼失敗', (r as PromiseRejectedResult).reason))
      removeFailed = failed.length
    }

    emit('notify', removeFailed > 0 ? 'error' : 'success', resultMessage(result, others.length - removeFailed, removeFailed))
    emit('changed', { noteId, uid: result.uid, autoBanned: result.autoBanned })
    emit('update:noteId', null)
  } finally {
    busy.value = false
  }
}
</script>
