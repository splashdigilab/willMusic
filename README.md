# WillMusic 數位應援便利貼

為 K-Pop 唱片行「微樂客」打造的互動裝置。顧客用手機做一張專屬便利貼送出，
內容經審核後在店內 LED 牆上輪播，並輪流放大展示。

## 技術棧

- **Nuxt 4** / Vue 3 Composition API / TypeScript
- **SCSS**（BEM，樣式集中在 `app/assets/scss/`，`.vue` 內不寫樣式）
- **Firebase**：Firestore（前端直連）、Auth（後台登入）、Storage（插播影片）
- **GSAP**（首頁 pan/zoom 與大螢幕的 FLIP 轉場）、**Fabric.js**（手繪）、
  **ECharts**（後台統計圖）、**html-to-image**（便利貼下載／分享）
- **LINE Seed** 字型（見 `scripts/fonts/README.md`）
- 部署在 **AWS Amplify**

架構上沒有傳統後端，前端直接連 Firestore；server route 只有兩組：
`/api/moderation`（代理 OpenAI，避免金鑰外洩到前端）與 `/api/auth/*`（LINE 登入）。

## 法律文件（`/privacy`、`/terms`）

兩頁共用 `.p-legal` 樣式與 `LegalBlocks` 元件，文案分別在
`app/data/privacy-policy.ts` 與 `app/data/terms.ts`。**活動規範只有一份**：
編輯器開場卡片渲染的是 `TERMS_RULES`（摘要），`/terms` 渲染 `TERMS_SECTIONS`
（完整版），兩者同一個檔案，不會各改各的。

這兩個網址也是 LINE Developers 後台的 **Privacy policy URL** 與
**Terms of use URL** 要填的值。

> **未定稿的保護是自動的。** 頁面會掃描文案裡還有沒有 `【`，有的話就顯示
> 警告橫幅並加上 `noindex`，填完自動消失 —— 不需要有人記得上線前關掉開關。

## 兩種登入

這是理解整個權限設計的前提。**同一個 Firebase Auth 上跑著兩種完全不同的身分**：

| 身分 | 誰 | 怎麼進來 | `sign_in_provider` |
|---|---|---|---|
| **staff** | 後台、LED 牆、掃碼頁 | `/login` 帳號密碼 | `password` |
| **member** | 前台顧客 | LINE Login → server 簽 custom token | `custom` |

所以「有沒有登入」這個問題在這個專案裡沒有意義，任何地方都必須問「是哪一種」。
`firestore.rules`、`storage.rules`、`admin-auth.global.ts` 判斷的都是同一個
`sign_in_provider` 欄位 —— 它由 Firebase 簽發 ID token 時填入，前端偽造不了。

> 這一點沒做對的後果很具體：`isStaff()` 若只寫 `request.auth != null`，
> 顧客一登入就能清空待播佇列、自行發放上傳憑證、改掉 GPS 圍籬與大螢幕影片。

前台的登入時機是**送出便利貼那一刻**——瀏覽、編輯、預覽、下載自己的圖都不需要
登入。活動規範頁另外提供一個選填的「先登入」，讓願意的人不必在畫完之後才被
導去 LINE。往返會整頁重載，所以 `redirectToLogin()` 一定是**同步**存完草稿才導向。

### 登入流程

```
/api/auth/line/start      產 state + nonce 存 httpOnly cookie，302 到 LINE
        ↓
LINE 授權頁（在 LINE 內建瀏覽器裡會自動登入，一鍵就過）
        ↓
/api/auth/line/callback   驗 state → code 換 token → 交給 LINE 的 verify 端點
                          驗 id_token 與 nonce → 簽 Firebase custom token
                          → 放進 120 秒的 httpOnly cookie → 302 回原頁
        ↓
/api/auth/session         前端來領那張 custom token（一次性，讀完即清）
        ↓
signInWithCustomToken     之後的登入狀態由 Firebase SDK 自己維護
```

幾個刻意的選擇：

- **不裝 `firebase-admin`。** custom token 就是一張用 service account 私鑰以
  RS256 簽的 JWT，Node 內建的 `crypto` 十幾行就簽完了。為此把整包 admin SDK
  拉進 Nitro，換來的是 Lambda 冷啟動變慢，而登入正是使用者盯著螢幕等的那幾秒。
  連帶的好處是 **server 完全沒有 Firestore 寫入權限**——它只簽 token。
- **id_token 交給 LINE 官方的 `/oauth2/v2.1/verify` 驗**，不自己驗簽。簽章演算法
  會隨 channel 設定在 HS256 與 ES256 之間變動，自己處理很容易寫成只認其中一種，
  而那種錯誤在本機測得過、換個 channel 就整個登不進來。
- **custom token 走 cookie，不走網址。** query 會進瀏覽器歷史與伺服器紀錄；
  fragment 雖然不外送，但留在網址列，使用者複製分享就把憑證一起送出去了。
- **會員資料 `users/{uid}` 由前端自己寫。** 之所以安全，是規則把 `displayName`
  綁死在 custom token 的 `lineName` claim 上，而那個值是 server 從 LINE 的
  id_token 取出、截斷到 12 字後簽進去的。

## 頁面

| 路徑 | 用途 | 需登入 |
|---|---|---|
| `/` | 便利貼牆，可拖曳縮放瀏覽歷史作品 | |
| `/editor` | 編輯器：便利貼材質／造型、文字、手繪、貼紙 | 送出時需 LINE |
| `/queue-status` | 送出後的等待頁，顯示佇列長度與預估時間 | |
| `/privacy` | 隱私權政策 | |
| `/terms` | 活動規範（完整版；編輯器開場卡片顯示的是摘要） | |
| `/login` | 後台登入（Firebase Auth 帳密） | |
| `/admin` | 後台：營運統計、Token、GPS、投稿頻率、插播影片、便利貼管理、會員資料 | 後台 |
| `/canvas` | **LED 牆播放頁** | 後台 |
| `/qrcode` | 店內掃碼頁，顯示後台即時產生的 QR code | 後台 |

`/canvas` 可用網址參數調整：

```
/canvas?count=16&duration=15&liveScale=0.95&displayScale=0.9
```

| 參數 | 預設 | 說明 |
|---|---|---|
| `count` | 16 | 左側散落區最多幾張 |
| `duration` | 15 | 每張在右側放大展示幾秒 |
| `liveScale` | 0.95 | 左側便利貼縮放 |
| `displayScale` | 0.9 | 右側便利貼縮放 |

## Firestore 結構

### `queue_pending` — 待播佇列

```ts
{
  content: string          // 所有文字區塊合併後的純文字
  style: StickyNoteStyle   // 見 app/types/index.ts
  token: string            // 同時也是 doc ID
  uid?: string             // 投稿者的 Firebase uid（= line:<LINE userId>）
  timestamp: Timestamp
  status: 'waiting'
}
```

`uid` 是 LINE 登入上線後才有的欄位，所以是 optional：在那之前送出的便利貼沒有它，
而且**刻意不回填**（規則只管 create，舊文件不受影響；回填要逐筆寫入整個
`queue_history`，成本與風險都不划算）。顯示端遇到沒有 `uid` 的一律當匿名處理。

`uid` 只用於身分追溯與封鎖，**不會顯示在 LED 牆上**。

### `queue_history` — 已播放

同上，另加 `status: 'played'` 與 `playedAt: Timestamp`。

**doc ID 一律使用 token**，這是避免重複寫入的關鍵設計：`moveToHistory()` 在
transaction 內先檢查 history 是否已存在，所以同一張便利貼重複搬移不會產生兩筆。

`style` 內的 `backgroundImage` 存的是路徑字串、`shape` 與 `stickers[].type` 存的是 ID，
都在渲染時才解析成檔案。**刪除或改名 `public/svg/` 底下的資產會讓舊便利貼破圖或
貼紙靜默消失**，動之前要先確認沒有舊資料在引用。

### `tokens` — 上傳憑證

```ts
{ status: 'unused' | 'used', createdAt: Timestamp }
```

建立後 30 分鐘過期（由 `checkTokenStatus()` 判定）。

### `users` — LINE 會員

doc ID 就是 Firebase uid（`line:<LINE userId>`）：

```ts
{ displayName: string, avatar?: string, createdAt: Timestamp, updatedAt: Timestamp }
```

`avatar` 存的是 **base64 data URL**，不是 LINE 的 CDN 網址。三個原因：使用者換頭貼
之後舊網址會失效，牆上就破圖；LINE 的 profile CDN 沒有承諾提供 CORS 標頭，
瀏覽器直接抓會被擋；而頭貼最終要進 `style`，那表示它會被 `html-to-image`
序列化（見「已知問題」），外部網域的圖片在那個情境讀不到。
頭貼由 `/api/auth/line/avatar` 代抓（順便把來源網域鎖在 `*.line-scdn.net`，
否則那就是一個任人指定目標的 SSRF 代理）。

只有本人與後台讀得到。便利貼上要顯示的名牌是送出時複製一份進 `style`，
不是渲染時回來讀這裡——否則首頁 100 張就是 100 次額外讀取，
而且使用者改暱稱會連帶改掉所有舊便利貼。

後台的便利貼管理會顯示投稿者（暱稱 + uid 末四碼，完整 uid 在 `title` 屬性裡）。
那裡是逐筆讀 `users/{uid}`，但查過的會進快取，同一個人翻幾頁都只讀一次；
後台流量低，這個成本可以接受。沒有 `uid` 的舊便利貼顯示為「舊資料」。

### `user_quota` — 投稿配額

doc ID 同樣是 Firebase uid：

```ts
{ lastSubmitAt: Timestamp, submitDate: string, submitCount: number, pendingNoteId: string }
```

每人每 N 分鐘 1 張、每天 M 張（預設 5／3，後台「上傳控管」可改，
設定在 `system/editor_rate_limit`）。取代了原本綁在 localStorage 的 3 分鐘冷卻
——那個清一下瀏覽器資料就沒了。

**這是「預約」不是「計數」，順序很重要。** 直覺的做法是送出後累加、下次檢查，
但計數是前端寫的，跳過那次寫入計數就永遠不會前進，而規則沒辦法要求
「你必須同時也寫另一份文件」。所以反過來：先寫這份預約（規則在這一步檢查冷卻
與每日上限），再建立便利貼，而 `canCreateNote` 要求存在一張**指名該 doc ID**
的新鮮預約。跳過預約就建不了便利貼。

`pendingNoteId` 就是編輯器的 `submissionId`，跟著草稿走，所以「上傳失敗再按一次」
是同一個 ID、被視為重試，不吃額度也不重置冷卻。

`submitDate` 是台灣當地日期（`request.time` 是 UTC，直接取日期會讓額度在早上 8 點
重置，那是營業時間正中間）。**前端 `useSubmissionQuota.taipeiDateKey()` 與規則的
`taipeiDateKey()` 必須算出一模一樣的字串**，包含「不補零」。

### `stats_daily` — 每日上傳統計（預聚合）

doc ID 即 `YYYY-MM-DD`（瀏覽器本地時區）：

```ts
{ date: string, total: number, hours: { '0'..'23': number }, updatedAt: Timestamp }
```

後台統計讀這裡而不是逐筆掃便利貼，任何區間的成本都是「1 天 1 read」。
上傳端需要 create／update 這個集合的權限（而且是未登入狀態），否則統計會停在 0
——後台會直接把這個情況顯示出來。

### `system/*` — 設定文件

| 文件 | 誰寫 | 誰讀 | 內容 |
|---|---|---|---|
| `editor_token_requirement` | admin | editor | `{ enabled }` 上傳是否需要 Token |
| `editor_geo_fence` | admin | editor | `{ enabled, latitude, longitude, radiusMeters }` |
| `editor_rate_limit` | admin | editor + rules | `{ enabled, cooldownMinutes, dailyLimit }` 投稿頻率 |
| `canvas_video` | admin | canvas | `{ videoUrl, interstitialIntervalMinutes, interstitialScheduleEnabled }` |
| `active_token` | admin | qrcode | `{ token, expiresAt }` 廣播給店內掃碼頁 |

> **`editor_rate_limit` 與其他設定文件相反：不存在時採用預設值（5 分鐘／3 張），
> 不是放行。** GPS 圍籬設錯會把使用者鎖在門外，所以寧可放行；頻率限制放行
> 等於完全沒有限制，那才是不該預設的狀態。預設值在規則與
> `app/types/index.ts` 的 `DEFAULT_RATE_LIMIT` 各寫了一份，改的時候兩邊都要動。

> **`editor_geo_fence` 的開關是真的會生效的**（這點在 2026-09 之前曾經失效，
> 因為 `editor.vue` 寫死了旗標）。文件不存在、`enabled` 非 `true`、或經緯度與
> 半徑沒填完整時一律放行，避免把使用者擋在門外。部署前請先確認這份文件的
> 現況，見 `docs/firebase-rules.md`。

### 安全規則與索引

規則已進版控：`firestore.rules`、`storage.rules`、`firestore.indexes.json`。
**套用前請先讀 `docs/firebase-rules.md`**，裡面有用模擬器驗證的步驟與回滾方式。

目前所有查詢都只用到單一欄位的排序或範圍條件，Firestore 會自動建立單欄位索引，
**不需要任何複合索引**。日後若新增跨欄位的查詢，Firestore 會在 console 報錯並
附上建立連結，把定義補進 `firestore.indexes.json` 即可。

## 開始開發

```bash
npm install
cp .env.example .env    # 填入 Firebase 與 OpenAI 設定
npm run dev             # http://localhost:3000
```

| 指令 | 說明 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run dev:mobile` | 綁 0.0.0.0，供同網段手機實機測試 |
| `npm run build` | 正式建置（輸出到 `.output/`） |
| `npm run typecheck` | `vue-tsc` 型別檢查，目前應為 0 錯誤 |

字型資產已進版控，一般開發不需要重跑產生流程；
改動介面文案後若要讓新字進入預載字集，見 `scripts/fonts/README.md`。

## 部署（AWS Amplify）

1. 連接 Git repository
2. 建置指令 `npm run build`
3. **這個專案不是純靜態站**：`/api/moderation` 需要 server runtime，
   Amplify 要設定為 SSR（Nuxt）而不是只發佈 `.output/public`，
   否則審核 API 會 404，而前端遇到錯誤時會直接放行。
4. 環境變數：

```
NUXT_PUBLIC_FIREBASE_API_KEY
NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NUXT_PUBLIC_FIREBASE_PROJECT_ID
NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NUXT_PUBLIC_FIREBASE_APP_ID
NUXT_PUBLIC_GTM_ID       # 選填，只認 GTM- 開頭的編號，其他值一律不載入 GTM
OPENAI_API_KEY           # 沒填的話內容審核會直接放行

LINE_CHANNEL_ID          # LINE Login channel
LINE_CHANNEL_SECRET
FIREBASE_CLIENT_EMAIL    # service account，用來簽 custom token
FIREBASE_PRIVATE_KEY     # 整段 PEM 做 base64，或含 \n 的原始內容
```

> **下面四個一律不要加 `NUXT_PUBLIC_` 前綴。** 那個前綴會讓 Nuxt 把值打包進
> 前端 bundle。channel secret 與 service account 私鑰進了瀏覽器等於直接公開，
> 而那把私鑰可以繞過所有 Firestore 規則讀寫整個資料庫——權限遠大於
> `OPENAI_API_KEY`，放進 Amplify 環境變數時要意識到 console 有權限的人都看得到。
>
> 改完可以自己驗一次：`npm run build` 之後
> `grep -r "lineChannelSecret\|firebasePrivateKey" .output/public/` 應該沒有輸出。

LINE Developers 後台的 **Callback URL 要把正式站與測試站兩個網域都登記**
（`https://<網域>/api/auth/line/callback`），本機開發再加一組
`http://localhost:3000/api/auth/line/callback`。程式預設從請求本身推導回呼網址，
所以兩站可以共用同一份環境變數。

### 測試站（staging 分支）

`staging` 分支掛在同一個 Amplify app 底下，用 **branch-level 覆寫**跟正式站區隔。
設在 app 層（所有分支）會連正式站一起改到，一定要指定分支：

| 變數 | 所有分支 | staging 覆寫 |
|---|---|---|
| `NUXT_PUBLIC_FIRESTORE_SUFFIX` | `none`（正式資料） | `_dev` |
| `NUXT_PUBLIC_GTM_ID` | 正式容器編號 | `none` |

其餘變數兩站共用（同一個 Firebase 專案）。

> **`none` 不是 Nuxt 的慣例，是為了繞開 Amplify。** Amplify 的環境變數一律不接受
> 空字串（連「所有分支」那一列也不行），所以本來用「留空」表達的「不加後綴」
> 與「不載入 GTM」，都改成填 `none`。本機 `.env` 留空即可，兩種寫法等價。

要注意兩站**不是**完全隔離：`system` 集合（啟用中 token、GPS 圍籬、大螢幕影片）
刻意不分組，Storage 的 `note_drawings/` 也沒有後綴。細節見
`app/utils/collections.ts` 與 `docs/firebase-rules.md`。

## 專案結構

```
app/
├── assets/scss/        # 所有樣式（base / mixins / components / pages）
├── components/         # StickyNote、AppModal、AppHeader…
├── composables/        # useFirestore、useConductor、useFabricBrush…
├── data/               # 貼紙、背景、造型、編輯器常數
├── middleware/         # admin-auth.global.ts
├── pages/
├── plugins/            # firebase.client.ts、gsap.client.ts
├── types/
└── utils/
public/fonts/           # LINE Seed 產物（由 scripts/fonts/build.py 產生）
scripts/fonts/          # 字型建置與驗證
server/api/             # moderation.post.ts
```

### 幾個關鍵檔案

- **`app/composables/useConductor.ts`** — LED 牆的排程核心。每 N 秒 tick 一次，
  決定要播新投稿（live push）還是從歷史裡借一張（idle borrow），
  並用 shuffle bag + 冷卻避免短時間重複。插播影片也由它排程。
- **`app/composables/useFirestore.ts`** — 所有 Firestore 讀寫，
  包含 token 交易與 history 去重。
- **`app/composables/useCanvasPinch.ts`** — 編輯器的單指拖曳與雙指縮放旋轉。
- **`app/pages/editor.vue`** — 編輯器，仍是最大的檔案（約 2,150 行）。
  裡面有不少針對 iOS Safari 記憶體壓力的處理（畫布最小化、草稿存檔防抖、
  匯出節點延後掛載），改動前先讀註解。

## 已知問題

- **內容審核是 fail-open，而且只檢查文字。** 沒設 API 金鑰、OpenAI 掛掉、
  或重試用盡時一律放行；貼紙與手繪圖完全沒有審核路徑。目前的做法是靠後台
  即時下架（便利貼管理可直接刪除，會連 Storage 上的手繪圖一起清掉）。
- **首頁一次抓 100 筆便利貼。** 手繪圖改存 Storage 之後負擔已大幅降低，
  但張數多時仍有不少請求量，之後可考慮改成分批載入。
- **`useInAppBrowser` 與 `BrowserWarning.vue` 寫好了但沒有掛上去，而且確定不會啟用。**
  它會提醒使用者改用外部瀏覽器，但 LINE 登入在 LINE 內建瀏覽器裡是自動登入、
  一鍵就過，跳到 Safari 反而要走完整的授權流程。**這兩件事是互相衝突的，
  我們選擇讓使用者留在 LINE。** 代價是內建瀏覽器正是 localStorage 草稿
  最容易失效的地方；清死碼時要跳過這兩個檔案。
- **便利貼上的圖片只要來自外部網域，「下載／分享」就會抓不到。**
  `useNoteExport` 用 `html-to-image` 序列化節點，那個情境下外部資源要有 CORS
  標頭才讀得到。目前沒有問題，因為匯出的是 `previewNoteData`（編輯器本地狀態），
  手繪圖在那裡始終是本地 base64，Storage 的網址只走 `<img>` 顯示、不進 canvas。
  **但這條界線很細**：之後任何要進 `style` 的圖片都得是 base64 或設好 CORS 的來源，
  LINE 頭貼存 base64 就是為了這個。
- **QR token 機制目前停用。** `system/editor_token_requirement` 是
  `enabled: false`，程式與規則都還在但沒有人走。LINE 登入上線後身分改由它負責，
  要重新啟用 token 之前得先處理 `system/active_token` 兩站共用的問題。
- **LINE 暱稱目前不會上 LED 牆，所以還沒有審核缺口**——它只存在 `users/{uid}`
  與後台的投稿者欄位。要送審的文字已經集中到 `editor.vue` 的 `moderatableText`，
  **做名牌貼紙時必須把暱稱加進那個 computed**，否則就是一條「把 LINE 暱稱改成
  髒話就直接上牆」的路。該處有註解說明。

## 授權

私有專案。字型 LINE Seed 採 SIL Open Font License 1.1（© LY Corporation）。
