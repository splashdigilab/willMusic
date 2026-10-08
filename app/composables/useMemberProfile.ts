/**
 * 把 LINE 會員資料寫進 users/{uid}：暱稱、頭貼、email，以及本人勾選的行銷同意。
 *
 * server 只負責簽 custom token、完全不碰 Firestore（那樣才不必把 service account
 * 的寫入權限搬進 Nitro），所以這份資料由前端自己寫。之所以敢這樣做，是因為
 * firestore.rules 的 canWriteUserProfile() 會把 displayName 綁死在 custom token
 * 的 lineName claim 上 —— 那個值是 server 從 LINE 的 id_token 取出後簽進去的。
 *
 * 頭貼存 base64 而不是 LINE 的 CDN 網址，原因有兩個：
 *   1. 使用者換頭貼之後舊網址會失效，牆上就破圖
 *   2. 便利貼的下載／分享是用 html-to-image 把節點序列化，外部網域的圖片
 *      要有 CORS 標頭才抓得到，base64 直接繞開整個問題
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { UserProfile } from '~/types'

/** 頭貼大小上限，與 firestore.rules 的 canWriteUserProfile 一致 */
const AVATAR_MAX_BYTES = 30000

export const useMemberProfile = () => {
  const { $firestore, $auth } = useNuxtApp() as any
  const cols = useCollections()

  /**
   * 抓 LINE 頭貼並轉成 data URL。
   *
   * 走自家的 /api/auth/line/avatar 代理而不是瀏覽器直接抓：LINE 的 profile CDN
   * 沒有承諾提供 CORS 標頭，前端 fetch 會被擋下。代理同時負責把網址限制在
   * LINE 的網域，避免變成一個任人指定目標的抓取器。
   */
  const fetchAvatarDataUrl = async (pictureUrl: string): Promise<string | null> => {
    try {
      const { dataUrl } = await $fetch<{ dataUrl: string | null }>(
        '/api/auth/line/avatar',
        { query: { url: pictureUrl } }
      )
      if (!dataUrl || dataUrl.length > AVATAR_MAX_BYTES) return null
      return dataUrl
    } catch (e) {
      console.warn('[MemberProfile] 取得 LINE 頭貼失敗，略過', e)
      return null
    }
  }

  /**
   * 登入後把會員資料寫下來（已存在就只更新 updatedAt 與變動的欄位）。
   *
   * 整段是 fire-and-forget 的性質：寫失敗不該擋住使用者送出便利貼，
   * 這份資料的用途是後台辨識投稿者，不是流程的必要條件。
   */
  const syncProfile = async (
    displayName: string,
    pictureUrl: string | null,
    email: string | null
  ): Promise<void> => {
    const uid = $auth?.currentUser?.uid
    if (!uid) return

    const ref = doc($firestore, cols.users, uid)
    let existingData: UserProfile | undefined

    try {
      const existing = await getDoc(ref)
      existingData = existing.data() as UserProfile | undefined

      // 頭貼只在沒有、或使用者改了暱稱時重抓 —— 每次登入都抓一張圖
      // 對只是要送張便利貼的人來說是白等
      const needAvatar =
        !existingData?.avatar || existingData.displayName !== displayName
      const avatar = needAvatar && pictureUrl
        ? await fetchAvatarDataUrl(pictureUrl)
        : existingData?.avatar ?? null

      await setDoc(ref, {
        displayName,
        ...(avatar ? { avatar } : {}),
        // 文件可能是行銷勾選先建的（登入回來馬上就勾），那份沒有 createdAt
        createdAt: existing.get('createdAt') ?? serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true })
    } catch (e) {
      console.warn('[MemberProfile] 寫入會員資料失敗', e)
      return
    }

    // email 分開寫：規則還沒部署新版時這一筆會被擋，但不能連累上面那筆 ——
    // 名牌的頭貼讀的是上面寫的 avatar。
    // 沒拿到 email 時不去刪舊的：可能只是這次 LINE 沒給，不代表使用者要我們忘掉
    if (!email || existingData?.email === email) return
    try {
      await setDoc(ref, { email }, { merge: true })
    } catch (e) {
      console.warn('[MemberProfile] 寫入 email 失敗', e)
    }
  }

  /**
   * 要不要收行銷信。只有本人勾了才寄，所以預設是沒有這個欄位（＝不寄）。
   *
   * 暱稱與 email 一起帶上：這份文件可能還不存在（登入回來馬上就勾，syncProfile 還沒寫完），
   * 規則要求文件裡一定要有對得上 token 的暱稱，勾「要收」時也一定要有 email。
   * `marketingUpdatedAt` 是同意或取消的時間，日後被問「什麼時候同意的」要拿得出來。
   */
  const setMarketingOptIn = async (
    optIn: boolean,
    displayName: string,
    email: string
  ): Promise<boolean> => {
    const uid = $auth?.currentUser?.uid
    if (!uid) return false
    try {
      await setDoc(doc($firestore, cols.users, uid), {
        displayName,
        email,
        marketingOptIn: optIn,
        marketingUpdatedAt: serverTimestamp()
      }, { merge: true })
      return true
    } catch (e) {
      console.warn('[MemberProfile] 寫入行銷同意失敗', e)
      return false
    }
  }

  const getProfile = async (): Promise<UserProfile | null> => {
    const uid = $auth?.currentUser?.uid
    if (!uid) return null
    try {
      const snap = await getDoc(doc($firestore, cols.users, uid))
      return snap.exists() ? (snap.data() as UserProfile) : null
    } catch (e) {
      console.warn('[MemberProfile] 讀取會員資料失敗', e)
      return null
    }
  }

  return { syncProfile, getProfile, setMarketingOptIn }
}
