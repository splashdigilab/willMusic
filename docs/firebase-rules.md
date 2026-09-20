# Firebase 安全規則：套用前務必先看

`firestore.rules` 與 `storage.rules` 是**依照程式碼裡實際存在的每一個查詢**寫出來的，
但撰寫當下**無法讀取線上現行的規則**（開發機沒有安裝 Firebase CLI）。
所以這兩份檔案還沒有套用到任何環境，**套用前一定要先驗證**。

## 這些規則改了什麼

目前線上的規則（依 README 舊版的紀錄）大致是「全部開放」：

```
allow read: if true;                       // 所有集合
queue_pending  allow create, delete: if true;
queue_history  allow create: if true;
tokens         allow read, update, create: if true;
```

也就是任何人都可以清空待播佇列、自行發放上傳憑證。新規則收斂成：

| 集合 | 未登入使用者 | 已登入（後台／大螢幕／掃碼頁） |
|---|---|---|
| `queue_pending` | 讀、投稿（限制欄位與長度） | 全部 |
| `queue_history` | 只能讀 | 全部 |
| `tokens` | 讀單一文件、把 `unused` 改成 `used` | 全部 |
| `stats_daily` | 只能累加計數（限制欄位） | 讀取 |
| `system/*` | 只能讀 | 全部 |
| 其他 | 全部拒絕 | 全部拒絕 |

Storage 則新增 `note_drawings/`（前台上傳手繪圖，限 3MB PNG、不可覆寫），
`canvas_interstitial/` 維持只有後台能寫。

## 套用前：在模擬器驗證（不碰正式站）

```bash
npm install -g firebase-tools     # 開發機目前沒有
firebase login
firebase emulators:start --only firestore,storage,auth
```

模擬器跑在本機，**不會連到正式專案**。接著把 `.env` 的 Firebase 設定指向模擬器
（或用 `connectFirestoreEmulator`）跑一次完整流程，至少要確認這幾條路徑都通：

- [ ] 首頁能載入便利貼牆
- [ ] 編輯器能送出便利貼（**含手繪圖**）
- [ ] 等待頁能看到佇列數字
- [ ] 後台能登入、看到統計、能刪除便利貼
- [ ] 後台能產生 Token，掃碼頁能收到
- [ ] 大螢幕能播放、播完能搬進歷史紀錄
- [ ] 後台能上傳與移除插播影片

## 套用

```bash
firebase deploy --only firestore:rules,storage:rules
```

建議**先在測試專案套用、跑過一輪**，確認沒問題再套到正式專案。

## 出事了怎麼辦

Firebase Console 的 Firestore／Storage → 規則 → 「查看歷史記錄」可以看到每一個
舊版本並直接還原。套用前先把現行規則複製一份存起來會更保險。

---

# 部署新版程式前的檢查清單

這個分支除了規則之外還有兩項會改變線上行為，部署前請確認：

## 1. GPS 定位限制會開始生效

`editor.vue` 原本寫死了 `ENABLE_GPS_VALIDATION = false`，所以後台的 GPS 設定
一直沒有作用。這個分支把它接回 `system/editor_geo_fence.enabled`。

> **部署前請到 Firebase Console 確認 `system/editor_geo_fence` 這份文件的
> `enabled` 目前是什麼值。** 如果之前有人在後台打開過那個開關（畫面會跳「已儲存」，
> 所以很可能有），部署後就會**立刻開始擋掉指定半徑外的所有上傳**。
>
> 不想啟用的話，部署前先到後台把開關關掉，或直接刪除那份文件。

## 2. 手繪圖改存 Storage

新送出的便利貼，`style.drawing` 會從內嵌的 base64 變成 Storage 的網址。

- **舊便利貼完全不受影響**，也不需要搬移資料。
- **正式站（舊版程式）也能正常顯示新格式**：顯示端是 `<img :src>`，
  data URL 與 https URL 都能吃。已確認 main 分支只有 `StickyNote.vue`
  會用到 `style.drawing`。所以新舊站可以共用同一個資料庫並存。
- **不需要設定 CORS**：會被 canvas 處理的只有使用者自己正在編輯的那張，
  那張在本機始終是 base64；資料庫來的網址只走 `<img>` 顯示。
- **順序可以分開**：如果先部署程式、還沒套用 Storage 規則，上傳會被拒絕，
  程式會自動退回舊的 base64 行為（console 會留下錯誤訊息），不會讓使用者上傳失敗。
  等規則套用後就會自動開始使用 Storage。
