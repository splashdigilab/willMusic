/**
 * 「現在能不能送、還剩幾張、還要等多久」的一句話摘要（useQuotaStatus 的 summary）。
 * 頭像小卡、編輯器、我的便利貼共用，同一件事在各處講法一致。
 *
 * wait 是倒數的 m:ss（例如 4:05），各語言通用，所以不翻譯、直接帶進句子裡。
 */
export default {
  banned: '這個帳號已停止投稿資格',
  exhausted: (dailyLimit: number) => `今天的 ${dailyLimit} 張已經送完了，明天再來`,
  /** 冷卻中：還有額度，但要等倒數跑完 */
  remainingWithWait: (remaining: number, wait: string) => `今天還能送 ${remaining} 張，${wait} 後可以送下一張`,
  remaining: (remaining: number) => `今天還能送 ${remaining} 張`
}
