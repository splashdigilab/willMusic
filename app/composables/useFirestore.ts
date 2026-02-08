import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  getDocs,
  where,
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
  /**
   * 移除物件中的 undefined 欄位（Firestore 不接受 undefined）
   */
  const removeUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) return obj
    if (Array.isArray(obj)) return obj.map(removeUndefined)
    if (typeof obj === 'object') {
      const result: Record<string, any> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) result[k] = removeUndefined(v)
      }
      return result
    }
    return obj
  }

  const createNote = async (form: CreateNoteForm, token: string): Promise<string> => {
    try {
      const sanitizedStyle = removeUndefined(form.style)
      const noteData = {
        content: form.content,
        style: sanitizedStyle,
        token,
        timestamp: serverTimestamp(),
        status: 'waiting'
      }

      await runTransaction(db, async (transaction) => {
        // 1. 檢查 token 是否仍為 unused
        const tokenRef = doc(db, 'tokens', token)
        const tokenSnap = await transaction.get(tokenRef)
        if (!tokenSnap.exists()) {
          throw new Error('Token 不存在')
        }
        const tokenData = tokenSnap.data() as TokenDocument
        if (tokenData.status !== 'unused') {
          throw new Error('Token 無效或已使用')
        }

        // 2. 使用 token 作為 queue_pending 的 doc id，避免重複建立
        const pendingRef = doc(db, 'queue_pending', token)
        const pendingSnap = await transaction.get(pendingRef)
        if (pendingSnap.exists()) {
          throw new Error('Token 已提交，請使用新的連結')
        }
        transaction.set(pendingRef, noteData)

        // 3. 標記 token 為已使用
        transaction.update(tokenRef, { status: 'used' })
      })

      return token
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
   * 依 token 去重：同一 token 只保留一筆（避免重複提交造成多筆）
   */
  const deduplicateByToken = (items: QueueHistoryItem[]): QueueHistoryItem[] => {
    const seen = new Set<string>()
    return items.filter((item) => {
      const key = item.token || item.id
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
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
        const seen = new Set<string>()
        const rawItems: QueueHistoryItem[] = []
        snapshot.docs.forEach((docSnap) => {
          const item = {
            id: docSnap.id,
            ...docSnap.data()
          } as QueueHistoryItem
          if (item.id && !seen.has(item.id)) {
            seen.add(item.id)
            rawItems.push(item)
          }
        })
        callback(deduplicateByToken(rawItems))
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
      const seen = new Set<string>()
      const rawItems: QueueHistoryItem[] = []
      snapshot.docs.forEach((docSnap) => {
        const item = {
          id: docSnap.id,
          ...docSnap.data()
        } as QueueHistoryItem
        if (item.id && !seen.has(item.id)) {
          seen.add(item.id)
          rawItems.push(item)
        }
      })

      return {
        items: deduplicateByToken(rawItems),
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
      const historyDocId = item.token || item.id
      const historyRef = doc(db, 'queue_history', historyDocId)

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

      // 清理同 token 的歷史重複資料（保留 historyDocId）
      if (item.token) {
        const dupQuery = query(
          collection(db, 'queue_history'),
          where('token', '==', item.token)
        )
        const dupSnap = await getDocs(dupQuery)
        const dupDocs = dupSnap.docs.filter((d) => d.id !== historyDocId)
        if (dupDocs.length > 0) {
          await Promise.all(
            dupDocs.map((d) => deleteDoc(doc(db, 'queue_history', d.id)))
          )
        }
      }
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
