/** 各頁共用的按鈕與狀態。只放真的到處都在用的；某一頁自己的字放在那一頁的 namespace */
export default {
  confirm: '確認',
  cancel: '取消',
  ok: '確定',
  close: '關閉',
  loading: '載入中…',
  /** 送出中的按鈕（AppModal 沒給 loadingText 時的預設）。跟 loading 不是同一件事，不共用 */
  processing: '處理中...',
  backToWall: '回到便利貼牆',
  /** 語言選單的無障礙名稱 */
  language: '語言'
}
