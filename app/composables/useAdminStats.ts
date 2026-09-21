/**
 * 後台「營運總覽」的資料與圖表設定。
 *
 * 資料來源是 stats_daily 預聚合集合（見 useUploadStats），
 * 所以任何區間的成本都是「1 天 1 read」，不再逐筆掃便利貼。
 *
 * 這支只負責統計；Token、GPS、插播影片、便利貼清單仍留在 admin.vue。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Timestamp, collection, getCountFromServer, query, where } from 'firebase/firestore'
import {
  countDaysInclusive,
  fetchDailyUploadStats,
  fetchDayUploadStat,
  isValidDateKey,
  shiftDateKey,
  STATS_MAX_RANGE_DAYS,
  toDateKey,
  type DailyUploadStat
} from '~/composables/useUploadStats'

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
const AXIS_LABEL_STYLE = { color: '#6b7280', fontSize: 11 }
const AXIS_LINE_STYLE = { lineStyle: { color: '#cbd5e1' } }
const SPLIT_LINE_STYLE = { lineStyle: { color: '#e5e7eb' } }

/** 超過這個天數，熱力圖的欄位會擠成一團而且格數暴增，改用 24 格平均長條 */
const STATS_HEATMAP_MAX_DAYS = 120

/** 自動刷新間隔：只補今天那一格 + 即時卡，成本固定 3 reads */
const REFRESH_INTERVAL_MS = 30_000

export type StatsPresetKey = 'today' | 'last7' | 'last30' | 'thisMonth'

export interface UseAdminStatsOptions {
  /** 非權限類的錯誤要怎麼通知使用者（admin.vue 傳 toast） */
  onError: (message: string) => void
}

export function useAdminStats(db: any, { onError }: UseAdminStatsOptions) {
  const cols = useCollections()
  const loading = ref(false)
  // 預設「今天」必須在掛載後用瀏覽器時區設定；若在 setup 用 new Date()，
  // SSR（多為 UTC）與客戶端本地日曆日可能不同，會造成 hydration mismatch。
  const startDate = ref('')
  const endDate = ref('')
  const maxDate = ref('')
  const dailyRows = ref<DailyUploadStat[]>([])
  const lastHourUploads = ref(0)
  const permissionDenied = ref(false)
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let requestId = 0

  const presets: Array<{ key: StatsPresetKey; label: string }> = [
    { key: 'today', label: '今天' },
    { key: 'last7', label: '近 7 天' },
    { key: 'last30', label: '近 30 天' },
    { key: 'thisMonth', label: '本月' }
  ]

  const presetRange = (key: StatsPresetKey): { start: string; end: string } => {
    const now = new Date()
    const today = toDateKey(now)
    if (key === 'today') return { start: today, end: today }
    if (key === 'last7') return { start: shiftDateKey(today, -6), end: today }
    if (key === 'last30') return { start: shiftDateKey(today, -29), end: today }
    return { start: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }

  const activePreset = computed<StatsPresetKey | null>(() => {
    for (const preset of presets) {
      const range = presetRange(preset.key)
      if (range.start === startDate.value && range.end === endDate.value) return preset.key
    }
    return null
  })

  const applyPreset = (key: StatsPresetKey) => {
    const range = presetRange(key)
    startDate.value = range.start
    endDate.value = range.end
  }

  /** 來自選取的區間而非已載入資料，避免載入期間閃「共 0 天」 */
  const rangeDays = computed(() => {
    if (!isValidDateKey(startDate.value) || !isValidDateKey(endDate.value)) return 0
    return Math.max(0, countDaysInclusive(startDate.value, endDate.value))
  })
  const rangeLabel = computed(() =>
    startDate.value === endDate.value ? startDate.value : `${startDate.value} ~ ${endDate.value}`
  )
  const rangeIncludesToday = computed(() => {
    const today = toDateKey(new Date())
    return startDate.value <= today && today <= endDate.value
  })

  /** 區間越長，主趨勢圖的粒度就越粗；攤成連續小時軸超過 3 天就完全讀不出東西 */
  const granularity = computed<'hour' | 'day' | 'week'>(() => {
    const days = rangeDays.value
    if (days <= 1) return 'hour'
    if (days <= 31) return 'day'
    return 'week'
  })

  const showHourBreakdown = computed(() => rangeDays.value >= 2)
  const useHeatmap = computed(
    () => rangeDays.value >= 7 && rangeDays.value <= STATS_HEATMAP_MAX_DAYS
  )

  const trendTitle = computed(() => {
    if (granularity.value === 'hour') return '每小時上傳趨勢'
    if (granularity.value === 'week') return '每週上傳趨勢'
    return '每日上傳趨勢'
  })
  const breakdownTitle = computed(() => (useHeatmap.value ? '上傳熱力圖' : '時段分佈'))
  const breakdownSubtitle = computed(() => (useHeatmap.value ? '日期 × 時段' : '區間內每日平均'))

  const rangeUploads = computed(() => dailyRows.value.reduce((sum, row) => sum + row.total, 0))
  const avgPerDay = computed(() => {
    const days = rangeDays.value
    if (!days) return 0
    return Math.round((rangeUploads.value / days) * 10) / 10
  })
  const peakDay = computed<DailyUploadStat | null>(() => {
    let peak: DailyUploadStat | null = null
    for (const row of dailyRows.value) {
      if (!peak || row.total > peak.total) peak = row
    }
    return peak
  })
  const hasNoData = computed(() => dailyRows.value.length > 0 && rangeUploads.value === 0)

  const formatMonthDay = (dateKey: string) => dateKey.slice(5).replace('-', '/')

  const trendBuckets = computed<Array<{ label: string; value: number }>>(() => {
    const rows = dailyRows.value

    if (granularity.value === 'hour') {
      const hours = rows[0]?.hours ?? Array.from({ length: 24 }, () => 0)
      return hours.map((value, hour) => ({ label: HOUR_LABELS[hour] ?? '', value }))
    }

    if (granularity.value === 'day') {
      return rows.map(row => ({ label: formatMonthDay(row.date), value: row.total }))
    }

    const buckets: Array<{ label: string; value: number }> = []
    for (let offset = 0; offset < rows.length; offset += 7) {
      const chunk = rows.slice(offset, offset + 7)
      const first = chunk[0]
      const last = chunk[chunk.length - 1]
      if (!first || !last) continue
      buckets.push({
        label: `${formatMonthDay(first.date)}–${formatMonthDay(last.date)}`,
        value: chunk.reduce((sum, row) => sum + row.total, 0)
      })
    }
    return buckets
  })

  /** 區間內各時段的每日平均，回答「幾點最多人上傳」 */
  const hourProfile = computed(() => {
    const rows = dailyRows.value
    const days = Math.max(1, rows.length)
    return Array.from({ length: 24 }, (_, hour) => {
      const sum = rows.reduce((acc, row) => acc + (row.hours[hour] ?? 0), 0)
      return Math.round((sum / days) * 10) / 10
    })
  })

  const trendChartOption = computed(() => {
    const buckets = trendBuckets.value
    const g = granularity.value
    return {
      grid: { left: 40, right: 18, top: 16, bottom: g === 'week' ? 58 : 28 },
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} 筆` },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: buckets.map(bucket => bucket.label),
        axisLabel: {
          ...AXIS_LABEL_STYLE,
          interval: g === 'hour' ? 3 : 'auto',
          rotate: g === 'week' ? 30 : 0
        },
        axisLine: AXIS_LINE_STYLE
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: AXIS_LABEL_STYLE,
        splitLine: SPLIT_LINE_STYLE
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: buckets.map(bucket => bucket.value),
          lineStyle: { width: 2, color: '#111' },
          itemStyle: { color: '#111' },
          areaStyle: { color: 'rgba(17, 17, 17, 0.08)' }
        }
      ]
    }
  })

  const hourProfileChartOption = computed(() => ({
    grid: { left: 40, right: 18, top: 16, bottom: 28 },
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `平均 ${value} 筆` },
    xAxis: {
      type: 'category',
      data: HOUR_LABELS,
      axisLabel: { ...AXIS_LABEL_STYLE, interval: 3 },
      axisLine: AXIS_LINE_STYLE
    },
    yAxis: { type: 'value', axisLabel: AXIS_LABEL_STYLE, splitLine: SPLIT_LINE_STYLE },
    series: [
      {
        type: 'bar',
        data: hourProfile.value,
        itemStyle: { color: '#111', borderRadius: [3, 3, 0, 0] }
      }
    ]
  }))

  const heatmapChartOption = computed(() => {
    const rows = dailyRows.value
    const data: Array<[number, number, number]> = []
    let max = 0
    rows.forEach((row, dayIndex) => {
      row.hours.forEach((count, hour) => {
        if (count > max) max = count
        data.push([dayIndex, hour, count])
      })
    })

    return {
      // 逐格進場動畫在上千格時很有感，直接關掉
      animation: false,
      grid: { left: 48, right: 18, top: 12, bottom: 68 },
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const [dayIndex, hour, count] = params.value as [number, number, number]
          return `${rows[dayIndex]?.date ?? ''} ${HOUR_LABELS[hour] ?? ''}<br/>${count} 筆`
        }
      },
      xAxis: {
        type: 'category',
        data: rows.map(row => formatMonthDay(row.date)),
        splitArea: { show: true },
        axisLabel: { ...AXIS_LABEL_STYLE, fontSize: 10, interval: 'auto', rotate: 45 }
      },
      yAxis: {
        type: 'category',
        data: HOUR_LABELS,
        splitArea: { show: true },
        axisLabel: { ...AXIS_LABEL_STYLE, fontSize: 10, interval: 2 }
      },
      visualMap: {
        min: 0,
        max: Math.max(1, max),
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemWidth: 10,
        itemHeight: 90,
        text: ['多', '少'],
        textStyle: { ...AXIS_LABEL_STYLE, fontSize: 10 },
        inRange: { color: ['#f3f4f6', '#9ca3af', '#111'] }
      },
      series: [
        {
          type: 'heatmap',
          data,
          itemStyle: { borderColor: '#fff', borderWidth: 0.5 }
        }
      ]
    }
  })

  /** 近 1 小時是即時指標，只有在區間包含今天時才有意義 */
  const fetchLastHourUploads = async (): Promise<number> => {
    if (!rangeIncludesToday.value) return 0
    const oneHourAgoTs = Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000))
    const [pendingSnapshot, historySnapshot] = await Promise.all([
      getCountFromServer(
        query(collection(db, cols.queuePending), where('timestamp', '>=', oneHourAgoTs))
      ),
      getCountFromServer(
        query(collection(db, cols.queueHistory), where('timestamp', '>=', oneHourAgoTs))
      )
    ])
    return pendingSnapshot.data().count + historySnapshot.data().count
  }

  const isPermissionDenied = (err: any) =>
    err?.code === 'permission-denied' ||
    String(err?.message || '').includes('Missing or insufficient permissions')

  const load = async () => {
    if (!isValidDateKey(startDate.value) || !isValidDateKey(endDate.value)) return

    const id = ++requestId
    loading.value = true
    try {
      const [rows, lastHour] = await Promise.all([
        fetchDailyUploadStats(db, startDate.value, endDate.value),
        fetchLastHourUploads()
      ])
      if (id !== requestId) return
      dailyRows.value = rows
      lastHourUploads.value = lastHour
      permissionDenied.value = false
    } catch (err) {
      console.error('[admin] 載入營運統計失敗', err)
      if (id !== requestId) return
      // Rules 尚未開放 stats_daily 時，在卡片內說明修法，不用無意義的「請稍後再試」
      if (isPermissionDenied(err)) {
        permissionDenied.value = true
        dailyRows.value = []
        lastHourUploads.value = 0
      } else {
        onError('載入統計失敗，請稍後再試')
      }
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  const refreshToday = async () => {
    if (!rangeIncludesToday.value || loading.value) return
    // 權限未開放時不必每 30 秒重試一次刷 console
    if (permissionDenied.value) return
    // 記下進來時的世代：請求還在路上時使用者可能換了區間、load() 也跑完了，
    // 那這次的結果就已經過期，寫回去會讓「近 1 小時」顯示不屬於該區間的數字。
    const id = requestId
    const todayKey = toDateKey(new Date())
    try {
      const [today, lastHour] = await Promise.all([
        fetchDayUploadStat(db, todayKey),
        fetchLastHourUploads()
      ])
      if (id !== requestId) return
      const index = dailyRows.value.findIndex(row => row.date === todayKey)
      if (index >= 0) {
        const next = dailyRows.value.slice()
        next[index] = today
        dailyRows.value = next
      }
      lastHourUploads.value = lastHour
    } catch (err) {
      console.warn('[admin] 更新今日統計失敗', err)
    }
  }

  watch([startDate, endDate], () => {
    if (!isValidDateKey(startDate.value) || !isValidDateKey(endDate.value)) return

    let start = startDate.value
    let end = endDate.value
    // ISO 日期字串可直接字典序比較
    if (start > end) [start, end] = [end, start]
    if (countDaysInclusive(start, end) > STATS_MAX_RANGE_DAYS) {
      start = shiftDateKey(end, -(STATS_MAX_RANGE_DAYS - 1))
      onError(`統計區間最多 ${STATS_MAX_RANGE_DAYS} 天，已自動調整開始日期`)
    }
    if (start !== startDate.value || end !== endDate.value) {
      startDate.value = start
      endDate.value = end
      return // 修正後的值會再次觸發本 watcher
    }

    void load()
  })

  onMounted(() => {
    const today = toDateKey(new Date())
    maxDate.value = today
    if (!startDate.value || !endDate.value) {
      // 預設看今天
      startDate.value = today
      endDate.value = today
    }
    refreshTimer = setInterval(() => {
      void refreshToday()
    }, REFRESH_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  })

  return {
    // 狀態
    loading,
    startDate,
    endDate,
    maxDate,
    lastHourUploads,
    permissionDenied,
    // 區間
    presets,
    activePreset,
    applyPreset,
    rangeDays,
    rangeLabel,
    rangeIncludesToday,
    // 顯示切換與標題
    showHourBreakdown,
    useHeatmap,
    trendTitle,
    breakdownTitle,
    breakdownSubtitle,
    // 數字卡
    rangeUploads,
    avgPerDay,
    peakDay,
    hasNoData,
    // 圖表
    trendChartOption,
    hourProfileChartOption,
    heatmapChartOption,
    // 動作
    load
  }
}
