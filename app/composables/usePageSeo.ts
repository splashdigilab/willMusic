import { toValue, type MaybeRefOrGetter } from 'vue'

/**
 * 分頁標題、搜尋結果的摘要、分享到 LINE／社群時的預覽文字一起設定，三者不會各改各的。
 *
 * 可以傳 getter（`() => t.value.seo.editor.title`），切換語言時會跟著換。
 * 搜尋引擎拿到的是繁中版（爬蟲不送語言偏好，見 utils/i18n.ts）。
 *
 * 沒呼叫的頁面沿用 nuxt.config 的全站預設（就是首頁那一組）。
 * 要不要給搜尋引擎收錄不在這裡管，見 nuxt.config 的 routeRules。
 */
export function usePageSeo(title: MaybeRefOrGetter<string>, description: MaybeRefOrGetter<string>) {
  const fullTitle = () => `${toValue(title)} - WillMusic`
  const desc = () => toValue(description)
  useSeoMeta({
    title: fullTitle,
    description: desc,
    ogTitle: fullTitle,
    ogDescription: desc
  })
}
