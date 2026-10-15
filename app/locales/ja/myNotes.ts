import type { Messages } from '../types'

export default {
  title: 'マイ付箋',
  backHome: 'ホームに戻る',

  login: {
    title: 'LINEでログイン',
    text: ['送信した付箋や', '今日あと何枚送れるかを確認できます'],
    button: 'LINEでログイン',
    failed: 'ログインが完了しませんでした。もう一度お試しください。'
  },

  quota: {
    banned: 'このアカウントは投稿できなくなりました',
    bannedNote: 'ご不明な点は、店内のスタッフにお尋ねください。',
    unlimited: '応援付箋を作って、大型スクリーンに送りましょう',
    label: '今日あと',
    of: (n: number) => `/ ${n} 枚`,
    exhausted: 'また明日どうぞ！',
    cooldown: (wait: string) => `${wait} 後に送れます`,
    ready: '今すぐ送れます',
    makeNote: '＼ 付箋を作る ／'
  },

  strikes: (n: number, limit: number) => `イベントのルールに沿わないため、${n}枚の付箋が削除されました。削除が${limit}枚になると投稿できなくなります。`,

  empty: {
    none: 'まだ付箋を送信していません',
    hidden: '表示できる付箋はありません',
    text: ['送信した付箋はここに表示されます', '順番や表示された時間も確認できます']
  },

  loadError: {
    title: '読み込めませんでした',
    text: ['通信環境をご確認のうえ', 'もう一度お試しください'],
    retry: '再読み込み'
  },

  pending: '順番待ち',
  played: '表示済み',
  yourTurn: 'あなたの番です！',
  watchScreen: '大型スクリーンをご覧ください',
  aheadBefore: '前に',
  aheadAfter: (_n: number) => '枚あります',
  sentAt: (time: string) => `${time} に送信`,
  shownAt: (time: string) => `${time} に表示`,
  today: (time: string) => `今日 ${time}`,

  marketing: 'WillMusicからイベントやお得な情報を受け取る',

  footnote: 'イベントのルールに沿わない付箋は削除され、ここには表示されません。'
} satisfies Messages['myNotes']
