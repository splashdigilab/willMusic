/**
 * 送使用者去 LINE 授權頁。
 *
 * 呼叫端帶 `?r=<站內相對路徑>` 指定登入完成後要回到哪裡（預設 /editor）。
 */
import { randomUUID } from 'node:crypto'
import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import { withQuery } from 'ufo'
import {
  LINE_AUTHORIZE_URL,
  LINE_SCOPE,
  getLineLoginConfig,
  resolveRedirectUri,
  sanitizeReturnTo,
  savePendingState
} from '~~/server/utils/line-login'

export default defineEventHandler(async (event) => {
  const returnTo = sanitizeReturnTo(getQuery(event).r)

  let config
  try {
    config = getLineLoginConfig()
  } catch (error: any) {
    // 設定不全時不要停在 API 的錯誤頁 —— 那是一片使用者看不懂的 JSON。
    // 導回原頁讓前端顯示「登入服務暫時無法使用」。
    console.error('[LINE Login] 設定錯誤:', error?.message)
    return sendRedirect(
      event,
      withQuery(returnTo, { login: 'error', reason: 'unconfigured' }),
      302
    )
  }

  const state = randomUUID()
  const nonce = randomUUID()
  savePendingState(event, { state, nonce, returnTo })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.channelId,
    redirect_uri: resolveRedirectUri(event),
    state,
    nonce,
    scope: LINE_SCOPE
    // 不帶 disable_auto_login：在 LINE 內建瀏覽器裡自動登入是預設行為，
    // 使用者一鍵就過，這正是我們選擇「讓使用者留在 LINE 裡」的理由。
    // 外部瀏覽器不受影響，仍會走完整的授權畫面。
  })

  return sendRedirect(event, `${LINE_AUTHORIZE_URL}?${params.toString()}`, 302)
})
