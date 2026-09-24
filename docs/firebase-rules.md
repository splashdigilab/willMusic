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

| 集合 | 未登入 | member（LINE 顧客） | staff（後台／大螢幕／掃碼頁） |
|---|---|---|---|
| `queue_pending` | 只能讀 | 讀、投稿（限制欄位與長度，`uid` 必須是自己） | 全部 |
| `queue_history` | 只能讀 | 只能讀 | 全部 |
| `tokens` | 讀單一文件 | 讀單一文件、把 `unused` 改成 `used` | 全部 |
| `stats_daily` | 不能碰 | 只能累加計數（限制欄位） | 讀取 |
| `users` | 不能碰 | 讀寫自己那一份（限制欄位） | 讀取、刪除 |
| `user_quota` | 不能碰 | 讀自己那一份、依冷卻與每日上限預約 | 讀取、刪除 |
| `system/*` | 只能讀 | 只能讀 | 全部 |
| 其他 | 全部拒絕 | 全部拒絕 | 全部拒絕 |

兩種身分是用 ID token 的 `sign_in_provider` 分辨的（`password` = staff、
`custom` = member），那個欄位由 Firebase 簽發、前端偽造不了。詳見 README 的
「兩種登入」一節。

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

這個分支除了規則之外還有幾項會改變線上行為，部署前請確認：

## 1. GPS 定位限制會開始生效

`editor.vue` 原本寫死了 `ENABLE_GPS_VALIDATION = false`，所以後台的 GPS 設定
一直沒有作用。這個分支把它接回 `system/editor_geo_fence.enabled`。

> **部署前請到 Firebase Console 確認 `system/editor_geo_fence` 這份文件的
> `enabled` 目前是什麼值。** 如果之前有人在後台打開過那個開關（畫面會跳「已儲存」，
> 所以很可能有），部署後就會**立刻開始擋掉指定半徑外的所有上傳**。
>
> 不想啟用的話，部署前先到後台把開關關掉，或直接刪除那份文件。

## 2. LINE 登入：規則與程式**必須一起上**

這一版把 `isStaff()` 從 `request.auth != null` 改成檢查
`request.auth.token.firebase.sign_in_provider == 'password'`，並新增 `isMember()`
（`== 'custom'`）。前台顧客現在也會登入，兩者跑在同一個 Firebase Auth 上。

> **順序很重要，兩個方向都會出事：**
>
> - **程式先上、規則沒跟上** → 顧客用 LINE 登入後，舊的 `isStaff()` 會把他當成
>   店員：可以清空待播佇列、竄改歷史牆、自行發放上傳憑證、改掉 GPS 圍籬與
>   大螢幕播放的影片。**這是整面 LED 牆被接管，不是小問題。**
> - **規則先上、程式沒跟上** → 舊版程式的投稿沒有 `uid` 欄位、使用者也沒登入，
>   新的 `canCreateNote()` 會一律拒絕，**所有人都送不出便利貼**。
>
> 沒有「先上一邊觀察看看」這個選項。要分段的話，唯一安全的拆法是
> **先只部署 `isStaff()` 的拆分**（那一段與 LINE 無關，舊程式完全不受影響，
> 因為後台本來就是帳密登入），之後再一起上 `canCreateNote()` 與程式碼。

模擬器驗證時至少要蓋到這四項：

| 身分 | 應該可以 | 應該被拒 |
|---|---|---|
| 未登入 | 讀 `queue_pending` / `queue_history` / `system` | 建立便利貼、寫 `stats_daily`、上傳手繪圖 |
| member（custom token） | 建立自己的便利貼（`uid` == 自己）、寫自己的 `users/{uid}` | 刪便利貼、寫 `system`、發 token、讀 `stats_daily`、寫別人的 `users/{uid}`、`displayName` 與 `lineName` claim 不符 |
| staff（password） | 全部 | — |
| 舊便利貼（無 `uid`） | 照常被讀取與顯示 | — |

另外新增了 `users` / `users_dev`、`user_quota` / `user_quota_dev` 四個 match 區塊。
**規則裡的集合是一組一組手寫的，改任何一條都要記得兩組都改**，
只改正式組的話測試站會整組被擋下。

## 3. 投稿頻率限制：一定要照「預約制」測

這一版加了每人每 N 分鐘 1 張、每天 M 張（預設 5／3，可在後台的「上傳控管」改）。

**它不是「送出後累加、下次檢查」。** 那種做法擋不住人：計數是前端寫的，
跳過那次寫入計數就永遠不會前進，而規則沒有辦法要求「你必須同時也寫另一份文件」。
所以順序是反的——先寫 `user_quota/{uid}`（預約，這一步檢查冷卻與每日上限），
再建立便利貼，而 `canCreateNote` 要求存在一張**指名該 doc ID、10 分鐘內發出**的預約。

模擬器要測的是這幾件事，前三項是「照規則走」，後三項才是真正的攻擊面：

1. 第一張送得出去
2. 冷卻時間內的第二張被拒
3. 當天第 M+1 張被拒（時間拉到冷卻之後）
4. **跳過預約直接寫 `queue_pending` → 必須被拒**（這是整個機制的重點）
5. **用別人的 noteId 預約、或改寫 `lastSubmitAt` 成過去的時間 → 必須被拒**
6. **同一個 `pendingNoteId` 重複預約 → 允許，而且不吃額度、不重置冷卻**
   （這是為了讓上傳失敗的重試不會被鎖 5 分鐘。`submissionId` 跟著草稿走，
   所以重試用的是同一個 ID）

另外注意兩個容易寫錯的地方：

- **日界線**。`request.time` 是 UTC，直接取 `day()` 會讓每日額度在台灣時間早上
  8 點重置，那是營業時間正中間。規則的 `taipeiDateKey()` 加了 8 小時，
  前端 `useSubmissionQuota` 的同名函式必須算出一模一樣的字串（含「不補零」）。
- **`system/editor_rate_limit` 不存在時採用預設值，不是放行。** 這與 GPS 圍籬
  相反——圍籬設錯會把人鎖在門外所以寧可放行；頻率限制放行等於完全沒有限制。

## 4. 手繪圖改存 Storage

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
