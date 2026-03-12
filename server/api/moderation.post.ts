import { defineEventHandler, readBody, createError, getHeaders } from 'h3'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const text = body?.text || ''

    if (!text) {
        throw createError({ statusCode: 400, message: 'Missing text content for moderation' })
    }

    // Runtime context API Key (e.g configured via standard host env variable)
    const config = useRuntimeConfig()
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || ''

    // If no API key is set, we bypass the check gracefully to avoid breaking the user application
    if (!apiKey) {
        console.warn('[OpenAI Moderation] OPENAI_API_KEY is not set. Bypassing check.')
        return {
            flagged: false,
            bypassed: true
        }
    }

    // Basic retry logic implementation for OpenAI API 429 errors
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
        try {
            // 1. Check with Moderation API first
            const moderationResponse = await fetch('https://api.openai.com/v1/moderations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({ input: text })
            })

            if (!moderationResponse.ok) {
                const errorText = await moderationResponse.text().catch(() => '');
                console.error(`[OpenAI API Error] Status: ${moderationResponse.status}, Body: ${errorText}`);
                if (moderationResponse.status === 429) {
                    const isQuotaError = errorText.includes('insufficient_quota');
                    throw createError({
                        statusCode: 429,
                        message: isQuotaError ? 'Insufficient Quota' : 'Rate limit exceeded',
                        data: errorText
                    })
                }
                throw Error(`OpenAI Moderation API failed: ${moderationResponse.statusText}`)
            }

            const data = await moderationResponse.json()
            const result = data.results[0]

            // Check if Moderation API flags it
            if (result.flagged) {
                return {
                    flagged: true,
                    categories: result.categories,
                    bypassed: false
                }
            }

            // 2. Moderation API is notoriously weak on general profanity and slang.
            //    We use a fast, strict completion request to catch common dirty words/insults.
            const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content:
                                `你是一個專業的內容審核員，負責為台灣「WillMusic 微樂客」韓流唱片行過濾留言。
                                你的目標是：攔截真正的惡意與非法內容，但「極大化」保留粉絲的熱情表達。

                                【判斷原則：寬鬆與包容】
                                1. 品牌與可愛語：絕對准許「微樂客」、「WillMusic」、「喵喵」、「嗚嗚」、「QQ」等擬聲詞。
                                2. 語感優先：如果這句話在台灣日常溝通中「聽得懂且不突兀」，請給予 PASS。
                                3. 灰色地帶從寬：像「立馬」、「優化」、「質量」、「壓力山大」這類在台灣也常見的詞彙，請直接 PASS。

                                【嚴格攔截 (FLAG) 範例】
                                1. 攻擊與不雅：中英韓文髒話、性暗示、針對藝人或粉絲的挑釁與詛咒（例如：XX去死、XX狗）。
                                2. 簡體中文：全文包含簡體字，直接 FLAG。
                                3. 極度強烈的中國網路詞彙：僅攔截台灣幾乎不使用、且帶有強烈對岸社群色彩的詞。
                                - 例如：YYDS、絕絕子、栓Q、集美、趕緊滴、給力、小哥哥/小姐姐(作為陌生人稱呼時)。
                                4. 廣告與非法：毒品代號、博弈廣告、不明網址。

                                【特殊情境處理】
                                - 判斷「喵喵」：在音樂店留言牆，這 100% 是可愛擬聲詞，請 PASS。
                                - 判斷「微樂客」：這是品牌名稱，請 PASS。

                                輸出格式：
                                - 僅回傳 "FLAG" 或 "PASS"。不要提供任何解釋。`
                        },
                        { role: 'user', content: text }
                    ],
                    temperature: 0,
                    max_completion_tokens: 5
                })
            })

            if (!chatResponse.ok) {
                const errorText = await chatResponse.text().catch(() => '');
                if (chatResponse.status === 429) {
                    throw createError({ statusCode: 429, message: 'Rate limit exceeded', data: errorText })
                }
                throw Error(`OpenAI Chat API failed: ${chatResponse.statusText}`)
            }

            const chatData = await chatResponse.json()
            const judgment = chatData.choices[0]?.message?.content?.trim().toUpperCase()

            if (judgment === 'FLAG') {
                return {
                    flagged: true,
                    categories: { profanity_strict: true },
                    bypassed: false
                }
            }

            return {
                flagged: false,
                bypassed: false
            }

        } catch (error: any) {
            if (error.statusCode === 429 && error.message !== 'Insufficient Quota' && retries < maxRetries - 1) {
                retries++;
                const delay = Math.pow(2, retries) * 500 + Math.random() * 500; // Exponential backoff with jitter
                console.warn(`[OpenAI Moderation Endpoint] Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${retries} of ${maxRetries - 1})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            console.error('[OpenAI Moderation Endpoint] final error:', error.message || error)
            // On unexpected errors (or max retries reached), we bypass the check so the client can still submit
            return {
                flagged: false,
                bypassed: true,
                error: error.message
            }
        }
    }
})
