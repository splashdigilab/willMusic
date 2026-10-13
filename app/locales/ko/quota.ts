import type { Messages } from '../types'

export default {
  banned: '이 계정은 더 이상 보낼 수 없어요',
  exhausted: (dailyLimit: number) => `오늘 ${dailyLimit}장을 모두 보냈어요. 내일 다시 와 주세요`,
  remainingWithWait: (remaining: number, wait: string) => `오늘 ${remaining}장 더 보낼 수 있어요. 다음 장은 ${wait} 후에 보낼 수 있어요`,
  remaining: (remaining: number) => `오늘 ${remaining}장 더 보낼 수 있어요`
} satisfies Messages['quota']
