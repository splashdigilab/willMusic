/**
 * 停權名單（banned_users/{uid}）。
 *
 * 真正的強制在 firestore.rules 的 canCreateNote（`!exists(bannedRef)`）。
 * 這裡的讀取有兩個用途：前台在按送出時把原因講清楚，後台管理名單。
 *
 * 只擋「送出」這一個動作 —— 被封鎖的人仍然可以瀏覽、製作、下載自己的圖。
 * 封鎖以 uid（= line:<LINE userId>）為單位，LINE userId 在同一個 channel 下
 * 不會變，要繞過就得另外辦一個 LINE 帳號。
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore'
import type { BannedUser } from '~/types'

/** 後台一次載入的名單上限。封鎖是例外處置，名單不會長到需要分頁 */
const BAN_LIST_LIMIT = 500

export const useBannedUsers = () => {
  const { $firestore, $auth } = useNuxtApp() as any
  const cols = useCollections()

  const banRef = (uid: string) => doc($firestore, cols.bannedUsers, uid)

  /**
   * 目前登入的會員是否被停權。讀不到時回 false：
   * 規則那一層還會再擋，這裡誤判成停權只會把正常的人擋在門外。
   */
  const isSelfBanned = async (): Promise<boolean> => {
    const uid = $auth?.currentUser?.uid
    if (!uid) return false
    try {
      return (await getDoc(banRef(uid))).exists()
    } catch (e) {
      console.warn('[ban] 讀取停權狀態失敗', e)
      return false
    }
  }

  // ── 以下限後台（規則只開放 isStaff() 寫入與讀取他人的紀錄）──

  const getBan = async (uid: string): Promise<BannedUser | null> => {
    const snap = await getDoc(banRef(uid))
    return snap.exists() ? (snap.data() as BannedUser) : null
  }

  /** 整份名單，新封鎖的在前。後台用它標示便利貼與會員清單上的「已封鎖」 */
  const listBans = async (): Promise<Map<string, BannedUser>> => {
    const snap = await getDocs(query(
      collection($firestore, cols.bannedUsers),
      orderBy('bannedAt', 'desc'),
      limit(BAN_LIST_LIMIT)
    ))
    return new Map(snap.docs.map(d => [d.id, d.data() as BannedUser]))
  }

  /**
   * @param displayName 暱稱快照。刪除個人資料後 users/{uid} 就沒了，
   *                    名單上還是要認得出這是誰
   * @param reason      後台自己看的備註，被封鎖的人看不到
   */
  const ban = async (uid: string, displayName: string, reason: string): Promise<void> => {
    await setDoc(banRef(uid), {
      displayName,
      reason,
      bannedAt: serverTimestamp(),
      bannedBy: $auth?.currentUser?.email ?? ''
    })
  }

  const unban = (uid: string): Promise<void> => deleteDoc(banRef(uid))

  return { isSelfBanned, getBan, listBans, ban, unban }
}
