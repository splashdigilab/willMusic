#!/usr/bin/env python3
"""
產生便利貼的陰影圖到 public/svg/shapes/shadow/。

為什麼陰影要預先算成圖片，而不是用 CSS 的 filter: drop-shadow：
  便利貼的形狀是內層的 mask-image 切出來的，drop-shadow 掛在外層，靠瀏覽器
  「先套遮罩、再算陰影」才會跟著形狀走。這個順序在圖層合成時不保證成立 ——
  內層一旦被拆成獨立的合成圖層（手繪的 canvas、動畫、捲動容器都可能觸發），
  陰影就可能改以整個 600×600 的方框計算，變成方形的影子。
  預先算好的陰影本身就是那個形狀，跟遮罩、合成都無關；
  而且每張便利貼只是多貼一張圖，不必每次重繪都跑一次模糊。

每個造型一張，與 public/svg/shapes/<id>.svg 同名。圖的範圍是 600×600 的
虛擬畫布往外各擴 MARGIN，便利貼放在正中央 —— _sticky-note.scss 的
$sticky-note-shadow-margin 必須與這裡的 MARGIN 相同。

用法：
    python3 scripts/shapes/build_shadows.py

需要：python3、Pillow（含 WebP）、Google Chrome（路徑不同時用 CHROME 環境變數指定）
產出會 commit 進 repo，只有新增造型或調整陰影時才需要重跑。
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SHAPES_DIR = ROOT / "public" / "svg" / "shapes"
OUT_DIR = SHAPES_DIR / "shadow"

CHROME = os.environ.get(
    "CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)

# 便利貼的虛擬畫布（StickyNote 的 __scaler 固定 600×600）
SIZE = 600
# 陰影圖往外擴的範圍。要蓋得住最遠的陰影：投影 7 + 3σ(6.5) ≈ 27
MARGIN = 32

# 疊在一起的陰影層，單位是虛擬畫布的 px；sigma 是高斯模糊的標準差。
# 投影的數值取自稿子：427px 的便利貼配 5px 位移、9px 模糊、不透明度 0.35，
# 換算到 600px 是位移 7、CSS blur 13（σ 6.5）。
# 接觸陰影是稿子之外補的：貼著邊緣的一道細暗線，讓便利貼像「貼在牆上」，
# 邊緣在淺色背景上也分得開。它很細，縮到首頁牆那麼小時自然就看不到。
LAYERS = [
    {"dx": 0, "dy": 1.5, "sigma": 1.5, "alpha": 0.22},  # 接觸陰影
    {"dx": 7, "dy": 7, "sigma": 6.5, "alpha": 0.35},  # 投影
]


def shape_markup(svg_text: str) -> tuple[str, str]:
    """取出 viewBox 與內容。Illustrator 匯出的檔案帶有 metadata 與註解，一併拿掉"""
    text = re.sub(r"<\?xml[^>]*>|<!--.*?-->|<metadata>.*?</metadata>", "", svg_text, flags=re.S)
    view_box = re.search(r'viewBox="([^"]+)"', text)
    body = re.search(r"<svg[^>]*>(.*)</svg>", text, flags=re.S)
    if not view_box or not body:
        raise ValueError("讀不到 viewBox 或 <svg> 內容")
    # 填色一律交給外層的黑色，各檔自帶的 fill 拿掉
    return view_box.group(1), re.sub(r'\sfill="[^"]*"', "", body.group(1))


def render(view_box: str, body: str, png: Path) -> None:
    canvas = SIZE + 2 * MARGIN
    layers = "".join(
        f'<svg viewBox="{view_box}" preserveAspectRatio="none" '
        f'style="position:absolute;left:{MARGIN + l["dx"]}px;top:{MARGIN + l["dy"]}px;'
        f'width:{SIZE}px;height:{SIZE}px;fill:#000;'
        f'filter:blur({l["sigma"]}px);opacity:{l["alpha"]}">{body}</svg>'
        for l in LAYERS
    )
    html = (
        '<!doctype html><html><body style="margin:0;background:transparent">'
        f'<div style="position:relative;width:{canvas}px;height:{canvas}px">{layers}</div>'
        "</body></html>"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html)
        page = Path(f.name)
    try:
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--default-background-color=00000000",
                f"--window-size={canvas},{canvas}",
                f"--screenshot={png}",
                page.as_uri(),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    finally:
        page.unlink()


def main() -> int:
    if not Path(CHROME).exists():
        print(f"找不到 Chrome：{CHROME}（用 CHROME 環境變數指定路徑）", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shapes = sorted(SHAPES_DIR.glob("*.svg"))
    with tempfile.TemporaryDirectory() as tmp:
        for svg in shapes:
            view_box, body = shape_markup(svg.read_text(encoding="utf-8"))
            png = Path(tmp) / f"{svg.stem}.png"
            render(view_box, body, png)

            image = Image.open(png).convert("RGBA")
            alpha = image.getchannel("A")
            # 最外圈一定要是全透明，否則代表 MARGIN 不夠、陰影被切掉了
            w, h = image.size
            edge = [alpha.getpixel((x, y)) for x in range(w) for y in (0, h - 1)]
            edge += [alpha.getpixel((x, y)) for y in range(h) for x in (0, w - 1)]
            if max(edge) > 0:
                print(f"{svg.name}：陰影碰到圖的邊緣，MARGIN 要加大", file=sys.stderr)
                return 1
            if alpha.getextrema()[1] == 0:
                print(f"{svg.name}：輸出是全透明的，造型沒有畫出來", file=sys.stderr)
                return 1

            out = OUT_DIR / f"{svg.stem}.webp"
            image.save(out, "WEBP", lossless=True, method=6)
            print(f"{out.relative_to(ROOT)}  {out.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
