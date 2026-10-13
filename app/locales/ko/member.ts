import type { Messages } from '../types'

export default {
  badge: {
    account: 'LINE 계정',
    accountWithName: (name: string) => `LINE 계정: ${name}`,
    notLoggedIn: '로그인하지 않았어요',
    loginStatus: '로그인 상태',
    guestHint: '구경하고 만드는 데는 로그인이 필요 없고, 포스트잇을 보낼 때만 필요해요. 로그인하면 내가 보낸 포스트잇과 오늘 몇 장 더 보낼 수 있는지 볼 수 있어요.',
    login: 'LINE으로 로그인',
    myNotes: '내 포스트잇',
    logout: '로그아웃',
    quotaLoading: '불러오는 중...',
    quotaUnknown: '포스트잇을 보낼 때 이 계정을 사용해요'
  },
  dataNotice: {
    before: '로그인하면 LINE 닉네임, 프로필 사진, 이메일을 받아 이벤트 연락에 사용해요.',
    after: ''
  },
  lineFriend: {
    title: 'WillMusic LINE 친구 추가',
    subtitle: '소식과 혜택을 가장 먼저 알려 드려요',
    cta: '추가',
    button: '+ WillMusic LINE 친구 추가'
  }
} satisfies Messages['member']
