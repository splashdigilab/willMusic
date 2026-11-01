// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizeFirestoreSuffix } from './app/utils/firestore-suffix'
import { UI_FONT_WEIGHTS, fontPreloadLink, uiFontHref } from './app/utils/ui-fonts'

// ─── Amplify 的空值限制 ───────────────────────────────────────────
// Amplify 的環境變數一律不接受空字串，連「所有分支」那一列也不行。
// 所以本來用「留空」表達的兩件事（不載入 GTM、不加集合後綴），都得改用
// 一個看得懂的值來表達，約定成 none。

// GTM 容器編號。只認 GTM- 開頭的正規格式，其他值（none、留空、打錯字）
// 一律視同沒設、不載入 GTM —— 編號打錯時直接不載入，
// 而不是靜靜去要一個不存在的容器。
const rawGtmId = process.env.NUXT_PUBLIC_GTM_ID || ''
const gtmId = /^GTM-[A-Z0-9]+$/i.test(rawGtmId) ? rawGtmId : ''

// 便利貼資料集合的後綴在這裡原樣傳遞，'none' 的正規化在執行時由 app/utils/collections.ts 做。
// 原因：NUXT_PUBLIC_FIRESTORE_SUFFIX 命中 Nuxt 的 runtimeConfig 自動覆寫規則，
// SSR 時環境變數會蓋掉這裡算好的值，轉換放這裡會被繞過。
const rawFirestoreSuffix = process.env.NUXT_PUBLIC_FIRESTORE_SUFFIX || ''

// ─── 搜尋引擎收錄 ─────────────────────────────────────────────
// 不給收錄用回應標頭（X-Robots-Tag），不用 robots.txt 的 Disallow：Disallow 只是叫爬蟲別來抓，
// 別的地方有連結時網址照樣會進搜尋結果（只是沒有內容）；爬蟲要抓得到這個標頭才會真的拿掉。
const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow' }

// 用測試資料（集合有後綴）的建置整站不收錄：用的不是正式資料，就不是給人搜到的站。
// 上面說的 runtimeConfig 覆寫在這裡不成問題 —— routeRules 是建置時寫死進 server bundle 的，
// 讀的就是建置當下的環境變數（Amplify 的 branch-level 覆寫在建置時就生效）。
// Amplify 的測試站從 2026-10-15 起改用正式資料，它的不收錄改由網域判斷
// （server/middleware/noindex-amplify-host.ts：*.amplifyapp.com 一律不收錄）。
const isProductionData = normalizeFirestoreSuffix(rawFirestoreSuffix) === ''

// 全站預設的標題與摘要，也是首頁的。其他頁面用 usePageSeo 蓋掉
const SITE_TITLE = '數位應援便利貼 - WillMusic'
const SITE_DESCRIPTION = '在微樂客 WillMusic 做一張專屬的應援便利貼，送上店內大螢幕輪播，和大家一起分享對音樂的熱愛。'

// LINE Seed 介面字的 @font-face（約 13KB）在建置時讀進來直接內嵌到 <head>，
// 省掉一次樣式表往返，介面文字不會有 FOUT。內容字（使用者輸入的中／韓文）
// 則是約 870 個 unicode-range 分片，放在獨立樣式表讓瀏覽器只抓用到的字。
// 兩者都由 scripts/fonts/build.py 產生，產物已進版控。
const lineSeedUiCss = (() => {
  const path = fileURLToPath(new URL('./public/fonts/line-seed-ui.css', import.meta.url))
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    throw new Error(
      `找不到 ${path}。請先執行 python3 scripts/fonts/build.py 產生字型資產。`
    )
  }
})()

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  srcDir: 'app',

  // 開發用的 port 明寫出來，因為它是 LINE 登入的一部分：
  // LINE Developers 登記的 Callback URL 是 http://localhost:3000/api/auth/line/callback，
  // 而 redirect_uri 是從請求推導的，port 一變就對不起來。
  //
  // **Nuxt 遇到 port 被佔用會靜默退讓**到 3001、3002…，這時 LINE 只會回一個
  // 看不出原因的 400 Invalid redirect_uri。啟動時看到「alternative port」就是
  // 這個狀況 —— 去把佔用 3000 的程序關掉，不要改登記另一個 port。
  devServer: { port: 3000 },

  // ─── 靜態檔的瀏覽器快取 ─────────────────────────────────────────
  // Amplify 上，public/ 底下沒有另外設定的檔案一律是 max-age=0：瀏覽器每次都要回伺服器確認，
  // 回訪的人看首頁的牆，用到的上百個檔案每個都要多跑一趟。這裡列出的資料夾，maxAge 會被
  // Nitro 的 aws-amplify preset 寫進部署設定（deploy-manifest.json），變成
  // public, max-age=<maxAge>, immutable：期限內瀏覽器直接用手機裡的，連重新整理都不會再問。
  //
  // - 一年：內容一變、檔名就跟著變的檔案。內容字分片的檔名是內容的雜湊（scripts/fonts/build.py
  //   用 cn-font-split 產生），符合。介面字（line-seed-ui-*）與 line-seed.css 檔名固定、重建時內容會變，不能放。
  // - 7 天：便利貼牆上的圖（貼紙、造型與陰影、底圖、節慶主題圖）。檔名固定，但幾乎不會同檔名換圖。
  //   **要換圖請用新檔名**：同檔名換的話，看過的人（包括店裡的 LED 牆）最多 7 天後才會看到新圖。
  //   底圖的路徑寫在便利貼的資料裡（style.backgroundImage），舊的那張也不能刪
  // dir 寫絕對路徑：Nitro 的相對路徑不是從專案根目錄算
  nitro: {
    publicAssets: [
      ...['fonts/tw', 'fonts/kr'].map(dir => ({ dir, maxAge: 60 * 60 * 24 * 365 })),
      ...['svg/stickers', 'svg/shapes', 'svg/bg', 'themes'].map(dir => ({ dir, maxAge: 60 * 60 * 24 * 7 }))
    ].map(({ dir, maxAge }) => ({
      baseURL: `/${dir}`,
      dir: fileURLToPath(new URL(`./public/${dir}`, import.meta.url)),
      maxAge
    }))
  },

  css: [
    '~/assets/scss/main.scss'
  ],

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "~/assets/scss/mixins/_index.scss" as *;'
        }
      }
    }
  },

  typescript: {
    strict: true,
    typeCheck: false,
    tsConfig: {
      compilerOptions: {
        // gsap 自身打包不一致：JS 是 Flip.js（大寫），型別卻是 types/flip.d.ts（小寫），
        // 在不分大小寫的檔案系統（macOS／Windows）上會讓 vue-tsc 報 TS1149。
        // 'gsap/Flip' 這個 import 路徑對執行期是正確的（Linux 上必須大寫），不能改。
        forceConsistentCasingInFileNames: false
      }
    }
  },

  app: {
    head: {
      title: SITE_TITLE,
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'description', content: SITE_DESCRIPTION },
        // 分享到 LINE／社群時的預覽。og:image 要絕對網址、得從請求推導，所以寫在 app.vue
        { property: 'og:site_name', content: 'WillMusic' },
        { property: 'og:type', content: 'website' },
        { property: 'og:locale', content: 'zh_TW' },
        { property: 'og:title', content: SITE_TITLE },
        { property: 'og:description', content: SITE_DESCRIPTION },
        { name: 'twitter:card', content: 'summary_large_image' }
      ],
      link: [
        // 加到主畫面的圖示。favicon 只有 32px，放大會糊，所以用 willMusicLogo.png 的 W 字標放在品牌藍底上
        // （iOS 會把透明的地方填黑，底色一定要實心）
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        // 介面字與 HTML 平行下載（@font-face 已內嵌，preload 只是提前開始抓）。
        // 400 / 700 / 800 都要 preload：全站粗體是 700，新視覺的大標（應援便利貼!、
        // POST BOARD、START）是 800，少預載任何一個，該字重都會先以後備字型渲染再換過來。
        // 這裡只預載首頁開場的字（三個字重合計約 115KB）。其他前台頁面的字由 app.vue 在那些頁面預載，
        // 首頁則等 START 能按之後才抓；檔案怎麼分見 app/utils/ui-fonts.ts。
        ...UI_FONT_WEIGHTS.map(w => fontPreloadLink(uiFontHref('home', w))),
        // 內容字分片的樣式表（/fonts/line-seed.css）不放這裡，由 plugins/content-font.client.ts
        // 在畫面接手之後才載入，理由見那支檔案
      ],
      style: [
        { innerHTML: lineSeedUiCss, type: 'text/css' }
      ],
      ...(gtmId ? {
        script: [
          {
            innerHTML: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`,
            type: 'text/javascript'
          }
        ],
        noscript: [
          {
            innerHTML: `<iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
            tagPosition: 'bodyOpen'
          }
        ]
      } : {})
    }
  },

  routeRules: {
    ...(isProductionData ? {} : { '/**': { headers: NOINDEX } }),
    // 後台只在瀏覽器端畫。登入檢查（admin-auth.global.ts）在伺服器端不做，伺服器照畫的話，
    // 沒登入的人與爬蟲都拿得到整個後台的版面、頁籤與設定說明。資料有 Firestore 規則擋著，
    // 但後台有哪些功能不必讓外面看到。
    '/admin': { ssr: false, headers: NOINDEX },
    // 下面幾頁伺服器畫出來的只有「載入中」或登入表單，沒有要藏的東西，只是不該出現在搜尋結果。
    // /canvas 是 LED 牆，不改它的渲染方式
    '/canvas': { headers: NOINDEX },
    '/qrcode': { headers: NOINDEX },
    '/login': { headers: NOINDEX },
    '/my-notes': { headers: NOINDEX },
    '/queue-status': { headers: NOINDEX }
  },

  runtimeConfig: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',

    // ── LINE 登入與 Firebase custom token 簽章 ──────────────────
    // 這四個全部是機密，**絕對不能加 NUXT_PUBLIC_ 前綴**：那個前綴會讓 Nuxt
    // 把值打包進前端 bundle，channel secret 與 service account 私鑰進了瀏覽器
    // 等於直接公開，而且私鑰可以繞過所有 Firestore 規則讀寫整個資料庫。
    // 放在這一層（public 之外）的值只會留在 server bundle。
    lineChannelId: process.env.LINE_CHANNEL_ID || '',
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
    // 選填。LINE 的回呼網址平常從請求推導；前面多一層代理、推導出來的網域不對時才用這個寫死。
    // 跟上面四個一樣在建置時寫進 server bundle —— 只在執行時讀 process.env 的話，
    // Amplify 的 SSR 執行環境不一定拿得到 console 設的變數，這個退路會靜靜失效
    lineLoginRedirectUri: process.env.LINE_LOGIN_REDIRECT_URI || '',

    public: {
      gtmId: gtmId,
      // 便利貼資料集合的後綴。空值或 none ＝正式環境；設為 _dev 等值可切到獨立的測試資料。
      // 詳見 app/utils/collections.ts
      firestoreSuffix: rawFirestoreSuffix,
      // 節慶主題（視覺皮膚）。none 或不設＝原本的主題；halloween＝萬聖節。詳見 app/data/themes.ts
      theme: process.env.NUXT_PUBLIC_THEME || 'none',
      firebase: {
        apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || '',
        authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
        storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || ''
      }
    }
  }
})
