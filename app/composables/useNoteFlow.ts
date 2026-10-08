/**
 * useNoteFlow – 大螢幕底層的流動便利貼牆
 *
 * 左右兩個螢幕當成一整面牆，所有便利貼排成幾道，一起往同一個方向流：
 * - direction 'left'：一排一排，由右往左
 * - direction 'up'：一欄一欄，由下往上
 * 便利貼從入口（右邊／下面）畫面外進場，流到出口（左邊／上面）離開，
 * 出場的排到「所有道共用的隊伍」尾端；哪一道輪到進場，就從隊伍接一張，
 * 優先接「從前一道流出來的」那張，所以每張每繞一圈就換到下一道，繞完所有道再回來。
 * 空位也照樣循環，牆面的疏密不會越流越擠或越空。
 *
 * 換道是為了公平：挑去展示只在左邊螢幕，直排時如果每張永遠待在同一欄，
 * 右邊螢幕那幾欄的便利貼就永遠輪不到。一條一條輪過去，每張待在左右兩邊的時間一樣。
 *
 * 各道進場的時間點都不一樣（起點錯開、流速也不同），從前一道流出的那張常要在隊伍裡等一下
 * 才輪到下一道進場；隊伍裡要有夠多張在等，每一道才能準時接到、不會開天窗。
 * 所以輪播的張數建議比牆面格數多一些（recommendedCount），多的在畫面外排隊。
 *
 * 程式裡的「along」是流動方向上的座標（'left' 是 x、'up' 是 y），從入口往出口遞減；
 * 「lane」是第幾道（'left' 是第幾排、'up' 是第幾欄）。
 *
 * 排版的底子是磚牆：同樣間距，相鄰兩道起點錯開半格。
 * 各道的流速可以不同（speedVary）：開場時分配好、之後固定，相鄰兩道刻意不給相近的速度，
 * 整面牆才不會像一塊板子一起往前推。同一道裡的便利貼一律同速，前後永遠不會撞在一起；
 * 相鄰兩道壓到一起的，會慢慢錯開、一張從另一張上面滑過去（圖層固定，不會閃）。
 * 上面再看 mess 加雜亂：大小一律相同，每張各自歪一個角度、前後左右偏一段，
 * 前後間距有疏有密，左右可以壓到隔壁道，欄（排）就不再筆直（跟首頁共用，見 ~/utils/wall-look）。
 * 只有兩個地方不能壓過去：畫面邊緣，以及直排時兩個螢幕中間的接縫（screens）——
 * 跨在接縫上的便利貼會被兩台螢幕的邊框切成兩半。
 * 會互相壓到，所以每張進場時給一個固定的圖層（越晚進場越上面），飛回來落地的放最上面；
 * 不這樣做，疊的順序會跟著 DOM 順序（liveGrid 一變就變）突然對調。
 * mess = 0 就是完全整齊的磚牆（只有很輕微的傾斜，彼此不重疊）。
 *
 * - 便利貼比牆面少：多出來的是空位，平均散開
 * - 便利貼比牆面多：多的在隊伍裡等（畫面外），輪到才進場
 *
 * 輪播時 canvas 從這裡「拿起」一張（take），它的格子變成空位跟著流；
 * 展示完再「放回」（reserveReturn → rectOf 追著落點飛 → land）。
 * 拿起與放回都限定在指定範圍內（canvas 給的是左邊螢幕），見 isPickable / reserveReturn。
 *
 * 牆上的便利貼不會憑空消失：
 * - 放回時落點沒有空位 → 落點那張連同它前面（往出口那側）的，順著流向滑一格讓出位置
 * - 超過張數被擠掉的舊便利貼 → 繼續流，流出出口才離開（retire）
 * - 只有後台下架才會當場拿掉（canvas 負責淡出）
 *
 * 位置每幀直接寫 transform，不走 Vue 的響應式，幾十張一起動也不會卡。
 * 時間用 gsap.ticker.time：分頁切到背景再回來時 GSAP 會吸收那段空白，
 * 牆不會一口氣跳一大段，也跟 canvas 的 GSAP 飛行動畫用同一個時鐘，落點才追得準。
 */
import { gsap } from 'gsap'
import {
  ALONG_JITTER,
  CROSS_JITTER,
  maxTiltOf,
  randomWallLook,
  turnFactor,
  type WallLook
} from '~/utils/wall-look'

export type FlowDirection = 'left' | 'up'

export interface FlowRect {
  /** 便利貼（未旋轉時）的左上角，相對於牆，也就是整個 canvas */
  x: number
  y: number
  size: number
  rotation: number
}

export interface NoteFlowOptions {
  /** 流動方向，預設由右往左 */
  direction?: FlowDirection
  /** 幾道：'left' 是畫面高分成幾排，'up' 是畫面寬分成幾欄 */
  lanes: number
  /**
   * 便利貼邊長佔道寬的比例。格子是正方形（格距 = 道寬），
   * 所以上下左右的間距一樣，磚牆才整齊
   */
  scale: number
  /** 流速：1080 高的畫面上每秒走幾 px，其他高度等比例換算 */
  speed: number
  /**
   * 各道流速上下差多少（比例），預設 0（全部同速）。例如 0.15：最慢 0.85 倍、最快 1.15 倍，
   * 其他道平均分佈在中間
   */
  speedVary?: number
  /** 雜亂程度，0 = 整齊磚牆、1 = 最亂（見檔頭說明），預設 0 */
  mess?: number
  /**
   * 最多歪幾度（每張在 ±tilt 之間），0 = 完全不歪，最多 45。
   * 沒給就跟著 mess 走（TILT_NEAT～TILT_MESSY）；給了就只管角度，前後左右的偏移照樣看 mess
   */
  tilt?: number
  /** 牆橫跨幾個左右並排的螢幕，預設 1。直排時便利貼不會跨過螢幕之間的接縫 */
  screens?: number
  /** 被擠掉的便利貼流出畫面、正式離開牆面時通知（canvas 才能把它的 DOM 拿掉） */
  onRetired?: (id: string) => void
}

interface Item {
  id: string | null
  /** 空位是誰被拿去展示留下的：它回來時優先回到這裡 */
  gapOf: string | null
  /** 格子前緣位在入口的時間 */
  enteredAt: number
  /** 所在那一道的流速（px/s） */
  v: number
  /**
   * 讓位時滑一格的動畫：位置已經改成新的（enteredAt 提前），
   * 畫面上再加回 from，隨時間緩緩收到 0，看起來就是滑過去
   */
  slide?: { from: number; start: number; dur: number }
  /** 圖層（z-index）：進場、落地時給，在畫面上的這段期間不變 */
  z: number
}

type Entry = Pick<Item, 'id' | 'gapOf'> & {
  /** 從第幾道流出來的（下一道優先接它）；一開始排進隊伍的沒有 */
  from?: number
}

interface Lane {
  /** 從出口到入口排（最早進場、最靠出口的在最前面） */
  items: Item[]
  /** 下一格預定進場的時間：每一道固定每隔 pitch / v 秒進一格 */
  nextEntryAt: number
  /** 這一道的流速（px/s） */
  v: number
}

/** 轉了角度、放大之後，四個角離畫面邊緣與螢幕接縫至少留這麼多（道寬的比例） */
const EDGE_MARGIN = 0.01
/**
 * 預定進場時隊伍剛好是空的，最多等這麼久（秒）還照原本的時間進場（位置會提前一點點，
 * 反正在畫面外）；等更久就從現在開始算，不然新進場的那張會一出現就在畫面中間
 */
const MAX_ENTRY_LAG = 0.5

const easeInOutSine = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p)

/** 把空位平均插進便利貼之間 */
const interleave = <T>(notes: T[], spacers: T[]): T[] => {
  if (!spacers.length) return notes
  const total = notes.length + spacers.length
  const out: T[] = []
  let ni = 0
  let si = 0
  for (let i = 0; i < total; i++) {
    const wantSpacer = Math.floor(((i + 1) * spacers.length) / total) > si
    if ((wantSpacer && si < spacers.length) || ni >= notes.length) out.push(spacers[si++]!)
    else out.push(notes[ni++]!)
  }
  return out
}

const shuffle = <T>(list: T[]) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j]!, list[i]!]
  }
  return list
}

/**
 * 各道流速的名次（0 最慢）：打亂排，相鄰兩道至少差兩名，兩道才不會幾乎同速、看起來黏在一起。
 * 道數太少排不出來（3 道以下）就用最後一次打亂的結果
 */
const pickSpeedRanks = (n: number) => {
  const ranks = Array.from({ length: n }, (_, i) => i)
  for (let attempt = 0; attempt < 200; attempt++) {
    shuffle(ranks)
    if (ranks.every((r, i) => i === 0 || Math.abs(r - ranks[i - 1]!) >= 2)) break
  }
  return ranks
}

export function useNoteFlow(opts: NoteFlowOptions) {
  const vertical = opts.direction === 'up'
  const mess = Math.min(1, Math.max(0, opts.mess ?? 0))
  const maxTilt = maxTiltOf(mess, opts.tilt)
  const screens = Math.max(1, Math.floor(opts.screens ?? 1))
  const speedVary = Math.min(0.9, Math.max(0, opts.speedVary ?? 0))
  /** 名次開場決定一次，換畫面大小重排時不變（不然每次重排快慢都換） */
  const speedRanks = pickSpeedRanks(Math.max(1, Math.floor(opts.lanes)))

  const elements = new Map<string, HTMLElement>()
  /** 每張的樣子，換道也跟著走；角度與偏移在 toRect 依當下的版面換算，換畫面大小也成立 */
  const looks = new Map<string, WallLook>()
  /** 每張元素目前寫上去的 z-index，沒變就不重寫 */
  const appliedZ = new Map<string, number>()
  let zTop = 0
  /** 牆上的成員（= liveGrid），不管現在在牆上、隊伍裡、還是被拿去展示 */
  const members = new Set<string>()
  /** 被拿去右邊展示中的 */
  const held = new Set<string>()
  /** 正在飛回牆上的：位置保留好了，但要等 land() 才現身，不然會跟飛行中那張同時出現 */
  const arriving = new Set<string>()
  /** 剛被拿起、還墊在展示那張底下的：原地定住不動，等 release() 才藏起來 */
  const frozen = new Set<string>()
  /** 已經不在 liveGrid、但還在牆上流的（被擠掉的舊便利貼）：流出出口就離開 */
  const retiring = new Set<string>()
  let shown = new Set<string>()

  let lanes: Lane[] = []
  /** 所有道共用的等候隊伍（畫面外） */
  let queue: Entry[] = []
  let initialized = false
  let width = 0
  let height = 0
  /** 流動方向上的總長（'left' 是畫面寬、'up' 是畫面高） */
  let alongLength = 0
  /** 每一道的寬度（'left' 是排高、'up' 是欄寬） */
  let laneSpan = 0
  let laneCount = 0
  let size = 0
  let pitch = 0
  /** 各道的流速（px/s），build 時抄進每一道 */
  let laneSpeeds: number[] = []
  /**
   * 便利貼最多會在流動方向上超出自己的格子多少（偏移＋轉角＋放大）。
   * 入口與出口都往畫面外多推這麼多，才不會在畫面邊緣就冒出來或消失
   */
  let overhang = 0

  const now = () => gsap.ticker.time

  /**
   * 顯示／藏起來用 opacity，不用 visibility：StickyNote 量完尺寸會在內層自己設 visibility: visible，
   * 子元素的 visible 會蓋過外層的 hidden，藏起來的便利貼就會定格在原位（或疊在左上角）被看見
   */
  const setShown = (el: HTMLElement | undefined, on: boolean) => {
    if (el) el.style.opacity = on ? '1' : '0'
  }

  const lookOf = (id: string) => {
    let look = looks.get(id)
    if (!look) {
      look = randomWallLook()
      looks.set(id, look)
    }
    return look
  }

  /** 格子前緣在 t 時的 along（不含讓位的滑動）。入口在畫面外 overhang 的地方 */
  const alongOf = (item: { enteredAt: number; v: number }, t: number) =>
    alongLength + overhang - item.v * (t - item.enteredAt)

  /** 畫面上看到的 along：再加上讓位滑動還沒走完的那一段 */
  const shownAlong = (item: Item, t: number) => {
    const s = item.slide
    if (!s) return alongOf(item, t)
    const p = (t - s.start) / s.dur
    if (p >= 1) {
      delete item.slide
      return alongOf(item, t)
    }
    return alongOf(item, t) + s.from * (1 - easeInOutSine(Math.max(0, p)))
  }

  /**
   * 跟流向垂直的方向上，中心在 c 的便利貼可以放的範圍：
   * 直排是它所在的那個螢幕（不跨接縫），橫排是畫面上下
   */
  const crossRange = (c: number): [number, number] => {
    const margin = laneSpan * EDGE_MARGIN
    if (!vertical) return [margin, height - margin]
    const screenW = width / screens
    const s = Math.min(screens - 1, Math.max(0, Math.floor(c / screenW)))
    return [s * screenW + margin, (s + 1) * screenW - margin]
  }

  /**
   * 第 lane 道、along 位置上，id 這張的方框（空位是格子正中、沒有角度）。
   * 往兩側偏的量先扣掉轉角後的半寬，四個角不會超出 crossRange
   */
  const toRect = (lane: number, along: number, id: string | null): FlowRect => {
    let a = along + pitch / 2
    let c = lane * laneSpan + laneSpan / 2
    let rotation = 0
    if (id) {
      const look = lookOf(id)
      rotation = look.tilt * maxTilt
      const [lo, hi] = crossRange(c)
      const half = (size * turnFactor(rotation)) / 2
      // 那一側放不下就反過來往另一側偏：靠畫面邊緣、接縫的那幾道才不會整排貼齊在邊上
      let shift = look.cross * CROSS_JITTER * laneSpan * mess
      if (c + shift - half < lo || c + shift + half > hi) shift = -shift
      c = Math.min(Math.max(c + shift, lo + half), hi - half)
      a += look.along * ALONG_JITTER * pitch * mess
    }
    return {
      x: (vertical ? c : a) - size / 2,
      y: (vertical ? a : c) - size / 2,
      size,
      rotation
    }
  }
  const rectAt = (lane: number, item: Item, t: number) => toRect(lane, shownAlong(item, t), item.id)

  const toTransform = (rect: FlowRect) => `translate3d(${rect.x}px, ${rect.y}px, 0) rotate(${rect.rotation}deg)`

  /** 整張都在 [0, maxX] × [0, height] 裡 */
  const fits = (rect: FlowRect, maxX: number) =>
    rect.x >= 0 && rect.x + rect.size <= maxX && rect.y >= 0 && rect.y + rect.size <= height

  /** 依畫面大小算道寬、便利貼大小、流速。回傳便利貼邊長（px），給 CSS 用 */
  const layout = (w: number, h: number) => {
    width = w
    height = h
    laneCount = Math.max(1, Math.floor(opts.lanes))
    laneSpan = (vertical ? w : h) / laneCount
    alongLength = vertical ? h : w
    // 格子是正方形：流動方向上的格距也等於道寬
    pitch = laneSpan
    size = laneSpan * Math.min(opts.scale, 0.95)
    const speed = opts.speed * (h / 1080)
    // 名次平均分佈在 1 ± speedVary 之間
    laneSpeeds = Array.from({ length: laneCount }, (_, l) => {
      const rank = speedRanks[l] ?? 0
      const p = laneCount > 1 ? (2 * rank) / (laneCount - 1) - 1 : 0
      return speed * (1 + speedVary * p)
    })
    // 流動方向上超出格子的：偏移，加上最歪的那張外接框比格子大的那一半
    const widest = size * turnFactor(maxTilt)
    overhang = ALONG_JITTER * pitch * mess + Math.max(0, (widest - pitch) / 2)
    return size
  }

  /**
   * 一道同時要有幾格：流動方向的長度（加上入口、出口各往外推的 overhang）再多一格，
   * 循環時入口才不會露出一段空白
   */
  const slotsPerLane = () => Math.ceil((alongLength + 2 * overhang + pitch) / pitch)

  /** 牆面剛好排滿需要幾張 */
  const capacity = () => laneCount * slotsPerLane()

  /**
   * 建議輪播幾張：排滿牆面，再多每道一張在畫面外排隊。
   * 少了這些，隊伍常常是空的，換道就換不起來（見檔頭說明）
   */
  const recommendedCount = () => capacity() + laneCount

  const findItem = (id: string) => {
    for (const [l, lane] of lanes.entries()) {
      const k = lane.items.findIndex(i => i.id === id)
      if (k >= 0) return { l, lane, k, item: lane.items[k]! }
    }
    return null
  }

  /** 排進隊伍：優先填隊伍裡的空位（畫面外），沒有就排到尾端 */
  const enqueue = (id: string) => {
    const k = queue.findIndex(e => e.id === null && e.gapOf === null)
    if (k >= 0) queue[k]!.id = id
    else queue.push({ id, gapOf: null })
  }

  /** 依目前的 layout 重新排：各道平均分，不夠長就平均插空位，相鄰兩道錯開半格 */
  const build = (ids: string[]) => {
    const t = now()
    const perLaneSlots = slotsPerLane()
    lanes = Array.from({ length: laneCount }, (_, l) => ({ items: [], nextEntryAt: t, v: laneSpeeds[l]! }))
    queue = []

    // 打亂再分道：liveGrid 是依時間排的，照順序分會讓同一批投稿擠在一起
    const shuffled = shuffle([...ids])
    const perLane: string[][] = lanes.map(() => [])
    shuffled.forEach((id, i) => perLane[i % lanes.length]!.push(id))

    // 排不進畫面的先依「第幾格」收集，再輪流排進共用隊伍，各道之後接到的才會平均
    const overflow: Entry[][] = []
    lanes.forEach((lane, l) => {
      const notes: Entry[] = perLane[l]!.map(id => ({ id, gapOf: null }))
      const spacers: Entry[] = Array.from(
        { length: Math.max(0, perLaneSlots - notes.length) },
        () => ({ id: null, gapOf: null })
      )
      // 從出口那端的畫面外排起；奇數道多錯開半格，排成磚牆
      let along = -pitch * (l % 2 ? 0.5 : 0)
      let k = 0
      for (const e of interleave(notes, spacers)) {
        if (along < alongLength + overhang) {
          lane.items.push({ ...e, enteredAt: t - (alongLength + overhang - along) / lane.v, v: lane.v, z: 0 })
        }
        else (overflow[k++] ??= []).push(e)
        along += pitch
      }
      const last = lane.items[lane.items.length - 1]
      lane.nextEntryAt = last ? last.enteredAt + pitch / lane.v : t
    })
    for (const group of overflow) queue.push(...group)
    // 圖層照進場先後給，跟之後一張一張進場的規則一樣（越晚進場越上面）
    const all = lanes.flatMap(lane => lane.items).sort((p, q) => p.enteredAt - q.enteredAt)
    for (const item of all) item.z = ++zTop

    for (const id of shown) setShown(elements.get(id), false)
    shown = new Set()
    initialized = true
  }

  /** 被擠掉的舊便利貼重排時就直接離開（重排本來就會整面換位置） */
  const dropRetiring = () => {
    for (const id of retiring) opts.onRetired?.(id)
    retiring.clear()
  }

  const init = (ids: string[]) => {
    members.clear()
    held.clear()
    arriving.clear()
    frozen.clear()
    dropRetiring()
    ids.forEach(id => {
      members.add(id)
      lookOf(id)
    })
    build(ids)
  }

  /** 畫面大小變了（例如按「開始」後才切全螢幕）：重排，展示中的那張不動 */
  const relayout = (w: number, h: number) => {
    const s = layout(w, h)
    if (initialized) {
      for (const id of frozen) setShown(elements.get(id), false)
      frozen.clear()
      arriving.clear()
      dropRetiring()
      build([...members].filter(id => !held.has(id)))
    }
    return s
  }

  /** 把一張從牆上的所有紀錄拿掉，格子變空位 */
  const detach = (id: string) => {
    held.delete(id)
    arriving.delete(id)
    frozen.delete(id)
    retiring.delete(id)
    shown.delete(id)
    for (const lane of lanes) {
      for (const item of lane.items) {
        if (item.id === id) item.id = null
        if (item.gapOf === id) item.gapOf = null
      }
    }
    for (const e of queue) {
      if (e.id === id) e.id = null
      if (e.gapOf === id) e.gapOf = null
    }
  }

  /**
   * 對齊 liveGrid。新成員排進隊伍（hold 裡的由 canvas 自己放回）。
   * 不在名單上的：
   * - 列在 retire 裡、當下在牆上看得到 → 繼續流，流出出口才離開（onRetired 通知）
   * - 其他（後台下架，或 retire 但本來就不在畫面上）→ 當場拿掉，格子變空位
   * 回傳「當場拿掉、而且當下看得到」的元素，canvas 要趁 Vue 拿掉 DOM 之前複製一份來淡出。
   */
  const sync = (ids: string[], { hold = [], retire = [] }: { hold?: string[]; retire?: string[] } = {}) => {
    const next = new Set(ids)
    const removedVisible: HTMLElement[] = []
    for (const id of [...members]) {
      if (next.has(id)) continue
      members.delete(id)
      if (retire.includes(id) && shown.has(id) && findItem(id) && !frozen.has(id)) {
        retiring.add(id)
        continue
      }
      const el = elements.get(id)
      if (el && shown.has(id)) removedVisible.push(el)
      detach(id)
      if (retire.includes(id)) opts.onRetired?.(id)
    }
    for (const id of ids) {
      if (members.has(id)) continue
      members.add(id)
      retiring.delete(id)
      lookOf(id)
      if (hold.includes(id)) held.add(id)
      else if (!findItem(id)) enqueue(id)
    }
    return removedVisible
  }

  /**
   * 流出去途中被後台下架的舊便利貼：當場拿掉。
   * 回傳它的元素（看得到的話），canvas 複製一份淡出
   */
  const removeRetiring = (id: string) => {
    if (!retiring.has(id)) return null
    const el = shown.has(id) ? elements.get(id) ?? null : null
    detach(id)
    return el
  }

  /**
   * 從牆上拿起一張，原位變成它的空位跟著流。回傳它當下的位置（不在畫面上就回 null）。
   * 牆上那張會原地定住、繼續顯示，墊在展示那張底下，等 canvas 呼叫 release() 才藏起來 ——
   * 展示那張剛掛上時要先量尺寸、解碼圖片，頭一兩幀是空的，沒墊著就會閃一下
   */
  const take = (id: string): FlowRect | null => {
    held.add(id)
    const found = findItem(id)
    if (found) {
      const rect = rectAt(found.l, found.item, now())
      found.item.id = null
      found.item.gapOf = id
      if (shown.has(id)) frozen.add(id)
      return rect
    }
    const e = queue.find(q => q.id === id)
    if (e) {
      e.id = null
      e.gapOf = id
    }
    return null
  }

  /** 拿起後墊在底下的那張可以藏起來了 */
  const release = (id: string) => {
    if (!frozen.delete(id)) return
    setShown(elements.get(id), false)
    shown.delete(id)
  }

  /**
   * 挑去展示的候選：整張都在 [0, maxX] × 畫面高 裡（canvas 給的是左邊螢幕）。
   * 給了 leadSec 的話，還要 leadSec 秒後（展示完、準備飛回來時）它留下的空位也還在範圍內，
   * 才回得去原位；範圍在流動方向上太短、根本不可能滿足時就只看現在的位置
   */
  const isPickable = (id: string, maxX: number, leadSec = 0) => {
    if (held.has(id) || arriving.has(id) || retiring.has(id)) return false
    const found = findItem(id)
    if (!found || found.item.slide) return false
    const t = now()
    if (!fits(rectAt(found.l, found.item, t), maxX)) return false
    const span = vertical ? height : maxX
    if (found.lane.v * leadSec > span - size) return true
    return fits(rectAt(found.l, found.item, t + leadSec), maxX)
  }

  /**
   * 在 lane 的第 k 格插進一張：第 k 格那張連同它前面（往出口那側）的全部順著流向滑一格，
   * 最前面那張只是提早流出畫面；新的一張落在第 k 格原本的位置。dur 秒內滑完
   */
  const insertBefore = (lane: Lane, k: number, id: string, dur: number) => {
    const shift = pitch / lane.v
    const t = now()
    const original = lane.items[k]!.enteredAt
    for (let i = 0; i <= k; i++) {
      const item = lane.items[i]!
      // 還在滑的，把剩下沒滑完的那段一起算進來，不會跳
      const pending = shownAlong(item, t) - alongOf(item, t)
      item.enteredAt -= shift
      item.slide = { from: pitch + pending, start: t, dur }
    }
    // 圖層等落地（land）時再給
    lane.items.splice(k + 1, 0, { id, gapOf: null, enteredAt: original, v: lane.v, z: 0 })
  }

  /**
   * 展示完要放回牆上：幫它在牆上保留一個位置，之後用 rectOf() 追著那個位置飛。
   * 落點限定在 [0, maxX] × 畫面高（canvas 給的是左邊螢幕），依序找：
   *
   * 1. 自己被拿起時留下的空位，落地時還在範圍內 → 回到原位
   * 2. 範圍內其他空位（例如被擠掉的舊便利貼離開後留下的） → 挑落點離 (preferX, 畫面中線) 最近的
   * 3. 範圍內都滿了 → 落點附近那張連同它前面的順著流向滑一格，讓出位置（slideSec 秒內滑完）
   * 4. 範圍內根本沒有格子（畫面異常窄）→ 插到隊伍最前面，下一個進場的就是它
   */
  const reserveReturn = (id: string, arriveIn: number, maxX: number, preferX: number, slideSec = arriveIn) => {
    const t = now() + arriveIn
    held.delete(id)
    arriving.add(id)

    // 用它自己的樣子（角度、偏移）來量：落地時實際佔的位置才是範圍內
    const slotAt = (l: number, item: Item) => toRect(l, alongOf(item, t), id)
    const distance = (rect: FlowRect) =>
      Math.hypot(rect.x + rect.size / 2 - preferX, rect.y + rect.size / 2 - height / 2)

    let own: Item | null = null
    let gap: { item: Item; d: number } | null = null
    let occupied: { lane: Lane; k: number; d: number } | null = null
    for (const [l, lane] of lanes.entries()) {
      for (const [k, item] of lane.items.entries()) {
        const rect = slotAt(l, item)
        if (!fits(rect, maxX)) continue
        const d = distance(rect)
        if (item.id === null) {
          if (item.gapOf === id) own = item
          // 別張展示中的空位留給它自己
          else if (!(item.gapOf && held.has(item.gapOf)) && (!gap || d < gap.d)) gap = { item, d }
        } else if (!held.has(item.id) && !arriving.has(item.id) && !frozen.has(item.id)) {
          if (!occupied || d < occupied.d) occupied = { lane, k, d }
        }
      }
    }

    // 不管最後回到哪，它留下的其他空位都變成一般空位，別張之後可以用
    for (const lane of lanes) {
      for (const item of lane.items) if (item.gapOf === id) item.gapOf = null
    }
    for (const e of queue) if (e.gapOf === id) e.gapOf = null

    const target = own ?? gap?.item ?? null
    if (target) {
      target.id = id
      return
    }
    if (occupied) {
      insertBefore(occupied.lane, occupied.k, id, slideSec)
      return
    }
    queue.unshift({ id, gapOf: null })
  }

  /** 隊伍裡第 k 張會在哪一道、什麼時候進場：各道照預定時間輪流接隊伍最前面那張 */
  const predictEntry = (k: number) => {
    const due = lanes.map(lane => Math.max(lane.nextEntryAt, now()))
    for (let j = 0; ; j++) {
      let l = 0
      for (let i = 1; i < due.length; i++) if (due[i]! < due[l]!) l = i
      if (j === k) return { l, at: due[l]! }
      due[l]! += pitch / lanes[l]!.v
    }
  }

  /**
   * 這張在牆上（或預計進場後）t 時的位置。飛回牆上時每幀用它當終點，
   * 終點本身在流動，飛到最後速度就跟牆一樣，落地交接時看不出接縫。
   * 還在隊伍裡、t 時還沒進場的，位置停在入口的畫面外。
   */
  const rectOf = (id: string, t: number): FlowRect | null => {
    const found = findItem(id)
    if (found) return rectAt(found.l, found.item, t)
    const k = queue.findIndex(e => e.id === id)
    if (k < 0 || !lanes.length) return null
    const { l, at } = predictEntry(k)
    return toRect(l, alongOf({ enteredAt: at, v: lanes[l]!.v }, Math.max(t, at)), id)
  }

  /** 飛回來的那張落地了：之後由牆接手顯示 */
  const land = (id: string) => {
    arriving.delete(id)
    if (!members.has(id)) return
    // 飛回來時一路蓋在所有便利貼上面，落地後也要在最上面，不然交棒那一幀會突然被鄰居壓住
    const found = findItem(id)
    if (found) found.item.z = ++zTop
    // 飛行途中牆重排過（relayout），保留的位置已經不在了：排回隊伍，不然這張會就此消失
    if (!findItem(id) && !queue.some(e => e.id === id)) enqueue(id)
  }

  const register = (id: string, el: Element | null) => {
    if (!el) {
      elements.delete(id)
      return
    }
    if (elements.get(id) !== el) {
      elements.set(id, el as HTMLElement)
      // 新掛上的元素預設是藏著的（CSS）、也還沒有圖層，要讓下一幀重新判斷一次
      shown.delete(id)
      appliedZ.delete(id)
    }
  }

  /* ─── 每幀 ─── */
  const update = () => {
    if (!initialized) return
    const t = now()
    const visible = new Set<string>()

    // 出場：整格（連同 overhang）離開出口（看畫面上的位置，讓位滑動中的要等它真的滑出去），排到共用隊伍尾端。
    // 先處理所有道的出場再處理進場，這一幀流出去的才接得上這一幀要進場的。
    // 被擠掉的舊便利貼在這裡正式離開；多出來的空位在整面牆長度夠的前提下丟掉，牆才不會越來越疏
    const minTotal = laneCount * slotsPerLane()
    for (const [l, lane] of lanes.entries()) {
      while (lane.items.length) {
        const first = lane.items[0]!
        if (shownAlong(first, t) + pitch + overhang > 0) break
        lane.items.shift()
        if (first.id !== null && retiring.has(first.id)) {
          const id = first.id
          detach(id)
          setShown(elements.get(id), false)
          opts.onRetired?.(id)
          first.id = null
        }
        const id = first.id !== null && members.has(first.id) ? first.id : null
        const total = lanes.reduce((n, ln) => n + ln.items.length, 0) + queue.length
        if (id === null && first.gapOf === null && total >= minTotal) continue
        queue.push({ id, gapOf: first.gapOf, from: l })
      }
    }

    // 進場：到點的道照時間先後接一張（一幀內可能好幾道都到點，分頁剛切回來時尤其多）。
    // 優先接從前一道流出來的，每張才會一道一道輪過去；沒有就接隊伍最前面的
    for (;;) {
      let due = -1
      lanes.forEach((lane, l) => {
        if (lane.nextEntryAt <= t && (due < 0 || lane.nextEntryAt < lanes[due]!.nextEntryAt)) due = l
      })
      if (due < 0) break
      const lane = lanes[due]!
      if (!queue.length) {
        // 隊伍空了：稍微晚一點還是照原本的時間進場；等太久就從現在重新算，不然一出現就在畫面中間
        for (const ln of lanes) if (t - ln.nextEntryAt > MAX_ENTRY_LAG) ln.nextEntryAt = t
        break
      }
      const prev = (due - 1 + lanes.length) % lanes.length
      const k = Math.max(0, queue.findIndex(e => e.from === prev))
      const [entry] = queue.splice(k, 1)
      lane.items.push({ id: entry!.id, gapOf: entry!.gapOf, enteredAt: lane.nextEntryAt, v: lane.v, z: ++zTop })
      lane.nextEntryAt += pitch / lane.v
    }

    lanes.forEach((lane, l) => {
      for (const item of lane.items) {
        const id = item.id
        if (!id || arriving.has(id) || frozen.has(id)) continue
        const el = elements.get(id)
        if (!el) continue
        el.style.transform = toTransform(rectAt(l, item, t))
        if (appliedZ.get(id) !== item.z) {
          el.style.zIndex = String(item.z)
          appliedZ.set(id, item.z)
        }
        visible.add(id)
      }
    })

    // 定住墊底的那張維持顯示（位置不再更新）
    for (const id of frozen) if (shown.has(id)) visible.add(id)
    for (const id of shown) if (!visible.has(id)) setShown(elements.get(id), false)
    for (const id of visible) if (!shown.has(id)) setShown(elements.get(id), true)
    shown = visible
  }

  let running = false
  const start = () => {
    if (running) return
    running = true
    gsap.ticker.add(update)
  }
  const stop = () => {
    running = false
    gsap.ticker.remove(update)
  }

  return {
    layout,
    relayout,
    capacity,
    recommendedCount,
    init,
    isInitialized: () => initialized,
    sync,
    removeRetiring,
    take,
    release,
    isPickable,
    reserveReturn,
    rectOf,
    land,
    register,
    start,
    stop
  }
}
