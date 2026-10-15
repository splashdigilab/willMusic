/** 我的便利貼（pages/my-notes.vue） */
export default {
  title: '我的便利貼',
  /** 左上圓鈕的無障礙名稱，也是頁尾那顆按鈕的字 */
  backHome: '回到首頁',

  /** 沒登入的人 */
  login: {
    title: '用 LINE 登入',
    /** 一個元素一行 */
    text: ['就可以看到自己送出的便利貼', '以及今天還能送幾張'],
    button: 'LINE 登入',
    failed: '登入沒有完成，請再試一次。'
  },

  /** 額度卡 */
  quota: {
    banned: '這個帳號已停止投稿資格',
    bannedNote: '如有疑問，請洽現場工作人員。',
    /** 後台關掉頻率限制、或讀不到用量：不顯示張數，只留這句話 */
    unlimited: '畫一張應援便利貼，送上 LED 大螢幕',
    label: '今天還能送',
    /** 大大的剩餘張數後面那一段，n 是每天的上限 */
    of: (n: number) => `/ ${n} 張`,
    /** 張數右邊的狀態標籤。不換行，太長會把左邊的張數擠窄 */
    exhausted: '明天再來吧！',
    /** wait 是倒數（m:ss） */
    cooldown: (wait: string) => `${wait} 後可以送`,
    ready: '現在就可以送',
    makeNote: '＼ 製作便利貼 ／'
  },

  /**
   * 被後台下架過、還沒到停權門檻時，額度卡裡的提醒。
   * n 是被下架的張數，limit 是停權門檻（STRIKE_LIMIT）
   */
  strikes: (n: number, limit: number) => `已有 ${n} 張便利貼因不符合活動規範被撤下，累計 ${limit} 張將停止投稿資格。`,

  /** 一張都沒有的時候 */
  empty: {
    /** 從來沒送過 */
    none: '還沒有送出過便利貼',
    /** 送過，但都被後台撤下了 */
    hidden: '目前沒有可以顯示的便利貼',
    /** 一個元素一行 */
    text: ['送出的便利貼會出現在這裡', '還能看到它排到第幾、什麼時候上牆']
  },

  /** 讀不到（多半是網路）。要跟「還沒有送出過」分開，否則會以為自己送的不見了 */
  loadError: {
    title: '讀取失敗',
    /** 一個元素一行 */
    text: ['暫時讀不到你的便利貼', '請確認網路連線後再試一次'],
    retry: '重新讀取'
  },

  /** 排隊中、已上牆兩張清單 */
  pending: '排隊中',
  played: '已上牆',
  /** 排在最前面（正在播或下一張） */
  yourTurn: '輪到你了！',
  watchScreen: '請看 LED 牆',
  /** 「前面還有 N 張」：N 要放大加粗，所以拆成前後兩段，n 給英文分單複數用 */
  aheadBefore: '前面還有 ',
  aheadAfter: (_n: number) => ' 張',
  /**
   * time 是排好的時間：今天的是 today(時:分)，其他天是「月/日 時:分」
   * （月日與時分的寫法交給瀏覽器依語言決定）
   */
  sentAt: (time: string) => `送出於 ${time}`,
  shownAt: (time: string) => `${time} 上牆`,
  today: (time: string) => `今天 ${time}`,

  /** 行銷信的同意 */
  marketing: '我願意收到微樂客的活動與優惠資訊',
  marketingTo: (email: string) => `寄到 ${email}`,

  footnote: '不符合活動規範的便利貼會被撤下，不會出現在這裡。'
}
