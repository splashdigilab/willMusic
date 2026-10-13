import type { Messages } from '../types'

export default {
  badge: {
    account: 'LINE account',
    accountWithName: (name: string) => `LINE account: ${name}`,
    notLoggedIn: 'Not logged in',
    loginStatus: 'Login status',
    guestHint: 'You don\'t need to log in to browse or make notes, only to submit one. Once you log in, you can see the notes you\'ve sent and how many you can still send today.',
    login: 'Log in with LINE',
    myNotes: 'My Notes',
    logout: 'Log out',
    quotaLoading: 'Loading...',
    quotaUnknown: 'Your notes will be sent from this account'
  },
  dataNotice: {
    before: 'Logging in shares your LINE display name, profile picture and email with us to confirm who you are and contact you about the event.',
    after: ''
  },
  lineFriend: {
    title: 'Add WillMusic on LINE',
    subtitle: 'Be the first to get news and offers',
    cta: 'Add',
    button: '+ Add WillMusic on LINE'
  }
} satisfies Messages['member']
