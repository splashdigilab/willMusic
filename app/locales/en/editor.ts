import type { Messages } from '../types'

const notes = (n: number) => (n === 1 ? '1 note' : `${n} notes`)

export default {
  back: 'Back',
  help: 'Help',
  startOver: 'Start over',

  intro: {
    agreeBefore: 'I have read and agree to the ',
    agreeBetween: ' and the ',
    agreeAfter: '',
    loading: 'Loading...',
    loginEarly: 'Log in with LINE now (only needed to submit, so it can wait)',
    termsRequired: 'Please read and agree to the Event Rules first.'
  },

  alertTitle: 'Notice',

  draft: {
    title: 'Draft found',
    message: 'You have an unfinished draft. Keep editing it or start fresh?',
    use: 'Use draft',
    discard: 'Start fresh'
  },

  exit: {
    title: 'Leave the editor?',
    message: 'Your progress has been saved as a draft. Are you sure you want to leave?',
    confirm: 'Leave',
    stay: 'Stay'
  },

  clearAll: {
    title: 'Clear everything?',
    message: '－ This can\'t be undone －'
  },

  steps: {
    note: 'Note',
    text: 'Text',
    draw: 'Draw',
    sticker: 'Stickers'
  },
  stepDot: (n: number, name: string) => `Step ${n}: ${name}`,
  stepTitles: {
    material: 'Pick a color',
    shape: 'Pick a shape',
    text: 'Text color & align',
    draw: 'Brush color & size',
    sticker: 'Pick stickers'
  },
  prev: 'Back',
  next: 'Next',
  submit: 'Submit',

  textPlaceholder: 'Type here...',
  delete: 'Delete',
  swatchHidden: 'This color won\'t show up on this note',
  align: {
    left: 'Align left',
    center: 'Center',
    right: 'Align right'
  },
  addText: 'Add text',
  eraser: 'Eraser',
  undoStroke: 'Undo',
  redoStroke: 'Redo',

  nameTag: {
    added: 'Added',
    add: '+ Add name tag',
    login: 'Log in with LINE to add a name tag',
    toggle: 'Add a name tag',
    on: 'Shows your photo and name',
    off: 'Posted anonymously',
    blocked: 'Not available',
    blockedState: 'This name can\'t be used as a name tag, so your note will be anonymous',
    adjust: 'Adjust',
    tourToggleTitle: 'Add a name tag to your note?',
    tourToggleBody: 'Turn it on to add your LINE photo and name. Leave it off to stay anonymous.',
    tourAdjustTitle: 'Name tag added',
    tourAdjustBody: (button: string) => `The preview above is how it will look on the big screen. To move it, tap \"${button}\".`,
    tourDismiss: 'Tap anywhere to close'
  },

  submitModal: {
    title: 'Ready to send?',
    titleSignedIn: 'You\'re logged in',
    message: 'Check how your note looks. You can\'t edit it after sending.',
    confirm: 'Send to the big screen',
    confirmWithLogin: 'Log in with LINE & send',
    processing: 'Processing...',
    share: 'Share note',
    lineAccount: 'LINE account',
    logout: 'Log out',
    quotaBanned: 'This account can no longer submit notes',
    quotaExhausted: (dailyLimit: number) =>
      dailyLimit === 1 ? 'You\'ve sent your 1 note for today' : `You\'ve sent all ${dailyLimit} notes for today`,
    quotaCooldown: (wait: string) => `You can send in ${wait}`,
    quotaNth: (nth: number, dailyLimit: number) => `Note ${nth} of ${dailyLimit} today`,
    marketing: 'Send me WillMusic event news and offers',
    marketingEmail: (email: string) => `To ${email}`
  },

  duration: {
    seconds: (seconds: number) => (seconds === 1 ? '1 second' : `${seconds} seconds`),
    minutes: (minutes: number) => (minutes === 1 ? '1 minute' : `${minutes} minutes`),
    minutesSeconds: (minutes: number, seconds: number) => `${minutes} min ${seconds} sec`
  },

  alerts: {
    stickerLimit: {
      title: 'Sticker limit reached',
      message: (max: number) => `You can add up to ${max} stickers per note. To add more, remove some first.`
    },
    empty: {
      title: 'Still blank',
      message: 'There\'s nothing on your note yet. Write something, draw, or add a sticker.'
    },
    locationDenied: {
      title: 'Location access needed',
      message: [
        'Location access is needed to send to the big screen.',
        '',
        'iPhone (Safari): go to Settings > Safari > Location and choose \"Allow\".',
        'Android (Chrome): tap the lock icon (site settings) left of the address bar > Location, and choose \"Allow\".',
        '',
        'Then come back to this page and tap \"Ask again\".'
      ],
      retry: 'Ask again'
    },
    locationUnavailable: {
      title: 'Couldn\'t get location',
      message: 'Couldn\'t get your current location. Make sure location services are on and try again later.'
    },
    locationServiceDown: {
      title: 'Couldn\'t get location',
      message: 'We can\'t verify your location right now (network or service issue). Please try again later.'
    },
    locationFailed: {
      title: 'Couldn\'t get location',
      message: 'Location check failed. Please try again later.'
    },
    outsideArea: {
      title: 'Outside the event area',
      message: 'You\'re not in the event area. Please try again from inside the store.'
    },
    banned: {
      title: 'Can\'t submit',
      message: 'This LINE account can no longer submit notes. If you have any questions, please ask our staff.'
    },
    dailyLimit: {
      title: 'Today\'s limit reached',
      message: (dailyLimit: number) =>
        `Each person can submit up to ${notes(dailyLimit)} a day, and you\'ve used today\'s. Come back tomorrow!`
    },
    cooldown: {
      title: 'Please wait',
      message: (wait: string) => `You need to wait a little between notes. Please try again in ${wait}.`
    },
    tokenMissing: {
      title: 'Just one more step!',
      message: [
        'You don\'t have permission to send to the big screen yet.',
        'Don\'t worry, your note is saved on your phone!',
        'Make a purchase in store and scan the QR code our staff gives you at checkout. Your note will be sent to the big screen automatically!'
      ]
    },
    textFlagged: {
      title: 'Content check failed',
      message: 'Your text contains inappropriate content. To keep this a friendly space, please edit it and try again! If you think this is a mistake, please talk to our staff.'
    },
    nameFlagged: {
      title: 'Name tag unavailable',
      message: 'Your LINE name can\'t be shown on notes, so we removed the name tag. To send without it, just tap Submit again.'
    },
    tokenExpired: {
      title: 'Time\'s up!',
      message: 'This QR code is past its 30-minute limit! Please ask our staff for a new one.'
    },
    tokenUsed: {
      title: 'Already used!',
      message: 'This QR code has already been used! To send another note, please ask our staff for a new one.'
    },
    tokenInvalid: {
      title: 'Invalid code',
      message: 'This QR code is invalid or doesn\'t exist. Please make sure you scanned the one our staff gave you.'
    },
    sessionExpired: {
      title: 'Please log in again',
      message: 'Your login has expired. Log in with LINE again to submit. Your note has been kept for you.',
      confirm: 'Log in again'
    },
    quotaExceeded: {
      title: 'Submission limit reached',
      message: 'You can\'t submit right now. You may have just sent one, or used up today\'s limit. Please try again later.'
    },
    tokenRequired: {
      title: 'Can\'t submit',
      message: 'Submitting currently requires a QR code from our staff. Please ask them for one and try again.'
    },
    createDenied: {
      title: 'Can\'t submit',
      message: 'The system can\'t accept this note right now. Please try again later. If it keeps failing, please ask our staff. Your note has been kept for you.'
    },
    tokenRevoked: {
      title: 'Upload permission expired',
      message: 'Your QR code may have expired (30-minute limit) or already been used. Please ask our staff for a new one!'
    },
    submitFailed: 'Couldn\'t send your note. Please try again later. If it keeps failing, please talk to our staff. Your note has been saved.',
    exportFailed: 'Couldn\'t create the image. Please try again later.',
    loginCancelled: {
      title: 'Login not finished',
      message: 'You need to log in with LINE to submit. Everything you made is still here, so you can submit once you log in.'
    },
    loginFailed: {
      title: 'Login failed',
      message: 'Something went wrong while logging in. Please try again.',
      incomplete: 'Login didn\'t complete. Please try again.',
      reasons: {
        unconfigured: 'Login isn\'t set up yet. Please ask our staff.',
        state_expired: 'Login timed out. Please try again.',
        state_invalid: 'That login didn\'t work. Please tap log in again.',
        token_exchange_failed: 'Couldn\'t connect to LINE. Please try again later.',
        id_token_invalid: 'Couldn\'t verify your LINE account. Please try again.'
      }
    }
  },

  share: {
    title: 'WillMusic note',
    text: 'Here\'s the note I just made!'
  },

  tutorial: {
    drag: {
      title: 'Move',
      message: 'Select text or a sticker and move it anywhere.'
    },
    rotate: {
      title: 'Rotate',
      message: 'Twist with two fingers to change the angle.'
    },
    scale: {
      title: 'Resize',
      message: 'Pinch in or out with two fingers to resize.'
    },
    demoText: 'Text',
    skip: 'Skip',
    start: 'Get started'
  }
} satisfies Messages['editor']
