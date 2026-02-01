import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

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
    const db = getFirestore(app)

    return {
      provide: {
        firebase: app,
        firestore: db
      }
    }
  } catch (error) {
    console.error('[Firebase] 初始化失敗:', error)
    throw error
  }
})
