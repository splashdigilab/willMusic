<template>
  <!-- 開新分頁：LINE 內建瀏覽器會直接攔下 line.me/R 的網址打開官方帳號頁；
       外部瀏覽器則是開一頁帶 QR code／開啟 LINE 的頁面。兩種都不該把使用者帶離本站 -->
  <a
    v-if="shouldPrompt"
    :href="LINE_ADD_FRIEND_URL"
    target="_blank"
    rel="noopener"
    class="c-line-friend-prompt"
    :class="`c-line-friend-prompt--${variant}`"
    @click="markPrompted"
  >
    <template v-if="variant === 'banner'">
      <span class="c-line-friend-prompt__text">
        <strong>{{ t.member.lineFriend.title }}</strong>
        <span>{{ t.member.lineFriend.subtitle }}</span>
      </span>
      <span class="c-line-friend-prompt__cta">{{ t.member.lineFriend.cta }}</span>
    </template>
    <template v-else>{{ t.member.lineFriend.button }}</template>
  </a>
</template>

<script setup lang="ts">
/**
 * 已登入、但還不是官方帳號好友的人看到的「加入好友」。判斷規則見 useLineFriend。
 *
 *   button → 右上角小卡、我的便利貼（淺底）：一整顆 LINE 綠細框膠囊
 *   banner → 送出後的等待頁（深灰底）：一張橫條小卡，右邊實心綠的「加入」
 *
 * 送出確認畫面刻意不放（2026-10-08 Kevin 決定）：那裡的主要動作是「上傳大螢幕」，
 * 再多一個綠色的東西會分散注意力；剛送出、在等上牆的那一刻才是邀請的好時機。
 */
import { LINE_ADD_FRIEND_URL, useLineFriend } from '~/composables/useLineFriend'

withDefaults(defineProps<{ variant?: 'button' | 'banner' }>(), { variant: 'button' })

const { t } = useI18n()
const { shouldPrompt, markPrompted } = useLineFriend()
</script>
