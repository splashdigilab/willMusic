<template>
  <div
    ref="noteRef"
    class="c-sticky-note"
    :data-shape="note.style.shape || 'rounded'"
  >
    <div class="c-sticky-note__scaler" :style="[scalerStyle, wrapperStyles]">
      <!-- 陰影：預先算好的形狀陰影圖，墊在便利貼底下（見 shapes.ts 的 shadow） -->
      <div class="c-sticky-note__shadow" :style="shadowStyles" aria-hidden="true" />
      <!-- 遮罩層比內層大一圈，避免 WebKit 在遮罩邊緣漏出底色（見 _sticky-note.scss） -->
      <div class="c-sticky-note__mask" :style="maskStyles">
      <div class="c-sticky-note__inner" :style="innerStyles">
      <!-- 多文字區塊：每個區塊各自位置、顏色、對齊 -->
      <template v-if="textBlocks.length">
        <div
          v-for="block in textBlocks"
          :key="block.id"
          class="c-sticky-note__content-wrap"
          :style="getBlockWrapStyle(block)"
        >
          <div
            class="c-sticky-note__content"
            :style="{ color: block.color, textAlign: block.align }"
          >
            {{ block.content }}
          </div>
        </div>
      </template>
      <!-- 單一文字（舊格式） -->
      <div
        v-else
        class="c-sticky-note__content-wrap"
        :style="contentWrapStyle"
      >
        <div class="c-sticky-note__content">
          {{ note.content }}
        </div>
      </div>
      <!-- 貼紙 -->
      <div
        v-for="sticker in stickers"
        :key="sticker.id"
        class="c-sticky-note__sticker"
        :style="getStickerWrapStyle(sticker)"
      >
        <img 
          v-if="getStickerData(sticker.type)?.svgFile"
          :src="getStickerData(sticker.type)?.svgFile"
          :alt="getStickerData(sticker.type)?.id"
          class="c-sticky-note__sticker-img"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
        />
      </div>
      <!-- 手繪：第一輪是 drawing，之後幾輪是 drawingLayers，各自照 objectLayerOrder 的前後
           （見 NOTE_LAYER_Z）。前後要跟編輯器一致，不然在貼紙上畫的線在預覽與大螢幕上會被貼紙蓋掉 -->
      <img
        v-if="drawingSrc"
        :src="drawingSrc"
        alt=""
        class="c-sticky-note__drawing"
        :style="drawingStyle"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
      />
      <img
        v-for="layer in drawingLayers"
        :key="layer.id"
        :src="layer.src"
        alt=""
        class="c-sticky-note__drawing"
        :style="{ zIndex: layerZ(layer.id, NOTE_LAYER_Z.drawingAboveStickers) }"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
      />
      <!-- 署名。疊在所有東西上面（見 nameTagStyle），沒有就是匿名投稿 -->
      <div v-if="nameTag" class="c-sticky-note__name-tag" :style="nameTagStyle">
        <NoteNameTag :name="nameTag.name" :avatar="nameTagAvatar" />
      </div>
    </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DrawingLayer, QueuePendingItem, QueueHistoryItem, StickerInstance, TextBlockInstance } from '~/types'
import { STICKER_LIBRARY } from '~/data/stickers'
import { getShapeById, DEFAULT_SHAPE_ID } from '~/data/shapes'
import { getTextBlockStyle, getStickerStyle, NOTE_LAYER_Z, DRAWING_LAYER_ID, drawingLayerZ } from '~/utils/sticky-note-style'
import { useStickyNoteStyle, type StickyNoteStyleProps } from '~/composables/useStickyNoteStyle'
import { isInlineAvatar } from '~/utils/name-tag'
import { isNoteDrawingSrc } from '~/utils/note-drawings'
import NoteNameTag from '~/components/NoteNameTag.vue'

interface Props {
  note: QueuePendingItem | QueueHistoryItem
  animate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  animate: false
})

const noteRef = ref<HTMLElement | null>(null)

const stickers = computed(() => {
  return props.note.style?.stickers || []
})

const textBlocks = computed<TextBlockInstance[]>(() => props.note.style?.textBlocks ?? [])

/**
 * 前後順序（見 NOTE_LAYER_Z）：新的便利貼每個物件都有記錄，照記錄排；
 * 沒有記錄的（舊便利貼）照固定值，已經上牆的內容不會因此變樣。
 * 只收數字：【過渡期】的舊格式什麼 style 都收，不是數字的值會讓署名的 z-index 算成 NaN
 */
const objectLayerOrder = computed<Record<string, number>>(() => {
  const raw: unknown = props.note.style?.objectLayerOrder
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(Object.entries(raw).filter(([, z]) => typeof z === 'number' && Number.isFinite(z)))
})

const layerZ = (id: string, fallback: number) => objectLayerOrder.value[id] ?? fallback

const getBlockWrapStyle = (block: TextBlockInstance) => {
  const base = getTextBlockStyle(block.x, block.y, block.scale, block.rotation)
  return { ...base, zIndex: layerZ(block.id, NOTE_LAYER_Z.text) }
}

const getStickerWrapStyle = (sticker: StickerInstance) => {
  const base = getStickerStyle(sticker)
  return { ...base, zIndex: layerZ(sticker.id, NOTE_LAYER_Z.sticker) }
}

const drawingStyle = computed(() => ({
  zIndex: layerZ(DRAWING_LAYER_ID, drawingLayerZ(props.note.style?.drawingAboveStickers))
}))

/**
 * 手繪圖只顯示本站的，理由見 isNoteDrawingSrc。drawingLayers 不是陣列、或某一張欄位不對，
 * 一樣是【過渡期】舊格式才寫得進來的，當作沒有，不能讓整張便利貼（以及大螢幕整面牆）跟著出錯
 */
const storageBucket = useRuntimeConfig().public.firebase?.storageBucket ?? ''
const drawingSrc = computed(() => {
  const src = props.note.style?.drawing
  return isNoteDrawingSrc(src, storageBucket) ? src : null
})
const drawingLayers = computed(() => {
  const raw: unknown = props.note.style?.drawingLayers
  if (!Array.isArray(raw)) return []
  return raw.filter((l): l is DrawingLayer => typeof l?.id === 'string' && isNoteDrawingSrc(l.src, storageBucket))
})

const nameTag = computed(() => {
  const tag = props.note.style?.nameTag
  return tag && typeof tag.name === 'string' && tag.name ? tag : null
})

// 規則只收 data URL，這裡再擋一次：規則還沒部署到的期間寫進來的外部網址，
// 不該讓牆上的圖片由別人的主機供應。擋掉就退成暱稱第一個字
const nameTagAvatar = computed(() => (isInlineAvatar(nameTag.value?.avatar) ? nameTag.value!.avatar : null))

/** 署名在所有東西上面：至少 NOTE_LAYER_Z.nameTag，有記錄順序的便利貼就放在最上面那個的再上一層 */
const nameTagStyle = computed(() => (nameTag.value
  ? {
      ...getStickerStyle(nameTag.value),
      zIndex: Math.max(NOTE_LAYER_Z.nameTag, ...Object.values(objectLayerOrder.value).map(z => z + 1))
    }
  : undefined))

const noteStyleProps = computed<StickyNoteStyleProps>(() => ({
  shape: props.note.style.shape || DEFAULT_SHAPE_ID,
  textColor: props.note.style.textColor,
  textAlign: props.note.style.textAlign || 'center',
  fontFamily: props.note.style.fontFamily || 'inherit',
  backgroundImage: props.note.style.backgroundImage
}))

const { wrapperStyles, maskStyles, innerStyles, shadowStyles } = useStickyNoteStyle(noteStyleProps)

const contentWrapStyle = computed(() => {
  const t = props.note.style?.textTransform
  const x = t?.x ?? 50
  const y = t?.y ?? 50
  const scale = t?.scale ?? 1
  const rotation = t?.rotation ?? 0
  return getTextBlockStyle(x, y, scale, rotation)
})

const getStickerData = (type: string) => STICKER_LIBRARY.find(s => s.id === type)

// GSAP 動畫（如果需要）與縮放
const VIRTUAL_SIZE = 600

// scaler 是固定 600×600，要縮到多小得先量到容器寬度，而那要等 onMounted。
// 在那之前先不要畫出來：否則新便利貼的第一幀會以 600px 全尺寸、
// 從左上角（transform-origin: 0 0）展開，看起來就是閃一下。
// 量到寬度後（含 ResizeObserver 的後續變化）才切回 visible。
// --note-scale 讓頁面能把「螢幕上的 1px」換算回 600px 畫布裡的長度（例如我的便利貼的細外框）
const scalerStyle = ref<Record<string, string>>({
  transform: 'scale(1)',
  visibility: 'hidden'
})

function updateScale() {
  if (noteRef.value) {
    const width = noteRef.value.clientWidth
    if (width > 0) {
      const scale = width / VIRTUAL_SIZE
      scalerStyle.value = {
        transform: `scale(${scale})`,
        visibility: 'visible',
        '--note-scale': String(scale)
      }
    }
  }
}

let ro: ResizeObserver | null = null

onMounted(async () => {
  updateScale()

  // 使用 ResizeObserver 監聽大小變化，保證 GSAP Flip 重排後 scale 始終正確
  if (noteRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { updateScale() })
    ro.observe(noteRef.value)
  }

  if (props.animate && import.meta.client && noteRef.value) {
    // 只在實際需要動畫時才載入 GSAP，減少不需要動畫時的記憶體與解析成本
    const { gsap } = await import('gsap')
    gsap.from(noteRef.value, {
      scale: 0,
      rotation: -180,
      opacity: 0,
      duration: 0.6,
      ease: 'back.out(1.7)'
    })
  }
})

onUnmounted(() => {
  ro?.disconnect()
})
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/components/_sticky-note.scss */
</style>
