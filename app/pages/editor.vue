<template>
  <div class="p-editor">
      <!-- 稿子的編輯器畫面沒有上方橫條，返回與說明改為浮動圓鈕（與首頁一致） -->
      <div class="p-editor__float-actions">
        <button type="button" class="p-index__icon-btn" aria-label="返回" @click="goBack">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 18l-6-6 6-6"></path>
          </svg>
        </button>
        <button type="button" class="p-index__icon-btn" aria-label="說明" @click="showTutorialModal = true">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </button>
      </div>

      <!-- 全部重來：分頁列拿掉後失去了原本的位置，改放右上角。
           左邊兩顆是導覽、用慣用圓圖示就夠；這顆是畫面上唯一不可復原的動作，
           所以做成帶字的藥丸，而且圖示是「重新開始」的繞圈箭頭，不是返回箭頭 ——
           返回箭頭會被讀成「退回一步」，跟它實際做的事差太多。 -->
      <div class="p-editor__float-actions p-editor__float-actions--right">
        <button
          type="button"
          class="p-editor__reset-btn"
          :disabled="!hasAnyContent"
          @click="handleClearAll"
        >
          <svg class="p-editor__reset-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.5 12a8.5 8.5 0 1 1 2.8 6.3" />
            <path d="M3 6.5V12h5.5" />
          </svg>
          全部重來
        </button>
      </div>

      <!-- 活動規範滿版 overlay：版面與首頁開場完全共用，只有文字不同 -->
      <Transition name="intro-fade">
        <div v-if="showIntroOverlay" class="p-index__intro-overlay p-editor__intro-overlay">
          <div class="p-index__intro-card">
            <!-- 四角裝飾方塊 -->
            <div class="p-index__intro-marks p-index__intro-marks--tl">
              <i class="p-index__intro-mark" /><i class="p-index__intro-mark" /><i class="p-index__intro-mark" />
            </div>
            <div class="p-index__intro-marks p-index__intro-marks--br">
              <i class="p-index__intro-mark" /><i class="p-index__intro-mark" /><i class="p-index__intro-mark" />
            </div>

            <!-- 卡片上下的英文小字 -->
            <p class="p-index__intro-caption p-index__intro-caption--top">Create your customized message here<br>and share your passion for music with everyone.</p>
            <p class="p-index__intro-caption p-index__intro-caption--bottom">Create your customized message here<br>and share your passion for music with everyone.</p>

            <h1 class="p-index__intro-title">
              <span>活動規範</span>
              <span>RULES</span>
            </h1>

            <div class="p-index__intro-desc p-index__intro-rules">
              <ol>
                <li>於南西旗艦店消費達 599 元，即可獲得一張數位應援便利貼。</li>
                <li>取得便利貼後，須於 30 分鐘內完成個人專屬內容製作並送出。（禁止任何敏感詞彙或圖像；如有違反，品牌有權不另行通知逕行撤下內容。若多次惡意違規，將依情節嚴重程度採取相應處置。微樂客對違規內容保有最終解釋之權利）</li>
                <li>便利貼內容經審核通過後，將於 LED 牆輪播展示，並輪流放大顯示 15 秒。</li>
              </ol>
              <label class="p-index__intro-terms">
                <input type="checkbox" v-model="termsAccepted" />
                <span>我已閱讀並同意上述活動規範</span>
              </label>
            </div>

            <button
              type="button"
              class="p-index__intro-btn"
              :disabled="loading"
              @click="onStartClick"
            >
              <span v-if="loading" class="p-index__intro-btn-inner">
                <span class="p-index__intro-spinner" aria-hidden="true" />
                載入中...
              </span>
              <span v-else>START</span>
            </button>
          </div>

          <img src="/willMusicLogo.png" alt="WillMusic" class="p-index__intro-logo" />
        </div>
      </Transition>

    <!-- Tutorial Modal -->
    <EditorTutorialModal v-model="showTutorialModal" />

    <AppModal
      v-model="showTermsModal"
      title="提示"
      message="請先閱讀並同意活動規範"
      confirm-text="確定"
      cancel-text=""
      @confirm="showTermsModal = false"
    />

    <!-- Draft Modal -->
    <AppModal
      v-model="showDraftModal"
      icon="📝"
      title="發現草稿"
      message="您有一份未完成的草稿，要繼續編輯還是重新開始？"
      confirmText="使用草稿"
      cancelText="重新開始"
      @confirm="handleDraftDecision(true)"
      @cancel="handleDraftDecision(false)"
    />

    <!-- Exit Confirmation Modal -->
    <AppModal
      v-model="showExitModal"
      title="確定離開？"
      message="目前的進度已經為您自動儲存為草稿。確定要離開編輯器嗎？"
      confirmText="確定離開"
      cancelText="留在本頁"
      @confirm="handleExitConfirm"
      @cancel="showExitModal = false"
    />

    <!-- Alert Modal -->
    <AppModal
      v-model="showAlertModal"
      :icon="alertIcon"
      :title="alertTitle"
      :message="alertMessage"
      :confirmText="alertConfirmText"
      :cancelText="''"
      @confirm="handleAlertConfirm"
    />

    <!-- Submit Confirmation Modal。
         分享便利貼原本在中樞那一列，線性流程沒有中樞了，改放這裡：
         這個 modal 本來就有預覽，看著成品決定要存到手機還是送上大螢幕是同一個當下的事。 -->
    <AppModal
      v-model="showSubmitModal"
      title="確認上傳"
      message="請確認您的便利貼樣貌，上傳後將無法修改。"
      :loading="isSubmitting"
      @confirm="confirmSubmit"
      @cancel="showSubmitModal = false"
    >
      <template #preview>
        <StickyNote v-if="previewNoteData" :note="previewNoteData" />
      </template>
      <template #secondary-action>
        <button
          type="button"
          class="c-modal__side-btn"
          :disabled="isSubmitting || isSharing"
          @click="handleShare"
        >
          {{ isSharing ? '處理中...' : '分享便利貼' }}
        </button>
      </template>
    </AppModal>

    <!-- Clear All Confirmation Modal -->
    <AppModal
      v-model="showClearAllModal"
      icon="⚠️"
      title="確認清除嗎？"
      message="－ 此動作將無法復原 －"
      confirmText="確認"
      cancelText="取消"
      @confirm="confirmClearAll"
      @cancel="showClearAllModal = false"
    />

    <!-- Canvas Area -->
    <div class="p-editor__canvas-section">
      <div
        ref="canvasRef"
        class="p-editor__canvas-container"
        :class="{ 'is-draw-mode': drawMode }"
        @click="deselectAll"
        @mousedown="onCanvasMouseDown"
        @touchstart.capture="onCanvasTouchStart"
        @touchmove.capture="onCanvasTouchMove"
        @touchend.capture="onCanvasTouchEnd"
        @touchcancel.capture="onCanvasTouchEnd"
      >
        <!-- 虛擬縮放層：永遠固定 600px 大小 -->
        <div class="p-editor__canvas-scaler" :style="[scalerStyle, wrapperStyles]">
          <!-- 可裁切層：背景、文字內容、貼紙圖片 -->
          <div class="p-editor__canvas p-editor__canvas--stage" :style="canvasStyle">
            <!-- 文字內容（可裁切）— 多文字區塊 -->
          <div
            v-for="block in textBlocks"
            :key="block.id"
            :data-text-block-id="block.id"
            class="p-editor__text-content"
            :style="[getTextBlockStyleComputed(block), drawMode ? STYLE_POINTER_NONE : STYLE_EMPTY, { zIndex: NOTE_LAYER_Z.text }]"
            @click.stop="() => { if (!drawMode) selectTextBlock(block.id) }"
          >
            <!-- 外層包裹器：接收 padding，點擊時觸發拖曳 -->
            <div
              class="p-editor__canvas-text-wrapper"
              :style="getTextStyleForBlock(block)"
              @touchstart="onLockedTextTouchStart(block.id, $event)"
              @touchend="onLockedTextTouchEnd"
              @touchcancel="onLockedTextTouchEnd"
            >
              <div
                :ref="(el: any) => setContentEditableRef(block.id, el)"
                class="p-editor__canvas-text"
                :class="{
                  'is-empty': !block.content.trim() && !(selectedTextBlockId === block.id && isComposing),
                  'is-locked': block.locked
                }"
                :contenteditable="activeTab === 'text' && !block.locked"
                @compositionstart="() => { isComposing = true }"
                @compositionend="(e: Event) => handleCompositionEnd(e, block.id)"
                @input="(e: Event) => handleTextInput(e, block.id)"
                @click.stop="() => { if (!drawMode && !block.locked) selectTextBlock(block.id) }"
                @focus="() => { if (!drawMode && !block.locked) selectTextBlock(block.id) }"
                data-placeholder="在這裡輸入文字..."
              />
            </div>
          </div>

          <!-- 貼紙圖片（可裁切）；便利貼/文字 tab 時點擊可進入貼紙編輯 -->
          <div
            v-for="sticker in stickers"
            :key="sticker.id"
            class="p-editor__sticker-content"
            :class="{ 'is-sticker-clickable': !drawMode }"
            :style="[getStickerStyle(sticker), { zIndex: NOTE_LAYER_Z.sticker }]"
            @click.stop="selectSticker(sticker.id)"
            @touchstart.stop="() => { if (!isTwoFingerGesture) selectSticker(sticker.id) }"
          >
            <img 
              v-if="getStickerById(sticker.type)?.svgFile"
              :src="getStickerById(sticker.type)?.svgFile"
              :alt="getStickerById(sticker.type)?.id"
              class="p-editor__sticker-img"
            />
          </div>

          <!-- 手繪層 (Fabric.js) -->
          <div
            ref="drawingLayerRef"
            class="p-editor__drawing-layer"
            :class="{ 'is-active': drawMode }"
            :style="{ 
              pointerEvents: drawMode ? 'auto' : 'none',
              zIndex: drawMode ? DRAW_MODE_LAYER_Z : NOTE_LAYER_Z.drawing
            }"
          >
            <!-- Fabric.js canvas：始終留在 DOM（init 需要），縮小後視覺空白 -->
            <canvas ref="drawingCanvasRef" class="p-editor__drawing-canvas" />
            <!-- 非繪圖模式時，用已儲存的 PNG 靜態預覽蓋住空白的縮小 canvas -->
            <img
              v-if="!drawMode && drawingData"
              :src="drawingData"
              class="p-editor__drawing-preview"
              alt=""
              draggable="false"
            />
          </div>
        </div>

        <!-- UI 層：編輯框置頂，不被裁切（繪圖模式時隱藏以便手繪） -->
        <div class="p-editor__canvas-ui" :style="{ pointerEvents: drawMode ? 'none' : undefined }">
          <!-- 中心對齊參考線 -->
          <div
            v-if="showVerticalCenterGuide"
            class="p-editor__guide-line p-editor__guide-line--vertical"
            aria-hidden="true"
          />
          <div
            v-if="showHorizontalCenterGuide"
            class="p-editor__guide-line p-editor__guide-line--horizontal"
            aria-hidden="true"
          />
          <!-- 文字區塊編輯框：僅在文字 tab 且該區塊被選取時顯示；按完成後消失 -->
          <div
            v-for="block in textBlocks"
            :key="`ui-text-${block.id}`"
            v-show="!drawMode && selectedTextBlockId === block.id"
            :data-text-block-id="block.id"
            class="p-editor__edit-frame p-editor__edit-frame--text"
            :class="{ 
              'is-selected': selectedTextBlockId === block.id,
              'is-dragging': textBlockDragging && selectedTextBlockId === block.id,
              'is-transforming': textBlockTransforming && selectedTextBlockId === block.id
            }"
            :style="[getTextBlockStyleComputed(block), { zIndex: NOTE_LAYER_Z.text }]"
            @mousedown="() => selectTextBlock(block.id)"
            @touchstart="() => { if (!isTwoFingerGesture) selectTextBlock(block.id) }"
          >
            <!-- 隱藏 sizer：與 contenteditable 同字體/padding，讓編輯框寬高與文字一致；空白時用 placeholder 撐開寬度。
                 判斷「是否為空」必須與上方 is-empty 的 .trim() 一致 —— 刪光文字後瀏覽器常留下一個換行，
                 若只用 || 判斷會認為有內容，量尺量到換行就把編輯框縮成一條。 -->
            <span class="p-editor__edit-frame-sizer" aria-hidden="true" :style="getTextStyleForBlock(block)">{{ sizerTextFor(block) }}</span>
            <!-- 刪除按鈕 -->
            <button
              v-if="selectedTextBlockId === block.id"
              class="p-editor__edit-frame-delete"
              @click.stop="removeTextBlock(block.id)"
              @touchstart.stop.prevent="removeTextBlock(block.id)"
              aria-label="刪除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 貼紙編輯框：在貼紙 tab，或 default 狀態且有選取貼紙時顯示 -->
          <div
            v-for="sticker in stickers"
            :key="`ui-${sticker.id}`"
            v-show="showStickerEditFrame && selectedStickerId === sticker.id"
            class="p-editor__edit-frame p-editor__edit-frame--sticker"
            :data-sticker-id="sticker.id"
            :class="{ 
              'is-selected': selectedStickerId === sticker.id,
              'is-dragging': draggingStickerId === sticker.id,
              'is-transforming': transformingStickerId === sticker.id
            }"
            :style="[getStickerStyle(sticker), { zIndex: NOTE_LAYER_Z.sticker }]"
            @mousedown="onStickerMouseDown($event, sticker)"
            @touchstart="onStickerTouchStart($event, sticker)"
            @click.stop="onStickerClick(sticker.id)"
          >
            <button
              class="p-editor__edit-frame-delete"
              @click.stop="removeSticker(sticker.id)"
              @touchstart.stop.prevent="removeSticker(sticker.id)"
              aria-label="刪除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <!-- <div
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTransformHandleMouseDown($event, sticker)"
              @touchstart.stop="onTransformHandleTouchStart($event, sticker)"
            >
              ↻
            </div> -->
          </div>
        </div>
        </div>
      </div>
    </div>


    <!-- 控制面板 + 底部按鈕列：包在同一層，漸層底才會連續。
         兩者原本是並排的兄弟元素，按鈕列自己塗白底才看起來相連。 -->
    <div class="p-editor__panel-wrap">
      <!-- 步驟指示，同時也是捷徑：點了直接跳，不必一路按上一步。
           絕對定位貼在面板右上與 STEP 標題同一條水平線，所以不佔面板高度。 -->
      <div class="p-editor__step-nav">
        <button
          v-for="(s, i) in EDITOR_STEPS"
          :key="s.id"
          type="button"
          class="p-editor__step-dot"
          :class="{ 'is-active': step === i, 'is-done': i < step }"
          :aria-label="`第 ${i + 1} 步：${s.label}`"
          :aria-current="step === i ? 'step' : undefined"
          @click="goToStep(i)"
        >
          <span />
        </button>
      </div>

    <!-- Control Panel -->
    <div class="p-editor__control-panel">
      <!-- Tab: 便利貼（v-if 才能觸發 leave 動畫，v-show 只切 display 不會跑 transition） -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'note'" class="p-editor__tab-content">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">STEP 1. 挑選材質</h3>
            <div class="p-editor__background-grid">
              <button
                v-for="bg in backgrounds"
                :key="bg.id"
                class="p-editor__background-btn"
                :class="{ 'is-active': backgroundImage === bg.url }"
                @click="backgroundImage = bg.url"
              >
                <!-- 材質可能是純色或圖片，兩種預覽方式 -->
                <span
                  v-if="isColorMaterial(bg.url)"
                  class="p-editor__background-swatch"
                  :style="{ backgroundColor: bg.url }"
                />
                <img v-else :src="bg.url" :alt="bg.id" loading="lazy" class="p-editor__background-img" />
                <img v-if="backgroundImage === bg.url" src="/check.svg" alt="" class="p-editor__background-check" />
              </button>
            </div>
          </div>
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">STEP 2. 挑選造型</h3>
            <div class="p-editor__shape-grid">
              <button
                v-for="shapeItem in shapes"
                :key="shapeItem.id"
                class="p-editor__shape-btn"
                :class="{ 'is-active': shape === shapeItem.id }"
                :style="{ '--shape-svg': `url(${shapeItem.svg})`, '--shape-scale': shapeItem.previewScale ?? 1 }"
                @click="shape = shapeItem.id"
              >
                <!-- 選中不放打勾：勾是對齊按鈕正中央，愛心、爆炸星這種非滿版的輪廓
                     會有一段勾落在形狀外，白色壓在淺灰面板上等於消失。改成整個造型變天藍。 -->
                <span class="p-editor__shape-icon" :aria-label="shapeItem.id" />
              </button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Tab: 文字 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'text'" class="p-editor__tab-content">
          <!-- 沒有選取文字時不再整片換成提示文字：控制項停用、「＋ 新增文字」照樣可按，
               面板高度也才不會在選取切換時上下跳。 -->
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">STEP 3. 挑選文字顏色 &amp; 對齊</h3>
            <div class="p-editor__color-grid p-editor__color-grid--text">
              <button
                v-for="color in TEXT_COLORS"
                :key="color.value"
                class="p-editor__color-btn p-editor__color-btn--square"
                :class="{ 'is-active': selectedBlock?.color === color.value }"
                :style="{ '--btn-color': color.value }"
                :disabled="!selectedBlock"
                @click="() => { if (selectedBlock) { selectedBlock.color = color.value; saveDraftData() } }"
              />
            </div>
          </div>
          <div class="p-editor__control-section">
            <div class="p-editor__align-row">
              <button
                v-for="opt in TEXT_ALIGN_OPTIONS"
                :key="opt.value"
                type="button"
                class="p-editor__align-btn"
                :class="{ 'is-active': selectedBlock?.align === opt.value }"
                :aria-label="opt.value === 'left' ? '置左' : opt.value === 'center' ? '置中' : '置右'"
                :disabled="!selectedBlock"
                @click="() => { if (selectedBlock) { selectedBlock.align = opt.value; saveDraftData() } }"
              >
                <span class="p-editor__align-icon" :style="{ '--align-svg': `url(${opt.svg})` }" />
              </button>
            </div>
          </div>
          <!-- 兩顆開關自成一列：原本各自靠在色票／對齊那列的右端，中間空一大片，
               也把寬度佔走讓對齊圖示放不大。移到這裡剛好用掉原本是空白的那段。 -->
          <div class="p-editor__control-section">
            <div class="p-editor__chip-row">
              <button
                type="button"
                class="p-editor__chip-btn"
                :disabled="!canAddTextBlock"
                @click="addTextBlockFromPanel"
              >
                <svg class="p-editor__chip-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新增文字
              </button>
              <button
                type="button"
                class="p-editor__chip-btn p-editor__chip-btn--lock"
                :class="{ 'is-active': selectedBlock?.locked }"
                :disabled="!selectedBlock || !selectedBlock.content.trim()"
                @click="toggleLockSelectedTextBlock"
              >
                <svg class="p-editor__chip-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="4" y="10.5" width="16" height="10.5" rx="2.4" />
                  <!-- 鎖環：鎖定時閉合，未鎖定時往右上翻開 -->
                  <path v-if="selectedBlock?.locked" d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                  <path v-else d="M8 10.5V7a4 4 0 0 1 7.7-1.4" />
                </svg>
                {{ selectedBlock?.locked ? '已鎖定' : '鎖定圖層' }}
              </button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Tab: 繪圖 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'draw'" class="p-editor__tab-content">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">STEP 4. 挑選筆刷顏色 &amp; 寬度</h3>
            <div class="p-editor__color-grid">
              <!-- 橡皮擦按鈕（第一個） -->
              <button
                class="p-editor__color-btn p-editor__color-btn--eraser"
                :class="{ 'is-active': eraserMode }"
                @click="eraserMode = true"
              >
                <img src="/erase.svg" alt="橡皮擦" class="p-editor__color-eraser-icon" />
              </button>
              <button
                v-for="c in BRUSH_COLORS"
                :key="c.value"
                class="p-editor__color-btn"
                :class="{ 'is-active': !eraserMode && brushColor === c.value }"
                :style="{ '--btn-color': c.value }"
                @click="() => { brushColor = c.value; eraserMode = false }"
              >
                <img v-if="!eraserMode && brushColor === c.value" src="/check.svg" alt="" class="p-editor__color-check" />
              </button>
            </div>
          </div>
          <div class="p-editor__control-section">
            <!-- undo/redo 從底部按鈕列移上來，分居滑桿左右兩側，
                 方向與按鈕上的箭頭一致（左＝往回、右＝往前） -->
            <div class="p-editor__brush-row">
              <button
                type="button"
                class="p-editor__draw-btn"
                :disabled="!drawCanUndo"
                aria-label="復原一筆"
                @click="fabricBrush.undo()"
              >
                <img src="/undo.svg" alt="" class="p-editor__draw-btn-icon" />
              </button>
              <input
                v-model.number="brushWidth"
                type="range"
                min="2"
                max="40"
                class="p-editor__brush-slider"
                :style="{ '--brush-pct': `${((brushWidth - 2) / 38) * 100}%` }"
              />
              <button
                type="button"
                class="p-editor__draw-btn"
                :disabled="!drawCanRedo"
                aria-label="重做一筆"
                @click="fabricBrush.redo()"
              >
                <img src="/undo.svg" alt="" class="p-editor__draw-btn-icon p-editor__draw-btn-icon--redo" />
              </button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Tab: 貼紙 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'sticker'" class="p-editor__tab-content">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">STEP 5. 挑選貼圖</h3>
            <div class="p-editor__sticker-grid">
            <button
              v-for="sticker in STICKER_LIBRARY"
              :key="sticker.id"
              class="p-editor__sticker-btn"
              @click="addSticker(sticker.id)"
            >
              <img 
                v-if="sticker.svgFile"
                :src="sticker.svgFile"
                :alt="sticker.id"
                loading="lazy"
                class="p-editor__sticker-btn-img"
              />
            </button>
          </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Hidden node for high-res export (html-to-image)：只在實際分享時才掛載，避免長時間佔用 GPU 記憶體
         注意：不能使用 visibility:hidden，否則 html-to-image 會輸出透明圖片；改用 off-screen + opacity:0 -->
    <div
      v-if="showExportNode"
      style="position: fixed; left: -9999px; top: -9999px; pointer-events: none; opacity: 0;"
    >
      <div ref="exportNodeRef" style="width: 1080px; height: 1080px; background: transparent; display: flex; justify-content: center; align-items: center;">
        <div style="width: 100%; height: 100%; position: relative;">
          <StickyNote :note="previewNoteData" style="position: absolute; left: 0; top: 0; transform: none; width: 100%; height: 100%;" />
        </div>
      </div>
    </div>

    <!-- Bottom Actions：四個步驟共用同一組上一步／下一步。
         鎖定與 undo/redo 已經移到各自的面板上，這裡只留導覽。 -->
    <div class="p-editor__bottom-actions">
      <button
        v-if="step > 0"
        type="button"
        class="p-editor__action-btn p-editor__action-btn--secondary"
        @click="goPrevStep"
      >
        ＼ 上一步 ／
      </button>
      <button
        v-if="step < EDITOR_STEPS.length - 1"
        type="button"
        class="p-editor__action-btn p-editor__action-btn--primary"
        @click="goNextStep"
      >
        ＼ 下一步 ／
      </button>
      <button
        v-else
        type="button"
        class="p-editor__action-btn p-editor__action-btn--primary"
        :disabled="isSubmitting || isSharing"
        @click="openSubmitModal"
      >
        ＼ 送出 ／
      </button>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { StickerInstance, DraftData, StickyNoteStyle, TextBlockInstance } from '~/types'
import { getStickerById, STICKER_LIBRARY } from '~/data/stickers'
import { BACKGROUND_IMAGES, isColorMaterial } from '~/data/backgrounds'
import { SELECTABLE_SHAPES, DEFAULT_SHAPE_ID, getShapeById } from '~/data/shapes'
import { EDITOR_STEPS, TEXT_ALIGN_OPTIONS, TEXT_COLORS, BRUSH_COLORS, MAX_CONTENT_LENGTH, type EditorStepId } from '~/data/editor-config'
import { getTextBlockStyle, getStickerStyle, NOTE_LAYER_Z } from '~/utils/sticky-note-style'
import { useStickyNoteStyle, type StickyNoteStyleProps } from '~/composables/useStickyNoteStyle'
import { useStickerInteraction } from '~/composables/useStickerInteraction'
import { useCanvasPinch } from '~/composables/useCanvasPinch'
import { useStorage } from '~/composables/useStorage'
import { useFirestore } from '~/composables/useFirestore'
import { useFabricBrush } from '~/composables/useFabricBrush'
import { useNoteExport } from '~/composables/useNoteExport'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '#imports'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import StickyNote from '~/components/StickyNote.vue'
import AppModal from '~/components/AppModal.vue'
import EditorTutorialModal from '~/components/EditorTutorialModal.vue'

definePageMeta({ ssr: false })

useHead({
  meta: [
    // interactive-widget=overlays-content：iOS 鍵盤以疊加方式顯示，不壓縮 layout viewport。
    // 核心作用：防止鍵盤彈出 → body 100dvh 縮小 → canvas container 尺寸改變 → ResizeObserver 在
    // 300ms 鍵盤動畫期間觸發 ~18 次 → Vue 重新渲染整個編輯器 → 每次渲染分配虛擬 DOM 記憶體 →
    // 疊加鍵盤本身的 ~100MB → 超出 iOS Safari tab 上限 → 「重複發生問題」崩潰。
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=overlays-content' }
  ],
  bodyAttrs: { class: 'is-editor-page' }
})

const route = useRoute()
const router = useRouter()
const { $firestore } = useNuxtApp()
const db = $firestore as any
const { saveDraft, loadDraft, clearDraft, saveToken, loadToken, clearToken } = useStorage()

const MAX_TEXT_BLOCKS = 3

// Loading state
const loading = ref(true)
const showIntroOverlay = ref(true)
const termsAccepted = ref(false)
const showTermsModal = ref(false)

const onStartClick = () => {
  if (loading.value) return
  if (!termsAccepted.value) {
    showTermsModal.value = true
    return
  }
  showIntroOverlay.value = false
  
  // 顯示教學或草稿邏輯移至開始之後
  checkInitialModals()
}

// Editor State
const backgroundImage = ref(BACKGROUND_IMAGES?.[0]?.url ?? '') // 預設第一張背景
const shape = ref(DEFAULT_SHAPE_ID)
const stickers = ref<StickerInstance[]>([])
const selectedStickerId = ref<string | null>(null)
const draggingStickerId = ref<string | null>(null)

// 多文字區塊
const textBlocks = ref<TextBlockInstance[]>([])
const selectedTextBlockId = ref<string | null>(null)
const textBlockDragging = ref(false)
const textBlockTransforming = ref(false)

// 疊放順序是固定的（NOTE_LAYER_Z：貼紙最上、手繪中間、文字最下），編輯器與顯示端共用同一組值。
// 繪圖時手繪層暫時蓋在所有東西上面，筆畫才看得見 —— 那只是「正在畫」的臨時狀態，
// 不會被記錄下來，也不是便利貼本身的順序。
const DRAW_MODE_LAYER_Z = 9999

// 文字編輯時的原始內容快照（用於取消還原）
const textBlockInitialContents = new Map<string, string>()
// 這次文字編輯流程中新建立的文字區塊（用於判斷取消時要刪除還是還原）
const newTextBlockIds = new Set<string>()

const snapshotTextBlockInitial = (blockId: string) => {
  const block = textBlocks.value.find(b => b.id === blockId)
  if (block) {
    textBlockInitialContents.set(blockId, block.content)
  }
}

const hasCurrentTextEdits = () => {
  const id = selectedTextBlockId.value
  if (!id) return false
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return false
  const initial = textBlockInitialContents.get(id) ?? ''
  return block.content !== initial
}

// 離開文字步驟時的收尾：移除空白文字區塊、存檔。不負責換步驟，因為它也被
// 「在畫布上改點另一個物件」呼叫，那時候使用者還停在同一步。
const completeTextEditing = () => {
  // 若 IME 組字中按完成，先提交組字內容
  commitComposingContent()

  // 將內容為空（或只含空白）的文字區塊 in-place 刪除（避免整個陣列替換觸發全量 v-for diff）
  for (let i = textBlocks.value.length - 1; i >= 0; i--) {
    const b = textBlocks.value[i]
    if (b && !b.content.trim()) {
      textBlocks.value.splice(i, 1)
    }
  }

  textBlockInitialContents.clear()
  newTextBlockIds.clear()
  if (selectedTextBlockId.value && !textBlocks.value.some(b => b.id === selectedTextBlockId.value)) {
    selectedTextBlockId.value = null
  }

  // 延遲到下一個 event loop：讓 Vue 先完成 DOM 更新，再做 JSON.stringify + localStorage 重 I/O，
  // 避免同步 JSON.stringify 大型 drawingData（500KB+ base64）與 DOM 更新搶 CPU 造成 OOM
  setTimeout(saveDraftData, 0)
}

// 計算屬性：當前選取的文字區塊
const selectedBlock = computed(() => {
  if (!selectedTextBlockId.value) return null
  return textBlocks.value.find(b => b.id === selectedTextBlockId.value) ?? null
})

// contenteditable ref map
const contentEditableRefs = new Map<string, HTMLDivElement | null>()
const setContentEditableRef = (blockId: string, el: HTMLDivElement | null) => {
  if (el) {
    contentEditableRefs.set(blockId, el)
  } else {
    contentEditableRefs.delete(blockId)
  }
}

const canvasRef = ref<HTMLElement | null>(null)
const drawingLayerRef = ref<HTMLElement | null>(null)
const drawingCanvasRef = ref<HTMLCanvasElement | null>(null)

// IG 風格中心對齊參考線
const showVerticalCenterGuide = ref(false)
const showHorizontalCenterGuide = ref(false)

// 線性流程：step 是唯一的狀態來源，activeTab 只是它的別名。
// 之所以保留 activeTab，是因為畫布、編輯框、繪圖模式都以「目前在哪個工具」來判斷，
// 讓它由 step 推導出來，這些地方就不用跟著改。
//
// 只有兩條路能改 step，都集中在一處以免各處各自寫：
//   goToStep       —— 上一步／下一步／步驟點，會套用「還沒輸入文字不能往後」的關卡
//   revealStepFor  —— 在畫布上選到物件，面板跟著切到那個物件的控制項，不套用關卡
const step = ref(0)
const activeTab = computed(() => EDITOR_STEPS[step.value]?.id ?? 'note')

const transformingStickerId = ref<string | null>(null)
const showDraftModal = ref(false)
const showTutorialModal = ref(false)
const showExitModal = ref(false)
const showSubmitModal = ref(false)

const showAlertModal = ref(false)
const alertIcon = ref('⚠️')
const alertTitle = ref('提示')
const alertMessage = ref('')
const alertConfirmText = ref('關閉')
const alertConfirmHandler = ref<(() => void | Promise<void>) | null>(null)

const handleAlertConfirm = async () => {
  const handler = alertConfirmHandler.value
  if (handler) {
    await handler()
    return
  }
  showAlertModal.value = false
}

const showAlert = (
  msg: string,
  title = '提示',
  icon = '⚠️',
  options?: {
    confirmText?: string
    onConfirm?: () => void | Promise<void>
  }
) => {
  alertIcon.value = icon
  alertTitle.value = title
  alertMessage.value = msg
  alertConfirmText.value = options?.confirmText || '關閉'
  alertConfirmHandler.value = options?.onConfirm || null
  showAlertModal.value = true
}

// Token 相關提示：標題、內文與 icon
const TOKEN_ALERT_TITLE = '只差最後一步！'
const TOKEN_ALERT_ICON = '🛍️'
const TOKEN_ALERT_MESSAGE = '目前您還沒有取得大螢幕的上傳權限。<br>請放心，剛剛的作品已經保存在您的手機裡了！<br>只要在店內消費，結帳時掃描店員提供的 QR Code，系統就會自動幫您一鍵發送上牆喔！'
const GPS_DENIED_MESSAGE = '需要開啟定位權限才能上傳大螢幕。<br><br>iPhone（Safari）：到「設定 > Safari > 定位」改為「允許」。<br>Android（Chrome）：到「瀏覽器網址列左側鎖頭/網站設定 > 位置」改為「允許」。<br><br>完成後回到此頁，點擊「重新詢問定位」再試一次。'
const GPS_OUTSIDE_MESSAGE = '您目前不在合法上傳區域內，請移動到店內指定範圍後再試。'
const TOKEN_DISABLED_SUBMIT_COOLDOWN_MS = 3 * 60 * 1000
const TOKEN_DISABLED_LAST_SUBMIT_AT_KEY = 'willmusic_token_disabled_last_submit_at'
const tokenRequiredForSubmit = ref(false)
let unsubTokenRequirement: (() => void) | null = null

const getTokenDisabledRemainingCooldownMs = (): number => {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(TOKEN_DISABLED_LAST_SUBMIT_AT_KEY)
    const lastSubmitAt = Number(raw)
    if (!Number.isFinite(lastSubmitAt) || lastSubmitAt <= 0) return 0
    const elapsed = Date.now() - lastSubmitAt
    return Math.max(0, TOKEN_DISABLED_SUBMIT_COOLDOWN_MS - elapsed)
  } catch {
    return 0
  }
}

const formatCooldownRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds} 秒`
  if (seconds <= 0) return `${minutes} 分鐘`
  return `${minutes} 分 ${seconds} 秒`
}

const saveTokenDisabledSubmitTimestamp = () => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKEN_DISABLED_LAST_SUBMIT_AT_KEY, String(Date.now()))
  } catch {
    // ignore storage write errors
  }
}

const exportNodeRef = ref<HTMLElement | null>(null)
// 分享／下載便利貼：實作在 ~/composables/useNoteExport
const { isSharing, showExportNode, share: handleShare } = useNoteExport(exportNodeRef, {
  getBackgroundUrl: () => previewNoteData.value?.style?.backgroundImage,
  getText: () => previewNoteData.value.content,
  onError: (message) => showAlert(message)
})

// 手繪筆刷
const drawMode = ref(false)
const drawCanUndo = ref(false)
const drawCanRedo = ref(false)
const brushColor = ref('#ffffff')
const brushWidth = ref(8)
const eraserMode = ref(false)
const drawingData = ref<string | null>(null)
// 資料來源
const backgrounds = BACKGROUND_IMAGES
const shapes = SELECTABLE_SHAPES

// 編輯框跟著「有沒有被選取」，不跟著目前在第幾步。
// 拖曳（revealStep: false）時步驟不會跟著切，編輯框若綁在步驟上就會中途消失。
// 繪圖時例外：畫布要讓給筆刷，所有編輯框都收起來。
const showStickerEditFrame = computed(() => !!selectedStickerId.value && !drawMode.value)

// Sticker Management

// ── 繪圖存檔防抖
// 每筆畫完成 (path:created) 後 exportToDataURL 會產生大型 PNG 字串，
// 加上 JSON.stringify 存到 localStorage 會短暫分配 1–2MB。
// 防抖 1.5s 確保快速畫多筆時只存一次，顯著降低 iOS Safari 的 GC 壓力。
let drawSaveTimer: ReturnType<typeof setTimeout> | null = null

// 僅在有實際筆畫時更新 drawingData；saveImmediately=true 時略過防抖（離開繪圖模式時使用）
const syncDrawingDataFromFabric = (saveImmediately = false) => {
  if (!fabricBrush.canUndo()) {
    // 當前沒有任何筆畫：保留既有的 drawingData（例如使用者先前的繪圖），
    // 清空動作交給「一鍵清除」等顯式操作，避免誤將完成的畫作設為 null。
    return
  }
  const data = fabricBrush.exportToDataURL()
  if (data && data !== drawingData.value) {
    drawingData.value = data
    if (saveImmediately) {
      if (drawSaveTimer) { clearTimeout(drawSaveTimer); drawSaveTimer = null }
      saveDraftData()
    } else {
      if (drawSaveTimer) clearTimeout(drawSaveTimer)
      drawSaveTimer = setTimeout(() => {
        drawSaveTimer = null
        saveDraftData()
      }, 1500)
    }
  }
}

const fabricBrush = useFabricBrush(() => {
  syncDrawingDataFromFabric()
})
// 切換 tab 時同步繪圖模式與文字選取狀態
watch(activeTab, (tab) => {
  // 繪圖：進入/退出繪圖模式
  if (tab === 'draw') {
    drawMode.value = true
    // 恢復畫布尺寸（從 1×1 最小化還原為 600×600，重新分配 GPU backing store）
    fabricBrush.restoreCanvas()
    fabricBrush.setDrawingMode(true)
  } else {
    if (drawMode.value) {
      // 離開繪圖模式：立即存檔（saveImmediately=true），不用防抖，避免資料遺失
      syncDrawingDataFromFabric(true)
      fabricBrush.setDrawingMode(false)
      // 最小化畫布：釋放 ~1.4MB GPU backing store，降低文字編輯時的記憶體壓力
      fabricBrush.minimizeCanvas()
      // 使用者剛離開繪圖模式（例如按下完成），清除所有物件選取，確保沒有殘留的編輯框
      selectedTextBlockId.value = null
      selectedStickerId.value = null
    }
    drawMode.value = false
  }
  // 離開文字步驟就收起文字選取與鍵盤。疊放順序是固定的、與選取無關，
  // 所以清掉選取不會影響文字在第幾層。
  if (tab !== 'text') {
    selectedTextBlockId.value = null
    nextTick(() => {
      contentEditableRefs.forEach(el => el?.blur())
    })
  }
}, { immediate: true })

watch(brushColor, (c) => {
  fabricBrush.setBrushColor(c)
}, { immediate: false })

watch(brushWidth, (w) => {
  fabricBrush.setBrushWidth(w)
  fabricBrush.setEraserWidth(w)
}, { immediate: false })

watch(eraserMode, (toEraser) => {
  fabricBrush.setEraserMode(toEraser)
}, { immediate: false })

watch(drawMode, (v) => {
  if (v) {
    contentEditableRefs.forEach(el => el?.blur())
    if (fabricBrush.isInitialized()) {
      fabricBrush.setOnUndoRedoChange(() => {
        drawCanUndo.value = fabricBrush.canUndo()
        drawCanRedo.value = fabricBrush.canRedo()
        syncDrawingDataFromFabric()
      })
      drawCanUndo.value = fabricBrush.canUndo()
      drawCanRedo.value = fabricBrush.canRedo()
    }
  }
})

const noteStyleProps = computed<StickyNoteStyleProps>(() => ({
  shape: shape.value || DEFAULT_SHAPE_ID,
  textColor: '#ffffff', // 預設白色，各文字區塊有各自的顏色
  textAlign: 'center',
  backgroundImage: backgroundImage.value
}))

const { wrapperStyles, innerStyles: canvasStyle } = useStickyNoteStyle(noteStyleProps)

// 畫面是否有內容（文字 / 貼紙 / 繪圖任一存在，或背景/形狀已被更改）
const hasAnyContent = computed(() =>
  textBlocks.value.some(b => b.content.trim()) ||
  stickers.value.length > 0 ||
  !!drawingData.value ||
  backgroundImage.value !== (BACKGROUND_IMAGES?.[0]?.url ?? '') ||
  shape.value !== DEFAULT_SHAPE_ID
)

// 快取靜態 style 物件：避免每次 render 都建立新物件，降低 GC 壓力
const STYLE_POINTER_NONE = Object.freeze({ pointerEvents: 'none' as const })
const STYLE_EMPTY = Object.freeze({})

// 文字區塊位置/大小樣式（接受 TextBlockInstance）
const getTextBlockStyleComputed = (block: TextBlockInstance) => ({
  ...getTextBlockStyle(block.x, block.y, block.scale, block.rotation),
  textAlign: block.align
})

// 文字區塊文字樣式（顏色與對齊：針對單一文字物件）
const getTextStyleForBlock = (block: TextBlockInstance) => ({
  ...wrapperStyles.value,
  color: block.color,
  textAlign: block.align,
  '--text-color': block.color,
})


// 文字 scale 上下限（與 useCanvasPinch 一致）
const TEXT_SCALE_MIN = 1
const TEXT_SCALE_MAX = 5

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** 當輸入導致文字框超出畫布時：縮小 scale 並調整位置，使整個框留在邊界內 */
const clampSelectedTextBlockToCanvas = () => {
  const id = selectedTextBlockId.value
  const el = canvasRef.value
  if (!id || !el) return
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return
  const frameEl = el.querySelector(
    `.p-editor__edit-frame--text[data-text-block-id="${id}"]`
  ) as HTMLElement | null
  if (!frameEl) return
  const rect = el.getBoundingClientRect()
  const fr = frameEl.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const halfWidthPct = (fr.width / rect.width) * 50
  const halfHeightPct = (fr.height / rect.height) * 50
  const eps = 1e-6
  const maxScaleX = halfWidthPct > eps ? (50 * block.scale) / halfWidthPct : TEXT_SCALE_MAX
  const maxScaleY = halfHeightPct > eps ? (50 * block.scale) / halfHeightPct : TEXT_SCALE_MAX
  const maxScale = Math.min(maxScaleX, maxScaleY, TEXT_SCALE_MAX)
  const oldScale = block.scale
  if (block.scale > maxScale) {
    block.scale = clamp(maxScale, TEXT_SCALE_MIN, TEXT_SCALE_MAX)
  }
  const newHalfW = halfWidthPct * (block.scale / oldScale)
  const newHalfH = halfHeightPct * (block.scale / oldScale)
  block.x = clamp(block.x, newHalfW, 100 - newHalfW)
  block.y = clamp(block.y, newHalfH, 100 - newHalfH)
}

// ── IME 狀態追蹤（韓文/日文/中文輸入法）
const isComposing = ref(false)
// 組字中的即時文字：僅供 sizer 使用，不觸發 textBlocks 深層反應鏈
const composingPreviewText = ref<string | null>(null)

// ── RAF-throttled clamp：合併同一幀內多次呼叫為一次，避免重複 getBoundingClientRect 引發回流
let _clampRafId: number | null = null
const scheduleClamp = () => {
  if (_clampRafId !== null) return
  _clampRafId = requestAnimationFrame(() => {
    _clampRafId = null
    clampSelectedTextBlockToCanvas()
  })
}

// 清理 IME 組字狀態並將 contenteditable 中的最終文字寫入 block.content
const commitComposingContent = () => {
  if (selectedTextBlockId.value) {
    const el = contentEditableRefs.get(selectedTextBlockId.value)
    if (el) {
      const text = el.innerText.slice(0, MAX_CONTENT_LENGTH)
      const block = textBlocks.value.find(b => b.id === selectedTextBlockId.value)
      if (block && block.content !== text) block.content = text
    }
  }
  isComposing.value = false
  composingPreviewText.value = null
}

const TEXT_PLACEHOLDER = '在這裡輸入文字...'

/**
 * 編輯框量尺要顯示的文字。
 * 空白判斷必須與模板上的 is-empty（同樣用 .trim()）一致：
 * 刪光文字後 innerText 常留下一個換行，若用 `content || placeholder` 會誤判成有內容，
 * 導致 placeholder 有顯示、編輯框卻縮成一條。
 */
const sizerTextFor = (block: { id: string; content: string }) => {
  const raw = (selectedTextBlockId.value === block.id && composingPreviewText.value != null)
    ? composingPreviewText.value
    : block.content
  return raw.trim() ? raw : TEXT_PLACEHOLDER
}

// Methods
const handleTextInput = (e: Event, blockId: string) => {
  const target = e.target as HTMLElement
  const text = target.innerText.slice(0, MAX_CONTENT_LENGTH)

  if (isComposing.value || (e as InputEvent).isComposing) {
    // IME 組字中：僅更新輕量 composingPreviewText（只驅動 sizer 寬度），
    // 不碰 block.content → 不觸發 hasAnyContent / previewNoteData 等重型 computed
    composingPreviewText.value = text
    scheduleClamp()
    return
  }

  composingPreviewText.value = null
  const block = textBlocks.value.find(b => b.id === blockId)
  if (block) block.content = text
  if (target.innerText.length > MAX_CONTENT_LENGTH) {
    target.innerText = text
    placeCaretAtEnd(target)
  }
  scheduleClamp()
}

const handleCompositionEnd = (e: Event, blockId: string) => {
  // 保持 isComposing=true 直到 block.content 提交完成，避免 placeholder 閃現
  nextTick(() => {
    const target = e.target as HTMLElement
    const text = target.innerText.slice(0, MAX_CONTENT_LENGTH)
    const block = textBlocks.value.find(b => b.id === blockId)
    if (block) block.content = text
    isComposing.value = false
    composingPreviewText.value = null
    if (target.innerText.length > MAX_CONTENT_LENGTH) {
      target.innerText = text
      placeCaretAtEnd(target)
    }
    scheduleClamp()
  })
}

const placeCaretAtEnd = (el: HTMLElement) => {
  const range = document.createRange()
  const sel = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** 將游標放到指定座標位置（模擬手機點擊移動游標） */
const placeCaretAtPoint = (el: HTMLElement, clientX: number, clientY: number) => {
  let range: Range | null = null

  // Chrome / Safari / Edge
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY)
  }
  // Firefox
  else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(clientX, clientY)
    if (pos) {
      range = document.createRange()
      range.setStart(pos.offsetNode, pos.offset)
      range.collapse(true)
    }
  }

  if (range) {
    // 確保 range 在目標 contenteditable 元素內
    if (el.contains(range.startContainer)) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
  }

  // fallback：無法定位時放到最後
  placeCaretAtEnd(el)
}

const syncContentToDom = () => {
  nextTick(() => {
    textBlocks.value.forEach(block => {
      const el = contentEditableRefs.get(block.id)
      if (el) {
        el.innerText = block.content
      }
    })
  })
}

// 文字區塊管理
const addTextBlock = (): TextBlockInstance => {
  const newBlock: TextBlockInstance = {
    id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content: '',
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 20,
    scale: 2,
    rotation: 0,
    color: '#ffffff',
    align: 'center',
    locked: false
  }
  textBlocks.value.push(newBlock)
  snapshotTextBlockInitial(newBlock.id)
  newTextBlockIds.add(newBlock.id)
  saveDraftData()
  return newBlock
}

const removeTextBlock = (blockId: string) => {
  textBlocks.value = textBlocks.value.filter(b => b.id !== blockId)
  textBlockInitialContents.delete(blockId)
  newTextBlockIds.delete(blockId)
  if (selectedTextBlockId.value === blockId) {
    selectedTextBlockId.value = null
  }
  saveDraftData()
}

/**
 * 進入文字步驟：還沒有任何文字就開一個，已經有就接續編輯最後一個。
 * 從 STEP 4 按上一步回來時不能再開新的，否則每回來一次就多一個空白文字框。
 */
const enterTextStep = () => {
  const existing = textBlocks.value[textBlocks.value.length - 1]
  const target = existing ?? addTextBlock()
  if (existing) {
    // 既有的文字區塊：重新記錄編輯前內容，並移出「本次新建」名單，
    // 這樣取消編輯時是還原內容而不是把它整個刪掉
    snapshotTextBlockInitial(existing.id)
    newTextBlockIds.delete(existing.id)
  }
  selectedTextBlockId.value = target.id
  selectedStickerId.value = null
  if (!target.locked) focusSelectedTextBlock()
}

/**
 * 能不能再開一段文字。
 * 除了數量上限，還擋「目前有空白的文字區塊」—— 手上這段都還沒打字就再開一段沒有意義，
 * 而且離開這一步時空白的本來就會被 completeTextEditing 清掉。
 * 用 some 判斷而不是看 selectedBlock：把唯一一段刪掉後沒有選取，那時要能再開一段，不能變死路。
 */
const canAddTextBlock = computed(() =>
  textBlocks.value.length < MAX_TEXT_BLOCKS &&
  !textBlocks.value.some(b => !b.content.trim())
)

/** 面板上的「＋ 新增文字」。舊版是靠再點一次「文字」分頁來新增，分頁列拿掉後需要明確的入口 */
const addTextBlockFromPanel = () => {
  if (!canAddTextBlock.value) return
  commitComposingContent()
  const newBlock = addTextBlock()
  selectedTextBlockId.value = newBlock.id
  selectedStickerId.value = null
  focusSelectedTextBlock()
}

/** 步驟切換的唯一入口：離開目前步驟先收尾，再進入目標步驟 */
const goToStep = (index: number) => {
  const target = Math.min(Math.max(index, 0), EDITOR_STEPS.length - 1)
  if (target === step.value) return

  // 離開文字步驟：清掉沒輸入內容的空白文字區塊並存檔
  if (activeTab.value === 'text') completeTextEditing()
  // 離開貼紙步驟：收起貼紙編輯框
  if (activeTab.value === 'sticker') selectedStickerId.value = null

  step.value = target

  // 進入文字步驟的選取必須等 activeTab 的 watcher 跑完 ——
  // 它在離開繪圖模式時會清掉所有選取，直接呼叫會被它蓋掉。
  if (EDITOR_STEPS[target]?.id === 'text') nextTick(enterTextStep)
}

const goNextStep = () => goToStep(step.value + 1)
const goPrevStep = () => goToStep(step.value - 1)

/**
 * 在畫布上選到某個物件時，面板跟著切到那個物件的控制項。
 *
 * 刻意不走 goToStep：這不是「往下一步」，而是跳到被選物件的介面，所以
 *   - 不套用「還沒輸入文字不能往後」的關卡（選貼紙只是想搬它，不該被攔下來問文字）
 *   - 不重複做離開步驟的收尾，呼叫端的 selectTextBlock / selectSticker 已經處理過
 *     舊文字的提交或還原了。
 */
const revealStepFor = (tabId: EditorStepId) => {
  const index = EDITOR_STEPS.findIndex(s => s.id === tabId)
  if (index >= 0) step.value = index
}

// 文字「取消」：新增未輸入時 = 刪除；編輯時 = 還原到編輯前內容。
// 與 completeTextEditing 一樣不負責換步驟 —— 呼叫它的是「改點另一個物件」。
const cancelTextEditing = () => {
  // 清除任何進行中的 IME 狀態
  isComposing.value = false
  composingPreviewText.value = null

  const id = selectedTextBlockId.value
  if (!id) return

  const block = textBlocks.value.find(b => b.id === id)
  const initial = textBlockInitialContents.get(id) ?? ''
  const isNew = newTextBlockIds.has(id)

  if (block && isNew) {
    removeTextBlock(id)
    return
  }

  if (block) {
    block.content = initial
    syncContentToDom()
    setTimeout(saveDraftData, 0)
  }

  textBlockInitialContents.delete(id)
  selectedTextBlockId.value = null
}

const MAX_STICKERS = 10

const addSticker = (stickerType: string) => {
  if (stickers.value.length >= MAX_STICKERS) {
    showAlert(
      `每張便利貼最多只能貼 ${MAX_STICKERS} 個貼紙喔！如果需要更多空間，可以先刪除一些。`,
      '貼紙數量達上限',
      '⚠️'
    )
    return
  }

  const newSticker: StickerInstance = {
    id: `sticker-${Date.now()}`,
    type: stickerType,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 20,
    scale: 3,
    rotation: (Math.random() - 0.5) * 30
  }
  stickers.value.push(newSticker)
  saveDraftData()
  // 選取新貼紙讓編輯框出現（貼紙只能從 STEP 5 的貼圖庫加，本來就在這一步）
  selectedStickerId.value = newSticker.id
  selectedTextBlockId.value = null
}

const selectSticker = (id: string) => {
  // 若正在文字編輯模式，先提交 IME 並自動完成之前的編輯
  if (activeTab.value === 'text' && selectedTextBlockId.value) {
    commitComposingContent()
    if (hasCurrentTextEdits()) {
      completeTextEditing()
    } else {
      cancelTextEditing()
    }
  }

  selectedStickerId.value = id
  selectedTextBlockId.value = null
  // 面板切到貼圖那一步，被選中的貼紙才有對應的控制項可用
  revealStepFor('sticker')
}

/**
 * @param options.revealStep 預設 true＝面板跟著切到文字步驟。
 *   拖曳時要傳 false：文字的 onTextDragStart 是「手指移動超過門檻」才觸發的，
 *   這時切步驟會在拖到一半改變面板高度，畫布跟著縮放，物件就會在手指底下跳掉。
 *   （貼紙不受影響，它的 selectSticker 是在 touchstart 就呼叫，還沒開始移動。）
 */
const selectTextBlock = (blockId: string, options?: { revealStep?: boolean }) => {
  const isCurrentlyEditing = selectedTextBlockId.value === blockId && activeTab.value === 'text'

  if (isCurrentlyEditing) {
    // 已經在文字模式下再次點擊同一個文字區塊：確保重新聚焦並叫出鍵盤
    focusSelectedTextBlock()
    return
  }

  // 切換到另一組文字時，先提交舊區塊的 IME 組字並自動完成/取消編輯
  if (selectedTextBlockId.value && selectedTextBlockId.value !== blockId) {
    commitComposingContent()
    if (hasCurrentTextEdits()) {
      completeTextEditing()
    } else {
      cancelTextEditing()
    }
  }
  
  snapshotTextBlockInitial(blockId)
  selectedTextBlockId.value = blockId
  selectedStickerId.value = null
  // 面板切到文字那一步。順序很重要：contenteditable 綁在 activeTab === 'text'，
  // 要先切步驟，下面的 focus 才有東西可以聚焦。
  if (options?.revealStep !== false) revealStepFor('text')

  // 沒切到文字步驟就不要聚焦叫鍵盤（拖曳中）
  if (activeTab.value !== 'text') return

  nextTick(() => {
    const el = contentEditableRefs.get(blockId)
    if (el) {
      el.focus()
      placeCaretAtEnd(el)
    }
  })
}

const focusSelectedTextBlock = () => {
  const id = selectedTextBlockId.value
  if (!id) return
  nextTick(() => {
    const el = contentEditableRefs.get(id)
    if (el) {
      el.focus()
      placeCaretAtEnd(el)
    }
  })
}

const toggleLockSelectedTextBlock = () => {
  const id = selectedTextBlockId.value
  if (!id) return
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return
  block.locked = !block.locked
  // 鎖定後保留選取，面板上那顆鎖定鈕才有對象可以再按一次解鎖；
  // 清掉選取的話按鈕會連同整個文字面板一起失去目標，等於把自己關掉。
  // 實際的「不能編輯」由 contenteditable 與 useCanvasPinch 的 locked 判斷負責。
  if (block.locked) {
    textBlockDragging.value = false
    textBlockTransforming.value = false
    // 清除所有文字框的 focus，避免仍可輸入文字
    contentEditableRefs.forEach(el => el?.blur())
  } else {
    focusSelectedTextBlock()
  }
  saveDraftData()
}

let lockedLongPressTimer: ReturnType<typeof setTimeout> | null = null

const onLockedTextTouchStart = (blockId: string, e: TouchEvent) => {
  const block = textBlocks.value.find(b => b.id === blockId)
  if (!block?.locked) return

  if (e.cancelable) e.preventDefault()
  e.stopPropagation()

  if (lockedLongPressTimer) {
    clearTimeout(lockedLongPressTimer)
    lockedLongPressTimer = null
  }

  lockedLongPressTimer = setTimeout(() => {
    lockedLongPressTimer = null
    const target = textBlocks.value.find(b => b.id === blockId)
    if (!target) return
    target.locked = false
    selectTextBlock(blockId)
  }, 600)
}

const onLockedTextTouchEnd = () => {
  if (lockedLongPressTimer) {
    clearTimeout(lockedLongPressTimer)
    lockedLongPressTimer = null
  }
}


const deselectAll = () => {
  if (lastCanvasDragEndAt.value && Date.now() - lastCanvasDragEndAt.value < 400) return
  if (selectedTextBlockId.value) commitComposingContent()
  selectedStickerId.value = null
  selectedTextBlockId.value = null
}

// saveDraftData 需在 composable 之前定義（作為 callback）
const saveDraftData = () => {
  // 如果沒有任何有效內容（文字、貼紙、繪圖皆為空，且背景/形狀皆為預設值），不存草稿
  const hasContent =
    textBlocks.value.some(b => b.content.trim()) ||
    stickers.value.length > 0 ||
    !!drawingData.value ||
    backgroundImage.value !== (BACKGROUND_IMAGES?.[0]?.url ?? '') ||
    shape.value !== DEFAULT_SHAPE_ID
  if (!hasContent) return

  // 僅儲存有內容的文字區塊（空白內容的區塊不存入草稿）
  const nonEmptyTextBlocks = textBlocks.value.filter(b => b.content.trim())

  const draft: DraftData = {
    content: nonEmptyTextBlocks.map(b => b.content).join('\n'),
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: nonEmptyTextBlocks[0]?.color ?? '#ffffff',
    textAlign: nonEmptyTextBlocks[0]?.align ?? 'center',
    stickers: stickers.value,
    textTransform: nonEmptyTextBlocks[0] ? { x: nonEmptyTextBlocks[0].x, y: nonEmptyTextBlocks[0].y, scale: nonEmptyTextBlocks[0].scale, rotation: nonEmptyTextBlocks[0].rotation } : undefined,
    textBlocks: nonEmptyTextBlocks,
    drawing: drawingData.value ?? undefined,
    timestamp: Date.now()
  }
  saveDraft(draft)
}

const {
  onCanvasTouchStart,
  onCanvasTouchMove,
  onCanvasTouchEnd,
  onCanvasMouseDown,
  lastCanvasDragEndAt,
  isTwoFingerGesture
} = useCanvasPinch({
  canvasRef,
  drawMode,
  selectedTextBlockId,
  selectedStickerId,
  textBlocks,
  stickers,
  textBlockDragging,
  textBlockTransforming,
  draggingStickerId,
  transformingStickerId,
  onTextTransformEnd: () => {
    focusSelectedTextBlock()
    saveDraftData()
  },
  onStickerTransformEnd: saveDraftData,
  onTextDragEnd: () => {
    focusSelectedTextBlock()
    saveDraftData()
  },
  onStickerDragEnd: saveDraftData,
  onTextTap: (blockId: string, clientX: number, clientY: number) => {
    const alreadySelected = selectedTextBlockId.value === blockId
    selectTextBlock(blockId)
    if (!alreadySelected) {
      // 切換到新的文字區塊：游標放到最後（selectTextBlock 內部已處理）
    }
    // 已選取的文字區塊：不做任何操作，瀏覽器已在 touchstart 自然定位游標
  },
  onTextDragStart: (blockId: string) => selectTextBlock(blockId, { revealStep: false }),
  showVerticalCenterGuide,
  showHorizontalCenterGuide
})

const {
  onStickerMouseDown,
  onStickerTouchStart,
  onStickerClick,
  onTransformHandleMouseDown,
  onTransformHandleTouchStart
} = useStickerInteraction({
  canvasRef,
  stickers,
  selectedStickerId,
  draggingStickerId,
  transformingStickerId,
  selectSticker,
  onDragEnd: saveDraftData,
  onTransformEnd: saveDraftData,
  isTwoFingerGesture
})

const removeSticker = (id: string) => {
  stickers.value = stickers.value.filter(s => s.id !== id)
  selectedStickerId.value = null
  saveDraftData()
}

const loadDraftData = async (draft: DraftData) => {
  backgroundImage.value = draft.backgroundImage
  shape.value = draft.shape
  stickers.value = draft.stickers
  drawingData.value = draft.drawing ?? null

  // 多文字區塊：優先使用 textBlocks，否則從舊格式轉換
  if (draft.textBlocks && draft.textBlocks.length > 0) {
    textBlocks.value = draft.textBlocks
  } else if (draft.content) {
    // 向下相容：舊格式只有一個文字區塊
    const t = draft.textTransform
    textBlocks.value = [{
      id: `text-legacy-${Date.now()}`,
      content: draft.content,
      x: t?.x ?? 50,
      y: t?.y ?? 50,
      scale: t?.scale ?? 2,
      rotation: t?.rotation ?? 0,
      color: draft.textColor ?? '#ffffff',
      align: draft.textAlign ?? 'center'
    }]
  } else {
    textBlocks.value = []
  }

  await nextTick()
  syncContentToDom()
  if (draft.drawing) {
    await nextTick()
    fabricBrush.loadFromDataURL(draft.drawing)
  }
  // 疊放順序不用還原了：現在是固定的（NOTE_LAYER_Z），草稿裡的 objectLayerOrder
  // 只有舊版寫過，讀了也不會用到。這裡原本有一整段「把存下來的順序重新編號」的程式，
  // 正是它造成了「回復草稿後東西自己換位」的兩個問題。
}

const resetEditorToInitial = () => {
  backgroundImage.value = BACKGROUND_IMAGES?.[0]?.url ?? ''
  shape.value = DEFAULT_SHAPE_ID
  stickers.value = []
  textBlocks.value = []
  selectedTextBlockId.value = null
  selectedStickerId.value = null
  step.value = 0
  drawingData.value = null
  fabricBrush.clear()
  syncContentToDom()
}

const showClearAllModal = ref(false)

const handleClearAll = () => {
  if (!hasAnyContent.value) return
  showClearAllModal.value = true
}

const confirmClearAll = () => {
  resetEditorToInitial()
  clearDraft()
  showClearAllModal.value = false
}

const handleDraftDecision = async (useDraft: boolean) => {
  if (useDraft) {
    showDraftModal.value = false
    const draft = loadDraft()
    if (draft) {
      await nextTick()
      await new Promise<void>(r => requestAnimationFrame(() => r()))
      await loadDraftData(draft)
    }
  } else {
    resetEditorToInitial()
    clearDraft()
    showDraftModal.value = false
  }
}

const isSubmitting = ref(false)

/**
 * 送得出去的最低條件：文字、繪圖、貼紙至少有一項。
 *
 * 不強制一定要有文字 —— 只用畫的或只用貼紙的便利貼一樣是完整的應援。
 * 材質與造型刻意不算：只換了顏色、上面什麼都沒有的空白便利貼上牆沒有意義。
 * （hasAnyContent 有把材質／造型算進去，那是給「全部重來」判斷用的，兩者不同。）
 */
const hasSubmittableContent = computed(() =>
  textBlocks.value.some(b => b.content.trim()) ||
  !!drawingData.value ||
  stickers.value.length > 0
)

/**
 * 開啟確認 modal。
 *
 * 這裡只擋「整張都是空的」—— 冷卻與 Token 的檢查移到 confirmSubmit（它本來就各做了一次），
 * 因為「分享便利貼」現在住在這個 modal 裡：把 Token／冷卻擋在開啟之前，
 * 等於讓沒有 QR Code 或在冷卻中的人連自己的便利貼都存不下來。
 */
const openSubmitModal = () => {
  if (!hasSubmittableContent.value) {
    showAlert('便利貼上還沒有任何內容，寫點字、畫張圖或貼個貼紙都可以。', '還是空白的')
    return
  }

  showSubmitModal.value = true
}

const previewNoteData = computed(() => {
  const style: StickyNoteStyle = {
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textBlocks.value[0]?.color ?? '#ffffff',
    textAlign: textBlocks.value[0]?.align ?? 'center',
    stickers: stickers.value,
    textTransform: textBlocks.value[0] ? { x: textBlocks.value[0].x, y: textBlocks.value[0].y, scale: textBlocks.value[0].scale, rotation: textBlocks.value[0].rotation } : undefined,
    textBlocks: textBlocks.value
  }
  if (drawingData.value) style.drawing = drawingData.value

  return {
    id: 'preview',
    content: textBlocks.value.map(b => b.content).join('\n').trim(),
    style: style,
    timestamp: Date.now(),
    status: 'waiting'
  } as any
})

const toRadians = (deg: number) => deg * (Math.PI / 180)

const calculateDistanceMeters = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) => {
  const earthRadiusMeters = 6371000
  const dLat = toRadians(toLat - fromLat)
  const dLng = toRadians(toLng - fromLng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusMeters * c
}

type GeoErrorKind =
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'
  | 'geolocation-unavailable'
  | 'geo-fence-fetch-failed'
  | 'geo-fence-config-invalid'
  | 'unknown'

type GeoError = Error & { kind?: GeoErrorKind; code?: number; cause?: unknown }

const createGeoError = (kind: GeoErrorKind, message: string, cause?: unknown): GeoError => {
  const error = new Error(message) as GeoError
  error.kind = kind
  error.cause = cause
  return error
}

const mapGeoErrorFromAny = (error: any): GeoError => {
  if (!error) return createGeoError('unknown', 'Unknown geolocation error')
  if (error.kind) return error as GeoError

  const code = Number(error?.code)
  if (code === 1) return createGeoError('permission-denied', 'Geolocation permission denied', error)
  if (code === 2) return createGeoError('position-unavailable', 'Geolocation position unavailable', error)
  if (code === 3) return createGeoError('timeout', 'Geolocation timeout', error)
  return createGeoError('unknown', error?.message || 'Unknown geolocation error', error)
}

const getCurrentPositionWithOptions = (options: PositionOptions): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(createGeoError('geolocation-unavailable', 'Geolocation API not available'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve(position),
      error => reject(mapGeoErrorFromAny(error)),
      options
    )
  })

const getCurrentPosition = (): Promise<GeolocationPosition> =>
  getCurrentPositionWithOptions({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  }).catch(async (error: any) => {
    const normalized = mapGeoErrorFromAny(error)
    // 手機在室內或節電模式下容易 high accuracy timeout；改用低精度 + 允許快取位置再嘗試一次。
    if (normalized.kind === 'position-unavailable' || normalized.kind === 'timeout') {
      return await getCurrentPositionWithOptions({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 120000
      })
    }
    throw normalized
  })

const requestGpsPermissionAgain = async () => {
  try {
    await getCurrentPosition()
    showAlertModal.value = false
    openSubmitModal()
  } catch (error: any) {
    const geoError = mapGeoErrorFromAny(error)
    if (geoError.kind === 'permission-denied') {
      showAlert(
        GPS_DENIED_MESSAGE,
        '需要定位權限',
        '📍',
        {
          confirmText: '重新詢問定位',
          onConfirm: requestGpsPermissionAgain
        }
      )
      return
    }
    if (
      geoError.kind === 'position-unavailable' ||
      geoError.kind === 'timeout' ||
      geoError.kind === 'geolocation-unavailable'
    ) {
      showAlert('無法取得目前位置，請確認定位服務已開啟並稍後再試。', '定位失敗', '📍')
      return
    }
    showAlert('定位驗證失敗，請稍後再試。', '定位失敗', '📍')
  }
}

/**
 * 上傳前的地理柵欄檢查，由後台 system/editor_geo_fence 的 enabled 控制。
 * 以下情況一律放行，避免後台設定不完整時把使用者擋在門外：
 * 文件不存在、enabled 非 true、經緯度或半徑填得不完整。
 */
const validateGeoFenceBeforeSubmit = async (): Promise<boolean> => {
  let geoFenceSnap
  try {
    geoFenceSnap = await getDoc(doc(db, 'system', 'editor_geo_fence'))
  } catch (error: any) {
    throw createGeoError('geo-fence-fetch-failed', error?.message || 'Failed to load geo fence config', error)
  }
  if (!geoFenceSnap.exists()) return true

  const data = geoFenceSnap.data() as {
    enabled?: boolean
    latitude?: number
    longitude?: number
    radiusMeters?: number
  }

  if (!data.enabled) return true

  const centerLat = Number(data.latitude)
  const centerLng = Number(data.longitude)
  const radiusMeters = Number(data.radiusMeters)
  const configValid =
    Number.isFinite(centerLat) &&
    Number.isFinite(centerLng) &&
    Number.isFinite(radiusMeters) &&
    radiusMeters > 0

  // 後台配置不完整時不擋使用者，避免手機端誤判為「定位驗證失敗」。
  if (!configValid) return true

  const position = await getCurrentPosition()
  const userLat = position.coords.latitude
  const userLng = position.coords.longitude
  const distance = calculateDistanceMeters(userLat, userLng, centerLat, centerLng)

  return distance <= radiusMeters
}

const confirmSubmit = async () => {
  if (isSubmitting.value) return

  if (!tokenRequiredForSubmit.value) {
    const remainingCooldownMs = getTokenDisabledRemainingCooldownMs()
    if (remainingCooldownMs > 0) {
      showSubmitModal.value = false
      showAlert(
        `每次上傳後需等待 3 分鐘。請於 ${formatCooldownRemaining(remainingCooldownMs)} 後再試。`,
        '上傳冷卻中',
        '⏱️'
      )
      return
    }
  }

  const tokenForSubmit = tokenRequiredForSubmit.value ? (loadToken() || undefined) : undefined
  if (tokenRequiredForSubmit.value && !tokenForSubmit) {
    // 與上面的冷卻分支一致先收掉 modal，否則提示會疊在確認畫面上
    showSubmitModal.value = false
    showAlert(TOKEN_ALERT_MESSAGE, TOKEN_ALERT_TITLE, TOKEN_ALERT_ICON)
    return
  }

  isSubmitting.value = true

  try {
    const { createNote, checkTokenStatus } = useFirestore()

    // GPS 合法區域檢查：若後台開啟限制，必須位於指定半徑內才能送出
    let isWithinAllowedArea = false
    try {
      isWithinAllowedArea = await validateGeoFenceBeforeSubmit()
    } catch (geoError: any) {
      const normalizedGeoError = mapGeoErrorFromAny(geoError)
      showSubmitModal.value = false
      if (normalizedGeoError.kind === 'permission-denied') {
        showAlert(
          GPS_DENIED_MESSAGE,
          '需要定位權限',
          '📍',
          {
            confirmText: '重新詢問定位',
            onConfirm: requestGpsPermissionAgain
          }
        )
      } else if (
        normalizedGeoError.kind === 'position-unavailable' ||
        normalizedGeoError.kind === 'timeout' ||
        normalizedGeoError.kind === 'geolocation-unavailable'
      ) {
        showAlert('無法取得目前位置，請確認定位服務已開啟並稍後再試。', '定位失敗', '📍')
      } else if (normalizedGeoError.kind === 'geo-fence-fetch-failed') {
        showAlert('目前無法驗證定位（網路或服務暫時異常），請稍後再試。', '定位失敗', '📍')
      } else {
        showAlert('定位驗證失敗，請稍後再試。', '定位失敗', '📍')
      }
      isSubmitting.value = false
      return
    }

    if (!isWithinAllowedArea) {
      showSubmitModal.value = false
      showAlert(GPS_OUTSIDE_MESSAGE, '不在合法區域', '📍')
      isSubmitting.value = false
      return
    }

    // 1. 若啟用 token 驗證，先透過 checkTokenStatus 取得詳細錯誤原因
    const status = tokenRequiredForSubmit.value
      ? await checkTokenStatus(tokenForSubmit as string).catch(() => 'unknown')
      : 'valid'
    
    // 中介檢查：OpenAI Moderation API 擋下不好的文字
    const allText = previewNoteData.value.content;
    if (allText.trim()) {
      try {
        const modRes: any = await $fetch('/api/moderation', {
          method: 'POST',
          body: { text: allText }
        });
        
        if (modRes.flagged) {
          showSubmitModal.value = false;
          showAlert('您的文字包含不妥適的內容，為維護良好環境，請修改後再試一次！', '內容安全檢查未通過', '🚫');
          isSubmitting.value = false;
          return;
        }
      } catch (err) {
        console.warn('Moderation check failed or bypassed, proceeding...', err);
      }
    }

    if (status === 'expired') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 已經超過 30 分鐘的有效期限囉！請向店員重新索取新的 QR Code。', 
        '時間到了！', 
        '⏳'
      )
      isSubmitting.value = false
      return
    }

    if (status === 'used') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 已經被使用過囉！如果還想再傳一張，請向店員重新索取新的 QR Code。', 
        '已經用過囉！', 
        '❌'
      )
      isSubmitting.value = false
      return
    }

    if (status === 'invalid') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 無效或不存在，請確認您掃描的是由店員提供的正確條碼。', 
        '無效代碼', 
        '❓'
      )
      isSubmitting.value = false
      return
    }

    // 2. 狀態正確(valid)或無法判別時，嘗試正式送出
    await createNote(
      { content: previewNoteData.value.content, style: previewNoteData.value.style },
      tokenForSubmit
    )

    // 上傳成功：清除草稿與快取的 Token
    clearDraft()
    if (!tokenRequiredForSubmit.value) {
      saveTokenDisabledSubmitTimestamp()
    }
    if (tokenRequiredForSubmit.value && tokenForSubmit) {
      clearToken() // 將 SessionStorage 中的 Token 刪除
    }
    
    // 如果網址上有 Token，把網址也清乾淨，避免重新整理再次讀取
    const query = { ...route.query }
    if (tokenRequiredForSubmit.value && query.token) {
      delete query.token
      // 使用 replace 避免在歷史紀錄中留存帶有 token 的網址
      await router.replace({ query })
    }

    showSubmitModal.value = false
    router.push('/queue-status')
  } catch (e: any) {
    showSubmitModal.value = false // 關閉「確認上傳」的 Modal，讓錯誤提示能正常顯示在最上層
    console.error('提交失敗:', e)
    
    // 如果因為 Firebase Rules 阻擋讀取 token 而拋錯，退回到這裡用泛用的錯誤提示
    if (
      tokenRequiredForSubmit.value &&
      (e?.code === 'permission-denied' || e?.message?.includes('Missing or insufficient permissions'))
    ) {
      showAlert(
        '您的專屬 QR Code 可能已失效 (超過限時 30 分鐘) 或已經被使用過。請向店員重新索取新的 QR Code！', 
        '上傳授權失效', 
        '⏳'
      )
    } else {
      showAlert(`提交失敗：${e?.message || '請稍後再試'}`)
    }
  } finally {
    isSubmitting.value = false
  }
}

const goBack = () => {
  const hasContent = textBlocks.value.some(b => b.content.trim())
  if (hasContent || stickers.value.length > 0) {
    showExitModal.value = true
  } else {
    router.push('/')
  }
}

const handleExitConfirm = () => {
  saveDraftData()
  showExitModal.value = false
  router.push('/')
}

// Lifecycle
// initFabricBrush 改為 async：Fabric.js 動態載入，await init 後再設定筆刷參數
const initFabricBrush = async () => {
  if (typeof window === 'undefined' || !canvasRef.value || !drawingCanvasRef.value || !drawingLayerRef.value) return
  await fabricBrush.init(drawingCanvasRef.value, 600, 600)
  fabricBrush.setOnUndoRedoChange(() => {
    drawCanUndo.value = fabricBrush.canUndo()
    drawCanRedo.value = fabricBrush.canRedo()
    syncDrawingDataFromFabric()
  })
  fabricBrush.setBrushColor(brushColor.value)
  fabricBrush.setBrushWidth(brushWidth.value)
  fabricBrush.setEraserWidth(brushWidth.value)
  fabricBrush.setEraserMode(eraserMode.value)
  fabricBrush.setDrawingMode(drawMode.value)
  if (drawingData.value) {
    await fabricBrush.loadFromDataURL(drawingData.value)
  }
  drawCanUndo.value = fabricBrush.canUndo()
  drawCanRedo.value = fabricBrush.canRedo()
}

const scalerStyle = ref({ transform: 'scale(1)' })
const VIRTUAL_SIZE = 600
let resizeObserver: ResizeObserver | null = null

const checkInitialModals = async () => {
  await nextTick()
  // 檢查草稿（僅顯示 modal，不預先載入內容；等使用者選擇「使用草稿」才載入）
  const existingDraft = loadDraft()
  if (existingDraft) {
    showDraftModal.value = true
  } else {
    // 沒有草稿時，檢查是否看過教學
    const hasSeen = localStorage.getItem('hasSeenWillMusicTutorial')
    if (!hasSeen) {
      showTutorialModal.value = true
    }
  }
  
  // 初始化 Fabric 手繪
  initFabricBrush()
}

onMounted(async () => {
  // 在背景預載 Fabric.js（不 await，讓它在使用者閱讀規範的期間下載完畢）
  if (import.meta.client) {
    import('fabric').catch(() => {})
  }

  // waitForImages：加入 3 秒超時保護，防止 iOS 上部分圖片永遠不觸發 load/error 導致卡死
  const waitForImages = async () => {
    await nextTick()
    const images = Array.from(document.images)
    const timeout = new Promise<void>(resolve => setTimeout(resolve, 3000))
    const allLoaded = Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      })
    )
    await Promise.race([allLoaded, timeout])
  }

  const windowLoaded = new Promise<void>(resolve => {
    if (document.readyState === 'complete') {
      resolve()
    } else {
      window.addEventListener('load', () => resolve(), { once: true })
    }
  })

  // 等待字體載入與最小延遲（加入 5 秒整體超時，防止字體 API 掛住）
  try {
    const fontsReady = Promise.race([
      document.fonts.ready,
      new Promise<void>(resolve => setTimeout(resolve, 5000))
    ])
    await Promise.all([
      fontsReady,
      windowLoaded,
      waitForImages(),
      new Promise(resolve => setTimeout(resolve, 800))
    ])
  } catch (e) {
    console.warn('Font loading error', e)
  }
  loading.value = false

  await nextTick()

  // 處理 Token
  const tokenFromQuery = route.query.token as string
  if (tokenFromQuery) {
    saveToken(tokenFromQuery)
  }

  // Token 驗證預設關閉；若後台有設定，則即時跟隨後台開關。
  unsubTokenRequirement = onSnapshot(doc(db, 'system', 'editor_token_requirement'), (snap) => {
    if (!snap.exists()) {
      tokenRequiredForSubmit.value = false
      return
    }
    const data = snap.data() as { enabled?: boolean }
    tokenRequiredForSubmit.value = data.enabled === true
  })

  // Scale observer（加防抖：即使 interactive-widget=overlays-content 未生效的舊 iOS，
  // 也能限制鍵盤動畫期間最多每 150ms 觸發一次 Vue re-render，避免記憶體暴衝）
  if (canvasRef.value) {
    let resizeRafId: number | null = null
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry || entry.contentRect.width <= 0) return
      const newWidth = entry.contentRect.width
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId)
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null
        const scale = newWidth / VIRTUAL_SIZE
        if (scalerStyle.value.transform !== `scale(${scale})`) {
          scalerStyle.value = { transform: `scale(${scale})` }
        }
      })
    })
    resizeObserver.observe(canvasRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (_clampRafId !== null) { cancelAnimationFrame(_clampRafId); _clampRafId = null }
  if (drawSaveTimer) { clearTimeout(drawSaveTimer); drawSaveTimer = null; saveDraftData() }
  unsubTokenRequirement?.()
  unsubTokenRequirement = null
  fabricBrush.dispose()
})

// Auto-save on changes
watch([backgroundImage, shape], () => {
  saveDraftData()
})
</script>