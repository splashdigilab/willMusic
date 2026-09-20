/**
 * 把便利貼輸出成 1080×1080 的 PNG，交給系統分享面板或直接下載。
 *
 * 這段之所以複雜，全是為了繞過 html-to-image 在手機上的限制：
 * 它會把節點序列化成 SVG foreignObject，所以外部資源（字型、圖片、
 * 偽元素背景）在那個情境全部載不到，必須事先轉成 base64 帶進去；
 * 而 iOS Safari 的記憶體上限又很容易被高解析度 canvas 撐爆。
 */
import { nextTick, ref, type Ref } from 'vue'
import { toPng } from 'html-to-image'

/** 輸出解析度。2x 太吃記憶體，1.5 省約 44% 且手機上畫質仍足夠 */
const EXPORT_PIXEL_RATIO = 1.5
/** 預熱用的低解析度，只是為了逼 html-to-image 先把資源綁好 */
const WARMUP_PIXEL_RATIO = 0.5
/** 預熱後給瀏覽器的渲染緩衝 */
const WARMUP_SETTLE_MS = 300

const FILE_NAME = 'willmusic-note.png'

export interface UseNoteExportOptions {
  /** 便利貼的背景圖 URL，會先預載確保 html-to-image 抓得到 */
  getBackgroundUrl: () => string | undefined
  /** 這張便利貼的文字，用來決定要嵌入哪些字型分片 */
  getText: () => string
  /** 非「使用者主動取消」的失敗要怎麼通知使用者 */
  onError: (message: string) => void
}

const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

/** 解析 @font-face 的 unicode-range，回傳 [起, 迄] 區間陣列 */
const parseUnicodeRange = (value: string): Array<[number, number]> =>
  value
    .split(',')
    .map(part => part.trim().replace(/^u\+/i, ''))
    .filter(Boolean)
    .map((part): [number, number] => {
      const [lo, hi] = part.split('-')
      const start = parseInt(lo ?? '', 16)
      return [start, hi ? parseInt(hi, 16) : start]
    })
    .filter(([lo, hi]) => Number.isFinite(lo) && Number.isFinite(hi))

/**
 * 只挑出「這張便利貼實際用到的字」所在的字型分片並轉成 base64。
 *
 * 全站字型是 870+ 個 unicode-range 分片（約 6.6MB），若讓 html-to-image
 * 自己讀 cssRules 會全部抓下來，手機直接 OOM。
 */
const buildFontEmbedCSS = async (text: string): Promise<string> => {
  const wanted = [...new Set([...text].map(c => c.codePointAt(0) ?? 0))].filter(Boolean)
  if (wanted.length === 0) return ''

  const sheets = await Promise.all(
    ['/fonts/line-seed-ui.css', '/fonts/line-seed.css'].map(async (href) => {
      try {
        const res = await fetch(href)
        return res.ok ? await res.text() : ''
      } catch (e) {
        console.warn('[FontEmbed] 讀取字型 CSS 失敗:', href, e)
        return ''
      }
    })
  )

  const blocks = sheets.join('\n').match(/@font-face\s*\{[^}]*\}/g) ?? []
  const needed = blocks.filter((block) => {
    const declared = /unicode-range:\s*([^;}]+)/i.exec(block)
    // 沒宣告 unicode-range 代表涵蓋全部字元，保守起見留著
    if (!declared) return true
    const ranges = parseUnicodeRange(declared[1] ?? '')
    return wanted.some(cp => ranges.some(([lo, hi]) => cp >= lo && cp <= hi))
  })

  const embedded = await Promise.all(
    needed.map(async (block) => {
      const url = /url\(["']?([^"')]+)["']?\)/.exec(block)?.[1]
      if (!url) return null
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        const base64 = await blobToDataURL(await res.blob())
        return block.replace(url, base64)
      } catch (e) {
        console.warn('[FontEmbed] 字型分片下載失敗:', url, e)
        return null
      }
    })
  )

  return embedded.filter((css): css is string => !!css).join('\n')
}

/** 使用者在系統分享面板按「取消」時 navigator.share 會丟 AbortError，不該當成錯誤 */
const isAbortError = (error: any): boolean => {
  const name = error?.name || ''
  const message = error?.message || ''
  return (
    name === 'AbortError' ||
    message.includes('AbortError') ||
    message.includes('The user aborted') ||
    message.includes('canceled') ||
    message.includes('cancelled')
  )
}

export function useNoteExport(
  exportNodeRef: Ref<HTMLElement | null>,
  { getBackgroundUrl, getText, onError }: UseNoteExportOptions
) {
  const isSharing = ref(false)
  /** 控制 1080px export node 的掛載時機：只在分享當下才建立，避免長期佔用 GPU 記憶體 */
  const showExportNode = ref(false)

  const share = async () => {
    if (isSharing.value) return
    isSharing.value = true

    try {
      // 1. 掛載 export node
      showExportNode.value = true
      await nextTick()
      // 讓瀏覽器完成 layout 與 paint（雙 RAF 確保 CSS mask 與背景圖都已渲染）
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )

      const node = exportNodeRef.value
      if (!node) throw new Error('Export node not ready')

      // 2. 強制預載背景圖片，確保瀏覽器快取中已經具備該圖，防止 html-to-image 抓不到
      const bgUrl = getBackgroundUrl()
      if (bgUrl) {
        await new Promise((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = resolve
          img.onerror = resolve
          img.src = bgUrl
        })
      }

      // 3. 強制載入 export node 內所有圖片
      // StickyNote 的 <img> 帶有 loading="lazy" + decoding="async"，
      // 在畫面外（-9999px）不會自動載入；必須改成 eager/sync 才能截到完整內容。
      const exportImgs = Array.from(node.querySelectorAll('img'))
      for (const img of exportImgs) {
        img.loading = 'eager'
        img.decoding = 'sync'
        // 若圖片尚未開始載入（src 存在但 naturalWidth=0），重設 src 觸發載入
        if (!img.complete || img.naturalWidth === 0) {
          const src = img.src
          img.src = ''
          img.src = src
        }
      }
      // 等待所有圖片完成載入（含 base64 drawing 與 SVG 貼紙）
      await Promise.all(
        exportImgs.map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve()
          return new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
        })
      )

      // 4. 預先嵌入字型：只挑這張便利貼用到的字所在的 LINE Seed 分片
      const fontEmbedCSS = await buildFontEmbedCSS(getText())

      // 4b. 注入紙張材質 base64
      // ::after 偽元素的 background-image 若為相對 URL，off-screen 截圖時找不到；
      // 改為先 fetch 成 base64，再用 <style> 直接覆寫，確保紙紋被完整輸出。
      let injectedTextureStyle: HTMLStyleElement | null = null
      try {
        const textureRes = await fetch('/paperTexture.webp')
        if (textureRes.ok) {
          const textureBase64 = await blobToDataURL(await textureRes.blob())
          injectedTextureStyle = document.createElement('style')
          injectedTextureStyle.textContent = `
          .c-sticky-note__inner::after {
            background-image: url('${textureBase64}') !important;
          }
        `
          node.appendChild(injectedTextureStyle)
        }
      } catch (e) {
        console.warn('[Export] 紙張材質嵌入失敗:', e)
      }

      // 5. 針對 iOS 的預熱 Hack：低解析度先跑一次，逼 html-to-image 綁定資源
      await toPng(node, {
        cacheBust: true,
        fontEmbedCSS,
        pixelRatio: WARMUP_PIXEL_RATIO
      }).catch(() => {})

      await new Promise(resolve => setTimeout(resolve, WARMUP_SETTLE_MS))

      // 6. 正式輸出
      const dataUrl = await toPng(node, {
        pixelRatio: EXPORT_PIXEL_RATIO,
        cacheBust: true,
        fontEmbedCSS
      })

      // export node 即將卸載，這步可省略，但保持乾淨
      injectedTextureStyle?.remove()

      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], FILE_NAME, { type: 'image/png' })

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'WillMusic 便利貼',
          text: '這是我剛畫好的便利貼！',
          files: [file]
        })
      } else {
        const link = document.createElement('a')
        link.download = FILE_NAME
        link.href = dataUrl
        link.click()
      }
    } catch (error: any) {
      if (isAbortError(error)) {
        console.warn('使用者取消分享/下載動作:', error)
      } else {
        console.error('分享失敗:', error)
        onError('圖片生成失敗，請稍後再試')
      }
    } finally {
      isSharing.value = false
      // 分享完成後立即卸載 export node，釋放 GPU 記憶體
      showExportNode.value = false
    }
  }

  return { isSharing, showExportNode, share }
}
