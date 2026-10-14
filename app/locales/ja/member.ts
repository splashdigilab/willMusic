import type { Messages } from '../types'

export default {
  badge: {
    account: 'LINEアカウント',
    accountWithName: (name: string) => `LINEアカウント：${name}`,
    notLoggedIn: 'ログインしていません',
    loginStatus: 'ログイン状態',
    guestHint: '見るのも作るのもログインは不要で、付箋を送信するときだけ必要です。ログインすると、送信した付箋や今日あと何枚送れるかを確認できます。',
    login: 'LINEでログイン',
    myNotes: 'マイ付箋',
    logout: 'ログアウト',
    quotaLoading: '読み込み中…',
    quotaUnknown: '付箋はこのアカウントで送信されます'
  },
  dataNotice: {
    before: 'ログインすると、LINEの表示名・プロフィール画像・メールアドレスを取得し、本人確認とイベントのご連絡に使用します。',
    after: ''
  },
  lineFriend: {
    title: 'WillMusicをLINEで友だち追加',
    subtitle: 'お知らせ・特典をいち早くお届けします',
    cta: '追加',
    button: '＋ LINE友だち追加'
  }
} satisfies Messages['member']
