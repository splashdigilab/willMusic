import type { Messages } from '../types'

const notes = (n: number) => (n === 1 ? '1 note' : `${n} notes`)

export default {
  banned: 'This account can no longer submit notes',
  exhausted: (dailyLimit: number) =>
    dailyLimit === 1
      ? 'You\'ve sent your 1 note for today. Come back tomorrow'
      : `You\'ve sent all ${dailyLimit} notes for today. Come back tomorrow`,
  remainingWithWait: (remaining: number, wait: string) => `${notes(remaining)} left today. Next one in ${wait}`,
  remaining: (remaining: number) => `${notes(remaining)} left today`
} satisfies Messages['quota']
