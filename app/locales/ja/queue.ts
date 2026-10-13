import type { Messages } from '../types'

export default {
  title: '順番待ち',
  lead: '付箋を送信しました。大型スクリーンに表示されるまでお待ちください',
  countLabel: '現在の順番待ち',
  countUnit: (_n: number) => '枚',
  waitLabel: '待ち時間の目安',
  waitSoon: 'まもなく表示',
  waitWithin: (n: number) => `約${n}分以内`,
  waitOver: (n: number) => `${n}分以上`,
  backHome: '＼ ホームに戻る ／',
  viewMyNotes: 'マイ付箋を見る'
} satisfies Messages['queue']
