/**
 * 後台的會員管理：會員清單、某個人的所有便利貼、刪除便利貼與個人資料。
 * 停權名單在 useBannedUsers（前台送出時也要讀，所以分開放）。
 *
 * 這裡的操作全部依賴 isStaff() 的規則權限，前台呼叫會被拒。
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot
} from 'firebase/firestore'
import { deleteObject, ref as storageRef } from 'firebase/storage'
import type { NoteOwner, QueueHistoryItem, QueuePendingItem, UserProfile } from '~/types'
import { getDocsByIds } from '~/utils/firestore-batch'

export const MEMBER_PAGE_SIZE = 20

export interface MemberRow extends UserProfile {
  uid: string
}

/**
 * 刪一張便利貼需要知道的事：ID，以及有沒有手繪圖檔要一起清。
 * 不需要知道它在待播還是歷史 —— 兩邊一起刪，理由見 deleteNote
 */
export interface NoteRef {
  id: string
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

  /**
   * 同意收行銷資訊的會員，一次全部讀完：這份是要整份匯出的名單，分頁沒有意義。
   * 只有一個等號條件、排序在前端做，不需要複合索引。
   *
   * 規則已經保證 marketingOptIn == true 的文件一定有 email，這裡還是再濾一次：
   * 名單是拿去寄信的，寧可少一筆也不要混進一筆空地址。
   */
  const listMarketingOptIns = async (): Promise<MemberRow[]> => {
    const snap = await getDocs(query(collection($firestore, cols.users), where('marketingOptIn', '==', true)))
    return snap.docs
      .map(d => ({ uid: d.id, ...(d.data() as UserProfile) }) as MemberRow)
      .filter(m => !!m.email)
      .sort((a, b) => toMillis(b.marketingUpdatedAt) - toMillis(a.marketingUpdatedAt))
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
   * 刪一張便利貼，連同投稿者紀錄與 Storage 上的手繪圖（否則圖片會無限累積）。
   *
   * 待播與歷史兩份用同一個 writeBatch 一起刪，不看清單上標的是哪一邊：
   * 後台清單不是即時的，畫面上還是「待播」的那張，大螢幕可能剛好播完、
   * 用同一個 doc ID 搬進了 queue_history（moveToHistory）。只刪待播那份的話，
   * 刪除顯示成功，便利貼卻原封不動地出現在牆上。刪不存在的文件不會出錯；
   * 跟 moveToHistory 的 transaction 撞在一起時，那邊會重試、看到待播那份沒了就不搬。
   *
   * 投稿者紀錄（note_owners）也放在同一批：便利貼都沒了，留著只是一筆多餘的個資。
   * 三份的刪除規則都只要 isStaff()、不看文件內容，不會只有其中一份被擋下而拖垮整批。
   *
   * 先刪文件再清圖：反過來的話，文件刪除一旦失敗，便利貼會繼續留在牆上
   * 但圖片已經不存在，變成破圖。舊便利貼的 drawing 是內嵌的 data URL，
   * 沒有檔案要刪；清圖失敗也不影響刪除本身。
   */
  const deleteNote = async (note: NoteRef): Promise<void> => {
    const batch = writeBatch($firestore)
    batch.delete(doc($firestore, cols.queuePending, note.id))
    batch.delete(doc($firestore, cols.queueHistory, note.id))
    batch.delete(doc($firestore, cols.noteOwners, note.id))
    await batch.commit()

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
   * 拿掉一張便利貼上的署名。待播的那張可能在剛才查到之後被大螢幕播完、
   * 用同一個 ID 搬進歷史（搬的時候署名跟著複製過去），那就改拿掉歷史那份的。
   * 兩邊都改不了才算失敗，丟出第一個錯誤。
   */
  const removeNameTag = async (note: MemberNote): Promise<void> => {
    const patch = { 'style.nameTag': deleteField() }
    if (!note.isPending) {
      await updateDoc(doc($firestore, cols.queueHistory, note.id), patch)
      return
    }
    try {
      await updateDoc(doc($firestore, cols.queuePending, note.id), patch)
    } catch (err) {
      try {
        await updateDoc(doc($firestore, cols.queueHistory, note.id), patch)
      } catch {
        throw err
      }
    }
  }

  /**
   * 刪除個人資料：暱稱、頭貼、投稿額度紀錄、每張便利貼的投稿者紀錄，
   * 以及便利貼上的署名。
   *
   * 額度紀錄也是個資（記錄了這個人什麼時候投過稿），一起刪。副作用是
   * 這個人的當日額度會重置 —— 個資請求不常發生，可以接受。
   * 投稿者紀錄刪掉之後，留下來的便利貼就再也追溯不到這個人。
   *
   * 署名是送出時把暱稱與頭貼複製進便利貼的，刪了 users/{uid} 它還在，
   * 所以要逐張拿掉。**必須在刪投稿者紀錄之前做**：那是找到這些便利貼的唯一線索，
   * 先刪的話中途失敗就再也找不回來。
   *
   * **停權名單不動**：否則被封鎖的人申請刪除個資就等於解除封鎖。
   * 隱私權政策「保存多久」的停權紀錄一條就是為此而寫。
   */
  const deleteProfile = async (uid: string): Promise<void> => {
    const notes = await findMemberNotes(uid)
    await Promise.all(notes.filter(note => note.style?.nameTag).map(removeNameTag))

    const ownedIds = await findOwnedNoteIds(uid)
    await Promise.all([
      deleteDoc(doc($firestore, cols.users, uid)),
      deleteDoc(doc($firestore, cols.userQuota, uid)),
      ...ownedIds.map(id => deleteDoc(doc($firestore, cols.noteOwners, id)))
    ])
  }

  return { listMembers, listMarketingOptIns, getProfile, findMemberNotes, loadOwners, deleteNote, deleteProfile }
}
