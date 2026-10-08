/**
 * 「加入微樂客 LINE 好友」提醒要不要出現。
 *
 * 登入時 LINE 已經問過一次（server 帶 bot_prompt=aggressive），但那一頁按「略過」的人
 * 之後就再也看不到了 —— LINE 只在同意畫面出現時問，而同意畫面每人只出現一次。
 * 所以登入後在右上角小卡、我的便利貼、送出後的等待頁補一顆按鈕。
 *
 * 判斷依據是 custom token 的 lineFriend claim，那是**登入那一刻**的狀態：
 * 使用者按了按鈕、真的加了好友之後，這個值要等下次登入才會變。
 * 所以按過一次就把這個人記在 localStorage，不再顯示 —— 就算他其實沒加，
 * 一直追著提醒也只是噪音。換一個人登入會重新判斷（記的是 uid）。
 */
import { computed } from 'vue'
import { useState } from '#imports'
import { useAuthSession } from '~/composables/useAuthSession'

/** 「微樂客 WillMusic」官方帳號（LINE 後台 Login channel 連結的那一個） */
export const LINE_OFFICIAL_ACCOUNT_ID = '@ngi0443q'
export const LINE_ADD_FRIEND_URL = `https://line.me/R/ti/p/${encodeURIComponent(LINE_OFFICIAL_ACCOUNT_ID)}`

const STORAGE_PREFIX = 'wm_line_friend_prompted:'

const readPrompted = (uid: string): boolean => {
  try {
    return localStorage.getItem(STORAGE_PREFIX + uid) === '1'
  } catch {
    return false
  }
}

export const useLineFriend = () => {
  const { isMember, claims, user, ensureInitialized } = useAuthSession()
  // 等待頁不經過 useMemberAuth，直接重新整理那一頁時沒有人掛登入監聽，要自己掛（重複呼叫無妨）
  ensureInitialized()
  // 好幾個地方同時掛著按鈕（例如等待頁加上右上角小卡），在其中一處按了，其他的也要一起收掉
  const prompted = useState<Record<string, boolean>>('line-friend-prompted', () => ({}))

  const shouldPrompt = computed(() => {
    const uid = user.value?.uid
    // 只有確定「不是好友」才提醒；server 查不到（null）就不吵
    if (!isMember.value || !uid || claims.value?.lineFriend !== false) return false
    return !(prompted.value[uid] ?? readPrompted(uid))
  })

  const markPrompted = () => {
    const uid = user.value?.uid
    if (!uid) return
    prompted.value = { ...prompted.value, [uid]: true }
    try {
      localStorage.setItem(STORAGE_PREFIX + uid, '1')
    } catch {
      // 無痕模式之類寫不進去：這次瀏覽期間還是會收掉（上面的 state），下次再出現也無妨
    }
  }

  return { shouldPrompt, markPrompted }
}
