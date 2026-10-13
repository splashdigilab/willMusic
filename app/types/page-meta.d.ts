declare module '#app' {
  interface PageMeta {
    /**
     * 店員與店內設備用的頁面（後台、LED 牆、掃碼頁、後台登入）：不翻譯，
     * 不管使用者選了什麼語言都用繁中（見 composables/useI18n.ts）
     */
    zhOnly?: boolean
  }
}

export {}
