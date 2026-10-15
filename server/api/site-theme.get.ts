/**
 * 後台設定的節慶主題（system/site_theme，測試站 site_theme_dev；見 app/data/themes.ts 的「切換方式」）。
 *
 * 由 app/plugins/site-theme.ts 在伺服器畫頁面前呼叫（同一個行程內直接呼叫，不走網路）。
 * 文件名稱由呼叫端帶 ?doc= 過來（命名規則在 app/utils/collections.ts 的 siteThemeConfig），
 * 這裡只收「這個站自己那一份」：只檢查長得像 site_theme_<後綴> 的話，
 * 每換一個後綴就多一次 Firestore 讀取、快取也多一筆，等於開了一個可以被刷的口。
 *
 * 快取在這個行程的記憶體裡，30 秒：
 *   - 過期後的第一個請求當場重讀（約多等 0.1～0.3 秒），所以後台改完，最多約 30 秒後新打開的頁面就換上
 *   - 同一時間只會有一次重讀，不會每個請求各打一次
 *   - 重讀失敗時保留舊值（只記錄錯誤），全站不會因為一次失敗閃回原本的主題；30 秒後再試
 *
 * 原本用 Nitro 的 defineCachedEventHandler（swr：過期時先回舊值、背景重讀），在 Amplify 上不成立：
 * Amplify 的 SSR 跑在 Lambda 上，回應一送出執行環境就凍結，背景重讀要等之後的請求把它喚醒才走得完。
 * 2026-10-15 正式站切成萬聖節後，舊值多撐了 4 分鐘、而且是靠連續打好幾次頁面才換上；
 * 流量少的時段可能更久，每個執行個體各自卡著，還會有人看到新主題、有人看到舊的。
 *
 * 讀法走 Firestore REST、不帶 API key：system 集合的規則是所有人可讀（firestore.rules），
 * 不需要登入也不需要金鑰。網站的 Firebase 金鑰若在 GCP 限定了網域，伺服器帶它反而會被擋。
 */
import { createError, defineEventHandler, getQuery, setResponseHeader, type H3Event } from 'h3'
import { normalizeFirestoreSuffix } from '~~/app/utils/firestore-suffix'

const FETCH_TIMEOUT_MS = 2_000
const MAX_AGE_MS = 30_000

/** 這個站讀得到的唯一一份；要跟 useCollections().siteThemeConfig 算出來的一樣 */
const siteThemeDocId = (event: H3Event): string =>
  `site_theme${normalizeFirestoreSuffix(useRuntimeConfig(event).public.firestoreSuffix)}`

/**
 * Firestore REST 的位址。本機用 Firebase 模擬器測試時，照 Firebase 官方 SDK 的慣例
 * 看 FIRESTORE_EMULATOR_HOST（例如 127.0.0.1:8080）；正式與測試站都不會設這個變數
 */
const firestoreBase = (): string => {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST
  return emulator ? `http://${emulator}/v1` : 'https://firestore.googleapis.com/v1'
}

interface FirestoreDocument {
  fields?: { themeId?: { stringValue?: string } }
}

const docIdOf = (event: H3Event): string => {
  const doc = getQuery(event).doc
  if (doc !== siteThemeDocId(event)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid doc' })
  }
  return doc
}

const readThemeId = async (event: H3Event, docId: string): Promise<string | null> => {
  const { projectId } = useRuntimeConfig(event).public.firebase as { projectId?: string }
  if (!projectId) return null

  try {
    const res = await $fetch<FirestoreDocument>(
      `${firestoreBase()}/projects/${projectId}/databases/(default)/documents/system/${docId}`,
      // 不重試：ofetch 預設會在逾時後再試一次，等於讓伺服器多等一倍
      { timeout: FETCH_TIMEOUT_MS, retry: 0 }
    )
    // null（舊版後台的「依部署設定」）跟沒設定一樣交給環境變數
    return res.fields?.themeId?.stringValue ?? null
  } catch (error: any) {
    // 404 是正常狀況：後台還沒設定過（這個結果要快取，所以照常回傳）
    if (error?.statusCode === 404 || error?.response?.status === 404) return null
    throw error
  }
}

/** 最後一次讀到的值與時間。一個站只讀一份文件（docIdOf 擋掉其他的），所以只要存一筆 */
let cached: { themeId: string | null; readAt: number } | undefined
/** 正在重讀的那一次，同時進來的請求共用 */
let pending: Promise<string | null> | undefined

export default defineEventHandler(async (event) => {
  const docId = docIdOf(event)
  // CDN 再存一層的話，只在瀏覽器端畫的 /admin 直接打這支時又多舊 30 秒；記憶體快取已經擋住 Firestore 讀取
  setResponseHeader(event, 'Cache-Control', 'no-store')

  if (cached && Date.now() - cached.readAt < MAX_AGE_MS) return { themeId: cached.themeId }

  pending ??= readThemeId(event, docId).finally(() => { pending = undefined })
  try {
    const themeId = await pending
    cached = { themeId, readAt: Date.now() }
    return { themeId }
  } catch (error: any) {
    if (cached) {
      console.error('[site-theme] 重讀節慶主題失敗，繼續用舊值', error?.message ?? error)
      // 30 秒後再試：Firestore 出問題的期間，不讓每個請求都多等一次逾時
      cached.readAt = Date.now()
      return { themeId: cached.themeId }
    }
    throw createError({ statusCode: 502, statusMessage: 'site theme fetch failed' })
  }
})
