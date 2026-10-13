/**
 * 分頁標題與摘要（usePageSeo）。
 *
 * 搜尋引擎抓的是繁中版（爬蟲不送語言偏好，見 utils/i18n.ts 的 detectLocale），
 * 所以首頁這一組同時寫在 nuxt.config 當全站預設，改的時候兩邊一起改。
 */
export default {
  home: {
    title: '數位應援便利貼',
    description: '在微樂客 WillMusic 做一張專屬的應援便利貼，審核通過後會在店內大螢幕輪播，和大家一起分享對音樂的熱愛。'
  },
  editor: {
    title: '製作便利貼',
    description: '選材質與造型、寫字、手繪、貼貼紙，做一張自己的應援便利貼，用 LINE 登入就能送上微樂客店內的大螢幕。'
  },
  queue: {
    title: '等待上大螢幕',
    description: '便利貼已經送出，看目前排隊的張數與預估上大螢幕的時間。'
  },
  myNotes: {
    title: '我的便利貼',
    description: '看自己送出的便利貼、排到第幾張，以及今天還能送幾張。'
  }
}
