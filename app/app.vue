<template>
  <div id="app">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
import { HTML_LANG } from '~/utils/i18n'
import { LOCALE_UI_FONTS } from '~/utils/locale-fonts'

// data-theme 是節慶主題樣式的範圍（app/assets/scss/themes/），原本的主題是 default
const { themeId } = useTheme()
// lang 跟著介面語言走：日文、韓文的介面字型靠它切換（base/_global.scss），系統字也靠它挑字形
const { locale } = useI18n()

// 日文、韓文介面的字型：選了那個語言才內嵌 @font-face 並預載（見 utils/locale-fonts.ts）
const localeFont = computed(() => LOCALE_UI_FONTS[locale.value])

useHead({
  htmlAttrs: {
    lang: computed(() => HTML_LANG[locale.value]),
    'data-theme': themeId
  },
  style: computed(() => (localeFont.value ? [{ key: 'locale-ui-font', innerHTML: localeFont.value.css }] : [])),
  link: computed(() =>
    (localeFont.value?.files ?? []).map(href => ({
      rel: 'preload',
      as: 'font',
      type: 'font/woff2',
      href,
      crossorigin: ''
    }))
  )
})

// 分享預覽圖（原稿與產生方式見 scripts/og/）。og:image 一定要絕對網址，網域從請求推導，
// 跟 LINE 登入的回呼網址同一套（server/utils/line-login.ts），正式站、測試站、本機都不用另外設定
const origin = useRequestURL({ xForwardedHost: true, xForwardedProto: true }).origin
useSeoMeta({
  ogImage: `${origin}/og-image.jpg`,
  ogImageType: 'image/jpeg',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: '應援便利貼！POST BOARD — WillMusic'
})
</script>
