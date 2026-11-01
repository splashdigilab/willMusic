import { getFirestore, type Firestore } from 'firebase/firestore'

/**
 * 這個站的 Firestore（原本的 useNuxtApp().$firestore，為什麼改成這樣見 plugins/firebase.client.ts）。
 *
 * Firebase app 只在瀏覽器端建立，伺服器畫頁面時回 undefined —— 跟原本的 $firestore 一樣，
 * 頁面的 setup 在伺服器上也會跑，那時只是拿著、不會真的讀寫。
 *
 * 首頁會用到的程式不要 import 這支：它一 import 就把整個 Firestore 帶進首頁。
 * 那幾支改在要讀寫時才 await import('firebase/firestore')（例如 useSubmissionQuota）。
 */
export const clientDb = (): Firestore => (import.meta.client ? getFirestore() : undefined) as Firestore
