import type { Messages } from '../types'

/** rules 是 data/terms.ts 的 TERMS_RULES 的翻譯，那邊改了這裡要跟著改 */
export default {
  rules: [
    'Log in with LINE to submit a note. Browsing and making notes don\'t require logging in. Logging in shares your LINE display name, profile picture and email address with us; see the Privacy Policy for how they are used.',
    'Sensitive words or images are not allowed. WillMusic may remove violating content without notice, and accounts with repeated malicious violations will lose the ability to submit. WillMusic decides whether content breaks these rules.',
    'Please write any Chinese in Traditional characters. Text with Simplified Chinese characters can\'t be sent.',
    'Each person can submit 1 note every 5 minutes, up to 3 notes a day.',
    'Submitted notes are shown on the in-store LED wall and featured full-size in turn. Notes that break the rules will be removed.'
  ],
  privacyPolicy: 'Privacy Policy',
  terms: 'Event Rules',
  chineseOnly: 'This document is available in Traditional Chinese only. If anything is unclear, the Chinese version prevails.'
} satisfies Messages['legal']
