<template>
  <template v-for="(block, index) in blocks" :key="index">
    <h3 v-if="block.type === 'h3'" class="p-legal__subheading">{{ block.text }}</h3>

    <p v-else-if="block.type === 'p'" class="p-legal__text">{{ block.text }}</p>

    <p v-else-if="block.type === 'note'" class="p-legal__note">{{ block.text }}</p>

    <ul v-else-if="block.type === 'ul'" class="p-legal__list">
      <li v-for="(item, i) in block.items" :key="i">{{ item }}</li>
    </ul>

    <ol v-else-if="block.type === 'ol'" class="p-legal__list p-legal__list--ordered">
      <li v-for="(item, i) in block.items" :key="i">{{ item }}</li>
    </ol>

    <!-- 表格在手機上一定會超出寬度，用一層包裝讓它自己橫向捲，
         而不是把整頁撐寬導致所有內文都要左右滑 -->
    <div v-else-if="block.type === 'table'" class="p-legal__table-scroll">
      <table class="p-legal__table">
        <thead>
          <tr>
            <th v-for="(cell, i) in block.head" :key="i" scope="col">{{ cell }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in block.rows" :key="r">
            <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<script setup lang="ts">
/**
 * 把法律文件的區塊陣列渲染出來。`/privacy` 與 `/terms` 共用。
 *
 * 內容一律用 `{{ }}` 插值而不是 `v-html`：這些文案之後會由法務或客戶提供，
 * 不該預設它是可信的 HTML。真的需要粗體之類的排版時，
 * 請在 LegalBlock 加一種新的 type，不要開 v-html 的口子。
 */
import type { LegalBlock } from '~/utils/legal-doc'

defineProps<{ blocks: LegalBlock[] }>()
</script>
