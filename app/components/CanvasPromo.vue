<template>
  <!-- 大螢幕左半常駐的徽章動畫，照設計給的「(Screen) Will Music - 應援便利貼.mp4」重做：
       圓形徽章從 START 翻到背面的 QR code，停一下再翻回來，一直重複。影片裡的造型背景不要，只留徽章，
       底下透出流動的便利貼牆。
       不直接播影片，是因為影片只有 540×720，放到大螢幕會糊；用 DOM 畫，QR 也能跟著網址換。
       掛上時彈出一次，之後就一直翻，何時掛上由 canvas 決定。 -->
  <div ref="rootRef" class="c-canvas-promo" :class="{ 'c-canvas-promo--halloween': isHalloween }" aria-hidden="true">
    <div ref="badgeRef" class="c-canvas-promo__badge">
      <!-- 圓片與上面的圖文分成兩組各自翻轉，文字那組永遠疊在圓片上面（見 SCSS 說明）。
           萬聖節的圓片換成南瓜外形，形狀與顏色都在 themes/_halloween.scss -->
      <div ref="platesRef" class="c-canvas-promo__flip">
        <div class="c-canvas-promo__plate" />
        <div class="c-canvas-promo__plate c-canvas-promo__plate--back" />
      </div>

      <div ref="facesRef" class="c-canvas-promo__flip">
        <!-- 萬聖節：稿子畫板 03（正面、SCAN）與 04（背面、PLAY），兩面都有 QR。
             座標是畫板的 1080×1440，viewBox 裁在南瓜的外框。南瓜上的圖文（字已轉外框、含蝙蝠）
             是從稿子取出的整張 SVG，QR 照樣自己畫，網址才只有 PROMO_QR_URL 一處 -->
        <template v-if="isHalloween">
          <svg class="c-canvas-promo__face" :viewBox="HW_VIEWBOX">
            <image href="/themes/halloween/promo-face-front.svg" v-bind="HW_ART_BOX" />
            <path class="c-canvas-promo__qr" :d="qrPath" :transform="hwQrTransform" />
          </svg>
          <svg class="c-canvas-promo__face c-canvas-promo__face--back" :viewBox="HW_VIEWBOX">
            <image href="/themes/halloween/promo-face-back.svg" v-bind="HW_ART_BOX" />
            <path class="c-canvas-promo__qr" :d="qrPath" :transform="hwQrTransform" />
          </svg>
        </template>

        <!-- 兩面的 SVG 座標都是徽章本身的 460×460，數字照影片量的（影片座標減去徽章左上角 40.5, 128.5） -->
        <template v-else>
          <svg class="c-canvas-promo__face" viewBox="0 0 460 460">
            <defs>
              <path :id="arcId" :d="ARC_PATH" />
            </defs>
            <text class="c-canvas-promo__arc-text" :transform="ARC_ROTATE">
              <textPath :href="`#${arcId}`" startOffset="50%">POST BOARD</textPath>
            </text>

            <g class="c-canvas-promo__scan-icon" transform="translate(197 102.7)">
              <path class="c-canvas-promo__scan-corners" d="M2.2 13.5V8.2a6 6 0 0 1 6-6H14M50 2.2h5.8a6 6 0 0 1 6 6v5.3M2.2 50.5v5.3a6 6 0 0 0 6 6H14M50 61.8h5.8a6 6 0 0 0 6-6v-5.3" />
              <rect x="12" y="12" width="17" height="17" rx="3.5" class="c-canvas-promo__scan-ring" />
              <rect x="35" y="35" width="17" height="17" rx="3.5" class="c-canvas-promo__scan-ring" />
              <path d="M18 18h5v5h-5zM41 41h5v5h-5zM37.3 9.1h4.4v4.4h-4.4zM46 9.1h8.8v17.5h-4.4V13.5H46zM41.7 13.5h4.4v5.6h-4.4zM37.3 21.9h8.8v4.4h-8.8zM9.8 34.8h4.4v18.7H9.8zM19.1 34.8h8.8v4.4h-8.8zM19.1 44.8h3.8v4.4h-3.8zM22.9 49.2h5v4.4h-5z" />
            </g>

            <!-- letter-spacing 會加在最後一個字後面，置中時整行偏左半個字距，x 多給 2.5 補回來 -->
            <text class="c-canvas-promo__title" x="232" y="247.3">應援便利貼</text>

            <rect class="c-canvas-promo__pill" x="119" y="288.4" width="221" height="58.8" rx="29.4" />
            <text class="c-canvas-promo__pill-label" x="230" y="335">START</text>

            <image href="/willMusicLogo.png" x="164.6" y="370" width="128.9" height="17.9" />
          </svg>

          <!-- 背面：稿子上整組圖文比正面高 4px，照抄 -->
          <svg class="c-canvas-promo__face c-canvas-promo__face--back" viewBox="0 0 460 460">
            <g transform="translate(0 -4)">
              <text class="c-canvas-promo__arc-text" :transform="ARC_ROTATE">
                <textPath :href="`#${arcId}`" startOffset="50%">POST BOARD</textPath>
              </text>

              <path class="c-canvas-promo__qr" :d="qrPath" :transform="qrTransform" />

              <rect class="c-canvas-promo__pill" x="119" y="288.4" width="221" height="58.8" rx="29.4" />
              <text class="c-canvas-promo__pill-label" x="229" y="335">SCAN</text>

              <image href="/willMusicLogo.png" x="164.6" y="370" width="128.9" height="17.9" />
            </g>
          </svg>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useId } from 'vue'
import { gsap } from 'gsap'
import QRCode from 'qrcode'

const { themeId } = useTheme()
const isHalloween = computed(() => themeId.value === 'halloween')

/**
 * 背面 QR 的網址。跟大螢幕下方那顆 /qrcode.svg 是同一個 lihi 短網址 ——
 * 換網址時兩個地方要一起換。影片裡那顆（lihi1.me/XyaUH）是設計稿的示意，不用。
 */
const PROMO_QR_URL = 'https://lihi1.me/IMO1J'

/* ─── 時間軸（秒）：照影片逐格量的 ──────────────────────────────
   正面停約 1 秒 → 花約 2.2 秒翻到背面 → 背面停約 2.8 秒 → 原路翻回正面 → 再停約 1 秒，
   一輪 9 秒，一直重複。影片本身沒有進場，這裡補一段：
   徽章由小彈到正常大小（稍微衝過頭再回來），整塊同時淡入。 */
/** 整塊淡入（掛上去的第一幀才不會閃一下） */
const FADE = 0.5
/** 徽章彈出。back 的參數越大衝過頭越多，1.8 是有彈性但不誇張 */
const POP_IN = 0.7
const POP_EASE_IN = 'back.out(1.8)'
const FLIP = 2.225
const FLIP_TO_BACK_AT = 0.92
const FLIP_TO_FRONT_AT = 5.92
const CYCLE = 9

/**
 * 翻面的速度曲線：影片裡是等速轉（約 90°/s），只有頭尾各約 0.2 秒在加減速。
 * 用梯形速度：前 10% 等加速、中間等速、最後 10% 等減速（拿影片每一幀的角度擬合，誤差 < 1°）。
 * GSAP 內建的 sine / power1 都是中段快、頭尾慢太多，對不上。
 */
const FLIP_RAMP = 0.1
const FLIP_EASE = (p: number) => {
  const v = 1 / (1 - FLIP_RAMP)
  if (p < FLIP_RAMP) return (0.5 * v * p * p) / FLIP_RAMP
  if (p > 1 - FLIP_RAMP) return 1 - (0.5 * v * (1 - p) ** 2) / FLIP_RAMP
  return v * (p - FLIP_RAMP / 2)
}

/* ─── 徽章 ─── */

/** 「POST BOARD」沿著走的弧線：以徽章圓心為圓心、由左到右繞過上緣的半圓 */
const ARC_PATH = 'M64.6 230A165.4 165.4 0 0 1 395.4 230'
/** 稿子上這行字不是正置中，整行往順時針偏了一點（約 2.5px） */
const ARC_ROTATE = 'rotate(0.8 230 230)'
const arcId = `c-canvas-promo-arc-${useId()}`

/**
 * 背面的 QR：白色方點，三個定位點畫成圓環＋圓點（照影片的樣式）。
 * 用 qrcode 套件取得點陣自己畫，不另外放一個 SVG 檔 —— 網址改了只要改上面那一行。
 */
const buildQrPath = (url: string) => {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = modules.size
  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)

  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!isFinder(r, c) && modules.get(r, c)) d += `M${c} ${r}h1v1h-1z`
    }
  }

  // 定位點：外環半徑 3.5、內空 2.5（一格寬的環），中心實心圓半徑 1.5。
  // 三個同心圓靠 fill-rule: evenodd 挖出「環＋點」，所以 SCSS 那邊一定要設 evenodd
  const circle = (cx: number, cy: number, radius: number) =>
    `M${cx - radius} ${cy}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0z`
  for (const [cx, cy] of [[3.5, 3.5], [n - 3.5, 3.5], [3.5, n - 3.5]] as const) {
    d += circle(cx, cy, 3.5) + circle(cx, cy, 2.5) + circle(cx, cy, 1.5)
  }
  return { d, size: n }
}

const qr = buildQrPath(PROMO_QR_URL)
const qrPath = qr.d
/** QR 在背面佔的方框：左上 (162.5, 116.9)、邊長 135（外面那層 g 再整組上移 4） */
const qrTransform = `translate(162.5 116.9) scale(${135 / qr.size})`

/* ─── 萬聖節版（稿子畫板 03、04）─── */

/** 南瓜的外框（畫板座標）。徽章寬度＝原本圓片的直徑，高度照這個比例（見 themes/_halloween.scss） */
const HW_VIEWBOX = '74 255 916 936'
/** 南瓜上的圖文那張 SVG 跟 viewBox 同一個框 */
const HW_ART_BOX = { x: 74, y: 255, width: 916, height: 936 }
/** QR 在兩面都是同一個方框：左上 (417.8, 593.9)、邊長 244.4。稿子是 29 格的示意碼，這裡照實際網址的格數縮放 */
const hwQrTransform = `translate(417.8 593.9) scale(${244.4 / qr.size})`

/* ─── 動畫 ─── */

const rootRef = ref<HTMLElement | null>(null)
const badgeRef = ref<HTMLElement | null>(null)
const platesRef = ref<HTMLElement | null>(null)
const facesRef = ref<HTMLElement | null>(null)

let timeline: gsap.core.Timeline | null = null

onMounted(() => {
  // 圓片與圖文一起轉；正反面的切換靠 backface-visibility，轉到 90° 那一刻直接換（見 SCSS）
  const flips = [platesRef.value, facesRef.value]
  // 影片的時間軸從徽章完全出現後才開始算，正面的停留才不會被進場吃掉
  const start = Math.max(FADE, POP_IN)

  // 影片的一輪，無限重複
  const cycle = gsap.timeline({ repeat: -1 })
    // 翻到背面。負角度 = 右半邊朝鏡頭轉過來，跟影片同方向
    .to(flips, { rotationY: -180, duration: FLIP, ease: FLIP_EASE }, FLIP_TO_BACK_AT)
    // 原路翻回正面（影片是倒轉回去，不是繼續轉一圈）
    .to(flips, { rotationY: 0, duration: FLIP, ease: FLIP_EASE }, FLIP_TO_FRONT_AT)
    // 翻回正面後還要停到 9 秒才接下一輪
    .set({}, {}, CYCLE)

  timeline = gsap.timeline()
    // 進場：整塊淡入，徽章同時由小彈出來
    .fromTo(rootRef.value, { autoAlpha: 0 }, { autoAlpha: 1, duration: FADE, ease: 'none' }, 0)
    .fromTo(badgeRef.value, { scale: 0 }, { scale: 1, duration: POP_IN, ease: POP_EASE_IN }, 0)
    .add(cycle, start)
})

onUnmounted(() => {
  timeline?.kill()
  timeline = null
})
</script>
