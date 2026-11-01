/**
 * 首頁的便利貼牆：最新播過的 100 張（queue_history，照 playedAt 新到舊，依 token 去重）。
 *
 * 原本是每個訪客的瀏覽器自己用 Firestore SDK 讀：要先建立連線（多好幾次往返）才開始讀，
 * 每打開一次首頁就是 100 次 Firestore 讀取。改由伺服器讀、在記憶體快取 30 秒，
 * 這段時間內的訪客共用同一份。首頁的牆本來就不是即時的（讀一次就不再更新），晚 30 秒看到新便利貼沒差。
 *
 * 快取的做法與理由同 site-theme.get.ts：過期後第一個請求當場重讀、同一時間只重讀一次、
 * 重讀失敗沿用舊值。Amplify 的 SSR 跑在 Lambda 上，背景重讀走不完，所以不用 swr。
 * 一開始就讀不到時回 502，首頁會退回瀏覽器自己讀（pages/index.vue 的 fetchWallItems）。
 *
 * 回應自己 gzip：100 張約 116KB 的 JSON，gzip 後約 40KB，Nitro 不會替 API 回應壓縮。
 */
import { gzipSync } from 'node:zlib'
import { createError, defineEventHandler, getRequestHeader, setResponseHeader, type H3Event } from 'h3'
import type { WallNote } from '~~/app/types'
import { deduplicateByToken } from '~~/app/utils/dedupe-notes'
import { normalizeFirestoreSuffix } from '~~/app/utils/firestore-suffix'
import { firestoreBase, fromFirestoreFields, type FirestoreValue } from '~~/server/utils/firestore-rest'

/** 牆上放幾張。跟 pages/index.vue 的 HISTORY_FETCH_LIMIT 一樣（退回瀏覽器自己讀時用那個） */
const WALL_LIMIT = 100
const FETCH_TIMEOUT_MS = 3_000
const MAX_AGE_MS = 30_000

interface RunQueryRow {
  document?: { name: string; fields?: Record<string, FirestoreValue> }
}

const readWall = async (event: H3Event): Promise<WallNote[]> => {
  const config = useRuntimeConfig(event)
  const { projectId } = config.public.firebase as { projectId?: string }
  if (!projectId) throw new Error('沒有設定 Firebase projectId')
  const collectionId = `queue_history${normalizeFirestoreSuffix(config.public.firestoreSuffix)}`

  const rows = await $fetch<RunQueryRow[]>(
    `${firestoreBase()}/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId }],
          orderBy: [{ field: { fieldPath: 'playedAt' }, direction: 'DESCENDING' }],
          limit: WALL_LIMIT
        }
      },
      // 不重試，理由同 site-theme：ofetch 預設逾時後再試一次，等於讓首頁多等一倍
      timeout: FETCH_TIMEOUT_MS,
      retry: 0
    }
  )

  const notes = rows.flatMap((row): WallNote[] => {
    if (!row.document) return []
    const fields = fromFirestoreFields(row.document.fields)
    return [{
      id: row.document.name.split('/').pop(),
      token: typeof fields.token === 'string' ? fields.token : '',
      content: typeof fields.content === 'string' ? fields.content : '',
      // StickyNote 直接讀 style 底下的欄位，沒有 style 的舊資料給空物件
      style: (fields.style ?? {}) as WallNote['style']
    }]
  })
  return deduplicateByToken(notes)
}

interface CachedWall {
  json: string
  /** 同一份壓好存著，不必每個請求重壓 */
  gzip: Buffer
  readAt: number
}

let cached: CachedWall | undefined
/** 正在重讀的那一次，同時進來的請求共用 */
let pending: Promise<CachedWall> | undefined

const refresh = async (event: H3Event): Promise<CachedWall> => {
  const json = JSON.stringify({ items: await readWall(event) })
  return { json, gzip: gzipSync(json), readAt: Date.now() }
}

export default defineEventHandler(async (event) => {
  // 不讓 CDN 再存一層，理由同 site-theme：記憶體快取已經擋住 Firestore 讀取
  setResponseHeader(event, 'Cache-Control', 'no-store')

  if (!cached || Date.now() - cached.readAt >= MAX_AGE_MS) {
    pending ??= refresh(event).finally(() => { pending = undefined })
    try {
      cached = await pending
    } catch (error: any) {
      if (!cached) throw createError({ statusCode: 502, statusMessage: 'wall fetch failed' })
      console.error('[wall] 重讀便利貼牆失敗，繼續用舊值', error?.message ?? error)
      // 30 秒後再試：Firestore 出問題的期間，不讓每個請求都多等一次逾時
      cached.readAt = Date.now()
    }
  }

  setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setResponseHeader(event, 'Vary', 'Accept-Encoding')
  if (/\bgzip\b/.test(getRequestHeader(event, 'accept-encoding') ?? '')) {
    setResponseHeader(event, 'Content-Encoding', 'gzip')
    return cached.gzip
  }
  return cached.json
})
