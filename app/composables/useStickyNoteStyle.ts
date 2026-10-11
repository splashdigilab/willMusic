import { computed, type Ref } from 'vue'
import { getShapeById, DEFAULT_SHAPE_ID } from '~/data/shapes'
import { isColorMaterial } from '~/data/backgrounds'

export interface StickyNoteStyleProps {
    shape?: string
    textColor?: string
    textAlign?: string
    fontFamily?: string
    backgroundImage?: string
}

/**
 * 將相對路徑轉換為絕對 URL（僅在瀏覽器環境）
 * 供需要絕對 URL 的場景使用（例如 html-to-image 匯出）
 */
export const getAbsoluteUrl = (url?: string): string => {
    if (!url) return ''
    if (url.startsWith('http') || url.startsWith('data:')) return url
    if (typeof window !== 'undefined') {
        return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
    }
    return url
}

export function useStickyNoteStyle(styleRef: Ref<StickyNoteStyleProps>) {
    // 查不到的造型（例如已下架、拼錯）一律退回預設的正方形
    const shape = computed(() =>
        getShapeById(styleRef.value.shape || DEFAULT_SHAPE_ID) ?? getShapeById(DEFAULT_SHAPE_ID)
    )

    // mask-image 直接使用 Illustrator 輸出的 SVG（無需 clipPath），遮罩 = 形狀的填色區域
    // 使用相對路徑，避免 SSR hydration mismatch（server 無法解析 window.location.origin）
    const shapeMaskUrl = computed(() => shape.value?.svg ?? '/svg/shapes/square.svg')

    // 外層容器：負責位置與字體大小。
    // --note-mask 給「要描出便利貼輪廓」的頁面用（例如我的便利貼的細外框）
    const wrapperStyles = computed(() => {
        const fontPct = 4
        const maskUrl = shapeMaskUrl.value
        return {
            color: styleRef.value.textColor || '#333',
            textAlign: (styleRef.value.textAlign || 'center') as any,
            ...(styleRef.value.fontFamily ? { fontFamily: styleRef.value.fontFamily } : {}),
            '--font-size-pct': fontPct,
            '--note-mask': `url(${maskUrl})`
        }
    })

    // 陰影層：預先算好的陰影圖，墊在內層底下（見 _sticky-note.scss 的 sticky-note-shadow-layer）。
    // 寫成 inline 的 background-image 而不是放在 CSS 偽元素裡：分享圖（html-to-image）
    // 只會把元素本身的背景圖轉成 base64 帶進去，偽元素的背景在那裡載不到。
    const shadowStyles = computed(() => ({
        backgroundImage: `url(${shape.value?.shadow ?? '/svg/shapes/shadow/square.webp'})`
    }))

    // 遮罩層：負責形狀裁切，比內層大一圈（見 _sticky-note.scss 的 sticky-note-mask-layer）。
    // 這裡只給遮罩圖，大小與位置寫在 SCSS
    const maskStyles = computed(() => {
        const maskUrl = shapeMaskUrl.value
        return {
            maskImage: `url(${maskUrl})`,
            WebkitMaskImage: `url(${maskUrl})`
        }
    })

    // 內層容器：600×600 的底色／材質圖，文字、貼紙、手繪都放在這裡面
    const innerStyles = computed(() => {
        const material = styleRef.value.backgroundImage || ''
        // 材質同時支援純色與圖片：開頭為 # 視為色碼（新視覺），否則視為圖片路徑（既有資料）
        return !material
            ? {}
            : isColorMaterial(material)
                ? { backgroundColor: material }
                : {
                    backgroundImage: `url(${material})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }
    })

    return {
        wrapperStyles,
        maskStyles,
        innerStyles,
        shadowStyles,
        shapeMaskUrl
    }
}
