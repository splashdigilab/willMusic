<template>
  <header class="c-header" :class="{ 'c-header--transparent': transparent, 'c-header--relative': relative }">
    <button v-if="showBack" class="c-header__back-btn" @click="$emit('back')">
      <img src="/back-btn.svg" alt="返回" />
    </button>
    <div class="c-header__logo">
      <img src="/logo.svg" alt="WillMusic Logo" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  showBack?: boolean
  transparent?: boolean
  relative?: boolean
}>()

defineEmits(['back'])
</script>


