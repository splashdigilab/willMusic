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

> **注意：`editor_geo_fence` 目前沒有作用。** `editor.vue` 裡的
> `ENABLE_GPS_VALIDATION` 寫死為 `false`，驗證函式第一行就 return，
> 但後台仍有完整的 GPS 設定畫面而且會跳「已儲存」。要嘛把旗標接回這個開關，
> 要嘛把後台那張卡片一起拿掉，現在的狀態會誤導操作的人。

### 必要的索引

- `queue_history`：`playedAt` DESC
- `queue_pending`：`timestamp` ASC
- `stats_daily`：`date` ASC

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
NUXT_PUBLIC_GTM_ID       # 選填，沒填就不會載入 GTM
OPENAI_API_KEY           # 沒填的話內容審核會直接放行
```

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

- **手繪圖以 base64 存在 Firestore 文件裡。** 單筆文件上限 1 MB，
  畫得太滿會上傳失敗且錯誤訊息不友善；首頁一次抓 100 筆也會因此很重。
  應改存 Storage 只留 URL（`StickyNote` 是用 `<img src>` 渲染，
  data URL 與 https URL 都吃，所以舊資料可以原樣保留）。
- **內容審核是 fail-open**，而且只檢查文字，貼紙與手繪圖完全沒有審核路徑。
- **Firestore 安全規則沒有進版控**，建議補上 `firestore.rules` 與
  `firestore.indexes.json` 並用 `firebase deploy` 管理。

## 授權

私有專案。字型 LINE Seed 採 SIL Open Font License 1.1（© LY Corporation）。
