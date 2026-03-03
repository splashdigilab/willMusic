import { defineEventHandler, readBody, createError, getHeaders } from 'h3'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const text = body?.text || ''

    if (!text) {
        throw createError({ statusCode: 400, message: 'Missing text content for moderation' })
    }

    // Runtime context API Key (e.g configured via standard host env variable)
    const apiKey = process.env.OPENAI_API_KEY || ''

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
                                `你是一個專業的公共大螢幕內容審核員，負責為「韓流唱片行」過濾留言。
                                這是一個闔家光臨且充滿正面能量的場景，任何一點不雅文字都會造成品牌公關危機。

                                請嚴格過濾以下類別的內容：
                                1. 髒話與辱罵：包含中、英、韓文的直接髒話，以及「諧音字」(例如：艹、淦、X你娘、SH1T、西八、C8)。
                                2. 性暗示與色情：包含猥褻詞彙、對偶像身體部位的過度意淫、或任何帶有性暗示的隱喻。
                                3. 粉絲挑釁與仇恨：禁止對特定藝人、團體或粉絲群體的攻擊、詛咒、歧視或刻意引發爭端的言論（Fan War）。
                                4. 敏感與負面：包含自殘、毒品、或任何不符合音樂店快樂氛圍的極端負面言論。

                                判斷規則：
                                - 只要有任何疑慮，請選擇「FLAG」。
                                - 正常的應援語（如：XX我愛你、XX世最美、回歸大發）請選擇「PASS」。

                                你的輸出格式必須嚴格遵循：
                                - 僅回傳 "FLAG"（代表包含不當內容）。
                                - 僅回傳 "PASS"（代表內容完全安全）。
                                不要提供任何解釋。`
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
