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
   * 取得歷史紀錄（支援分頁）
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
   */
  const moveToHistory = async (item: QueuePendingItem): Promise<void> => {
    try {
      if (!item.id) throw new Error('Item ID is required')

      // 加入歷史紀錄
      const historyData: Omit<QueueHistoryItem, 'id'> = {
        content: item.content,
        style: item.style,
        token: item.token,
        timestamp: item.timestamp,
        status: 'played',
        playedAt: serverTimestamp() as any
      }

      await addDoc(collection(db, 'queue_history'), historyData)

      // 從待處理佇列刪除
      await deleteDoc(doc(db, 'queue_pending', item.id))
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
    getHistory,
    moveToHistory,
    validateToken,
    createToken
  }
}
