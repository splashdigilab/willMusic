<template>
  <!-- 右上角的語言選單：地球圓鈕，點開是四個語言。放在登入狀態（MemberBadge）左邊，
       同尺寸、同樣子，兩顆看起來是同一排。
       用地球圖示不用文字：看不懂目前語言的人，才認得出這是換語言的地方 -->
  <div ref="rootRef" class="c-locale-menu">
    <button
      type="button"
      class="c-locale-menu__btn"
      :aria-label="t.common.language"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg class="c-locale-menu__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" />
      </svg>
    </button>

    <Transition name="member-pop">
      <ul v-if="open" class="c-locale-menu__list" role="menu" :aria-label="t.common.language">
        <!-- 每個語言用它自己的寫法，不跟著目前的介面語言翻譯 -->
        <li v-for="code in LOCALES" :key="code" role="none">
          <button
            type="button"
            role="menuitemradio"
            class="c-locale-menu__item"
            :class="{ 'is-active': code === locale }"
            :aria-checked="code === locale"
            :lang="HTML_LANG[code]"
            @click="choose(code)"
          >
            <svg class="c-locale-menu__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {{ LOCALE_LABELS[code] }}
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { HTML_LANG, LOCALES, LOCALE_LABELS, type Locale } from '~/utils/i18n'

const { t, locale, setLocale } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)

const choose = async (code: Locale) => {
  open.value = false
  if (code !== locale.value) await setLocale(code)
}

// 點外面或按 Esc 收起來，跟 MemberBadge 同一套
const onPointerDown = (e: PointerEvent) => {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = false
}
const unbind = () => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
}

watch(open, (isOpen) => {
  if (isOpen) {
    // capture：首頁的 usePanZoom 會在畫布上攔 pointerdown，冒泡階段收不到
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    unbind()
  }
})

onUnmounted(unbind)
</script>
