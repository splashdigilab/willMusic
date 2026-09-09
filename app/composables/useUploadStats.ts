import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'firebase/firestore'

/**
 * 每日上傳統計的預聚合集合，一天一份文件、doc ID 即 YYYY-MM-DD。
 *
 * 後台營運總覽不再逐筆讀取 queue_pending / queue_history 來分桶，
 * 而是讀這裡的聚合文件：任何區間的成本都是「1 天 1 read」。
 *
 * 文件格式：
 *   stats_daily/2026-09-08
 *     date:  '2026-09-08'
 *     total: 123
 *     hours: { '0': 2, '1': 0, ..., '23': 8 }
 *
 * 需要對應的 Firestore Rules 允許上傳端 create/update 這個集合，
 * 否則 recordUploadStat 會被拒（上傳本身不受影響，統計會停在 0）。
 */
export const STATS_DAILY_COLLECTION = 'stats_daily'

/**
 * 一次查詢允許的最長區間。
 * 因為改成預聚合（1 天 1 read），一年也只有 366 reads，不必壓得太低。
 */
export const STATS_MAX_RANGE_DAYS = 366

export interface DailyUploadStat {
  /** YYYY-MM-DD（瀏覽器本地時區） */
  date: string
  total: number
  /** 長度固定 24，index 即小時 */
  hours: number[]
}

/** 以瀏覽器本地時區產生 YYYY-MM-DD，與後台日期選擇器同一套曆法 */
export const toDateKey = (date: Date): string => date.toLocaleDateString('en-CA')

export const isValidDateKey = (dateKey: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(dateKey)

/** 不可用 new Date('YYYY-MM-DD')，那會被當成 UTC 午夜而位移一天 */
const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export const shiftDateKey = (dateKey: string, days: number): string => {
  const base = parseDateKey(dateKey)
  base.setDate(base.getDate() + days)
  return toDateKey(base)
}

export const countDaysInclusive = (startKey: string, endKey: string): number => {
  const diff = (parseDateKey(endKey).getTime() - parseDateKey(startKey).getTime()) / 86_400_000
  return Math.round(diff) + 1
}

export const eachDateKey = (startKey: string, endKey: string): string[] => {
  const total = countDaysInclusive(startKey, endKey)
  return Array.from({ length: Math.max(0, total) }, (_, i) => shiftDateKey(startKey, i))
}

const emptyHours = (): number[] => Array.from({ length: 24 }, () => 0)

/** Firestore 的 hours 是稀疏 map，補成長度 24 的陣列方便圖表使用 */
const normalizeHours = (raw: any): number[] => {
  const hours = emptyHours()
  if (!raw || typeof raw !== 'object') return hours
  for (let hour = 0; hour < 24; hour += 1) {
    const value = Number(raw[String(hour)])
    hours[hour] = Number.isFinite(value) && value > 0 ? value : 0
  }
  return hours
}

const toDailyStat = (dateKey: string, data: any): DailyUploadStat => {
  const hours = normalizeHours(data?.hours)
  const rawTotal = Number(data?.total)
  return {
    date: dateKey,
    total: Number.isFinite(rawTotal) ? rawTotal : hours.reduce((sum, n) => sum + n, 0),
    hours
  }
}

const emptyDailyStat = (dateKey: string): DailyUploadStat => ({
  date: dateKey,
  total: 0,
  hours: emptyHours()
})

/**
 * 上傳成功後累加當日／當時的計數。
 *
 * 桶位以瀏覽器本地時區計算，跟後台的日期選擇器一致；
 * 便利貼本身的 timestamp 仍是 serverTimestamp，兩者可能在整點邊界差幾秒。
 */
export const recordUploadStat = async (db: any, at: Date = new Date()): Promise<void> => {
  const dateKey = toDateKey(at)
  await setDoc(
    doc(db, STATS_DAILY_COLLECTION, dateKey),
    {
      date: dateKey,
      total: increment(1),
      hours: { [String(at.getHours())]: increment(1) },
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )
}

/** 讀取區間內每日統計；沒有文件的日期補 0，回傳長度等於區間天數 */
export const fetchDailyUploadStats = async (
  db: any,
  startKey: string,
  endKey: string
): Promise<DailyUploadStat[]> => {
  const snapshot = await getDocs(
    query(
      collection(db, STATS_DAILY_COLLECTION),
      where('date', '>=', startKey),
      where('date', '<=', endKey),
      orderBy('date', 'asc')
    )
  )

  const byDate = new Map<string, DailyUploadStat>()
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as any
    const dateKey = typeof data?.date === 'string' ? data.date : docSnap.id
    byDate.set(dateKey, toDailyStat(dateKey, data))
  }

  return eachDateKey(startKey, endKey).map(dateKey => byDate.get(dateKey) ?? emptyDailyStat(dateKey))
}

/** 讀取單日統計，給 30 秒自動刷新用（1 read） */
export const fetchDayUploadStat = async (db: any, dateKey: string): Promise<DailyUploadStat> => {
  const snapshot = await getDoc(doc(db, STATS_DAILY_COLLECTION, dateKey))
  if (!snapshot.exists()) return emptyDailyStat(dateKey)
  return toDailyStat(dateKey, snapshot.data())
}

