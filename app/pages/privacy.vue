<template>
  <main class="p-legal">
    <div class="p-legal__container">
      <!-- 文案還沒定稿時自己現身。不是靠開關，是掃描內容裡還有沒有【，
           所以不需要記得在上線前關掉什麼——填完就消失。 -->
      <aside v-if="unfilledCount > 0" class="p-legal__draft" role="alert">
        <p class="p-legal__draft-title">⚠️ 這份政策尚未定稿，請勿對外公開</p>
        <p class="p-legal__draft-body">
          還有 {{ unfilledCount }} 處以【】標示的內容需要填寫或決定。
          填完之後這個提示會自動消失。撰寫時的說明見 <code>docs/privacy-policy.md</code>。
        </p>
      </aside>

      <!-- 本文只有繁中版，其他語言的介面先說明以中文版為準 -->
      <p v-if="t.legal.chineseOnly" class="p-legal__locale-note">{{ t.legal.chineseOnly }}</p>

      <!-- 本文標明繁中：日文、韓文介面的字型不套到這裡（見 base/_global.scss） -->
      <div lang="zh-Hant-TW">
        <header class="p-legal__header">
          <h1 class="p-legal__title">{{ POLICY_TITLE }}</h1>
          <p class="p-legal__updated">最後更新日期：{{ POLICY_LAST_UPDATED }}</p>
        </header>

        <div class="p-legal__intro">
          <LegalBlocks :blocks="POLICY_INTRO" />
        </div>

        <nav class="p-legal__toc" aria-label="目錄">
          <p class="p-legal__toc-title">目錄</p>
          <ol class="p-legal__toc-list">
            <li v-for="section in POLICY_SECTIONS" :key="section.id">
              <a :href="`#${section.id}`">{{ section.heading }}</a>
            </li>
          </ol>
        </nav>

        <section
          v-for="section in POLICY_SECTIONS"
          :id="section.id"
          :key="section.id"
          class="p-legal__section"
        >
          <h2 class="p-legal__heading">{{ section.heading }}</h2>
          <LegalBlocks :blocks="section.blocks" />
        </section>
      </div>

      <footer class="p-legal__footer">
        <NuxtLink to="/terms" class="p-legal__link">{{ t.legal.terms }}</NuxtLink>
        <NuxtLink to="/" class="p-legal__back">{{ t.common.backToWall }}</NuxtLink>
      </footer>
    </div>
  </main>
</template>

<script setup lang="ts">
/**
 * 隱私權政策。也是 LINE Developers 後台「Privacy policy URL」要填的那一頁。
 *
 * 文案在 `app/data/privacy-policy.ts`，這裡只負責版面——法務改完只要換那一份。
 * 版面與 `/terms` 共用 `.p-legal`，區塊渲染共用 `LegalBlocks`。
 *
 * 這一頁刻意不吃編輯器那套滿版鎖高度的處理：它是一份要捲著看的長文件，
 * 而且會在新分頁開啟（同意勾選的連結帶 target="_blank"），不會蓋掉編輯中的內容。
 */
import {
  POLICY_TITLE,
  POLICY_LAST_UPDATED,
  POLICY_INTRO,
  POLICY_SECTIONS
} from '~/data/privacy-policy'
import { countPlaceholders } from '~/utils/legal-doc'

definePageMeta({
  layout: false
})

const { t } = useI18n()

const unfilledCount = computed(() =>
  countPlaceholders(
    POLICY_TITLE,
    POLICY_LAST_UPDATED,
    POLICY_INTRO,
    ...POLICY_SECTIONS.map(s => s.heading),
    ...POLICY_SECTIONS.map(s => s.blocks)
  )
)

usePageSeo(POLICY_TITLE, '數位應援便利貼活動的個人資料蒐集告知與隱私權政策')

useHead({
  meta: [
    // 全站預設禁止縮放（編輯器與便利貼牆有自己的手勢），這份長文件要讓人能放大來讀
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    // 還沒定稿就不要讓搜尋引擎收錄
    ...(unfilledCount.value > 0 ? [{ name: 'robots', content: 'noindex' }] : [])
  ]
})
</script>
