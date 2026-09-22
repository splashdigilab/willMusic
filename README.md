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

架構上沒有傳統後端，前端直接連 Firestore；唯一的 server route 是
`/api/moderation`（代理 OpenAI，避免金鑰外洩到前端）。

## 頁面

| 路徑 | 用途 | 需登入 |
|---|---|---|
| `/` | 便利貼牆，可拖曳縮放瀏覽歷史作品 | |
| `/editor` | 編輯器：便利貼材質／造型、文字、手繪、貼紙 | |
| `/queue-status` | 送出後的等待頁，顯示佇列長度與預估時間 | |
| `/login` | 後台登入（Firebase Auth 帳密） | |
| `/admin` | 後台：營運統計、Token、GPS、插播影片、便利貼管理 | ✓ |
| `/canvas` | **LED 牆播放頁** | ✓ |
| `/qrcode` | 店內掃碼頁，顯示後台即時產生的 QR code | ✓ |

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
  timestamp: Timestamp
  status: 'waiting'
}
```

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
| `canvas_video` | admin | canvas | `{ videoUrl, interstitialIntervalMinutes, interstitialScheduleEnabled }` |
| `active_token` | admin | qrcode | `{ token, expiresAt }` 廣播給店內掃碼頁 |

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
```

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
- **`useInAppBrowser` 與 `BrowserWarning.vue` 寫好了但沒有掛上去。**
  這是偵測 LINE／IG 內建瀏覽器並提醒改用外部瀏覽器的功能，而內建瀏覽器
  正是 localStorage 草稿最容易失效的地方。保留著等決定要不要啟用。

## 授權

私有專案。字型 LINE Seed 採 SIL Open Font License 1.1（© LY Corporation）。
