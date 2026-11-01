import { initializeApp } from 'firebase/app'
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth'

/**
 * Firebase app 與登入。每一頁都要知道「現在是誰」，所以登入在這裡就建好（$auth）。
 *
 * Firestore 與 Storage 不在這裡建：打包起來約 90KB（gzip 後），而首頁平常用不到 ——
 * 牆上的便利貼由 /api/wall 給，沒登入的人也不會去讀會員資料。在這裡 import 的話
 * 每一頁的第一支 JS 都要帶著它們。改成各自用到時才取：
 *   - Firestore：utils/firestore-client.ts 的 clientDb()；首頁會碰到的幾支（頭像小卡的額度與停權、
 *     登入回來寫會員資料、牆面讀不到時的備援）用 await import('firebase/firestore')，點下去才下載
 *   - Storage：getStorage()，只有上傳手繪圖、後台上傳影片、刪手繪圖時用
 * getFirestore()／getStorage() 同一個 app 只會建一個實例，在哪裡第一次呼叫都一樣。
 *
 * Firestore 用預設的記憶體快取，不開 IndexedDB 離線快取（getFirestore() 的預設就是這樣）。
 * 離線快取會把每次讀到的文件都寫進手機的 IndexedDB（舊便利貼的手繪圖還是 base64，
 * 一筆就幾百 KB），多分頁模式還要搶主控權，打包也多約 76KB。
 * 代價是重新整理頁面時不會先秀出上次的舊資料，要等網路回來 —— 牆面本來就要即時資料。
 *
 * Storage 的重試上限維持預設（上傳 10 分鐘）：同一個實例全站共用，後台的插播影片動輒幾十 MB，
 * 店內網路不穩時要靠長時間重試撐過去。前台送出時的手繪圖另外有自己的期限，
 * 見 useFirestore 的 persistDrawing
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const firebaseConfig = {
    apiKey: config.public.firebase?.apiKey || '',
    authDomain: config.public.firebase?.authDomain || '',
    projectId: config.public.firebase?.projectId || '',
    storageBucket: config.public.firebase?.storageBucket || '',
    messagingSenderId: config.public.firebase?.messagingSenderId || '',
    appId: config.public.firebase?.appId || ''
  }

  // 檢查必要配置
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('[Firebase] 缺少必要配置，請檢查 .env 檔案是否有設定:')
    console.error('  - NUXT_PUBLIC_FIREBASE_API_KEY')
    console.error('  - NUXT_PUBLIC_FIREBASE_PROJECT_ID')
  }

  try {
    const app = initializeApp(firebaseConfig)

    // 不用 getAuth：它會連彈窗／轉址登入的程式一起打包（約 20KB），
    // 這個站只用帳密（後台）與 LINE 換來的 custom token 登入，用不到。
    // persistence 與 getAuth 的預設順序相同，已登入的人不會被登出。
    const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })

    return {
      provide: {
        firebase: app,
        auth
      }
    }
  } catch (error) {
    console.error('[Firebase] 初始化失敗:', error)
    throw error
  }
})
