<template>
  <!-- 每個語言用它自己的寫法，不跟著目前的介面語言翻譯：看不懂目前語言的人才找得到自己的 -->
  <nav class="c-locale-switcher" :aria-label="t.common.language">
    <button
      v-for="code in LOCALES"
      :key="code"
      type="button"
      class="c-locale-switcher__item"
      :class="{ 'is-active': code === locale }"
      :lang="HTML_LANG[code]"
      :aria-pressed="code === locale"
      @click="setLocale(code)"
    >{{ LOCALE_LABELS[code] }}</button>
  </nav>
</template>

<script setup lang="ts">
import { HTML_LANG, LOCALES, LOCALE_LABELS } from '~/utils/i18n'

const { t, locale, setLocale } = useI18n()
</script>
