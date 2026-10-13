/**
 * 不能拿來署名的 LINE 暱稱：冒充店家，或明確宣稱是藝人本人、經紀公司。
 *
 * 署名用的是 LINE 暱稱，使用者自己改得到。改成「微樂客官方」再寫「今天全館五折」，
 * 顧客會拿著截圖到櫃檯要折扣（活動規範第四條也禁止冒名，見 app/data/terms.ts）。
 *
 * 「本人」「娛樂公司」「Entertainment」這類身分字眼也列在這裡，不交給 AI：
 * 2026-10-13 試過請審核模型判斷「這個名字是不是冒名」，連「Kevin Chiang」「Jennie老婆」
 * 都被擋。名字太短、沒有上下文，模型判斷不了；字眼清單是確定的，不會誤傷一般人名。
 *
 * 在伺服器簽 custom token 時判斷、簽成 `nameTagBlocked` claim，由 firestore.rules 的
 * isValidNameTag 擋下：判斷放在使用者碰不到的地方，自己打 API 也繞不過。
 * 前端只讀 claim 決定要不要給署名鈕，不重複這份清單。
 *
 * 藝人的名字刻意不列：粉絲的暱稱本來就常帶藝人名字（「Jennie老婆」），列了會誤傷一大片。
 * 只有名字、沒有身分字眼的冒名（暱稱就叫「Jennie」）擋不了，靠後台拿掉署名、封鎖。
 *
 * 誤傷的代價很小：暱稱剛好叫「官方認證迷妹」的人不能署名，但照樣能匿名送出。
 */

/** 比對前會先正規化（見 normalize），這裡一律寫小寫、不含空白；繁簡兩種寫法都要列 */
const RESERVED_WORDS = [
  '微樂客', '微乐客',
  'willmusic',
  '官方',
  '店長', '店长',
  '店員', '店员',
  '客服',
  '小編', '小编',
  '管理員', '管理员', '管理者',
  'admin',
  'official',
  'staff',
  // 自稱藝人本人或經紀公司
  '本人',
  '經紀', '经纪',
  '娛樂公司', '娱乐公司',
  'entertainment'
]

/**
 * 統一寫法再比對，擋掉常見的繞法：
 * 全形英數（Ｗｉｌｌ）→ NFKC 轉半形；大小寫；中間插空白、標點、符號（Will.Music、微 樂 客）；
 * 看不見的字元（零寬空白）。
 */
const normalize = (name: string): string =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}\p{Cf}]/gu, '')

export const isReservedDisplayName = (name: string): boolean => {
  const normalized = normalize(name)
  return RESERVED_WORDS.some(word => normalized.includes(word))
}
