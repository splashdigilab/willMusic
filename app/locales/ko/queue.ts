import type { Messages } from '../types'

export default {
  title: '대기 중',
  lead: '포스트잇을 보냈어요. 대형 스크린에 나올 때까지 기다려 주세요',
  countLabel: '현재 대기',
  countUnit: (_n: number) => '장',
  waitLabel: '예상 시간',
  waitSoon: '곧 표시돼요',
  waitWithin: (n: number) => `약 ${n}분 이내`,
  waitOver: (n: number) => `${n}분 이상`,
  backHome: '＼ 홈으로 ／',
  viewMyNotes: '내 포스트잇 보기'
} satisfies Messages['queue']
