/**
 * 分頁標題、搜尋結果的摘要、分享到 LINE／社群時的預覽文字一起設定，三者不會各改各的。
 *
 * 沒呼叫的頁面沿用 nuxt.config 的全站預設（就是首頁那一組）。
 * 要不要給搜尋引擎收錄不在這裡管，見 nuxt.config 的 routeRules。
 */
export function usePageSeo(title: string, description: string) {
  const fullTitle = `${title} - WillMusic`
  useSeoMeta({
    title: fullTitle,
    description,
    ogTitle: fullTitle,
    ogDescription: description
  })
}
