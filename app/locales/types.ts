/**
 * 翻譯檔的型別：以繁中（zh-TW/）為準，其他語言少一個 key、多一個 key、
 * 函式參數對不上，型別檢查都會報錯。
 *
 * 繁中的值是字面常數，直接拿 typeof 會變成「英文版的字串必須跟中文一模一樣」，
 * 所以先把字串放寬成 string、函式放寬成同樣參數的 (...) => string。
 */
import type zhTW from './zh-TW'

type Widen<T> =
  T extends string ? string
    : T extends (...args: infer A) => string ? (...args: A) => string
      : T extends readonly string[] ? string[]
        : { [K in keyof T]: Widen<T[K]> }

export type Messages = Widen<typeof zhTW>
