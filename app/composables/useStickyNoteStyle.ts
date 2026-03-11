import { computed, type Ref } from 'vue'
import { getShapeById, DEFAULT_SHAPE_ID } from '~/data/shapes'

export interface StickyNoteStyleProps {
    shape?: string
    textColor?: string
    textAlign?: string
    fontFamily?: string
    backgroundImage?: string
}

export function useStickyNoteStyle(styleRef: Ref<StickyNoteStyleProps>) {
    const getAbsoluteUrl = (url?: string) => {
        if (!url) return ''
        if (url.startsWith('http') || url.startsWith('data:')) return url
        if (typeof window !== 'undefined') {
            return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
        }
        return url
    }

    // mask-image 直接使用 Illustrator 輸出的 SVG（無需 clipPath），遮罩 = 形狀的填色區域
    const shapeMaskUrl = computed(() => {
        const shapeId = styleRef.value.shape || DEFAULT_SHAPE_ID
        const shapeData = getShapeById(shapeId)
        const s = shapeData ?? getShapeById(DEFAULT_SHAPE_ID)
        return getAbsoluteUrl(s ? s.svg : '/svg/shapes/square.svg')
    })

    // 外層容器：負責位置與字體大小，並且加上 drop-shadow（不可含有 mask）
    const wrapperStyles = computed(() => {
        const fontPct = 4
        const maskUrl = shapeMaskUrl.value
        return {
            color: styleRef.value.textColor || '#333',
            textAlign: (styleRef.value.textAlign || 'center') as any, // explicit bypass for TS
            ...(styleRef.value.fontFamily ? { fontFamily: styleRef.value.fontFamily } : {}),
            '--font-size-pct': fontPct,
            '--shadow-mask': `url(${maskUrl})`
        }
    })

    // 內層容器：負責形狀裁切與背景圖片（mask 會切掉此層所有內容，所以不可放 drop-shadow）
    const innerStyles = computed(() => {
        const maskUrl = shapeMaskUrl.value
        const bgUrl = getAbsoluteUrl(styleRef.value.backgroundImage)
        const bgStyles = bgUrl ? {
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        } : {}
        return {
            ...bgStyles,
            maskImage: `url(${maskUrl})`,
            maskSize: '100% 100%',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskImage: `url(${maskUrl})`,
            WebkitMaskSize: '100% 100%',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center'
        }
    })

    return {
        wrapperStyles,
        innerStyles,
        shapeMaskUrl
    }
}
