import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot
} from 'firebase/firestore'

/**
 * onSnapshot 出錯之後就不會再收到任何東西（例如部署規則的空檔被拒一次），
 * 大螢幕這種一跑好幾個小時、沒人盯著的頁面，從此新投稿上不了牆、後台下架也拿不下來。
 * 這裡包一層：出錯就隔一段時間重掛，5 秒起跳、每次加倍、最多 1 分鐘，收到資料就歸零。
 *
 * onNext 的第二個參數是「這是（重）掛上後的第一筆」。第一筆的 docChanges() 全是 added，
 * 斷線期間的刪除與修改不會出現在裡面，要差異的人得拿整份自己比對。
 *
 * 回傳的函式會取消監聽，也取消還沒到的重掛。
 */
export function watchWithResubscribe(
  target: Query,
  onNext: (snap: QuerySnapshot, fresh: boolean) => void,
  label: string
): () => void
export function watchWithResubscribe(
  target: DocumentReference,
  onNext: (snap: DocumentSnapshot, fresh: boolean) => void,
  label: string
): () => void
export function watchWithResubscribe(
  target: Query | DocumentReference,
  onNext: (snap: any, fresh: boolean) => void,
  label: string
): () => void {
  let stopped = false
  let errors = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let unsub: (() => void) | null = null

  const subscribe = () => {
    let first = true
    unsub = onSnapshot(
      target as Query,
      (snap) => {
        errors = 0
        const fresh = first
        first = false
        onNext(snap, fresh)
      },
      (error) => {
        console.error(`[${label}] 監聽中斷，稍後重掛`, error)
        unsub = null
        if (stopped) return
        timer = setTimeout(() => {
          timer = null
          if (!stopped) subscribe()
        }, resubscribeDelay(++errors))
      }
    )
  }

  subscribe()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
    unsub?.()
    unsub = null
  }
}

/** 第 n 次連續失敗後隔多久重掛 */
export const resubscribeDelay = (errors: number) => Math.min(60_000, 5_000 * 2 ** (errors - 1))
