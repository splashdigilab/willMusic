// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─── Amplify 的空值限制 ───────────────────────────────────────────
// Amplify 的環境變數一律不接受空字串，連「所有分支」那一列也不行。
// 所以本來用「留空」表達的兩件事（不載入 GTM、不加集合後綴），都得改用
// 一個看得懂的值來表達，約定成 none。

// GTM 容器編號。只認 GTM- 開頭的正規格式，其他值（none、留空、打錯字）
// 一律視同沒設、不載入 GTM —— 編號打錯時直接不載入，
// 而不是靜靜去要一個不存在的容器。
const rawGtmId = process.env.NUXT_PUBLIC_GTM_ID || ''
const gtmId = /^GTM-[A-Z0-9]+$/i.test(rawGtmId) ? rawGtmId : ''

// 便利貼資料集合的後綴在這裡原樣傳遞，'none' 的正規化寫在 app/utils/collections.ts。
// 原因：NUXT_PUBLIC_FIRESTORE_SUFFIX 命中 Nuxt 的 runtimeConfig 自動覆寫規則，
// SSR 時環境變數會蓋掉這裡算好的值，轉換放這裡會被繞過。

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
      title: 'WillMusic - Post Board',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'description', content: 'Interactive digital sticky notes for K-Pop record store' }
      ],
      link: [
        // 介面字與 HTML 平行下載（@font-face 已內嵌，preload 只是提前開始抓）。
        // 400 / 700 / 800 都要 preload：全站粗體是 700，新視覺的大標（應援便利貼!、
        // POST BOARD、START）是 800，少預載任何一個，該字重都會先以後備字型渲染再換過來。
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/line-seed-ui-400.woff2',
          crossorigin: ''
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/line-seed-ui-700.woff2',
          crossorigin: ''
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/line-seed-ui-800.woff2',
          crossorigin: ''
        },
        // 內容字分片：一般樣式表，確保大螢幕不會先閃後備字型再換成 LINE Seed
        { rel: 'stylesheet', href: '/fonts/line-seed.css' }
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

    public: {
      gtmId: gtmId,
      // 便利貼資料集合的後綴。空值或 none ＝正式環境；設為 _dev 等值可切到獨立的測試資料。
      // 詳見 app/utils/collections.ts
      firestoreSuffix: process.env.NUXT_PUBLIC_FIRESTORE_SUFFIX || '',
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
