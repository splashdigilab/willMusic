import type { Messages } from '../types'

export default {
  back: '뒤로',
  help: '도움말',
  startOver: '처음부터',

  intro: {
    agreeBefore: '',
    agreeBetween: ' 및 ',
    agreeAfter: '을 읽고 동의해요',
    loading: '불러오는 중...',
    loginEarly: '먼저 LINE으로 로그인하기 (보낼 때만 필요해서 나중에 해도 돼요)',
    termsRequired: '먼저 참여 규정을 읽고 동의해 주세요.'
  },

  alertTitle: '알림',

  draft: {
    title: '임시 저장본이 있어요',
    message: '완성하지 않은 임시 저장본이 있어요. 이어서 편집할까요, 새로 시작할까요?',
    use: '이어서 편집',
    discard: '새로 시작'
  },

  exit: {
    title: '나갈까요?',
    message: '지금까지의 내용은 임시 저장됐어요. 편집기에서 나갈까요?',
    confirm: '나가기',
    stay: '계속 편집'
  },

  clearAll: {
    title: '모두 지울까요?',
    message: '－ 이 작업은 되돌릴 수 없어요 －'
  },

  steps: {
    note: '포스트잇',
    text: '텍스트',
    draw: '그리기',
    sticker: '스티커'
  },
  stepDot: (n: number, name: string) => `${n}단계: ${name}`,
  stepTitles: {
    material: '색상 고르기',
    shape: '모양 고르기',
    text: '텍스트 색상 & 정렬',
    draw: '펜 색상 & 굵기',
    sticker: '스티커 고르기'
  },
  prev: '이전',
  next: '다음',
  submit: '보내기',

  textPlaceholder: '여기에 입력...',
  delete: '삭제',
  swatchHidden: '이 색은 지금 포스트잇 색상에서 보이지 않아요',
  align: {
    left: '왼쪽 정렬',
    center: '가운데 정렬',
    right: '오른쪽 정렬'
  },
  addText: '텍스트 추가',
  eraser: '지우개',
  undoStroke: '실행 취소',
  redoStroke: '다시 실행',

  nameTag: {
    added: '추가됨',
    add: '+ 이름표 붙이기',
    login: 'LINE으로 로그인하고 이름표 붙이기',
    toggle: '포스트잇에 이름표 붙이기',
    on: '프로필 사진과 이름 표시',
    off: '익명으로 게시',
    blocked: '사용 불가',
    blockedState: '이 이름은 이름표로 쓸 수 없어서 익명으로 게시돼요',
    adjust: '위치 조정',
    tourToggleTitle: '포스트잇에 이름표를 붙일까요?',
    tourToggleBody: '켜면 LINE 프로필 사진과 이름이 붙고, 끄면 익명이에요.',
    tourAdjustTitle: '이름표를 붙였어요',
    tourAdjustBody: (button: string) => `위 미리보기가 게시될 모습이에요. 위치를 바꾸려면 \'${button}\' 버튼을 눌러 주세요.`,
    tourDismiss: '아무 곳이나 눌러 닫기'
  },

  submitModal: {
    title: '보내기 전 확인',
    titleSignedIn: '로그인했어요',
    message: '포스트잇 모습을 확인해 주세요. 보낸 후에는 수정할 수 없어요.',
    confirm: '대형 스크린에 보내기',
    confirmWithLogin: 'LINE으로 로그인하고 보내기',
    processing: '처리 중...',
    share: '포스트잇 공유',
    lineAccount: 'LINE 계정',
    logout: '로그아웃',
    quotaBanned: '이 계정은 더 이상 보낼 수 없어요',
    quotaExhausted: (dailyLimit: number) => `오늘 ${dailyLimit}장을 모두 보냈어요`,
    quotaCooldown: (wait: string) => `${wait} 후에 보낼 수 있어요`,
    quotaNth: (nth: number, dailyLimit: number) => `오늘 ${dailyLimit}장 중 ${nth}번째`,
    marketing: 'WillMusic 이벤트·혜택 소식 받기',
    marketingEmail: (email: string) => `받는 주소: ${email}`
  },

  duration: {
    seconds: (seconds: number) => `${seconds}초`,
    minutes: (minutes: number) => `${minutes}분`,
    minutesSeconds: (minutes: number, seconds: number) => `${minutes}분 ${seconds}초`
  },

  alerts: {
    stickerLimit: {
      title: '스티커를 더 붙일 수 없어요',
      message: (max: number) => `포스트잇 한 장에 스티커는 최대 ${max}개까지 붙일 수 있어요. 더 붙이려면 몇 개를 먼저 지워 주세요.`
    },
    empty: {
      title: '아직 비어 있어요',
      message: '포스트잇에 아직 아무것도 없어요. 글을 쓰거나 그림을 그리거나 스티커를 붙여 보세요.'
    },
    locationDenied: {
      title: '위치 권한이 필요해요',
      message: [
        '대형 스크린에 보내려면 위치 권한이 필요해요.',
        '',
        'iPhone(Safari): \'설정 > Safari > 위치\'에서 \'허용\'으로 바꿔 주세요.',
        'Android(Chrome): 주소창 왼쪽의 자물쇠 아이콘(사이트 설정) > \'위치\'에서 \'허용\'으로 바꿔 주세요.',
        '',
        '설정한 뒤 이 페이지로 돌아와 \'위치 다시 확인\'을 눌러 주세요.'
      ],
      retry: '위치 다시 확인'
    },
    locationUnavailable: {
      title: '위치를 확인하지 못했어요',
      message: '현재 위치를 가져올 수 없어요. 위치 서비스가 켜져 있는지 확인하고 잠시 후 다시 시도해 주세요.'
    },
    locationServiceDown: {
      title: '위치를 확인하지 못했어요',
      message: '지금은 위치를 확인할 수 없어요(네트워크 또는 서비스 일시 오류). 잠시 후 다시 시도해 주세요.'
    },
    locationFailed: {
      title: '위치를 확인하지 못했어요',
      message: '위치 확인에 실패했어요. 잠시 후 다시 시도해 주세요.'
    },
    outsideArea: {
      title: '이벤트 구역 밖이에요',
      message: '지금 계신 곳은 이벤트 구역 밖이에요. 매장 안에서 다시 시도해 주세요.'
    },
    banned: {
      title: '보낼 수 없어요',
      message: '이 LINE 계정은 투고 자격이 정지되어 포스트잇을 보낼 수 없어요. 궁금한 점은 매장 직원에게 문의해 주세요.'
    },
    dailyLimit: {
      title: '오늘 한도를 다 썼어요',
      message: (dailyLimit: number) => `한 사람당 하루 최대 ${dailyLimit}장까지 보낼 수 있는데, 오늘 몫은 모두 보냈어요. 내일 다시 와 주세요!`
    },
    cooldown: {
      title: '잠시만 기다려 주세요',
      message: (wait: string) => `보낸 후에는 잠시 기다려야 해요. ${wait} 후에 다시 시도해 주세요.`
    },
    tokenMissing: {
      title: '한 단계만 남았어요!',
      message: [
        '아직 대형 스크린에 보낼 권한이 없어요.',
        '걱정 마세요. 방금 만든 포스트잇은 휴대폰에 저장돼 있어요!',
        '매장에서 구매하고 계산할 때 직원이 보여 주는 QR 코드를 스캔하면 자동으로 대형 스크린에 보내져요!'
      ]
    },
    textFlagged: {
      title: '내용 검사를 통과하지 못했어요',
      message: '텍스트에 부적절한 내용이 있어요. 모두가 즐길 수 있도록 수정한 뒤 다시 시도해 주세요! 판단이 잘못됐다고 생각되면 매장 직원에게 문의해 주세요.'
    },
    nameFlagged: {
      title: '이름표를 쓸 수 없어요',
      message: 'LINE 이름을 포스트잇에 표시할 수 없어서 이름표를 뺐어요. 이름표 없이 보내려면 한 번 더 보내기를 눌러 주세요.'
    },
    tokenExpired: {
      title: '시간이 지났어요!',
      message: '이 QR 코드는 30분 유효 시간이 지났어요! 직원에게 새 QR 코드를 요청해 주세요.'
    },
    tokenUsed: {
      title: '이미 사용했어요!',
      message: '이 QR 코드는 이미 사용됐어요! 한 장 더 보내려면 직원에게 새 QR 코드를 요청해 주세요.'
    },
    tokenInvalid: {
      title: '유효하지 않은 코드예요',
      message: '이 QR 코드는 유효하지 않거나 존재하지 않아요. 직원이 준 올바른 코드를 스캔했는지 확인해 주세요.'
    },
    sessionExpired: {
      title: '다시 로그인해 주세요',
      message: '로그인이 만료됐어요. LINE으로 다시 로그인한 뒤 보내 주세요. 포스트잇은 그대로 남아 있어요.',
      confirm: '다시 로그인'
    },
    quotaExceeded: {
      title: '보내기 횟수를 넘었어요',
      message: '지금은 보낼 수 없어요. 방금 한 장을 보냈거나 오늘 한도를 다 썼을 수 있어요. 잠시 후 다시 시도해 주세요.'
    },
    tokenRequired: {
      title: '보낼 수 없어요',
      message: '지금은 보내려면 직원이 주는 QR 코드가 필요해요. 직원에게 받은 뒤 다시 시도해 주세요.'
    },
    createDenied: {
      title: '보낼 수 없어요',
      message: '시스템이 잠시 이 포스트잇을 받을 수 없어요. 잠시 후 다시 시도해 주세요. 계속 실패하면 매장 직원에게 문의해 주세요. 포스트잇은 그대로 남아 있어요.'
    },
    tokenRevoked: {
      title: '업로드 권한이 만료됐어요',
      message: 'QR 코드가 만료됐거나(제한 시간 30분) 이미 사용됐을 수 있어요. 직원에게 새 QR 코드를 요청해 주세요!'
    },
    submitFailed: '보내지 못했어요. 잠시 후 다시 시도해 주세요. 계속 실패하면 매장 직원에게 문의해 주세요. 포스트잇은 저장되어 있어요.',
    exportFailed: '이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요',
    loginCancelled: {
      title: '로그인이 끝나지 않았어요',
      message: '포스트잇을 보내려면 LINE으로 로그인해야 해요. 만든 내용은 그대로 있으니 로그인하면 바로 보낼 수 있어요.'
    },
    loginFailed: {
      title: '로그인하지 못했어요',
      message: '로그인 중에 문제가 생겼어요. 다시 시도해 주세요.',
      incomplete: '로그인이 완료되지 않았어요. 다시 시도해 주세요.',
      reasons: {
        unconfigured: '로그인 서비스가 아직 설정되지 않았어요. 직원에게 문의해 주세요.',
        state_expired: '로그인 시간이 초과됐어요. 다시 시도해 주세요.',
        state_invalid: '이번 로그인은 실패했어요. 다시 로그인해 주세요.',
        token_exchange_failed: 'LINE 연결에 실패했어요. 잠시 후 다시 시도해 주세요.',
        id_token_invalid: 'LINE 계정을 확인할 수 없어요. 다시 시도해 주세요.'
      }
    }
  },

  share: {
    title: 'WillMusic 포스트잇',
    text: '방금 만든 포스트잇이에요!'
  },

  tutorial: {
    drag: {
      title: '한 손가락으로 이동',
      message: '텍스트나 스티커를 선택하면 원하는 곳으로 옮길 수 있어요.'
    },
    rotate: {
      title: '두 손가락으로 회전',
      message: '두 손가락으로 돌려서 각도를 바꿀 수 있어요.'
    },
    scale: {
      title: '확대·축소',
      message: '두 손가락을 오므리거나 벌려서 크기를 바꿀 수 있어요.'
    },
    demoText: '텍스트',
    skip: '건너뛰기',
    start: '시작하기'
  }
} satisfies Messages['editor']
