<template>
  <main class="p-legal">
    <div class="p-legal__container">
      <!-- 與 /privacy 同一套：掃描內容裡還有沒有【，有就現身，填完自動消失 -->
      <aside v-if="unfilledCount > 0" class="p-legal__draft" role="alert" lang="zh-Hant-TW">
        <p class="p-legal__draft-title">⚠️ 這份規範尚未定稿，請勿對外公開</p>
        <p class="p-legal__draft-body">
          還有 {{ unfilledCount }} 處以【】標示的內容需要填寫或決定。
          填完之後這個提示會自動消失。待確認的項目見 <code>app/data/terms.ts</code> 的檔頭。
        </p>
      </aside>

      <!-- 本文只有繁中版，其他語言的介面先說明以中文版為準 -->
      <p v-if="t.legal.chineseOnly" class="p-legal__locale-note">{{ t.legal.chineseOnly }}</p>

      <!-- 本文標明繁中：日文、韓文介面的字型不套到這裡（見 base/_global.scss） -->
      <div lang="zh-Hant-TW">
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
      </div>

      <footer class="p-legal__footer">
        <NuxtLink to="/privacy" class="p-legal__link">{{ t.legal.privacyPolicy }}</NuxtLink>
        <NuxtLink to="/" class="p-legal__back">{{ t.common.backToWall }}</NuxtLink>
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

const { t } = useI18n()

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

usePageSeo(TERMS_TITLE, '數位應援便利貼活動的參加方式、投稿限制與內容規範')

useHead({
  meta: [
    // 全站預設禁止縮放（編輯器與便利貼牆有自己的手勢），這份長文件要讓人能放大來讀
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ...(unfilledCount.value > 0 ? [{ name: 'robots', content: 'noindex' }] : [])
  ]
})
</script>
