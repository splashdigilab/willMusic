<template>
  <main class="p-legal">
    <div class="p-legal__container">
      <!-- 與 /privacy 同一套：掃描內容裡還有沒有【，有就現身，填完自動消失 -->
      <aside v-if="unfilledCount > 0" class="p-legal__draft" role="alert">
        <p class="p-legal__draft-title">⚠️ 這份規範尚未定稿，請勿對外公開</p>
        <p class="p-legal__draft-body">
          還有 {{ unfilledCount }} 處以【】標示的內容需要填寫或決定。
          填完之後這個提示會自動消失。待確認的項目見 <code>app/data/terms.ts</code> 的檔頭。
        </p>
      </aside>

      <header class="p-legal__header">
        <h1 class="p-legal__title">{{ TERMS_TITLE }}</h1>
        <p class="p-legal__updated">最後更新日期：{{ TERMS_LAST_UPDATED }}</p>
      </header>

      <div class="p-legal__intro">
        <LegalBlocks :blocks="TERMS_INTRO" />
      </div>

      <nav class="p-legal__toc" aria-label="目錄">
        <p class="p-legal__toc-title">目錄</p>
        <ol class="p-legal__toc-list">
          <li v-for="section in TERMS_SECTIONS" :key="section.id">
            <a :href="`#${section.id}`">{{ section.heading }}</a>
          </li>
        </ol>
      </nav>

      <section
        v-for="section in TERMS_SECTIONS"
        :id="section.id"
        :key="section.id"
        class="p-legal__section"
      >
        <h2 class="p-legal__heading">{{ section.heading }}</h2>
        <LegalBlocks :blocks="section.blocks" />
      </section>

      <footer class="p-legal__footer">
        <NuxtLink to="/privacy" class="p-legal__link">隱私權政策</NuxtLink>
        <NuxtLink to="/" class="p-legal__back">回到便利貼牆</NuxtLink>
      </footer>
    </div>
  </main>
</template>

<script setup lang="ts">
/**
 * 活動規範。也是 LINE Developers 後台「Terms of use URL」要填的那一頁。
 *
 * 文案在 `app/data/terms.ts`，與編輯器開場卡片共用同一份 ——
 * 那裡顯示的是摘要版（TERMS_RULES），這裡是完整版（TERMS_SECTIONS）。
 * 兩者都從同一個檔案來，才不會改了一邊忘了另一邊。
 */
import {
  TERMS_TITLE,
  TERMS_LAST_UPDATED,
  TERMS_INTRO,
  TERMS_RULES,
  TERMS_SECTIONS
} from '~/data/terms'
import { countPlaceholders } from '~/utils/legal-doc'

definePageMeta({
  layout: false
})

const unfilledCount = computed(() =>
  countPlaceholders(
    TERMS_TITLE,
    TERMS_LAST_UPDATED,
    TERMS_RULES.join(''),
    TERMS_INTRO,
    ...TERMS_SECTIONS.map(s => s.heading),
    ...TERMS_SECTIONS.map(s => s.blocks)
  )
)

useHead({
  title: `${TERMS_TITLE} - WillMusic`,
  meta: [
    { name: 'description', content: '數位應援便利貼活動的參加方式、投稿限制與內容規範' },
    ...(unfilledCount.value > 0 ? [{ name: 'robots', content: 'noindex' }] : [])
  ]
})
</script>
