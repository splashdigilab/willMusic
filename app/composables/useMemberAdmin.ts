/**
 * 後台的會員管理：會員清單、某個人的所有便利貼、刪除便利貼與個人資料。
 * 停權名單在 useBannedUsers（前台送出時也要讀，所以分開放）。
 *
 * 這裡的操作全部依賴 isStaff() 的規則權限，前台呼叫會被拒。
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
  startAfter,
  where,
  type QueryDocumentSnapshot
} from 'firebase/firestore'
import { deleteObject, ref as storageRef } from 'firebase/storage'
import type { NoteOwner, QueueHistoryItem, QueuePendingItem, UserProfile } from '~/types'
import { getDocsByIds } from '~/utils/firestore-batch'

export const MEMBER_PAGE_SIZE = 20

export interface MemberRow extends UserProfile {
  uid: string
}

/** 刪一張便利貼需要知道的事：在哪個集合、有沒有手繪圖檔要一起清 */
export interface NoteRef {
  id: string
  isPending: boolean
  style?: { drawing?: unknown }
}

/** 後台列出的一張便利貼。isPending 決定它在哪個集合 */
export type MemberNote = (QueuePendingItem | QueueHistoryItem) & { id: string, isPending: boolean }

const toMillis = (ts: any): number => ts?.toMillis?.() ?? 0

export const useMemberAdmin = () => {
  const { $firestore, $storage } = useNuxtApp() as any
  const cols = useCollections()

  /**
   * 依最近登入排序。updatedAt 每次登入都會更新（useMemberProfile.syncProfile），
   * 所以排在最前面的就是最近還在活動的人。單一欄位排序，不需要複合索引。
   */
  const listMembers = async (cursor: QueryDocumentSnapshot | null) => {
    const constraints: any[] = [orderBy('updatedAt', 'desc')]
    if (cursor) constraints.push(startAfter(cursor))
    constraints.push(limit(MEMBER_PAGE_SIZE + 1))

    const snap = await getDocs(query(collection($firestore, cols.users), ...constraints))
    const docs = snap.docs.slice(0, MEMBER_PAGE_SIZE)
    return {
      members: docs.map(d => ({ uid: d.id, ...(d.data() as UserProfile) })) as MemberRow[],
      cursor: docs[docs.length - 1] ?? null,
      hasMore: snap.docs.length > MEMBER_PAGE_SIZE
    }
  }

  const getProfile = async (uid: string): Promise<UserProfile | null> => {
    const snap = await getDoc(doc($firestore, cols.users, uid))
    return snap.exists() ? (snap.data() as UserProfile) : null
  }

  /** 這個 uid 名下的便利貼 ID（note_owners 的 doc ID 就是便利貼的 ID） */
  const findOwnedNoteIds = async (uid: string): Promise<string[]> => {
    const snap = await getDocs(query(collection($firestore, cols.noteOwners), where('uid', '==', uid)))
    return snap.docs.map(d => d.id)
  }

  /**
   * 這個 uid 的所有便利貼，新送出的在前。
   *
   * 先從 note_owners 找出 ID，再到待播與歷史兩邊去拿便利貼本身。
   * 兩邊都找不到的是已經被撤下的（投稿者紀錄沒跟著刪，例如刪除時中途失敗），略過。
   * 排序在前端做 —— 一個人每天最多幾張，不值得開複合索引。
   */
  const findMemberNotes = async (uid: string): Promise<MemberNote[]> => {
    const ids = await findOwnedNoteIds(uid)
    const [pending, history] = await Promise.all([
      getDocsByIds($firestore, cols.queuePending, ids),
      getDocsByIds($firestore, cols.queueHistory, ids)
    ])
    const notes = [
      ...pending.map(d => ({ ...(d.data() as QueuePendingItem), id: d.id, isPending: true })),
      ...history.map(d => ({ ...(d.data() as QueueHistoryItem), id: d.id, isPending: false }))
    ] as MemberNote[]
    return notes.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
  }

  /**
   * 一批便利貼各自的投稿者 uid，給便利貼管理的卡片標示投稿者用。
   * 沒有紀錄的（匿名時期的舊便利貼）不會出現在結果裡。
   */
  const loadOwners = async (noteIds: string[]): Promise<Record<string, string>> => {
    const docs = await getDocsByIds($firestore, cols.noteOwners, noteIds)
    return Object.fromEntries(docs.map(d => [d.id, (d.data() as NoteOwner).uid]))
  }

  /**
   * 刪一張便利貼，連同 Storage 上的手繪圖（否則圖片會無限累積）。
   *
   * 先刪文件再清圖：反過來的話，文件刪除一旦失敗，便利貼會繼續留在牆上
   * 但圖片已經不存在，變成破圖。舊便利貼的 drawing 是內嵌的 data URL，
   * 沒有檔案要刪；清圖失敗也不影響刪除本身。
   */
  const deleteNote = async (note: NoteRef): Promise<void> => {
    await deleteDoc(doc($firestore, note.isPending ? cols.queuePending : cols.queueHistory, note.id))
    // 投稿者紀錄跟著刪：便利貼都沒了，留著只是一筆多餘的個資。
    // 失敗不影響刪除本身（「我的便利貼」與會員面板都會略過找不到便利貼的紀錄）
    try {
      await deleteDoc(doc($firestore, cols.noteOwners, note.id))
    } catch (err) {
      console.warn('[admin] 便利貼已刪除，但投稿者紀錄清除失敗', err)
    }

    const drawing = note.style?.drawing
    if (typeof drawing !== 'string' || !drawing.startsWith('http')) return
    try {
      await deleteObject(storageRef($storage, drawing))
    } catch (err: any) {
      if (err?.code !== 'storage/object-not-found') {
        console.warn('[admin] 便利貼已刪除，但手繪圖檔案清除失敗', err)
      }
    }
  }

  /**
   * 刪除個人資料：暱稱、頭貼、投稿額度紀錄，以及每張便利貼的投稿者紀錄。
   *
   * 額度紀錄也是個資（記錄了這個人什麼時候投過稿），一起刪。副作用是
   * 這個人的當日額度會重置 —— 個資請求不常發生，可以接受。
   * 投稿者紀錄刪掉之後，留下來的便利貼就再也追溯不到這個人。
   *
   * **停權名單不動**：否則被封鎖的人申請刪除個資就等於解除封鎖。
   * 隱私權政策「保存多久」的停權紀錄一條就是為此而寫。
   */
  const deleteProfile = async (uid: string): Promise<void> => {
    const ownedIds = await findOwnedNoteIds(uid)
    await Promise.all([
      deleteDoc(doc($firestore, cols.users, uid)),
      deleteDoc(doc($firestore, cols.userQuota, uid)),
      ...ownedIds.map(id => deleteDoc(doc($firestore, cols.noteOwners, id)))
    ])
  }

  return { listMembers, getProfile, findMemberNotes, loadOwners, deleteNote, deleteProfile }
}
