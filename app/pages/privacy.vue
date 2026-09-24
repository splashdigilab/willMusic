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

      <footer class="p-legal__footer">
        <NuxtLink to="/terms" class="p-legal__link">活動規範</NuxtLink>
        <NuxtLink to="/" class="p-legal__back">回到便利貼牆</NuxtLink>
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

const unfilledCount = computed(() =>
  countPlaceholders(
    POLICY_TITLE,
    POLICY_LAST_UPDATED,
    POLICY_INTRO,
    ...POLICY_SECTIONS.map(s => s.heading),
    ...POLICY_SECTIONS.map(s => s.blocks)
  )
)

useHead({
  title: `${POLICY_TITLE} - WillMusic`,
  meta: [
    { name: 'description', content: '數位應援便利貼活動的個人資料蒐集告知與隱私權政策' },
    // 還沒定稿就不要讓搜尋引擎收錄
    ...(unfilledCount.value > 0 ? [{ name: 'robots', content: 'noindex' }] : [])
  ]
})
</script>
