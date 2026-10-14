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
      <!-- 標題已轉成外框畫在南瓜圖裡（介面字型沒有「聖」這個字），這裡留給讀屏軟體。
           圖裡的字標每個語言都一樣，所以這裡也不翻譯，標成繁中讓讀屏軟體用中文念 -->
      <h1 class="t-hw-intro__sr-only" lang="zh-Hant-TW">POST BOARD 萬聖便利貼</h1>
      <img src="/themes/halloween/intro-hero.svg" alt="" class="t-hw-intro__hero" />

      <!-- 一個元素一行，各語言行數不同（最多四行）。四行的縮小字級，否則會貼到 START（見 themes/_halloween.scss） -->
      <p
        class="t-hw-intro__desc"
        :class="{ 't-hw-intro__desc--compact': t.home.halloween.intro.length > 3 }"
      ><template v-for="(line, i) in t.home.halloween.intro" :key="i"><br v-if="i > 0">{{ line }}</template></p>

      <div class="t-hw-intro__start-wrap">
        <button
          type="button"
          class="p-index__intro-btn t-hw-intro__start"
          :disabled="loading"
          @click="emit('start')"
        >
          <span v-if="loading" class="p-index__intro-btn-inner">
            <span class="p-index__intro-spinner" aria-hidden="true" />
            {{ t.home.loading }}
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

const { t } = useI18n()
</script>

<style scoped>
/* 樣式在 app/assets/scss/themes/_halloween.scss */
</style>
