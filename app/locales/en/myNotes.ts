import type { Messages } from '../types'

export default {
  title: 'My Notes',
  backHome: 'Back to home',

  login: {
    title: 'Log in with LINE',
    text: ['to see your notes', 'and how many you can send today'],
    button: 'Log in with LINE',
    failed: 'Login didn\'t go through. Please try again.'
  },

  quota: {
    banned: 'This account can no longer send notes',
    bannedNote: 'Questions? Please ask our staff in the store.',
    unlimited: 'Make a cheer note and send it to the big screen',
    label: 'Left today',
    of: (n: number) => `/ ${n}`,
    exhausted: 'Come back tomorrow!',
    cooldown: (wait: string) => `Next in ${wait}`,
    ready: 'Ready to send',
    makeNote: '＼ Make a note ／'
  },

  empty: {
    none: 'You haven\'t sent any notes yet',
    hidden: 'No notes to show right now',
    text: ['Notes you send will show up here,', 'with their place in line', 'and when they\'re on the big screen']
  },

  pending: 'In line',
  played: 'Shown on screen',
  yourTurn: 'It\'s your turn!',
  watchScreen: 'Look at the big screen',
  aheadBefore: '',
  aheadAfter: (n: number) => (n === 1 ? ' note ahead of you' : ' notes ahead of you'),
  sentAt: (time: string) => `Sent ${time}`,
  shownAt: (time: string) => `Shown ${time}`,
  today: (time: string) => `today ${time}`,

  marketing: 'I\'d like to get event and deal news from WillMusic',
  marketingTo: (email: string) => `We\'ll email ${email}`,

  footnote: 'Notes that break the event rules are taken down and won\'t appear here.'
} satisfies Messages['myNotes']
