import type { Messages } from '../types'

export default {
  back: '戻る',
  help: 'ヘルプ',
  startOver: 'やり直す',

  intro: {
    agreeBefore: '',
    agreeBetween: 'と',
    agreeAfter: 'を読み、同意します',
    loading: 'ロード中',
    loginEarly: '先にLINEでログイン（送信時にだけ必要です。あとからでも大丈夫です）',
    termsRequired: '先に参加規約を読んで同意してください。'
  },

  alertTitle: 'お知らせ',

  draft: {
    title: '下書きがあります',
    message: '途中の下書きがあります。続きから編集しますか？それとも新しく始めますか？',
    use: '下書きを使う',
    discard: '新しく始める'
  },

  exit: {
    title: '編集をやめますか？',
    message: 'ここまでの内容は下書きとして自動保存されています。エディターを離れてもよろしいですか？',
    confirm: '離れる',
    stay: 'このページに残る'
  },

  clearAll: {
    title: 'すべて消去しますか？',
    message: '－ この操作は元に戻せません －'
  },

  steps: {
    note: '付箋',
    text: '文字',
    draw: '手描き',
    sticker: 'ステッカー'
  },
  stepDot: (n: number, name: string) => `ステップ${n}：${name}`,
  stepTitles: {
    material: 'カラーを選ぶ',
    shape: '形を選ぶ',
    text: '文字の色・配置を選ぶ',
    draw: 'ペンの色・太さを選ぶ',
    sticker: 'ステッカーを選ぶ'
  },
  prev: '戻る',
  next: '次へ',
  submit: '送信',

  textPlaceholder: 'ここに入力…',
  delete: '削除',
  transformHandle: 'ドラッグで拡大・縮小、回転',
  swatchHidden: 'この色は今の付箋のカラーでは見えません',
  align: {
    left: '左揃え',
    center: '中央揃え',
    right: '右揃え'
  },
  addText: '文字を追加',
  eraser: '消しゴム',
  undoStroke: '元に戻す',
  redoStroke: 'やり直し',
  drawAboveStickers: 'ステッカーの上に描く',

  nameTag: {
    added: '追加済み',
    add: '＋ ネームタグを追加',
    login: 'LINEでログインしてネームタグを付ける',
    toggle: '付箋にネームタグを付ける',
    on: 'プロフィール画像と名前を表示',
    off: '匿名で掲載',
    blocked: '使用できません',
    blockedState: 'この名前はネームタグに使えないため、匿名で掲載されます',
    adjust: '位置を調整',
    tourToggleTitle: '付箋にネームタグを付けますか？',
    tourToggleBody: 'オンにすると、LINEのプロフィール画像と名前が付きます。オフのままなら匿名です。',
    tourAdjustTitle: 'ネームタグを付けました',
    tourAdjustBody: (button: string) => `上のプレビューが掲載されたときの見た目です。位置を変えたいときは「${button}」をタップしてください。`,
    tourDismiss: 'どこかをタップして閉じる'
  },

  submitModal: {
    title: '送信前の確認',
    titleSignedIn: 'ログインしました',
    message: '付箋の見た目を確認してください。送信後は修正できません。',
    confirm: '大型スクリーンに送る',
    confirmWithLogin: 'LINEでログインして送る',
    processing: '処理中…',
    share: '付箋をシェア',
    lineAccount: 'LINEアカウント',
    logout: 'ログアウト',
    quotaBanned: 'このアカウントは投稿できなくなりました',
    quotaExhausted: (dailyLimit: number) => `今日の${dailyLimit}枚はすべて送信しました`,
    quotaCooldown: (wait: string) => `${wait}後に送信できます`,
    quotaNth: (nth: number, dailyLimit: number) => `今日の${nth}枚目（全${dailyLimit}枚）`,
    marketing: 'WillMusicのイベント・特典情報を受け取る'
  },

  duration: {
    seconds: (seconds: number) => `${seconds}秒`,
    minutes: (minutes: number) => `${minutes}分`,
    minutesSeconds: (minutes: number, seconds: number) => `${minutes}分${seconds}秒`
  },

  alerts: {
    stickerLimit: {
      title: 'ステッカーの上限です',
      message: (max: number) => `1枚の付箋に貼れるステッカーは${max}個までです。もっと貼りたいときは、いくつか削除してください。`
    },
    empty: {
      title: 'まだ空白です',
      message: '付箋にまだ何もありません。文字を書いたり、絵を描いたり、ステッカーを貼ったりしてみてください。'
    },
    locationDenied: {
      title: '位置情報の許可が必要です',
      message: [
        '大型スクリーンに送るには、位置情報の許可が必要です。',
        '',
        'iPhone（Safari）：「設定 > Safari > 位置情報」で「許可」にしてください。',
        'Android（Chrome）：アドレスバー左の鍵アイコン（サイトの設定）>「位置情報」で「許可」にしてください。',
        '',
        '設定後このページに戻り、「位置情報を再確認」をタップしてください。'
      ],
      retry: '位置情報を再確認'
    },
    locationUnavailable: {
      title: '位置情報を取得できません',
      message: '現在地を取得できませんでした。位置情報サービスがオンになっているか確認して、しばらくしてからもう一度お試しください。'
    },
    locationServiceDown: {
      title: '位置情報を取得できません',
      message: '現在、位置情報を確認できません（ネットワークまたはサービスの一時的な問題）。しばらくしてからもう一度お試しください。'
    },
    locationFailed: {
      title: '位置情報を取得できません',
      message: '位置情報の確認に失敗しました。しばらくしてからもう一度お試しください。'
    },
    outsideArea: {
      title: 'イベントエリアの外です',
      message: '現在地がイベントエリアの外です。店内でもう一度お試しください。'
    },
    banned: {
      title: '送信できません',
      message: 'このLINEアカウントは投稿資格が停止されているため、付箋を送信できません。ご不明な点は店内のスタッフにお問い合わせください。'
    },
    dailyLimit: {
      title: '今日の上限に達しました',
      message: (dailyLimit: number) => `1人1日${dailyLimit}枚まで送信できます。今日の分はすべて使いました。また明日どうぞ！`
    },
    cooldown: {
      title: '少々お待ちください',
      message: (wait: string) => `送信後は少し時間を空ける必要があります。${wait}後にもう一度お試しください。`
    },
    tokenMissing: {
      title: 'あと一歩です！',
      message: [
        'まだ大型スクリーンへの送信権限がありません。',
        'ご安心ください。作った付箋はスマートフォンに保存されています！',
        '店内でお買い物をして、お会計時にスタッフが提示するQRコードを読み取ると、自動で大型スクリーンに送信されます！'
      ]
    },
    textFlagged: {
      title: '内容チェックを通過できませんでした',
      message: '文字に不適切な内容が含まれています。みんなが気持ちよく楽しめるよう、修正してからもう一度お試しください！判定に誤りがあると思われる場合は、店頭スタッフにお声がけください。'
    },
    textSimplified: {
      title: '繁体字をお使いください',
      message: 'このイベントの付箋は繁体字中国語で書くことになっています。簡体字を含む内容は送信できないため、繁体字に変えてからもう一度お試しください。'
    },
    nameFlagged: {
      title: 'ネームタグを使えません',
      message: 'LINEの名前は付箋に表示できないため、ネームタグを外しました。ネームタグなしでよければ、もう一度送信してください。'
    },
    tokenExpired: {
      title: '時間切れです！',
      message: 'このQRコードは30分の有効期限が過ぎています！スタッフに新しいQRコードをお求めください。'
    },
    tokenUsed: {
      title: '使用済みです！',
      message: 'このQRコードはすでに使用されています！もう1枚送りたいときは、スタッフに新しいQRコードをお求めください。'
    },
    tokenInvalid: {
      title: '無効なコードです',
      message: 'このQRコードは無効か、存在しません。スタッフが提示した正しいコードを読み取ったか確認してください。'
    },
    sessionExpired: {
      title: 'もう一度ログインしてください',
      message: 'ログインの有効期限が切れました。LINEでもう一度ログインしてから送信してください。付箋はそのまま残っています。',
      confirm: '再ログイン'
    },
    quotaExceeded: {
      title: '送信回数の上限です',
      message: '現在送信できません。直前に1枚送信したか、今日の上限に達した可能性があります。しばらくしてからもう一度お試しください。'
    },
    tokenRequired: {
      title: '送信できません',
      message: '現在、送信にはスタッフが提示するQRコードが必要です。スタッフにお求めのうえ、もう一度お試しください。'
    },
    createDenied: {
      title: '送信できません',
      message: 'システムが一時的にこの付箋を受け付けられません。しばらくしてからもう一度お試しください。何度も失敗する場合は、店内のスタッフにお問い合わせください。付箋はそのまま残っています。'
    },
    tokenRevoked: {
      title: 'アップロード権限が無効です',
      message: 'QRコードの有効期限（30分）が切れたか、すでに使用された可能性があります。スタッフに新しいQRコードをお求めください！'
    },
    submitFailed: '送信に失敗しました。しばらくしてからもう一度お試しください。何度も失敗する場合は、店頭スタッフにお声がけください。付箋は保存されています。',
    exportFailed: '画像を作成できませんでした。しばらくしてからもう一度お試しください',
    drawToolFailed: '手描きツールを読み込めませんでした。ページを再読み込みしてから、もう一度お試しください。',
    loginCancelled: {
      title: 'ログインが完了していません',
      message: '付箋を送信するにはLINEでのログインが必要です。作った内容はそのまま残っているので、ログインすれば送信できます。'
    },
    loginFailed: {
      title: 'ログインに失敗しました',
      message: 'ログイン中に問題が発生しました。もう一度お試しください。',
      incomplete: 'ログインが完了しませんでした。もう一度お試しください。',
      reasons: {
        unconfigured: 'ログイン機能の設定が完了していません。スタッフにお問い合わせください。',
        state_expired: 'ログインがタイムアウトしました。もう一度お試しください。',
        state_invalid: 'ログインできませんでした。もう一度ログインしてください。',
        token_exchange_failed: 'LINEとの接続に失敗しました。しばらくしてからもう一度お試しください。',
        id_token_invalid: 'LINEアカウントを確認できませんでした。もう一度お試しください。'
      }
    }
  },

  share: {
    title: 'WillMusicの付箋',
    text: 'いま作った付箋です！'
  },

  tutorial: {
    drag: {
      title: '移動',
      message: '文字やステッカーを選ぶと、好きな位置に動かせます。'
    },
    rotate: {
      title: '回転',
      message: '2本指で回して、角度を自由に調整できます。'
    },
    scale: {
      title: '拡大・縮小',
      message: '2本指でピンチして、大きさを自由に変えられます。'
    },
    demoText: '文字',
    skip: 'スキップ',
    start: 'はじめる'
  }
} satisfies Messages['editor']
