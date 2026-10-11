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
</script>
