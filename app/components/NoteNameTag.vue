<template>
  <!-- 署名：頭貼＋暱稱。編輯器、確認畫面的預覽、首頁、LED 牆共用這一個元件，
       大小全部跟著便利貼的比例走（cqw），定位與縮放由外層負責。 -->
  <span class="c-note-name-tag">
    <img
      v-if="avatar && !avatarBroken"
      :src="avatar"
      alt=""
      class="c-note-name-tag__avatar"
      draggable="false"
      @error="avatarBroken = true"
    />
    <span v-else class="c-note-name-tag__avatar c-note-name-tag__avatar--initial" aria-hidden="true">{{ initial }}</span>
    <span class="c-note-name-tag__name">{{ name }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { nameInitial } from '~/utils/name-tag'

const props = defineProps<{
  name: string
  avatar?: string | null
}>()

const avatarBroken = ref(false)
watch(() => props.avatar, () => { avatarBroken.value = false })

const initial = computed(() => nameInitial(props.name))
</script>
