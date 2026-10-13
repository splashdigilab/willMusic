"""產生分享預覽圖 public/og-image.jpg（原稿是同目錄的 og-image.html）。

    python3 scripts/og/build.py

需要本機裝好 Google Chrome 與 Pillow。產物已進版控，部署不需要跑這支。

輸出 JPEG 而不是 PNG：底圖是條紋漸層，PNG 會到 1MB 上下，LINE、Facebook 抓預覽圖
都有大小與逾時限制，太大的圖可能直接不顯示。
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/og/og-image.html"
OUT = ROOT / "public/og-image.jpg"
WIDTH, HEIGHT = 1200, 630
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "og.png"
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                # 原稿用相對路徑讀 public/ 的字型與圖片，file:// 底下 Chrome 預設會擋字型
                "--allow-file-access-from-files",
                f"--user-data-dir={tmp}/profile",
                f"--window-size={WIDTH},{HEIGHT}",
                "--virtual-time-budget=5000",
                f"--screenshot={png}",
                SRC.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
        image = Image.open(png).convert("RGB")
        if image.size != (WIDTH, HEIGHT):
            sys.exit(f"截圖尺寸是 {image.size}，不是 {WIDTH}×{HEIGHT}")
        image.save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{OUT.relative_to(ROOT)}：{OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
