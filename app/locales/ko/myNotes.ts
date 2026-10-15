import type { Messages } from '../types'

export default {
  title: '내 포스트잇',
  backHome: '홈으로',

  login: {
    title: 'LINE으로 로그인',
    text: ['내가 보낸 포스트잇과', '오늘 몇 장 더 보낼 수 있는지 볼 수 있어요'],
    button: 'LINE 로그인',
    failed: '로그인이 완료되지 않았어요. 다시 시도해 주세요.'
  },

  quota: {
    banned: '이 계정은 더 이상 포스트잇을 보낼 수 없어요',
    bannedNote: '궁금한 점은 매장 직원에게 문의해 주세요.',
    unlimited: '응원 포스트잇을 만들어 대형 스크린에 보내 보세요',
    label: '오늘 남은 장수',
    of: (n: number) => `/ ${n}장`,
    exhausted: '내일 또 만나요!',
    cooldown: (wait: string) => `${wait} 후 보낼 수 있어요`,
    ready: '지금 보낼 수 있어요',
    makeNote: '＼ 포스트잇 만들기 ／'
  },

  strikes: (n: number, limit: number) => `이벤트 규칙에 맞지 않아 삭제된 포스트잇이 ${n}장 있어요. 삭제된 포스트잇이 ${limit}장이 되면 더 이상 보낼 수 없어요.`,

  empty: {
    none: '아직 보낸 포스트잇이 없어요',
    hidden: '지금 표시할 포스트잇이 없어요',
    text: ['보낸 포스트잇이 여기에 나타나요', '대기 순서와 표시 시간도 볼 수 있어요']
  },

  loadError: {
    title: '불러오지 못했어요',
    text: ['네트워크 연결을 확인한 뒤', '다시 시도해 주세요'],
    retry: '다시 시도'
  },

  pending: '대기 중',
  played: '표시 완료',
  yourTurn: '차례가 왔어요!',
  watchScreen: '대형 스크린을 봐 주세요',
  aheadBefore: '앞에 ',
  aheadAfter: (_n: number) => '장 남았어요',
  sentAt: (time: string) => `${time} 보냄`,
  shownAt: (time: string) => `${time} 표시됨`,
  today: (time: string) => `오늘 ${time}`,

  marketing: 'WillMusic의 이벤트·혜택 소식을 받을게요',
  marketingTo: (email: string) => `받는 주소: ${email}`,

  footnote: '이벤트 규칙에 맞지 않는 포스트잇은 삭제되어 여기에 표시되지 않아요.'
} satisfies Messages['myNotes']
