<template>
  <!--
    萬聖節主題的開場畫面（稿子「(Draft) 萬聖節便利貼 - WillMusic.ai」畫板 01）。
    流程與原本的開場卡片相同：載入時顯示、按 START 關閉，只換長相。

    排版以稿子的 1080×1920 為座標系：--u 是「稿子上的 1px」在螢幕上的長度，
    舞台（.t-hw-intro__stage）照 9:16 縮到放得進螢幕，南瓜、說明、START 放在舞台上；
    蜘蛛網、垂吊的蜘蛛、字標、英文小字則貼著螢幕四角，螢幕比 9:16 細長或寬扁時才不會飄在半空。
    素材都在 public/themes/halloween/，由 scripts/themes/ 從稿子取出。
  -->
  <div class="t-hw-intro">
    <img src="/themes/halloween/web-top-left.svg" alt="" class="t-hw-intro__web t-hw-intro__web--tl" />
    <img src="/themes/halloween/web-bottom-right.svg" alt="" class="t-hw-intro__web t-hw-intro__web--br" />
    <img src="/themes/halloween/spider-top.svg" alt="" class="t-hw-intro__spider-top" />

    <p class="t-hw-intro__caption t-hw-intro__caption--top">Create your customized message here<br>and share your passion for music with everyone.</p>
    <p class="t-hw-intro__caption t-hw-intro__caption--bottom">Create your customized message here<br>and share your passion for music with everyone.</p>
    <img src="/themes/halloween/logo-intro.svg" alt="WillMusic" class="t-hw-intro__logo" />

    <div class="t-hw-intro__stage">
      <!-- 標題已轉成外框畫在南瓜圖裡（介面字型沒有「聖」這個字），這裡留給讀屏軟體 -->
      <h1 class="t-hw-intro__sr-only">POST BOARD 萬聖便利貼</h1>
      <img src="/themes/halloween/intro-hero.svg" alt="" class="t-hw-intro__hero" />

      <p class="t-hw-intro__desc">歡迎來到 WILL MUSIC 數位應援便利貼<br>在這裡，您可以創作專屬於您的應援內容<br>與大家一起分享對音樂的熱愛。</p>

      <div class="t-hw-intro__start-wrap">
        <button
          type="button"
          class="p-index__intro-btn t-hw-intro__start"
          :disabled="loading"
          @click="emit('start')"
        >
          <span v-if="loading" class="p-index__intro-btn-inner">
            <span class="p-index__intro-spinner" aria-hidden="true" />
            載入中...
          </span>
          <span v-else>START</span>
        </button>
        <img src="/themes/halloween/spider-start.svg" alt="" class="t-hw-intro__spider-start" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ loading: boolean }>()
const emit = defineEmits<{ start: [] }>()
</script>

<style scoped>
/* 樣式在 app/assets/scss/themes/_halloween.scss */
</style>
