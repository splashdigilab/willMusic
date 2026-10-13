import type { Messages } from '../types'

/** rules 是 data/terms.ts 的 TERMS_RULES 的翻譯，那邊改了這裡要跟著改 */
export default {
  rules: [
    'LINE으로 로그인하면 포스트잇을 보낼 수 있어요. 둘러보기와 만들기는 로그인 없이 가능해요. 로그인할 때 LINE 닉네임, 프로필 사진, 이메일 주소를 받아요. 사용 목적은 개인정보 처리방침을 확인해 주세요.',
    '부적절한 단어나 이미지는 금지예요. 위반한 내용은 WillMusic이 예고 없이 삭제할 수 있고, 악의적인 위반을 반복한 계정은 더 이상 보낼 수 없어요. 규정 위반 여부는 WillMusic이 본 규정에 따라 판단해요.',
    '1인당 5분에 1장, 하루 최대 3장까지 보낼 수 있어요.',
    '보낸 포스트잇은 매장 LED 월에 흘러가고, 차례대로 크게 보여요. 규정을 위반한 내용은 삭제돼요.'
  ],
  privacyPolicy: '개인정보 처리방침',
  terms: '참여 규정',
  chineseOnly: '이 문서는 번체 중국어로만 제공돼요. 내용이 다를 경우 중국어 버전이 우선해요.'
} satisfies Messages['legal']
