<template>
  <div id="app">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
// data-theme 是節慶主題樣式的範圍（app/assets/scss/themes/），原本的主題是 default
const { themeId } = useTheme()

useHead({
  htmlAttrs: {
    lang: 'zh-TW',
    'data-theme': themeId
  }
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
