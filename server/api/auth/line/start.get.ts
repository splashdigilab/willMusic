/**
 * 送使用者去 LINE 授權頁。
 *
 * 呼叫端帶 `?r=<站內相對路徑>` 指定登入完成後要回到哪裡（預設 /editor）。
 */
import { defineEventHandler, getCookie, getHeader, getQuery, sendRedirect } from 'h3'
import { withQuery } from 'ufo'
import {
  LINE_UI_LOCALE,
  LOCALE_COOKIE,
  detectLocale,
  parseAcceptLanguage,
  parseLocale
} from '~~/app/utils/i18n'
import {
  LINE_AUTHORIZE_URL,
  LINE_BOT_PROMPT,
  LINE_SCOPE,
  createLoginState,
  getLineLoginConfig,
  resolveRedirectUri,
  sanitizeReturnTo
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

  // 回程頁面與到期時間都封在 state 裡，不存 cookie —— 原因見 line-login.ts 的 createLoginState
  const { state, nonce } = createLoginState(config.channelSecret, returnTo)

  // LINE 授權頁跟網站用同一個語言，判斷方式與 plugins/i18n.ts 相同（選過的語言 → 瀏覽器語言）。
  // 在 LINE 內建瀏覽器裡多半自動登入、看不到授權頁，這主要是給外部瀏覽器第一次登入的人
  const locale = parseLocale(getCookie(event, LOCALE_COOKIE))
    ?? detectLocale(parseAcceptLanguage(getHeader(event, 'accept-language')))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.channelId,
    redirect_uri: resolveRedirectUri(event),
    state,
    nonce,
    scope: LINE_SCOPE,
    bot_prompt: LINE_BOT_PROMPT,
    ui_locales: LINE_UI_LOCALE[locale]
    // 不帶 disable_auto_login：在 LINE 內建瀏覽器裡自動登入是預設行為，
    // 使用者一鍵就過，這正是我們選擇「讓使用者留在 LINE 裡」的理由。
    // 外部瀏覽器不受影響，仍會走完整的授權畫面。
  })

  return sendRedirect(event, `${LINE_AUTHORIZE_URL}?${params.toString()}`, 302)
})
