/**
 * 下架違規的便利貼，以及隨之而來的違規次數與自動停權。
 *
 * 「下架」跟「刪除」（useMemberAdmin.deleteNote）是兩件事：
 *   下架 = 違規。便利貼搬進 blocked_notes（只有後台讀得到），投稿者違規次數加一，
 *          加到 STRIKE_LIMIT 就自動停權。誤判可以恢復。
 *   刪除 = 不是違規（本人要求撤下、測試資料、刪個資）。直接刪掉，不計次。
 *
 * 擋送出的仍然只有 banned_users（firestore.rules 的 canCreateNote）。規則數不了文件，
 * 所以次數由後台在下架的同一個 transaction 裡算，到門檻就順便寫入停權名單。
 *
 * getSelfStrikes 是前台用的，其餘限後台（規則只開放 isStaff()）。
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore'
import { deleteObject, ref as storageRef } from 'firebase/storage'
import { STRIKE_LIMIT, type BlockedNote, type NoteOwner, type UserProfile, type UserStrikes } from '~/types'

/** 後台一次載入的已下架清單上限。下架是例外處置，不做分頁 */
export const BLOCKED_LIST_LIMIT = 200

export type BlockedNoteRow = BlockedNote & { id: string }

export interface BlockResult {
  /** 投稿者。匿名時期的便利貼是 null */
  uid: string | null
  /** 這次下架之後的違規次數。匿名的、或這張早就下架過的是 null */
  strikes: number | null
  /** 這一下讓這個帳號達到門檻、被自動停權 */
  autoBanned: boolean
  /** 這張早就下架過了（另一位店員剛按、或上一次其實已經寫成功），這次沒有再計次 */
  alreadyBlocked: boolean
}

export interface RestoreResult {
  uid: string | null
  /** 恢復之後的違規次數。匿名的是 null */
  strikes: number | null
  /** 這個帳號還在停權中。恢復不會自動解除，由店員決定 */
  stillBanned: boolean
}

/** 待播、歷史兩邊都找不到這張：在清單讀出來之後被刪掉或下架了 */
export class NoteGoneError extends Error {
  constructor () {
    super('note-gone')
    this.name = 'NoteGoneError'
  }
}

const toMillis = (ts: any): number => ts?.toMillis?.() ?? 0

export const useNoteModeration = () => {
  const { $firestore, $auth, $storage } = useNuxtApp() as any
  const cols = useCollections()

  const strikesRef = (uid: string) => doc($firestore, cols.userStrikes, uid)

  /**
   * 目前登入的會員被下架過幾張。讀不到時回 0：這只是提醒，
   * 真正擋送出的是停權名單，誤報成有違規反而會嚇到正常的人。
   */
  const getSelfStrikes = async (): Promise<number> => {
    const uid = $auth?.currentUser?.uid
    if (!uid) return 0
    try {
      const snap = await getDoc(strikesRef(uid))
      return snap.exists() ? ((snap.data() as UserStrikes).count ?? 0) : 0
    } catch (e) {
      console.warn('[strikes] 讀取違規次數失敗', e)
      return 0
    }
  }

  // ── 以下限後台 ──────────────────────────────────────────

  const getStrikes = async (uid: string): Promise<number> => {
    const snap = await getDoc(strikesRef(uid))
    return snap.exists() ? ((snap.data() as UserStrikes).count ?? 0) : 0
  }

  /** 這張便利貼的投稿者 uid。匿名時期的沒有紀錄，回 null */
  const getOwner = async (noteId: string): Promise<string | null> => {
    const snap = await getDoc(doc($firestore, cols.noteOwners, noteId))
    return snap.exists() ? (snap.data() as NoteOwner).uid : null
  }

  /**
   * 下架一張便利貼。全部在一個 transaction 裡：
   *   1. 便利貼原樣寫進 blocked_notes，待播、歷史兩份都刪（理由同 deleteNote：
   *      清單不是即時的，畫面上的待播那張可能剛被大螢幕搬進歷史）
   *   2. 有投稿者的話違規次數加一；加到 STRIKE_LIMIT、而且還沒停權，就寫入停權名單
   *
   * 跟大螢幕的 moveToHistory 撞在一起時，兩邊的 transaction 會有一邊重跑，
   * 重跑時讀到的就是對方寫完的結果，不會一邊搬進歷史、一邊以為還在待播。
   * 兩位店員同時下架同一張也一樣：後到的那一次會看到 blocked_notes 已經有了，不重複計次。
   *
   * 手繪圖不刪，blocked_notes 裡還指著它（後台要看得到下架的是什麼）。
   */
  const blockNote = async (noteId: string, reason: string): Promise<BlockResult> => {
    const pendingRef = doc($firestore, cols.queuePending, noteId)
    const historyRef = doc($firestore, cols.queueHistory, noteId)
    const ownerRef = doc($firestore, cols.noteOwners, noteId)
    const blockedRef = doc($firestore, cols.blockedNotes, noteId)
    const staff: string = $auth?.currentUser?.email ?? ''

    return runTransaction($firestore, async (tx) => {
      // transaction 裡所有的讀取都要在寫入之前
      const [pendingSnap, historySnap, ownerSnap, blockedSnap] = await Promise.all([
        tx.get(pendingRef), tx.get(historyRef), tx.get(ownerRef), tx.get(blockedRef)
      ])

      if (blockedSnap.exists()) {
        // 殘留的待播、歷史照樣清掉（照理不會有），但不再計次
        tx.delete(pendingRef)
        tx.delete(historyRef)
        return {
          uid: (blockedSnap.data() as BlockedNote).uid ?? null,
          strikes: null,
          autoBanned: false,
          alreadyBlocked: true
        }
      }

      // 兩邊都有的話以歷史為準：那是比較後面的狀態（moveToHistory 會在同一個 transaction 刪掉待播）
      const source = historySnap.exists() ? historySnap : pendingSnap.exists() ? pendingSnap : null
      if (!source) throw new NoteGoneError()
      const uid = ownerSnap.exists() ? (ownerSnap.data() as NoteOwner).uid : null

      let strikes: number | null = null
      let banWrite: Record<string, unknown> | null = null
      if (uid) {
        const bannedRef = doc($firestore, cols.bannedUsers, uid)
        const [strikesSnap, bannedSnap] = await Promise.all([tx.get(strikesRef(uid)), tx.get(bannedRef)])
        strikes = (strikesSnap.exists() ? ((strikesSnap.data() as UserStrikes).count ?? 0) : 0) + 1

        // 已經停權（店員手動封鎖過、或之前就到門檻）的不覆寫：原本的時間、備註要留著
        if (strikes >= STRIKE_LIMIT && !bannedSnap.exists()) {
          // 停權名單要存暱稱快照（理由見 BannedUser）。讀不到就留空，後台會顯示編號
          const profileSnap = await tx.get(doc($firestore, cols.users, uid))
          banWrite = {
            displayName: profileSnap.exists() ? ((profileSnap.data() as UserProfile).displayName ?? '') : '',
            reason: `違規累計 ${strikes} 次，自動停權`,
            bannedAt: serverTimestamp(),
            bannedBy: staff,
            auto: true
          }
        }

        tx.set(strikesRef(uid), { count: strikes, updatedAt: serverTimestamp() })
        if (banWrite) tx.set(bannedRef, banWrite)
      }

      tx.set(blockedRef, {
        note: source.data(),
        from: source === historySnap ? 'history' : 'pending',
        uid,
        reason,
        blockedAt: serverTimestamp(),
        blockedBy: staff
      })
      tx.delete(pendingRef)
      tx.delete(historyRef)

      return { uid, strikes, autoBanned: !!banWrite, alreadyBlocked: false }
    })
  }

  /**
   * 恢復（誤判）：放回歷史牆、違規次數減一。**不會**自動解除停權 —— 次數掉回門檻以下
   * 不代表這個人沒問題，要不要解除由店員在會員面板決定。
   *
   * 只能放回歷史，不能放回待播：規則不開放後台建立 queue_pending（那是前台投稿的入口）。
   * 所以從待播下架的便利貼恢復之後會直接出現在首頁牆上，不會在 LED 上重播放大。
   *
   * 欄位跟 moveToHistory 一樣明列，不整份照抄：下架時存的是原樣，可能帶著
   * 測試期間舊格式寫在便利貼上的 uid，而 queue_history 是公開可讀的。
   */
  const restoreNote = async (noteId: string): Promise<RestoreResult> => {
    const blockedRef = doc($firestore, cols.blockedNotes, noteId)
    const historyRef = doc($firestore, cols.queueHistory, noteId)

    return runTransaction($firestore, async (tx) => {
      const [blockedSnap, historySnap] = await Promise.all([tx.get(blockedRef), tx.get(historyRef)])
      if (!blockedSnap.exists()) throw new NoteGoneError()
      const record = blockedSnap.data() as BlockedNote
      const uid = record.uid ?? null

      let strikes: number | null = null
      let stillBanned = false
      if (uid) {
        const [strikesSnap, bannedSnap] = await Promise.all([
          tx.get(strikesRef(uid)),
          tx.get(doc($firestore, cols.bannedUsers, uid))
        ])
        const before = strikesSnap.exists() ? ((strikesSnap.data() as UserStrikes).count ?? 0) : 0
        strikes = Math.max(0, before - 1)
        stillBanned = bannedSnap.exists()
        tx.set(strikesRef(uid), { count: strikes, updatedAt: serverTimestamp() })
      }

      // 歷史牆上已經有同一個 ID 的話（照理不會）就不蓋掉它，只撤銷這次下架
      if (!historySnap.exists()) {
        const note = record.note
        tx.set(historyRef, {
          content: note.content ?? '',
          style: note.style ?? {},
          token: note.token ?? noteId,
          timestamp: note.timestamp ?? serverTimestamp(),
          status: 'played',
          // 從待播下架的還沒播過、沒有 playedAt。歷史牆依 playedAt 排序，少了它就不會出現
          playedAt: ('playedAt' in note && note.playedAt) || serverTimestamp()
        })
      }
      tx.delete(blockedRef)

      return { uid, strikes, stillBanned }
    })
  }

  /**
   * 刪掉下架紀錄本身（活動結束清資料用），連同投稿者紀錄與手繪圖。
   * **違規次數不動**：這是清資料，不是撤銷違規。誤判要用 restoreNote。
   * 順序同 deleteNote：先刪文件、再清圖，清圖失敗不影響刪除本身。
   */
  const purgeBlockedNote = async (record: BlockedNoteRow): Promise<void> => {
    const batch = writeBatch($firestore)
    batch.delete(doc($firestore, cols.blockedNotes, record.id))
    batch.delete(doc($firestore, cols.noteOwners, record.id))
    await batch.commit()

    const drawing = record.note?.style?.drawing
    if (typeof drawing !== 'string' || !drawing.startsWith('http')) return
    try {
      await deleteObject(storageRef($storage, drawing))
    } catch (err: any) {
      if (err?.code !== 'storage/object-not-found') {
        console.warn('[admin] 下架紀錄已刪除，但手繪圖檔案清除失敗', err)
      }
    }
  }

  /** 已下架的便利貼，新下架的在前 */
  const listBlockedNotes = async (): Promise<BlockedNoteRow[]> => {
    const snap = await getDocs(query(
      collection($firestore, cols.blockedNotes),
      orderBy('blockedAt', 'desc'),
      limit(BLOCKED_LIST_LIMIT)
    ))
    return snap.docs.map(d => ({ ...(d.data() as BlockedNote), id: d.id }))
  }

  /** 某個人被下架的便利貼，新的在前。排序在前端做，不必為此開複合索引 */
  const findBlockedNotesOf = async (uid: string): Promise<BlockedNoteRow[]> => {
    const snap = await getDocs(query(collection($firestore, cols.blockedNotes), where('uid', '==', uid)))
    return snap.docs
      .map(d => ({ ...(d.data() as BlockedNote), id: d.id }))
      .sort((a, b) => toMillis(b.blockedAt) - toMillis(a.blockedAt))
  }

  return {
    getSelfStrikes,
    getStrikes,
    getOwner,
    blockNote,
    restoreNote,
    purgeBlockedNote,
    listBlockedNotes,
    findBlockedNotesOf
  }
}
