import type { Messages } from '../types'

export default {
  title: 'Waiting',
  lead: 'Your note has been sent and is in line for the big screen',
  countLabel: 'In line now',
  countUnit: (n: number) => (n === 1 ? 'note' : 'notes'),
  waitLabel: 'Estimated wait',
  waitSoon: 'Very soon',
  waitWithin: (n: number) => `~${n} min`,
  waitOver: (n: number) => `Over ${n} min`,
  backHome: '＼ Back to home ／',
  viewMyNotes: 'View my notes'
} satisfies Messages['queue']
