import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  type Unsubscribe,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore'
import type {
  QueuePendingItem,
  QueueHistoryItem,
  TokenDocument,
  CreateNoteForm
} from '~/types'

export const useFirestore = () => {
  const { $firestore } = useNuxtApp()
  const db = $firestore as any

  /**
   * 建立新的便利貼並加入待處理佇列
   */
  const createNote = async (form: CreateNoteForm, token: string): Promise<string> => {
    try {
      const noteData: Omit<QueuePendingItem, 'id'> = {
        content: form.content,
        style: form.style,
        token,
        timestamp: serverTimestamp() as any,
        status: 'waiting'
      }

      const docRef = await addDoc(collection(db, 'queue_pending'), noteData)
      
      // 更新 token 狀態
      const tokenQuery = query(collection(db, 'tokens'))
      const tokenSnapshot = await getDocs(tokenQuery)
      const tokenDoc = tokenSnapshot.docs.find(d => d.id === token)
      
      if (tokenDoc) {
        await updateDoc(doc(db, 'tokens', tokenDoc.id), {
          status: 'used'
        })
      }

      return docRef.id
    } catch (error) {
      console.error('Error creating note:', error)
      throw error
    }
  }

  /**
   * 監聽待處理佇列
   */
  const listenToPendingQueue = (
    callback: (items: QueuePendingItem[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, 'queue_pending'),
      orderBy('timestamp', 'asc')
    )

    return onSnapshot(q, (snapshot) => {
      const items: QueuePendingItem[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as QueuePendingItem))
      callback(items)
    })
  }

  /**
   * 即時監聽歷史紀錄（最新 N 筆，用於即時牆）
   */
  const listenToHistory = (
    pageSize: number = 60,
    callback: (items: QueueHistoryItem[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, 'queue_history'),
      orderBy('playedAt', 'desc'),
      limit(pageSize)
    )

    return onSnapshot(
      q,
      (snapshot) => {
        const items: QueueHistoryItem[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as QueueHistoryItem))
        callback(items)
      },
      (error) => {
        console.error('Error listening to history:', error)
      }
    )
  }

  /**
   * 取得歷史紀錄（支援分頁，用於典藏牆無限捲動）
   */
  const getHistory = async (
    pageSize: number = 20,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{
    items: QueueHistoryItem[]
    lastDoc: QueryDocumentSnapshot<DocumentData> | null
  }> => {
    try {
      let q = query(
        collection(db, 'queue_history'),
        orderBy('playedAt', 'desc'),
        limit(pageSize)
      )

      if (lastDoc) {
        q = query(q, startAfter(lastDoc))
      }

      const snapshot = await getDocs(q)
      const items: QueueHistoryItem[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as QueueHistoryItem))

      return {
        items,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null
      }
    } catch (error) {
      console.error('Error fetching history:', error)
      throw error
    }
  }

  /**
   * 將項目從待處理佇列移至歷史紀錄
   * - 使用 pending 的 document ID 作為 history 的 ID，確保同一項目不會產生重複紀錄
   * - 使用 transaction：僅當項目仍在 queue_pending 時才寫入，避免多 display 同時完成時重複
   */
  const moveToHistory = async (item: QueuePendingItem): Promise<void> => {
    try {
      if (!item.id) throw new Error('Item ID is required')

      const pendingRef = doc(db, 'queue_pending', item.id)
      const historyRef = doc(db, 'queue_history', item.id)

      await runTransaction(db, async (transaction) => {
        const pendingSnap = await transaction.get(pendingRef)
        if (!pendingSnap.exists()) {
          return
        }

        const historyData: Omit<QueueHistoryItem, 'id'> = {
          content: item.content,
          style: item.style,
          token: item.token,
          timestamp: item.timestamp,
          status: 'played',
          playedAt: serverTimestamp() as any
        }

        transaction.set(historyRef, historyData)
        transaction.delete(pendingRef)
      })
    } catch (error) {
      console.error('Error moving to history:', error)
      throw error
    }
  }

  /**
   * 驗證 token 是否可用
   */
  const validateToken = async (token: string): Promise<boolean> => {
    try {
      const tokenQuery = query(collection(db, 'tokens'))
      const snapshot = await getDocs(tokenQuery)
      const tokenDoc = snapshot.docs.find(d => d.id === token)

      if (!tokenDoc) return false

      const data = tokenDoc.data() as TokenDocument
      return data.status === 'unused'
    } catch (error) {
      console.error('Error validating token:', error)
      return false
    }
  }

  /**
   * 建立新的 token
   */
  const createToken = async (): Promise<string> => {
    try {
      const tokenData: Omit<TokenDocument, 'id'> = {
        status: 'unused',
        createdAt: serverTimestamp() as any
      }

      const docRef = await addDoc(collection(db, 'tokens'), tokenData)
      return docRef.id
    } catch (error) {
      console.error('Error creating token:', error)
      throw error
    }
  }

  return {
    createNote,
    listenToPendingQueue,
    listenToHistory,
    getHistory,
    moveToHistory,
    validateToken,
    createToken
  }
}
