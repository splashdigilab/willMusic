# Firebase 安全規則：套用前務必先看

`firestore.rules` 與 `storage.rules` 是**依照程式碼裡實際存在的每一個查詢**寫出來的。

**部署狀態（2026-09-25）**：兩份都已部署到 willmusic-dd6ae，是第 2 節「三步走」的
步驟 ①（過渡版）。部署前用 Rules API 的 `:test` 端點跑過行為測試
（Firestore 40 項、Storage 14 項，涵蓋正式站舊版程式的每一種寫入、
會員不再被當成店員、測試組只收新格式）——那個端點只評估規則，不碰資料，
開發機沒有 Java、跑不了模擬器時可以用它代替。
部署前的線上 Storage 規則是 `canvas_interstitial/**` 任何人可寫（連未登入都行），
這次一併收斂成只有後台帳密能寫。

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
| `banned_users` | 不能碰 | 讀自己那一份（前台用來說明為什麼送不出去） | 全部 |
| `note_owners` | 不能碰 | 讀自己的（我的便利貼）；只能跟便利貼同一批建立 | 讀取、刪除 |
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
# 先只編譯、不部署（唯讀，線上規則不會變）
npx firebase-tools deploy --only firestore:rules,storage --dry-run --project willmusic-dd6ae
# 確認後才真的部署
npx firebase-tools deploy --only firestore:rules,storage --project willmusic-dd6ae
```

**沒有獨立的測試專案**：測試站與正式站是同一個 Firebase 專案（willmusic-dd6ae），
資料用集合後綴分開，但規則只有一份，部署當下兩站同時生效。
所以規則必須同時相容兩站當時跑的程式，見下面第 2 節的過渡版。

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

## 2. LINE 登入：規則分三步上（正式站與測試站共用同一份規則）

這一版把 `isStaff()` 從 `request.auth != null` 改成檢查
`request.auth.token.firebase.sign_in_provider == 'password'`，並新增 `isMember()`
（`== 'custom'`）。前台顧客現在也會登入，兩者跑在同一個 Firebase Auth 上。

**難處在於規則只有一份**：正式站（origin/main）還是舊版的匿名投稿，
測試站（staging）已經是 LINE 登入版，兩邊的寫入格式不同，卻要吃同一份規則。
所以 `firestore.rules` 目前是**過渡版**：正式組集合兩種格式都收，
測試組（`_dev`）只收新格式。過渡用的條件都標了「【過渡期】」。

| 步驟 | 做什麼 | 正式站 | 測試站 |
|---|---|---|---|
| ① 現在 | 部署目前這份規則（連同 `storage.rules`） | 行為與現在相同，照常匿名投稿 | 投稿開始能用；登入的顧客不再被當成店員 |
| ② 任何時候 | 正式站換成新版程式 | 改走登入投稿，**不需要動規則** | — |
| ③ 正式站穩定一天後 | 刪掉所有「【過渡期】」、重新部署 | 只收登入投稿，封鎖與額度開始真的擋得住人 | 不變 |

> **① 要盡快。** 目前線上的規則 `isStaff()` 只看 `request.auth != null`。
> 測試站的 LINE 登入一旦能用，任何在測試站登入的顧客對**正式站的資料**也是「店員」
> （同一個 Firebase 專案、同一套 Auth）：可以清空正式站的待播佇列、竄改歷史牆、
> 發放上傳憑證、改掉 GPS 圍籬與大螢幕影片。這一份規則把這個洞補起來，
> 而且不影響舊版程式——舊版後台與大螢幕本來就是帳密登入。
>
> 目前線上規則的另一個後果：測試站的新版程式寫入帶 `uid` 的便利貼與 `user_quota_dev`，
> 舊規則都會拒絕，所以**測試站現在送不出便利貼**，要等 ① 部署之後才會通。
>
> ③ 之前，正式站的封鎖與投稿額度都**擋不住刻意繞過的人**（走舊的匿名格式就好）。
> 一般使用者用的是新版畫面、一定會走登入，所以實際上只有會自己打 API 的人繞得過。

`storage.rules` 不需要過渡版：正式站的舊版程式只在後台上傳與刪除插播影片
（帳密登入，`isStaff()` 照樣通過），手繪圖是新版才開始存進 Storage 的。
它跟 Firestore 規則一樣有 `isStaff()` 的拆分，所以 ① 應該一起部署。

驗證時至少要蓋到這幾項：

| 身分 | 應該可以 | 應該被拒 |
|---|---|---|
| 未登入 | 讀 `queue_pending` / `queue_history` / `system`；**在正式組**用舊格式建立便利貼、寫 `stats_daily`（過渡期） | 在測試組建立便利貼、寫 `stats_daily_dev`、上傳手繪圖、帶 `uid` 的便利貼 |
| member（custom token） | 建立自己的便利貼（`uid` == 自己、有預約）、寫自己的 `users/{uid}` | 刪便利貼、寫 `system`、發 token、讀 `stats_daily`、寫別人的 `users/{uid}`、`displayName` 與 `lineName` claim 不符 |
| staff（password） | 全部 | — |
| 舊便利貼（無 `uid`） | 照常被讀取與顯示 | — |

另外新增了 `users` / `users_dev`、`user_quota` / `user_quota_dev`、
`banned_users` / `banned_users_dev` 六個 match 區塊。
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

## 3b. 停權名單

後台可以封鎖帳號（會員面板裡的「封鎖這個帳號」），寫入 `banned_users/{uid}`，
`canCreateNote` 多了一條 `!exists(bannedRef)`。只擋送出：被封鎖的人仍能讀、
能製作，只是建不了便利貼。

模擬器要測：

1. 名單上的 member 建立便利貼 → **被拒**（就算已經預約成功也一樣）
2. 不在名單上的 member → 照常可以送
3. member 讀自己的 `banned_users/{uid}` → 允許；讀別人的、或寫任何一份 → **被拒**
4. staff 讀寫 → 允許

**上線順序可以分開，兩種順序都不會出事**：名單是空的時候，規則等於沒改；
程式先上而規則還沒上的話，後台的封鎖按鈕會寫入失敗（catch-all 拒絕），
其他功能都不受影響。

過渡期（見第 2 節）正式組還收匿名的舊格式投稿，所以封鎖在正式站要到步驟 ③
才真的擋得住刻意繞過的人；測試組現在就有效。

刪除個人資料（`users` 與 `user_quota`）**不會**連帶刪掉停權紀錄，
否則被封鎖的人申請刪除個資就等於解除封鎖。隱私權政策的「保存多久」有對應的一條。

已知限制：Storage 的 `note_drawings/` 沒有檢查停權名單（Storage 規則要跨服務讀
Firestore 才做得到，還牽涉測試／正式兩組名單），所以被封鎖的人仍能上傳手繪圖檔。
圖檔沒有對應的便利貼就不會顯示在任何地方，影響只有儲存空間 —— 這跟任何會員
不送出、只上傳的情況相同，不是封鎖造成的新缺口。

## 3c. 投稿者移出便利貼（`note_owners`）

便利貼公開可讀，原本卻帶著 `uid`（= LINE 使用者編號），任何人打開開發者工具就看得到，
與隱私權政策「LINE 使用者識別碼不會公開」不符。現在便利貼不帶 `uid`，
投稿者寫在 `note_owners/{noteId}`，只有本人與後台讀得到，而且必須跟便利貼同一批寫入：

- 便利貼那邊：`existsAfter(ownerRef) && getAfter(ownerRef).data.uid == request.auth.uid`
- 投稿者那邊：`!exists(noteRef) && existsAfter(noteRef)`（便利貼必須是這一批才建立的，
  否則匿名時期沒有投稿者紀錄的舊便利貼可以被任何人認領）

**部署要跟測試站的程式一起上。** 線上測試站跑的程式還會在便利貼上寫 `uid`、
不寫 `note_owners`，新規則會拒絕它。正式站不受影響（舊版程式走【過渡期】的匿名格式）。

過渡期的已知限制多了一條：新格式的便利貼拿掉 `uid` 之後跟舊的匿名格式欄位相同，
所以正式組會直接走舊格式放行，封鎖與額度在正式站要到步驟 ③ 才對刻意繞過的人生效
（一般使用者仍會被前端的檢查與預約規則擋下）。測試組不受影響。

測試站既有的測試便利貼還帶著 `uid`（正式站沒有這種資料，正式站一直是匿名投稿）。
這批不會被新程式讀到；上正式站前清掉測試資料即可，不需要搬移。

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
