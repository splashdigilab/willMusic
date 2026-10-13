/** 送出之後的等待頁（pages/queue-status.vue） */
export default {
  title: '等待中',
  lead: '你的便利貼已經送出，排隊等著上大螢幕',
  countLabel: '目前佇列',
  /** 張數後面的單位。跟數字分開排（數字大、單位小），n 給英文分單複數用 */
  countUnit: (_n: number) => '張',
  waitLabel: '預估時間',
  // 預估時間的三種說法。數值卡的字很大，手機上一行大約只放得下 8 個英文字母寬，
  // 超過會折成兩行。
  /** 一分鐘內：不倒數秒數 */
  waitSoon: '準備顯示',
  /** 「大概時間」區間，n 是區間的上限分鐘數（2–10、15、20、25、30） */
  waitWithin: (n: number) => `約 ${n} 分鐘內`,
  /** 超過最大的那個區間，n 是那個區間的分鐘數 */
  waitOver: (n: number) => `超過 ${n} 分鐘`,
  backHome: '＼ 回到首頁 ／',
  viewMyNotes: '查看我的便利貼'
}
