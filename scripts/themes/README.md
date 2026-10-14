# 節慶主題素材

從 Illustrator 稿子取出節慶主題用的素材（造型、貼紙、開場畫面的圖），輸出到 `public/`。
主題怎麼切換、能決定哪些事，見 `app/data/themes.ts`。

```bash
python3 scripts/themes/halloween.py           # 只輸出到 /tmp/willmusic-theme-halloween，附預覽表 sheet.png
python3 scripts/themes/halloween.py --write   # 寫進 public/
python3 scripts/shapes/build_shadows.py       # 有新造型時，接著產生陰影
```

需要 `python3`（Pillow、numpy、fontTools、pymupdf）、`rsvg-convert`、`cwebp`。
稿子路徑用環境變數 `AI_FILE` 指定（預設是萬聖節那份），產物已進版控，一般開發不需要跑。

## 為什麼不用 Illustrator MCP

這份稿子物件多，Illustrator MCP 每匯出一個物件要一分多鐘，還常常沒反應。
`.ai` 存檔時預設會附一份 PDF，`ai2svg.py` 直接讀那一層：路徑、填色、漸層、
透明度與混合模式都拿得到，幾秒跑完，Illustrator 也不用開。

`ai2svg.py` 單獨執行會把每個畫板輸出成 `page{n}.svg` 與 `page{n}.json`（每個物件的填色、
外框、混合模式），新稿子先跑一次、對照 json 找出要的物件是第幾個：

```bash
python3 scripts/themes/ai2svg.py /tmp/ai2svg
```

它**不支援** soft mask（明度遮罩）與 knockout 群組。用到這兩種效果的東西改用 MuPDF 算成點陣圖
（`halloween.py` 的 `render_page_raster`）—— 萬聖節開場的紫色斜紋就是：摺痕是細長漸層加明度遮罩，
走 SVG 轉換會變成一條糊糊的深色帶。

## 萬聖節做了什麼

**造型與貼紙**（`public/svg/shapes/`、`public/svg/stickers/halloween-*-face.svg`）

稿子畫板上方的南瓜、骷髏、幽靈都是歪的，取牆面圖樣（畫板 02）裡同一組輪廓轉正：

| | 怎麼判定「正」 | 角度 |
|---|---|---|
| 南瓜 | 開場畫板 01 的大南瓜是正的、與牆上的南瓜同一個輪廓，用形狀比對（IoU ≈ 1）找角度 | 18.40° |
| 骷髏 | 兩個眼窩是同尺寸的橢圓，眼心連線水平 | −15.65° |
| 幽靈 | 牆上中間偏左那隻本來就是正的，直接用 | 0° |

本體與臉用同一個角度轉。骷髏本體在牆上是複合路徑（眼窩、鼻孔挖空），當遮罩會在便利貼上開洞，
只留外輪廓 —— 與畫板上方的素材一樣是實心的。造型輸出成與既有造型相同的格式（正方形 viewBox、填黑）。

**開場畫面**（`public/themes/halloween/`）

| 檔案 | 內容 |
|---|---|
| `intro-bg.webp` | 紫色斜紋，MuPDF 算圖，2160×3840 |
| `intro-hero.svg` | 南瓜（漸層）＋陰影＋兩隻蝙蝠＋標題。標題用稿子內嵌的 LINE Seed TW ExtraBold 轉外框，介面字型子集沒有「聖」 |
| `web-*.svg`、`spider-*.svg` | 角落蜘蛛網、垂吊蜘蛛 |
| `logo-intro.svg` | 開場字標。稿子是白字經過混合模式變成的淡紫，從預覽圖取樣成 #B79ED9 |

南瓜的陰影在稿子裡是一張模糊的黑色點陣（Multiply 50%），量出位移 8.8、模糊 σ 9 之後改用 SVG 濾鏡，
只套在南瓜上（蝙蝠、標題不帶陰影）。執行時印出的 layout 是各物件在 1080×1920 上的座標，
`app/assets/scss/themes/_halloween.scss` 的 `u(N)` 數字就是從這裡來的。

## 下一個節慶

照 `app/data/themes.ts` 開頭的步驟加主題。素材的取法可以照這支複製一份改：
物件編號換成新稿子的（先跑 `ai2svg.py` 看 json），轉正方式依形狀挑上面三種之一。
