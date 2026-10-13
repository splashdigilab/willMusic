<template>
  <!-- 隱私權政策開新分頁：在編輯器裡同分頁導過去，整個編輯器會重載。
       @click.stop 是給放在 label 或可點容器裡的情況，點連結不要順手觸發外層。
       句子拆成前、連結、後三段，各語言自己決定連結在句中的位置；三段之間不能留空白，
       連結與前文的間距由 .c-login-data-notice__link 的左邊距負責 -->
  <p class="c-login-data-notice">
    {{ t.member.dataNotice.before }}<a
      href="/privacy"
      target="_blank"
      rel="noopener"
      class="c-login-data-notice__link"
      @click.stop
    >{{ t.legal.privacyPolicy }}</a>{{ t.member.dataNotice.after }}
  </p>
</template>

<script setup lang="ts">
/**
 * 每一顆 LINE 登入鈕旁邊的資料告知：登入會拿到什麼、email 拿去做什麼。
 *
 * LINE 後台申請 email 權限時要附「你的 app 怎麼向使用者說明 email 用途」的截圖，
 * 截的就是這段（送出確認畫面那一處）。文案只有一份（locales/<語言>/member.ts 的 dataNotice），
 * 四個入口共用 —— 改用途時四個語言的 dataNotice、隱私權政策（app/data/privacy-policy.ts
 * 與 docs/privacy-policy.md）要一起改，否則畫面上講的跟政策對不起來。
 *
 * 行銷信不寫在這裡：那是登入後另外勾選才寄（確認畫面的勾選框本身就是告知），
 * 這段只講登入當下會拿走什麼。原本寫進來整段長到使用者反映「廢話太多」。
 */
const { t } = useI18n()
</script>
