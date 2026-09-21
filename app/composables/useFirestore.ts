import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  where,
  doc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  getDoc,
  setDoc,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore'
import type {
  QueuePendingItem,
  QueueHistoryItem,
  TokenDocument,
  CreateNoteForm
} from '~/types'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { recordUploadStat } from '~/composables/useUploadStats'

/** 手繪圖在 Storage 上的資料夾 */
export const NOTE_DRAWING_PATH = 'note_drawings'

export const useFirestore = () => {
  const { $firestore, $storage } = useNuxtApp()
  const db = $firestore as any
  const cols = useCollections()
  const storage = $storage as any

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

  /**
   * 產生無法預測的檔名片段。
   *
   * 檔名**不能**只用便利貼的 doc ID：有 token 時 doc ID 就是 token，而 token
   * 印在店內螢幕的 QR code 上任何人都看得到。配合 Storage 規則的「只允許
   * 建立、不允許覆寫」，攻擊者只要搶先上傳一個同名檔案就能讓真正的顧客
   * 永遠上傳失敗。加上隨機碼之後，卡位與重試碰撞都不可能發生。
   */
  const randomFileSuffix = (): string => {
    const cryptoObj = globalThis.crypto
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 12)
    return Math.random().toString(36).slice(2, 14)
  }

  /**
   * 手繪圖改存 Storage，文件只留網址。
   *
   * 原本是把 base64 data URL 直接塞進 Firestore 文件，但單筆文件上限 1MB，
   * 使用者畫得太滿就會上傳失敗（而且錯誤訊息看不懂）；首頁一次抓 100 筆時
   * 也等於把所有圖一起拖下來。
   *
   * 顯示端是 `<img :src>`，data URL 與 https URL 都能吃，所以**舊便利貼完全
   * 不受影響**，也不需要搬移既有資料。刪除便利貼時是用文件裡存的網址去刪檔，
   * 不是從 doc ID 推算路徑，所以檔名帶隨機碼不影響清理。
   *
   * 上傳失敗時沿用原本的 base64：這樣「程式碼先上線、Storage 規則後套用」
   * 的順序也不會壞掉，只是暫時退回舊行為。
   */
  const persistDrawing = async (style: any, noteId: string): Promise<any> => {
    const drawing = style?.drawing
    if (typeof drawing !== 'string' || !drawing.startsWith('data:')) return style

    try {
      const blob = await (await fetch(drawing)).blob()
      const path = `${NOTE_DRAWING_PATH}/${noteId}-${randomFileSuffix()}.png`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, blob, { contentType: 'image/png' })
      return { ...style, drawing: await getDownloadURL(fileRef) }
    } catch (error) {
      console.error('[createNote] 手繪圖上傳 Storage 失敗，暫時沿用內嵌資料', error)
      return style
    }
  }

  /**
   * 建立新的便利貼並加入待處理佇列
   * - 有 token：使用 token 作為 queue_pending 的 doc ID，並在 transaction 內將 token 標記為 used
   * - 無 token：直接建立 queue_pending 文件（給後台關閉 token 驗證時使用）
   */
  const createNoteInternal = async (form: CreateNoteForm, token?: string): Promise<string> => {
    try {
      // 先決定 doc ID，手繪圖才能用同一個 ID 當檔名。
      // 上傳 Storage 必須在 transaction 之外完成（transaction 內不能做非 Firestore 的非同步工作）。
      const pendingRef = token
        ? doc(db, cols.queuePending, token)
        : doc(collection(db, cols.queuePending))
      const sanitizedStyle = await persistDrawing(removeUndefined(form.style), pendingRef.id)

      const createNoteWithToken = async (resolvedToken: string): Promise<string> => {
        const noteData = {
          content: form.content,
          style: sanitizedStyle,
          token: resolvedToken,
          timestamp: serverTimestamp(),
          status: 'waiting'
        }

        const tokenPendingRef = doc(db, cols.queuePending, resolvedToken)
        const tokenRef = doc(db, cols.tokens, resolvedToken)

        await runTransaction(db, async (transaction) => {
          // 先讀取 token 確保狀態
          const tokenSnap = await transaction.get(tokenRef)
          if (!tokenSnap.exists()) {
            throw new Error('Token does not exist')
          }

          const tokenData = tokenSnap.data()
          if (tokenData.status !== 'unused') {
            throw new Error('Token already used')
          }

          // 寫入 pending queue 並將 token 標記為 used
          transaction.set(tokenPendingRef, noteData)
          transaction.update(tokenRef, { status: 'used' })
        })

        return resolvedToken
      }

      if (token) {
        return await createNoteWithToken(token)
      }

      try {
        await setDoc(pendingRef, {
          content: form.content,
          style: sanitizedStyle,
          token: pendingRef.id,
          timestamp: serverTimestamp(),
          status: 'waiting'
        })
        return pendingRef.id
      } catch (error: any) {
        const denied =
          error?.code === 'permission-denied' ||
          String(error?.message || '').includes('Missing or insufficient permissions')
        if (!denied) throw error

        // 當後端 Rules 仍強制 token 寫入時，自動建立內部 token 後重送，
        // 讓前端在「不需 token」模式下仍可正常上傳。
        try {
          const autoTokenRef = await addDoc(collection(db, cols.tokens), {
            status: 'unused',
            createdAt: serverTimestamp()
          })
          return await createNoteWithToken(autoTokenRef.id)
        } catch (autoTokenError: any) {
          const autoDenied =
            autoTokenError?.code === 'permission-denied' ||
            String(autoTokenError?.message || '').includes('Missing or insufficient permissions')
          if (autoDenied) {
            throw new Error('目前後端權限設定不允許無 Token 上傳，請先開啟後台 Token 驗證或調整 Firestore 規則。')
          }
          throw autoTokenError
        }
      }
    } catch (error) {
      console.error('Error creating note:', error)
      throw error
    }
  }

  /**
   * 建立便利貼，並累加後台營運總覽用的每日／每小時計數。
   * 統計是 fire-and-forget：寫入失敗（例如 Rules 未開放 stats_daily）不影響上傳結果。
   */
  const createNote = async (form: CreateNoteForm, token?: string): Promise<string> => {
    const noteId = await createNoteInternal(form, token)
    void recordUploadStat(db).catch((error) => {
      console.warn('[stats] 累加每日上傳統計失敗', error)
    })
    return noteId
  }

  /**
   * 依 token 去重：同一 token 只保留一筆
   */
  const deduplicateByToken = (items: QueueHistoryItem[]): QueueHistoryItem[] => {
    const seen = new Set<string>()
    return items.filter((item) => {
      const key = item.token || item.id || ''
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
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
        collection(db, cols.queueHistory),
        orderBy('playedAt', 'desc'),
        limit(pageSize)
      )

      if (lastDoc) {
        q = query(q, startAfter(lastDoc))
      }

      const snapshot = await getDocs(q)
      const rawItems: QueueHistoryItem[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as QueueHistoryItem))

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
   * 清理同一 token 的重複歷史紀錄
   * - 只保留 doc ID === token 的那筆
   * - 僅當「同 token 有多筆」時才刪除 doc ID ≠ token 的孤兒，絕不刪除唯一一筆
   */
  const cleanupDuplicateHistory = async (token: string): Promise<number> => {
    if (!token) return 0
    try {
      const dupQuery = query(
        collection(db, cols.queueHistory),
        where('token', '==', token)
      )
      const dupSnap = await getDocs(dupQuery)
      // 只有當同 token 真的有多筆時才刪除孤兒，避免誤刪唯一一筆
      if (dupSnap.docs.length <= 1) return 0
      const orphans = dupSnap.docs.filter(d => d.id !== token)
      if (orphans.length > 0) {
        await Promise.all(
          orphans.map(d => deleteDoc(doc(db, cols.queueHistory, d.id)))
        )
        console.warn(`[cleanupDuplicateHistory] Deleted ${orphans.length} orphan(s) for token: ${token}`)
      }
      return orphans.length
    } catch (e) {
      console.error('[cleanupDuplicateHistory] Error:', e)
      return 0
    }
  }

  /**
   * 將項目從 queue_pending 移至 queue_history
   *
   * 關鍵設計：
   * 1. 以 token 作為 history doc ID（保證同 token 只寫一筆）
   * 2. 在 transaction 內同時檢查 history 是否已存在（冪等）
   * 3. transaction 完成後立即清理 + 延遲清理同 token 殘留 history
   */
  const moveToHistory = async (item: QueuePendingItem): Promise<void> => {
    try {
      if (!item.id) throw new Error('Item ID is required')

      const token = item.token || item.id
      const pendingRef = doc(db, cols.queuePending, item.id)
      const historyRef = doc(db, cols.queueHistory, token)

      await runTransaction(db, async (transaction) => {
        const pendingSnap = await transaction.get(pendingRef)
        const historySnap = await transaction.get(historyRef)

        if (historySnap.exists()) {
          if (pendingSnap.exists()) {
            transaction.delete(pendingRef)
          }
          return
        }

        if (!pendingSnap.exists()) {
          return
        }

        const pendingData = pendingSnap.data()
        const historyData = {
          content: pendingData.content ?? item.content,
          style: pendingData.style ?? item.style,
          token: pendingData.token ?? token,
          timestamp: pendingData.timestamp ?? item.timestamp,
          status: 'played',
          playedAt: serverTimestamp()
        }

        transaction.set(historyRef, historyData)
        transaction.delete(pendingRef)
      })

      // 僅在有重複時才清理（cleanupDuplicateHistory 內已判斷 dupSnap.docs.length > 1）
      await cleanupDuplicateHistory(token)

    } catch (error) {
      console.error('[moveToHistory] Error:', error)
      throw error
    }
  }

  /**
   * 驗證 token 狀態並回傳詳細原因
   * @returns 'valid' | 'expired' | 'used' | 'invalid'
   */
  const checkTokenStatus = async (token: string): Promise<'valid' | 'expired' | 'used' | 'invalid'> => {
    try {
      const tokenSnap = await getDoc(doc(db, cols.tokens, token))
      if (!tokenSnap.exists()) return 'invalid'
      const data = tokenSnap.data() as TokenDocument
      if (data.status !== 'unused') return 'used'
      if (!data.createdAt || typeof (data.createdAt as any).toMillis !== 'function') return 'invalid'

      const createdMs = (data.createdAt as any).toMillis() as number
      const nowMs = Date.now()
      const THIRTY_MIN_MS = 30 * 60 * 1000

      if (nowMs - createdMs > THIRTY_MIN_MS) return 'expired'

      return 'valid'
    } catch (error) {
      console.error('Error checking token status:', error)
      // 如果發生權限錯誤（前端可能無法直接讀取 tokens collection，除非 Rules 允許），
      // 此函式可能會拋錯，需搭配前端 try-catch 處理，或調整 Rules
      throw error
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

      const docRef = await addDoc(collection(db, cols.tokens), tokenData)
      return docRef.id
    } catch (error) {
      console.error('Error creating token:', error)
      throw error
    }
  }

  return {
    createNote,
    getHistory,
    moveToHistory,
    checkTokenStatus,
    createToken
  }
}
