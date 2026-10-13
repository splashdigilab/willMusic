/**
 * LINE 會員相關的共用元件：右上角的登入狀態（MemberBadge）、登入鈕旁的資料告知（LoginDataNotice）、
 * 加官方帳號好友的提醒（LineFriendPrompt）。首頁、編輯器、等待頁、我的便利貼都會出現。
 *
 * 「今天還能送幾張」那一行不在這裡，在 quota.ts（好幾個頁面共用同一套說法）。
 */
export default {
  /** 右上角的頭像鈕與點開的小卡 */
  badge: {
    /** 暱稱讀不到時頂替的名字，也是已登入小卡的無障礙名稱 */
    account: 'LINE 帳號',
    /** 已登入時頭像鈕的無障礙名稱 */
    accountWithName: (name: string) => `LINE 帳號：${name}`,
    /** 沒登入時頭像鈕的無障礙名稱，也是小卡的標題 */
    notLoggedIn: '還沒登入',
    /** 沒登入時小卡的無障礙名稱 */
    loginStatus: '登入狀態',
    /** 第一句先講「瀏覽與製作不需要登入」，理由見 MemberBadge.vue 開頭 */
    guestHint: '瀏覽和製作都不用登入，送出便利貼時才需要。登入後可以看到自己送出的便利貼，以及今天還能送幾張。',
    login: 'LINE 登入',
    myNotes: '我的便利貼',
    logout: '登出',
    /** 額度那一行還在讀 */
    quotaLoading: '讀取中…',
    /** 後台關掉頻率限制、或讀不到用量：不猜張數，改講這句 */
    quotaUnknown: '送出便利貼時會使用這個帳號'
  },

  /**
   * 登入鈕旁邊的資料告知。中間的隱私權政策是連結（字用 legal.privacyPolicy），拆成前後兩段，
   * 讓各語言自己決定連結放在句子的哪裡（不用 v-html）。
   * 連結本身有左邊距，before 結尾不必補空白。
   */
  dataNotice: {
    before: '登入會取得 LINE 暱稱、大頭貼與電子郵件，用於活動聯繫。',
    after: ''
  },

  /** 加官方帳號好友的提醒 */
  lineFriend: {
    /** 等待頁橫條小卡的標題 */
    title: '加入微樂客 LINE 好友',
    subtitle: '活動與優惠消息，第一時間通知你',
    /** 橫條小卡右邊的實心鈕 */
    cta: '加入',
    /** 右上角小卡、我的便利貼的膠囊鈕。前面的加號各語言自己挑全形或半形，所以整句放在一起 */
    button: '＋ 加入微樂客 LINE 好友'
  }
}
