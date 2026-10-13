/**
 * 簡體中文檢查（活動規範：中文請以繁體字書寫，見 app/data/terms.ts）。
 *
 * 查表，不交給 AI：2026-10-13 實測審核模型對「我爱你们」「谢谢微乐客」都放行。
 * 字表由 scripts/moderation/build_simplified_chars.py 從 Unicode Unihan 產生，
 * 只收「繁體不用」的字（台、后、干這類繁簡共用的不算），台灣人寫的字不會被擋。
 *
 * 含假名的一律當日文、不檢查：日文新字體跟簡體有不少同形（国、学、会、来），
 * 不排除的話日本粉絲寫的「韓国大好き」會被擋。日文幾乎一定帶假名，純漢字的日文短句漏判是可接受的代價。
 */
import { SIMPLIFIED_ONLY_CHARS } from './simplified-chars'

const SIMPLIFIED = new Set(SIMPLIFIED_ONLY_CHARS)
/** 平假名、片假名（含半形與擴充） */
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/

export const containsSimplifiedChinese = (text: string): boolean =>
  !KANA.test(text) && Array.from(text).some(char => SIMPLIFIED.has(char))
