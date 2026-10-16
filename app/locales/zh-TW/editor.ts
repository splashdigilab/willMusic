/**
 * 編輯器（pages/editor.vue）、它的操作教學（EditorTutorialModal）與分享圖（useNoteExport）。
 *
 * 提示框（AppModal）的內文是用 v-html 顯示的，這裡不要寫 HTML：
 * 要換行的寫成字串陣列，一個元素一行、空字串是空一行，editor.vue 跳脫之後才接成 <br>。
 *
 * 「STEP 1.」、上一步／下一步兩旁的「＼ ／」各語言都一樣，是版面的一部分，寫在 editor.vue，
 * 這裡只放中間會換語言的字。
 */
export default {
  /** 左上角兩顆圓鈕的無障礙名稱 */
  back: '返回',
  help: '說明',
  /** 右上角的藥丸鈕 */
  startOver: '全部重來',

  /** 活動規範頁（開場卡片）。規範本文與兩個連結的字在 legal */
  intro: {
    /**
     * 「我已閱讀並同意〔活動規範〕與〔隱私權政策〕」。兩個連結夾在句子中間，拆成三段，
     * 讓各語言自己決定連結前後接什麼。連結沒有左右邊距，需要空白的語言自己補在字串裡。
     */
    agreeBefore: '我已閱讀並同意',
    agreeBetween: '與',
    agreeAfter: '',
    /**
     * START 鈕載入中。跟 common.loading 的「載入中…」不是同一個字，不能共用。
     * 藥丸寬度固定、前面還有轉圈圈，其他語言要跟 home.loading 一樣短，否則會撐出藥丸
     */
    loading: '載入中...',
    loginEarly: '先用 LINE 登入（送出時才需要，也可以稍後再登）',
    /** 沒勾同意就按 START */
    termsRequired: '請先閱讀並同意活動規範'
  },

  /** 提示框沒指定標題時用的 */
  alertTitle: '提示',

  /** 進編輯器時發現上次的草稿 */
  draft: {
    title: '發現草稿',
    message: '您有一份未完成的草稿，要繼續編輯還是重新開始？',
    use: '使用草稿',
    discard: '重新開始'
  },

  /** 有內容時按左上角返回 */
  exit: {
    title: '確定離開？',
    message: '目前的進度已經為您自動儲存為草稿。確定要離開編輯器嗎？',
    confirm: '確定離開',
    stay: '留在本頁'
  },

  /** 「全部重來」的確認 */
  clearAll: {
    title: '確認清除嗎？',
    message: '－ 此動作將無法復原 －'
  },

  /** 四個畫面的名稱，key 是 data/editor-config.ts 的 EDITOR_STEPS 的 id */
  steps: {
    note: '便利貼',
    text: '文字',
    draw: '繪圖',
    sticker: '貼紙'
  },
  /** 面板右上角步驟點的無障礙名稱。name 是上面 steps 的字 */
  stepDot: (n: number, name: string) => `第 ${n} 步：${name}`,
  /** 各 STEP 的標題，前面的「STEP 1.」寫在 editor.vue。標題右邊讓給步驟點，寬度有限，越短越好 */
  stepTitles: {
    material: '挑選材質',
    shape: '挑選造型',
    text: '挑選文字顏色 & 對齊',
    draw: '挑選筆刷顏色 & 寬度',
    sticker: '挑選貼圖'
  },
  /** 底部按鈕列。教學的上一步／下一步也用這兩個 */
  prev: '上一步',
  next: '下一步',
  submit: '送出',

  /** 文字框沒字時的提示，也拿來撐開編輯框的寬度 */
  textPlaceholder: '在這裡輸入文字...',
  /** 編輯框右上角刪除鈕的無障礙名稱 */
  delete: '刪除',
  /** 在目前材質上看不到、被停用的色票（滑鼠移上去的 title） */
  swatchHidden: '這個顏色在目前的材質上看不到',
  /** 對齊鈕的無障礙名稱，key 是 TEXT_ALIGN_OPTIONS 的 value */
  align: {
    left: '置左',
    center: '置中',
    right: '置右'
  },
  addText: '新增文字',
  eraser: '橡皮擦',
  undoStroke: '復原一筆',
  redoStroke: '重做一筆',
  /** STEP 4 的開關：手繪整層蓋在貼紙上面。只在有貼紙時出現，自己佔一整列 */
  drawAboveStickers: '畫在貼紙上面',

  /** 署名（把 LINE 頭貼與暱稱當成一張貼紙）：STEP 5 那一列與確認畫面的開關 */
  nameTag: {
    /** STEP 5 已登入：已經貼上／還沒貼。左邊是頭貼與暱稱，暱稱會被這段擠成刪節號 */
    added: '已署名',
    add: '＋ 貼上署名',
    /** STEP 5 沒登入：整列就是登入鈕，不換行，太長會超出面板 */
    login: '用 LINE 登入，貼上頭貼與名字署名',
    /** 確認畫面的開關與底下那行灰字（開關只有顏色，灰字講現在是哪一種） */
    toggle: '在便利貼上署名',
    on: '顯示頭貼與名字',
    off: '匿名上牆',
    /**
     * 暱稱冒充店家、不能署名（server/utils/reserved-names.ts）。blocked 放在 STEP 5 那一列，
     * 跟 add 一樣短；blockedState 是確認畫面開關底下的灰字。
     * 不講是哪些字被擋：講了等於教人怎麼繞過，真的被誤擋的人可以照常匿名送出
     */
    blocked: '不能署名',
    blockedState: '這個暱稱不能用來署名，會匿名上牆',
    /** 回 STEP 5 調整名牌位置 */
    adjust: '調整位置',
    /** 在確認畫面才登入的人，回來時框出這張卡的導覽泡泡（見 editor.vue 的 signatureTour） */
    tourToggleTitle: '要在便利貼上署名嗎？',
    tourToggleBody: '打開開關會貼上你的 LINE 頭貼與名字，不開就是匿名。',
    tourAdjustTitle: '署名已經貼上',
    /** button 是上面的 adjust，兩處一定是同一個字 */
    tourAdjustBody: (button: string) => `上面的預覽就是上牆的樣子，想換位置就按「${button}」。`,
    tourDismiss: '點任意處關閉'
  },

  /** 送出確認畫面 */
  submitModal: {
    title: '確認上傳',
    /** 剛從 LINE 登入回來、自動開回來的那一次 */
    titleSignedIn: '登入成功',
    message: '請確認您的便利貼樣貌，上傳後將無法修改。',
    confirm: '上傳大螢幕',
    /** 沒登入：按下去會整頁導去 LINE，字要先講清楚，不能讓人以為按了就送出 */
    confirmWithLogin: 'LINE 登入並上傳大螢幕',
    /** 上傳鈕送出中、分享鈕產生圖片中 */
    processing: '處理中...',
    share: '分享便利貼',
    /** 暱稱讀不到時頂替的名字 */
    lineAccount: 'LINE 帳號',
    logout: '登出',
    /** 身分列的第二行：用這個帳號送的話，今天的額度狀態 */
    quotaBanned: '這個帳號已停止投稿資格',
    quotaExhausted: (dailyLimit: number) => `今天的 ${dailyLimit} 張已經送完了`,
    /** wait 是倒數的 m:ss（例如 4:05），各語言通用 */
    quotaCooldown: (wait: string) => `${wait} 後才能送出`,
    quotaNth: (nth: number, dailyLimit: number) => `今天第 ${nth} 張，共 ${dailyLimit} 張`,
    /** 收行銷信的勾選（LINE 有給 email 才出現） */
    marketing: '我願意收到微樂客的活動與優惠資訊'
  },

  /** 冷卻還要等多久，接在 alerts.cooldown 的句子裡 */
  duration: {
    seconds: (seconds: number) => `${seconds} 秒`,
    minutes: (minutes: number) => `${minutes} 分鐘`,
    minutesSeconds: (minutes: number, seconds: number) => `${minutes} 分 ${seconds} 秒`
  },

  /**
   * 提示框。一個提示一組 title／message，標題重複也各寫各的，呼叫端才能整組拿。
   * message 是陣列的，一個元素一行（空字串是空一行）。
   */
  alerts: {
    stickerLimit: {
      title: '貼紙數量達上限',
      message: (max: number) => `每張便利貼最多只能貼 ${max} 個貼紙喔！如果需要更多空間，可以先刪除一些。`
    },
    /** 什麼都沒有就按送出 */
    empty: {
      title: '還是空白的',
      message: '便利貼上還沒有任何內容，寫點字、畫張圖或貼個貼紙都可以。'
    },
    /** 後台開著地理柵欄、使用者拒絕定位。內文提到的按鈕就是 retry，兩處要同一個字 */
    locationDenied: {
      title: '需要定位權限',
      message: [
        '需要開啟定位權限才能上傳大螢幕。',
        '',
        'iPhone（Safari）：到「設定 > Safari > 定位」改為「允許」。',
        'Android（Chrome）：到「瀏覽器網址列左側鎖頭/網站設定 > 位置」改為「允許」。',
        '',
        '完成後回到此頁，點擊「重新詢問定位」再試一次。'
      ],
      retry: '重新詢問定位'
    },
    /** 定位逾時、裝置沒有定位功能 */
    locationUnavailable: {
      title: '定位失敗',
      message: '無法取得目前位置，請確認定位服務已開啟並稍後再試。'
    },
    /** 讀不到後台的地理柵欄設定 */
    locationServiceDown: {
      title: '定位失敗',
      message: '目前無法驗證定位（網路或服務暫時異常），請稍後再試。'
    },
    locationFailed: {
      title: '定位失敗',
      message: '定位驗證失敗，請稍後再試。'
    },
    /** 不寫「合法區域」：讀起來像在說使用者違法 */
    outsideArea: {
      title: '不在活動範圍內',
      message: '您目前不在活動範圍內，請到店內後再試一次。'
    },
    /** 被停權的人按送出。不寫原因：原因是後台的備註，不對外 */
    banned: {
      title: '無法送出',
      message: '這個 LINE 帳號已被停止投稿資格，無法再送出便利貼。如有疑問，請洽現場工作人員。'
    },
    dailyLimit: {
      title: '今天的額度用完了',
      message: (dailyLimit: number) => `每人每天最多只能送出 ${dailyLimit} 張便利貼，今天的份額已經用完了。明天再來吧！`
    },
    cooldown: {
      title: '請稍候',
      /** wait 是上面 duration 組出來的字 */
      message: (wait: string) => `每次送出後需要間隔一段時間。請於 ${wait} 後再試。`
    },
    /** 後台開著 Token 驗證，身上卻沒有店員給的 QR Code */
    tokenMissing: {
      title: '只差最後一步！',
      message: [
        '目前您還沒有取得大螢幕的上傳權限。',
        '請放心，剛剛的作品已經保存在您的手機裡了！',
        '只要在店內消費，結帳時掃描店員提供的 QR Code，系統就會自動幫您一鍵發送上牆喔！'
      ]
    },
    /**
     * 內文沒通過審核。審核是 AI 判斷，會誤判，給一條申訴的路：
     * 不然被誤擋的人只能自己猜哪裡不妥，抱怨會直接出現在社群上
     */
    textFlagged: {
      title: '內容安全檢查未通過',
      message: '您的文字包含不妥適的內容，為維護良好環境，請修改後再試一次！如果認為判斷有誤，請洽現場工作人員。'
    },
    /**
     * 只因為簡體字被擋（審核回 SIMP）。講規則、不講對錯：
     * 跟 textFlagged 一樣說「不妥適」的話，截圖出去就成了「簡體字＝不妥適」
     */
    textSimplified: {
      title: '請使用繁體字',
      message: '本活動的便利貼以繁體中文書寫，含簡體字的內容無法送出，請改用繁體字後再試一次。'
    },
    /** LINE 暱稱沒通過審核：署名已經被拿掉，再送一次就是匿名 */
    nameFlagged: {
      title: '署名無法使用',
      message: '你的 LINE 名稱無法顯示在便利貼上，署名已經先幫你拿掉了。不署名的話，再按一次送出就可以了。'
    },
    tokenExpired: {
      title: '時間到了！',
      message: '這個 QR Code 已經超過 30 分鐘的有效期限囉！請向店員重新索取新的 QR Code。'
    },
    tokenUsed: {
      title: '已經用過囉！',
      message: '這個 QR Code 已經被使用過囉！如果還想再傳一張，請向店員重新索取新的 QR Code。'
    },
    tokenInvalid: {
      title: '無效代碼',
      message: '這個 QR Code 無效或不存在，請確認您掃描的是由店員提供的正確條碼。'
    },
    /** 送出途中登入失效。confirm 是重新登入的按鈕 */
    sessionExpired: {
      title: '需要重新登入',
      message: '登入狀態已失效，請重新用 LINE 登入後再送出。你的便利貼已經幫你留著了。',
      confirm: '重新登入'
    },
    /** 送出前的檢查放行了，規則卻說額度不夠。原因猜不準，講法保持籠統 */
    quotaExceeded: {
      title: '送出次數已達上限',
      message: '目前無法送出，可能是剛剛已經送過一張、或是今天的額度用完了。請稍後再試。'
    },
    /** 規則拒絕、而且後台開著 Token 驗證 */
    tokenRequired: {
      title: '無法送出',
      message: '目前送出需要店員提供的 QR Code，請向店員索取後再試一次。'
    },
    /** 規則拒絕、原因不明 */
    createDenied: {
      title: '無法送出',
      message: '系統暫時無法接受這張便利貼，請稍後再試一次。一直失敗的話，請洽現場工作人員。你的便利貼已經幫你留著了。'
    },
    tokenRevoked: {
      title: '上傳授權失效',
      message: '您的專屬 QR Code 可能已失效 (超過限時 30 分鐘) 或已經被使用過。請向店員重新索取新的 QR Code！'
    },
    /**
     * 其他沒預料到的錯誤，標題用 alertTitle。
     * 錯誤本身只記在 console，不顯示：那是系統內部的訊息（資料庫規則、服務名稱），
     * 使用者看不懂，給外人看到反而是在介紹系統怎麼運作
     */
    submitFailed: '送出失敗，請稍後再試。一直失敗的話，請洽現場工作人員。你的便利貼已經幫你留著了。',
    /** 分享圖產生失敗（useNoteExport），標題用 alertTitle */
    exportFailed: '圖片生成失敗，請稍後再試',
    /** 繪圖工具（Fabric.js，動態載入）載不進來，多半是網路不穩。標題用 alertTitle */
    drawToolFailed: '繪圖工具載入失敗，請重新整理頁面後再試一次。',
    /** 從確認畫面去 LINE 登入、在 LINE 那邊取消了 */
    loginCancelled: {
      title: '還沒完成登入',
      message: '送出便利貼需要用 LINE 登入。你做的內容都還在，登入後就能送出。'
    },
    loginFailed: {
      title: '登入失敗',
      /** 原因不在 reasons 裡的 */
      message: '登入時發生問題，請再試一次。',
      /** LINE 那邊說成功，這邊卻沒拿到登入狀態 */
      incomplete: '登入沒有完成，請再試一次。',
      /** 網址上的 reason（server/api/auth/line 帶回來的）對應的說法 */
      reasons: {
        unconfigured: '登入服務尚未設定完成，請聯絡店員。',
        state_expired: '登入逾時了，請再試一次。',
        state_invalid: '這次登入沒有成功，請再按一次登入。',
        token_exchange_failed: '與 LINE 連線失敗，請稍後再試。',
        id_token_invalid: '無法驗證你的 LINE 身分，請再試一次。'
      }
    }
  },

  /** 交給系統分享面板的標題與文字（useNoteExport） */
  share: {
    title: 'WillMusic 便利貼',
    text: '這是我剛畫好的便利貼！'
  },

  /**
   * 操作教學（EditorTutorialModal）。三頁的 key 對應元件裡的示意圖。
   * 標題兩邊有「＼ ／」，360px 寬的手機上一行只放得下約 6 個全形字或 10 個英文字母，
   * 再長就會折行、把「／」單獨擠到下一行 —— 翻譯寧可短（英日韓都用一個詞：移動、旋轉、縮放），
   * 動作的說明交給 message
   */
  tutorial: {
    drag: {
      title: '單指拖移',
      message: '選取文字或貼紙，即可隨心移動位置。'
    },
    rotate: {
      title: '雙指旋轉',
      message: '雙指旋轉物件，輕鬆調整呈現角度。'
    },
    scale: {
      title: '雙指縮放',
      message: '雙指捏合或張開，自由放大縮小物件。'
    },
    /** 示意動畫裡那個被選取的文字框上的字 */
    demoText: '文字',
    skip: '略過',
    start: '開始體驗'
  }
}
