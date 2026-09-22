/**
 * Firestore 集合名稱
 *
 * 集合名稱原本硬寫在各個 composable 與頁面裡（8 個檔案），
 * 想用一份獨立的便利貼資料做測試時無處可切，因此集中到這裡。
 *
 * 用法：在 .env 設 NUXT_PUBLIC_FIRESTORE_SUFFIX，所有「資料型」集合都會加上該後綴。
 *   （空值 = 正式環境，維持原本的 queue_pending / queue_history / tokens / stats_daily）
 *   NUXT_PUBLIC_FIRESTORE_SUFFIX=_dev
 *     → queue_pending_dev / queue_history_dev / tokens_dev / stats_daily_dev
 *
 * 刻意不加後綴的是 `system` 集合：它放的是設定（啟用中的 token、GPS 圍籬、
 * 大螢幕影片等），測試時通常希望沿用同一份設定，分開反而要重設一次。
 * 若日後需要連設定也分離，再把 system 一併納入即可。
 */

export const SYSTEM_COLLECTION = 'system'

export interface FirestoreCollections {
  queuePending: string
  queueHistory: string
  tokens: string
  statsDaily: string
}

export const useCollections = (): FirestoreCollections => {
  const raw = (useRuntimeConfig().public.firestoreSuffix as string) || ''
  // 'none' 等同不加後綴 —— Amplify 的環境變數一律不接受空字串，
  // 正式站那一列沒辦法留空，只能填一個字來表達「無」。
  //
  // 這段正規化刻意放在這裡，不放 nuxt.config：NUXT_PUBLIC_FIRESTORE_SUFFIX 這個名字
  // 剛好命中 Nuxt 的 runtimeConfig 自動覆寫規則（public.firestoreSuffix），
  // SSR 時 Nuxt 會拿環境變數的原始字串蓋掉 nuxt.config 算好的值。
  // 寫在 nuxt.config 的話會被繞過，正式站就會去找 queue_pendingnone。
  const suffix = raw === 'none' ? '' : raw
  return {
    queuePending: `queue_pending${suffix}`,
    queueHistory: `queue_history${suffix}`,
    tokens: `tokens${suffix}`,
    statsDaily: `stats_daily${suffix}`
  }
}
