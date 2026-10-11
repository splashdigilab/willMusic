import { initializeApp } from 'firebase/app'
import { getFirestore, initializeFirestore } from 'firebase/firestore'
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

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

    // Firestore 用預設的記憶體快取，不開 IndexedDB 離線快取。
    // 離線快取會把每次讀到的文件都寫進手機的 IndexedDB（舊便利貼的手繪圖還是 base64，
    // 一筆就幾百 KB），多分頁模式還要搶主控權，打包也多約 76KB。
    // 代價是重新整理頁面時不會先秀出上次的舊資料，要等網路回來 —— 牆面本來就要即時資料。
    let db;
    if (import.meta.client) {
      db = initializeFirestore(app, {})
    } else {
      db = getFirestore(app)
    }

    // 不用 getAuth：它會連彈窗／轉址登入的程式一起打包（約 20KB），
    // 這個站只用帳密（後台）與 LINE 換來的 custom token 登入，用不到。
    // persistence 與 getAuth 的預設順序相同，已登入的人不會被登出。
    const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
    const storage = getStorage(app)

    return {
      provide: {
        firebase: app,
        firestore: db,
        auth,
        storage
      }
    }
  } catch (error) {
    console.error('[Firebase] 初始化失敗:', error)
    throw error
  }
})
