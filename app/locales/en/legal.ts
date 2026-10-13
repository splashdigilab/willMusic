import type { Messages } from '../types'

/** rules 是 data/terms.ts 的 TERMS_RULES 的翻譯，那邊改了這裡要跟著改 */
export default {
  rules: [
    'Log in with LINE to submit a note. Browsing and making notes don\'t require logging in. Logging in shares your LINE display name, profile picture and email address with us; see the Privacy Policy for how they are used.',
    'Sensitive words or images are not allowed. WillMusic may remove violating content without notice, and repeated or malicious violations will be handled according to their severity. WillMusic has the final say on what counts as a violation.',
    'Each person can submit 1 note every 5 minutes, up to 3 notes a day.',
    'Approved notes are shown on the in-store LED wall, and each one is featured full-size for 15 seconds.'
  ],
  privacyPolicy: 'Privacy Policy',
  terms: 'Event Rules',
  chineseOnly: 'This document is available in Traditional Chinese only. If anything is unclear, the Chinese version prevails.'
} satisfies Messages['legal']
