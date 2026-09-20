#!/usr/bin/env python3
"""
檢查 public/fonts/ 的產出是否正確，並量出實際下載成本。

會驗證三件事：
  1. 介面層與內容層的 unicode-range 完全不重疊（重疊會讓瀏覽器多抓一片）
  2. CSS 裡沒有殘留 local()（會讓裝了同名字型的機器改用本機版本，大螢幕就會不一致）
  3. 介面文字應該幾乎完全由預載檔覆蓋，不需要額外抓分片

用法：
    python3 scripts/fonts/verify.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = ROOT / "public" / "fonts"

SAMPLES = {
    "一張中文便利貼": "親愛的哥哥們謝謝你們的歌陪我度過每一個難過的日子希望你們永遠健康快樂演唱會我一定會到現場應援愛你們",
    "一張韓文便利貼": "오빠들사랑해요항상응원할게요콘서트에서만나요건강하고행복하세요최고예요진짜고마워요",
    "中韓混合便利貼": "오빠사랑해永遠支持你們謝謝화이팅",
}


def parse_faces(css: str, base: Path):
    faces = []
    for block in re.findall(r"@font-face\{.*?\}", css, re.S):
        m_url = re.search(r'url\("([^"]+)"\)', block)
        m_range = re.search(r"unicode-range:([^;}]+)", block)
        if not m_url:
            continue
        cps: set[int] = set()
        if m_range:
            for part in m_range.group(1).split(","):
                p = part.strip().lower().removeprefix("u+")
                if not p:
                    continue
                if "-" in p:
                    lo, hi = p.split("-", 1)
                    cps.update(range(int(lo, 16), int(hi, 16) + 1))
                else:
                    cps.add(int(p, 16))
        path = base / m_url.group(1).lstrip("/").removeprefix("fonts/")
        faces.append({"cps": cps, "size": path.stat().st_size, "url": m_url.group(1)})
    return faces


def main() -> int:
    ui_css = (FONT_DIR / "line-seed-ui.css").read_text(encoding="utf-8")
    content_css = (FONT_DIR / "line-seed.css").read_text(encoding="utf-8")

    ui_faces = parse_faces(ui_css, FONT_DIR)
    content_faces = parse_faces(content_css, FONT_DIR)
    ok = True

    print(f"介面層 @font-face: {len(ui_faces)}    內容層 @font-face: {len(content_faces)}")
    print(f"介面 CSS {len(ui_css.encode())/1024:.1f} KB（內嵌）"
          f"    內容 CSS {len(content_css.encode())/1024:.1f} KB（獨立樣式表）")

    # 1. local() 殘留
    if "local(" in ui_css or "local(" in content_css:
        print("✗ CSS 仍含 local()：裝有同名字型的機器會改用本機版本，大螢幕會不一致")
        ok = False
    else:
        print("✓ 無 local() 殘留")

    # 2. unicode-range 重疊
    ui_cps: set[int] = set().union(*[f["cps"] for f in ui_faces]) if ui_faces else set()
    content_cps: set[int] = set().union(*[f["cps"] for f in content_faces]) if content_faces else set()
    overlap = ui_cps & content_cps
    if overlap:
        print(f"✗ 介面層與內容層 unicode-range 重疊 {len(overlap)} 個碼位")
        ok = False
    else:
        print("✓ 介面層與內容層 unicode-range 不重疊")
    print(f"  總涵蓋 {len(ui_cps | content_cps):,} 個碼位")

    # 3. 下載成本
    preload = sum(f["size"] for f in ui_faces)
    print(f"\n每頁固定成本（介面字 400+700）: {preload/1024:.0f} KB")

    def cost(text: str) -> tuple[int, int, str]:
        hit, missing = set(), []
        for ch in set(text):
            cp = ord(ch)
            if cp in ui_cps:
                continue
            for i, f in enumerate(content_faces):
                if cp in f["cps"]:
                    hit.add(i)
                    break
            else:
                missing.append(ch)
        return len(hit), sum(content_faces[i]["size"] for i in hit), "".join(missing)

    print("額外成本（依畫面上的文字）:")
    ui_text_chars = "".join(chr(c) for c in sorted(ui_cps) if c > 0x2000)
    n, b, miss = cost(ui_text_chars)
    if b > 32 * 1024:
        print(f"✗ 介面文字竟需額外抓 {b/1024:.1f} KB，預載檔應該要完全覆蓋才對")
        ok = False
    else:
        print(f"✓ {'全部介面文字':<16} 額外 {n} 片 / {b/1024:.1f} KB")

    for label, text in SAMPLES.items():
        n, b, miss = cost(text)
        note = f"  ← 未涵蓋: {miss}" if miss else ""
        print(f"  {label:<16} 額外 {n:>3} 片 / {b/1024:>6.1f} KB{note}")

    total = sum(p.stat().st_size for p in FONT_DIR.rglob("*") if p.is_file())
    count = sum(1 for p in FONT_DIR.rglob("*") if p.is_file())
    print(f"\npublic/fonts 總計 {total/1048576:.2f} MB / {count} 個檔案")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
