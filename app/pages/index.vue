<template>
  <div class="p-index-redirect">
    <div class="p-index-loading">
      <div class="p-index-spinner"></div>
      <p>載入中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})

// 自動導向到即時牆
onMounted(() => {
  navigateTo('/live')
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/pages/_index.scss */
</style>
