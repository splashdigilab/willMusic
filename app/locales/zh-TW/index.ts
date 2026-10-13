/**
 * 繁中翻譯，也是其他語言的型別基準（locales/types.ts）。
 * 一個 namespace 一個檔案，大致對應一個頁面或一組元件，新增 namespace 要四個語言一起加。
 */
import common from './common'
import seo from './seo'
import legal from './legal'
import home from './home'
import editor from './editor'
import queue from './queue'
import myNotes from './myNotes'
import member from './member'
import quota from './quota'

export default { common, seo, legal, home, editor, queue, myNotes, member, quota }
