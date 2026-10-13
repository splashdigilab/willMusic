import type { Messages } from '../types'

export default {
  banned: 'このアカウントは投稿できなくなりました',
  exhausted: (dailyLimit: number) => `今日の${dailyLimit}枚はすべて送信しました。また明日どうぞ`,
  remainingWithWait: (remaining: number, wait: string) => `今日はあと${remaining}枚送れます。次は${wait}後に送れます`,
  remaining: (remaining: number) => `今日はあと${remaining}枚送れます`
} satisfies Messages['quota']
