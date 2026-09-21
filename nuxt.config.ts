// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const gtmId = process.env.NUXT_PUBLIC_GTM_ID || ''

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
    public: {
      gtmId: gtmId,
      // 便利貼資料集合的後綴。空值＝正式環境；設為 _dev 等值可切到獨立的測試資料。
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
