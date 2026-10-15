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
 *
 * 例外是投稿頻率限制（`rateLimitConfig`）：測試站要能關掉限流反覆送，
 * 正式站不能跟著關，所以這一份設定的文件 ID 帶後綴（editor_rate_limit_dev）。
 * 節慶主題（`siteThemeConfig`）同理：在測試站切成萬聖節試看，正式站不能跟著換。
 */

export const SYSTEM_COLLECTION = 'system'

export interface FirestoreCollections {
  queuePending: string
  queueHistory: string
  tokens: string
  statsDaily: string
  users: string
  userQuota: string
  bannedUsers: string
  noteOwners: string
  blockedNotes: string
  userStrikes: string
  /** system 底下投稿頻率設定的文件 ID（不是集合名稱） */
  rateLimitConfig: string
  /** system 底下節慶主題設定的文件 ID（不是集合名稱），後台「播放設定」可改 */
  siteThemeConfig: string
}

export const useCollections = (): FirestoreCollections => {
  // 'none' 等同不加後綴，規則見 normalizeFirestoreSuffix。
  //
  // 這段正規化刻意在執行時做，不在 nuxt.config 算好再傳：NUXT_PUBLIC_FIRESTORE_SUFFIX 這個名字
  // 剛好命中 Nuxt 的 runtimeConfig 自動覆寫規則（public.firestoreSuffix），
  // SSR 時 Nuxt 會拿環境變數的原始字串蓋掉 nuxt.config 算好的值。
  // 只在 nuxt.config 轉換的話會被繞過，正式站就會去找 queue_pendingnone。
  const suffix = normalizeFirestoreSuffix(useRuntimeConfig().public.firestoreSuffix)
  return {
    queuePending: `queue_pending${suffix}`,
    queueHistory: `queue_history${suffix}`,
    tokens: `tokens${suffix}`,
    statsDaily: `stats_daily${suffix}`,
    // LINE 會員資料也分組。Firebase Auth 的帳號本身兩站共用（uid 相同，
    // 不會重複建），但測試站的登入不該把暱稱與頭貼寫進正式站的資料。
    users: `users${suffix}`,
    // 投稿配額同樣分組——不分的話在測試站測限流會吃掉正式站的每日額度
    userQuota: `user_quota${suffix}`,
    // 停權名單跟著分組：在測試站試封鎖，不該連正式站的顧客一起擋掉
    bannedUsers: `banned_users${suffix}`,
    // 便利貼的投稿者。跟著便利貼分組，因為 doc ID 就是便利貼的 ID
    noteOwners: `note_owners${suffix}`,
    // 被下架的便利貼與違規次數，跟著便利貼與停權名單分組
    blockedNotes: `blocked_notes${suffix}`,
    userStrikes: `user_strikes${suffix}`,
    // 頻率設定兩站分開：測試站關掉限流不會連正式站一起關。
    // 規則裡 user_quota_dev 讀的也是 _dev 這一份，兩邊要對得上
    rateLimitConfig: `editor_rate_limit${suffix}`,
    // 節慶主題兩站分開：測試站切主題試看，不會連正式站一起換
    siteThemeConfig: `site_theme${suffix}`
  }
}
