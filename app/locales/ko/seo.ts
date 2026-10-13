import type { Messages } from '../types'

export default {
  home: {
    title: '디지털 응원 포스트잇',
    description: 'WillMusic에서 나만의 응원 포스트잇을 만들어 보세요. 검토를 통과하면 매장 대형 스크린에 띄워져 모두와 음악에 대한 사랑을 나눌 수 있어요.'
  },
  editor: {
    title: '포스트잇 만들기',
    description: '색과 모양을 고르고 글씨, 손그림, 스티커로 나만의 응원 포스트잇을 만들어요. LINE으로 로그인하면 WillMusic 매장 대형 스크린으로 보낼 수 있어요.'
  },
  queue: {
    title: '대형 스크린 대기 중',
    description: '포스트잇을 보냈어요. 대기 중인 장수와 화면에 나오기까지 예상 시간을 확인할 수 있어요.'
  },
  myNotes: {
    title: '내 포스트잇',
    description: '보낸 포스트잇, 대기 순서, 오늘 더 보낼 수 있는 장수를 확인할 수 있어요.'
  }
} satisfies Messages['seo']
