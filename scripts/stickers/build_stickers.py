#!/usr/bin/env python3
"""
整理貼紙圖檔：產生 STEP 5 選單用的縮圖、把太重的貼紙換成小尺寸的 WebP。

為什麼要做：
  貼紙在畫面上很小（選單格子約 22px、首頁牆上十幾 px、大螢幕放大 3 倍也才 160px 左右），
  但原始檔有的是 2084×2084 的 WebP（解碼後一張 17MB）、有的是上百 KB 的 SVG，
  或帶模糊濾鏡的 SVG（每次重畫都要重算一次模糊）。打開 STEP 5 時選單前幾格就是這些大圖，
  手機上可能一次吃掉上百 MB 記憶體。

做三件事（依 app/data/stickers.ts 的 STICKER_LIBRARY）：
  1. 每張貼紙產生一張 THUMB_SIZE 的縮圖到 public/svg/stickers/thumb/<id>.webp，給選單用。
  2. 點陣貼紙邊長超過 DISPLAY_SIZE 的，原地縮到 DISPLAY_SIZE（舊的大圖在 git 歷史裡）。
  3. SVG 貼紙若超過 HEAVY_SVG_BYTES 或帶 <filter>，轉成同名的 DISPLAY_SIZE WebP。
     原本的 SVG 留著當來源；stickers.ts 要改指向 .webp（腳本會列出要改哪幾筆）。
     之後重跑時，指向 .webp 而旁邊有同名 .svg 的，一律從 SVG 重新產生。

用法：
    python3 scripts/stickers/build_stickers.py

需要：python3、Pillow（含 WebP）、Google Chrome（路徑不同時用 CHROME 環境變數指定）
產出會 commit 進 repo，只有新增或更換貼紙時才需要重跑。
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
PUBLIC = ROOT / "public"
LIBRARY = ROOT / "app" / "data" / "stickers.ts"
THUMB_DIR = PUBLIC / "svg" / "stickers" / "thumb"

CHROME = os.environ.get(
    "CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)

# 選單格子在 3 倍螢幕上約 120 實際像素，留一點餘裕
THUMB_SIZE = 144
# 便利貼上的貼紙：大螢幕放大 3 倍約 160px、手機預覽放大 2 倍約 350 實際像素。
# 不取 1024：iPhone 解碼時不會依顯示大小縮小取樣，1024² 一張就是 4MB，首頁牆上幾十張會撐爆記憶體
DISPLAY_SIZE = 512
HEAVY_SVG_BYTES = 40 * 1024
WEBP_QUALITY = 85
THUMB_QUALITY = 80


def library() -> list[tuple[str, str]]:
    text = LIBRARY.read_text(encoding="utf-8")
    entries = re.findall(r"id:\s*'([^']+)'[^}]*?svgFile:\s*'([^']+)'", text)
    if not entries:
        raise SystemExit("讀不到 STICKER_LIBRARY 的內容")
    return entries


def render_svg(svg: Path, size: int, out_png: Path) -> None:
    """用 Chrome 把 SVG 畫成 size×size 的透明 PNG（等比縮放、置中，與畫面上的 object-fit: contain 相同）"""
    html = (
        '<!doctype html><html><body style="margin:0;background:transparent">'
        f'<img src="{svg.as_uri()}" style="display:block;width:{size}px;height:{size}px;object-fit:contain">'
        "</body></html>"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html)
        page = Path(f.name)
    try:
        subprocess.run(
            [
                CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", "--default-background-color=00000000",
                f"--window-size={size},{size}", f"--screenshot={out_png}", page.as_uri(),
            ],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    finally:
        page.unlink()


def fit(image: Image.Image, size: int) -> Image.Image:
    """等比縮進 size×size 的透明方框正中央"""
    image = image.convert("RGBA")
    image.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def save_webp(image: Image.Image, out: Path, quality: int) -> None:
    if image.getchannel("A").getextrema()[1] == 0:
        raise SystemExit(f"{out.name}：輸出是全透明的，來源沒有畫出來")
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, "WEBP", quality=quality, method=6)


def is_heavy_svg(path: Path) -> bool:
    return path.stat().st_size > HEAVY_SVG_BYTES or "<filter" in path.read_text(
        encoding="utf-8", errors="replace"
    )


def main() -> int:
    if not Path(CHROME).exists():
        print(f"找不到 Chrome：{CHROME}（用 CHROME 環境變數指定路徑）", file=sys.stderr)
        return 1

    to_repoint: list[tuple[str, str, str]] = []
    resized = rasterized = 0
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for sticker_id, src in library():
            path = PUBLIC / src.lstrip("/")
            svg_source = path if path.suffix == ".svg" else path.with_suffix(".svg")
            has_svg = svg_source.exists()

            # 來源：有 SVG 就從 SVG 畫（畫得比點陣縮圖銳利），否則直接讀點陣
            def source(size: int) -> Image.Image:
                if has_svg:
                    png = tmp_dir / f"{sticker_id}-{size}.png"
                    render_svg(svg_source, size, png)
                    return Image.open(png)
                return Image.open(path)

            # 3. 太重的 SVG 換成 WebP（以及之前已經換過、要從 SVG 重新產生的）
            if has_svg and (path.suffix == ".webp" or is_heavy_svg(svg_source)):
                webp = svg_source.with_suffix(".webp")
                save_webp(fit(source(DISPLAY_SIZE), DISPLAY_SIZE), webp, WEBP_QUALITY)
                rasterized += 1
                if path.suffix == ".svg":
                    to_repoint.append((sticker_id, src, src[:-4] + ".webp"))
            # 2. 點陣大圖原地縮小
            elif not has_svg:
                with Image.open(path) as im:
                    too_big = max(im.size) > DISPLAY_SIZE
                if too_big:
                    save_webp(fit(Image.open(path), DISPLAY_SIZE), path, WEBP_QUALITY)
                    resized += 1

            # 1. 選單縮圖
            save_webp(fit(source(THUMB_SIZE), THUMB_SIZE), THUMB_DIR / f"{sticker_id}.webp", THUMB_QUALITY)

    print(f"縮圖 {len(library())} 張、點陣縮小 {resized} 張、SVG 轉 WebP {rasterized} 張")
    if to_repoint:
        print("\nstickers.ts 要把下面幾筆的 svgFile 改成 .webp：")
        for sticker_id, old, new in to_repoint:
            print(f"  {sticker_id}: {old} → {new}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
