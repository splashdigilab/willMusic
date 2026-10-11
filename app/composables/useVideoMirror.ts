import { onBeforeUnmount, type Ref } from 'vue'

/**
 * 把一支 <video> 的畫面逐格畫到 <canvas> 上。
 *
 * 大螢幕的插播影片要在左右兩個螢幕同時出現。原本是兩個 <video> 放同一個網址，
 * 等於同一支影片解碼兩次，右邊再靠 timeupdate 跳轉去對齊左邊 —— 每次跳轉都要
 * 從關鍵格重新解碼，弱一點的機器上右螢幕會頓一下。改成只有左邊解碼，右邊照著畫，
 * 兩邊永遠同一格。
 *
 * 影片在別的網域（Firebase Storage）時，畫上去的 canvas 會被標成 tainted：
 * 只是不能再把像素讀回來，顯示不受影響，所以不需要設 CORS。
 */
export function useVideoMirror(
  source: Ref<HTMLVideoElement | null>,
  target: Ref<HTMLCanvasElement | null>
) {
  let running = false
  let handle: number | null = null
  let usingFrameCallback = false

  const draw = () => {
    const video = source.value
    const canvas = target.value
    // HAVE_CURRENT_DATA 以上才有畫面可畫
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return
    // canvas 用影片原本的解析度，縮放交給 CSS 的 object-fit: contain（跟 <video> 一樣）
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  }

  const schedule = () => {
    const video = source.value
    if (!running || !video) return
    // requestVideoFrameCallback 只在影片真的出了新的一格時才呼叫，不會白畫；
    // 不支援的瀏覽器退回每幀畫一次
    if ('requestVideoFrameCallback' in video) {
      usingFrameCallback = true
      handle = video.requestVideoFrameCallback(tick)
    } else {
      usingFrameCallback = false
      handle = requestAnimationFrame(tick)
    }
  }

  function tick() {
    if (!running) return
    draw()
    schedule()
  }

  /** 開始照著畫。先清掉上一次留下的最後一格，免得新影片的第一格出來前閃到舊畫面 */
  const start = () => {
    if (running) return
    const canvas = target.value
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    running = true
    draw()
    schedule()
  }

  const stop = () => {
    running = false
    if (handle === null) return
    if (usingFrameCallback) source.value?.cancelVideoFrameCallback(handle)
    else cancelAnimationFrame(handle)
    handle = null
  }

  onBeforeUnmount(stop)

  return { start, stop }
}
