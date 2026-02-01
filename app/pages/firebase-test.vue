<template>
  <div class="p-firebase-test">
    <div class="p-firebase-test__container">
      <h1>Firebase 連線測試</h1>

      <!-- Config Status -->
      <section class="p-firebase-test__test-section">
        <h2>1. 環境變數載入</h2>
        <div class="p-firebase-test__status-grid">
          <div class="p-firebase-test__status-item" :class="configStatus.apiKey ? 'ok' : 'error'">
            apiKey: {{ configStatus.apiKey ? '✓ 已載入' : '✗ 缺少' }}
          </div>
          <div class="p-firebase-test__status-item" :class="configStatus.authDomain ? 'ok' : 'error'">
            authDomain: {{ configStatus.authDomain ? '✓ 已載入' : '✗ 缺少' }}
          </div>
          <div class="p-firebase-test__status-item" :class="configStatus.projectId ? 'ok' : 'error'">
            projectId: {{ configStatus.projectId ? '✓ 已載入' : '✗ 缺少' }}
          </div>
          <div class="p-firebase-test__status-item" :class="configStatus.storageBucket ? 'ok' : 'error'">
            storageBucket: {{ configStatus.storageBucket ? '✓ 已載入' : '✗ 缺少' }}
          </div>
          <div class="p-firebase-test__status-item" :class="configStatus.appId ? 'ok' : 'error'">
            appId: {{ configStatus.appId ? '✓ 已載入' : '✗ 缺少' }}
          </div>
        </div>
      </section>

      <!-- Firestore Init -->
      <section class="p-firebase-test__test-section">
        <h2>2. Firestore 初始化</h2>
        <div class="p-firebase-test__status-item" :class="firestoreStatus">
          {{ firestoreMessage }}
        </div>
      </section>

      <!-- REST API Test (bypass SDK) - 先測這個！ -->
      <section class="p-firebase-test__test-section highlight">
        <h2>3. Firestore REST API 測試 ⭐ 先執行</h2>
        <p class="p-firebase-test__section-desc">繞過 SDK，直接用 HTTP 測試。成功代表 Firestore 已設定好。</p>
        <button
          class="p-firebase-test__test-btn"
          :disabled="testingRest"
          @click="runRestApiTest"
        >
          {{ testingRest ? '測試中...（8 秒）' : '執行 REST API 測試' }}
        </button>
        <div v-if="restTestResult" class="p-firebase-test__result-box" :class="restTestResult.success ? 'success' : 'error'">
          <p><strong>{{ restTestResult.success ? '✓ 成功' : '✗ 失敗' }}</strong></p>
          <pre>{{ restTestResult.message }}</pre>
        </div>
      </section>

      <!-- Read Test (SDK) -->
      <section class="p-firebase-test__test-section">
        <h2>4. Firestore SDK 讀取測試</h2>
        <button
          class="p-firebase-test__test-btn"
          :disabled="testing"
          @click="runReadTest"
        >
          {{ testing ? '測試中...' : '執行讀取測試' }}
        </button>
        <div v-if="readTestResult" class="p-firebase-test__result-box" :class="readTestResult.success ? 'success' : 'error'">
          <p><strong>{{ readTestResult.success ? '✓ 成功' : '✗ 失敗' }}</strong></p>
          <pre>{{ readTestResult.message }}</pre>
          <pre v-if="readTestResult.details">{{ readTestResult.details }}</pre>
        </div>
      </section>

      <!-- Write Test (Optional) -->
      <section class="p-firebase-test__test-section">
        <h2>5. Firestore SDK 寫入測試（tokens）</h2>
        <button
          class="p-firebase-test__test-btn"
          :disabled="testingWrite"
          @click="runWriteTest(false)"
        >
          {{ testingWrite ? '測試中...（最多等 10 秒）' : '建立測試 Token' }}
        </button>
        <button
          class="p-firebase-test__test-btn p-firebase-test__test-btn--alt"
          :disabled="testingWrite"
          @click="runWriteTest(true)"
        >
          使用本機時間重試
        </button>
        <div v-if="writeTestResult" class="p-firebase-test__result-box" :class="writeTestResult.success ? 'success' : 'error'">
          <p><strong>{{ writeTestResult.success ? '✓ 成功' : '✗ 失敗' }}</strong></p>
          <pre>{{ writeTestResult.message }}</pre>
        </div>
        <p v-if="writeTestResult && !writeTestResult.success" class="p-firebase-test__hint-text">
          若顯示逾時，請檢查：Firebase Console 是否已啟用 Firestore、安全規則是否允許寫入、網路連線是否正常
        </p>
      </section>

      <!-- 診斷建議 -->
      <section class="p-firebase-test__test-section p-firebase-test__diagnosis-section">
        <h2>🔧 逾時故障排除</h2>
        <ol>
          <li><strong>步驟 3 REST 逾時</strong> → Firestore 可能未建立。至
            <a :href="firebaseConsoleUrl" target="_blank" rel="noopener">Firebase Console</a>
            → Firestore Database → 建立資料庫（<strong>務必選 Native 模式</strong>，不是 Datastore）
          </li>
          <li><strong>步驟 3 回傳 404</strong> → 資料庫不存在，同上建立 Firestore</li>
          <li><strong>步驟 3 回傳 403</strong> → 至 Google Cloud Console 啟用 Firestore API，或檢查 API Key 限制</li>
          <li><strong>步驟 3 成功、4/5 SDK 逾時</strong> → SDK 或 IndexedDB 問題，嘗試無痕模式、換瀏覽器、關閉廣告阻擋</li>
          <li><strong>全部逾時</strong> → 檢查 VPN、防火牆、公司網路是否阻擋 firestore.googleapis.com</li>
        </ol>
        <a :href="firebaseConsoleUrl" target="_blank" rel="noopener" class="p-firebase-test__console-link">
          開啟 Firebase Console →
        </a>
      </section>

      <NuxtLink to="/home" class="p-firebase-test__back-link">← 返回首頁</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { collection, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

definePageMeta({ layout: false })

const config = useRuntimeConfig()
const { $firestore } = useNuxtApp()
const { createToken } = useFirestore()

const projectId = computed(() => config.public?.firebase?.projectId || '')
const apiKey = computed(() => config.public?.firebase?.apiKey || '')
const firebaseConsoleUrl = computed(() => 
  `https://console.firebase.google.com/project/${projectId.value}/firestore`
)

// 1. Config check
const configStatus = computed(() => ({
  apiKey: !!config.public?.firebase?.apiKey,
  authDomain: !!config.public?.firebase?.authDomain,
  projectId: !!config.public?.firebase?.projectId,
  storageBucket: !!config.public?.firebase?.storageBucket,
  appId: !!config.public?.firebase?.appId
}))

// 2. Firestore init
const firestoreStatus = ref<'pending' | 'ok' | 'error'>('pending')
const firestoreMessage = ref('檢查中...')

onMounted(() => {
  try {
    if ($firestore) {
      firestoreStatus.value = 'ok'
      firestoreMessage.value = '✓ Firestore 實例已初始化'
    } else {
      firestoreStatus.value = 'error'
      firestoreMessage.value = '✗ Firestore 實例為 undefined'
    }
  } catch (e) {
    firestoreStatus.value = 'error'
    firestoreMessage.value = `✗ 初始化失敗: ${(e as Error).message}`
  }
})

// 3. REST API test（直接呼叫，不經 SDK）
const testingRest = ref(false)
const restTestResult = ref<{ success: boolean; message: string } | null>(null)

const runRestApiTest = async () => {
  if (!projectId.value || !apiKey.value) {
    restTestResult.value = { success: false, message: '請先確認環境變數已載入' }
    return
  }
  testingRest.value = true
  restTestResult.value = null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const url = `https://firestore.googleapis.com/v1/projects/${projectId.value}/databases/(default)/documents/tokens?key=${apiKey.value}`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    const data = await res.json()
    if (res.ok) {
      const count = data.documents?.length ?? 0
      restTestResult.value = { success: true, message: `REST API 讀取成功，tokens 數量: ${count}` }
    } else {
      const errMsg = data.error?.message || data.error?.status || JSON.stringify(data)
      restTestResult.value = { 
        success: false, 
        message: `HTTP ${res.status}: ${errMsg}` 
      }
    }
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? '連線逾時（8 秒）' : (e?.message || String(e))
    restTestResult.value = { success: false, message: msg }
  } finally {
    testingRest.value = false
  }
}

// 超時包裝（10 秒）
const withTimeout = <T>(promise: Promise<T>, ms = 10000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`操作逾時（${ms / 1000} 秒）`)), ms)
    )
  ])
}

// 3. Read test
const testing = ref(false)
const readTestResult = ref<{ success: boolean; message: string; details?: string } | null>(null)

const runReadTest = async () => {
  testing.value = true
  readTestResult.value = null
  
  try {
    const db = $firestore as any
    const snapshot = await withTimeout(getDocs(collection(db, 'tokens')))
    readTestResult.value = {
      success: true,
      message: `成功讀取 tokens 集合`,
      details: `文件數量: ${snapshot.size}`
    }
  } catch (e: any) {
    readTestResult.value = {
      success: false,
      message: e?.message || String(e),
      details: e?.code ? `錯誤代碼: ${e.code}` : undefined
    }
  } finally {
    testing.value = false
  }
}

// 5. Write test（建立 token）
const testingWrite = ref(false)
const writeTestResult = ref<{ success: boolean; message: string } | null>(null)

const runWriteTest = async (useLocalTime: boolean) => {
  testingWrite.value = true
  writeTestResult.value = null
  try {
    if (useLocalTime) {
      const db = $firestore as any
      const tokenData = {
        status: 'unused',
        createdAt: Timestamp.now()
      }
      const docRef = await addDoc(collection(db, 'tokens'), tokenData)
      writeTestResult.value = { success: true, message: `已建立測試 Token（本機時間）: ${docRef.id}` }
    } else {
      const tokenId = await withTimeout(createToken())
      writeTestResult.value = { success: true, message: `已建立測試 Token: ${tokenId}` }
    }
  } catch (e: any) {
    writeTestResult.value = {
      success: false,
      message: e?.message || String(e)
    }
  } finally {
    testingWrite.value = false
  }
}
</script>

<style scoped>
/* Firebase 測試頁面 - 樣式簡化 */
</style>
