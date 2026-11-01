#!/usr/bin/env python3
"""
檢查 public/fonts/ 的產出是否正確，並量出實際下載成本。

會驗證四件事：
  1. CSS 裡沒有殘留 local()（會讓裝了同名字型的機器改用本機版本，大螢幕就會不一致）
  2. 介面層與內容層的 unicode-range 完全不重疊（重疊會讓瀏覽器多抓一片）
  3. 每個 @font-face 宣告的 unicode-range，字型檔裡真的都有對應字形
  4. 實際文字的下載成本落在合理範圍

第 3 項是最容易出錯也最難發現的：宣告了字型檔裡沒有的碼位，瀏覽器會把那個檔案
抓下來、找不到字形、再默默掉到系統字，畫面上看得出來但沒有任何地方會報錯。

用法：
    python3 scripts/fonts/verify.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = ROOT / "public" / "fonts"

SAMPLES = {
    "一張中文便利貼": "親愛的哥哥們謝謝你們的歌陪我度過每一個難過的日子希望你們永遠健康快樂演唱會我一定會到現場應援愛你們",
    "一張韓文便利貼": "오빠들사랑해요항상응원할게요콘서트에서만나요건강하고행복하세요최고예요진짜고마워요",
    "中韓混合便利貼": "오빠사랑해永遠支持你們謝謝화이팅",
}

# 單張便利貼額外抓超過這個量就代表分片策略出問題了
MAX_NOTE_COST_BYTES = 150 * 1024


def parse_faces(css: str) -> list[dict]:
    faces = []
    for block in re.findall(r"@font-face\{.*?\}", css, re.S):
        m_url = re.search(r'url\("([^"]+)"\)', block)
        m_range = re.search(r"unicode-range:([^;}]+)", block)
        m_weight = re.search(r"font-weight:(\d+)", block)
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
        rel = m_url.group(1).lstrip("/").removeprefix("fonts/")
        weight = int(m_weight.group(1)) if m_weight else None
        faces.append({"cps": cps, "path": FONT_DIR / rel, "url": m_url.group(1), "weight": weight})
    for face in faces:
        face["size"] = face["path"].stat().st_size
    return faces


def font_codepoints(path: Path) -> set[int]:
    font = TTFont(path, lazy=True)
    cps: set[int] = set()
    for table in font["cmap"].tables:
        cps.update(table.cmap.keys())
    font.close()
    return cps


def main() -> int:
    ui_css = (FONT_DIR / "line-seed-ui.css").read_text(encoding="utf-8")
    content_css = (FONT_DIR / "line-seed.css").read_text(encoding="utf-8")

    ui_faces = parse_faces(ui_css)
    content_faces = parse_faces(content_css)
    ok = True

    print(f"介面層 @font-face: {len(ui_faces)}    內容層 @font-face: {len(content_faces)}")
    print(f"介面 CSS {len(ui_css.encode())/1024:.1f} KB（內嵌）"
          f"    內容 CSS {len(content_css.encode())/1024:.1f} KB（獨立樣式表）")

    # ── 1. local() 殘留
    if "local(" in ui_css or "local(" in content_css:
        print("✗ CSS 仍含 local()：裝有同名字型的機器會改用本機版本，大螢幕會不一致")
        ok = False
    else:
        print("✓ 無 local() 殘留")

    # ── 2. unicode-range 重疊
    ui_cps: set[int] = set().union(*[f["cps"] for f in ui_faces]) if ui_faces else set()
    content_cps: set[int] = set().union(*[f["cps"] for f in content_faces]) if content_faces else set()
    overlap = ui_cps & content_cps
    if overlap:
        print(f"✗ 介面層與內容層 unicode-range 重疊 {len(overlap)} 個碼位")
        ok = False
    else:
        print("✓ 介面層與內容層 unicode-range 不重疊")
    print(f"  總涵蓋 {len(ui_cps | content_cps):,} 個碼位")

    # ── 3. 宣告的 unicode-range 是否真的有字形
    ghost_total = 0
    for face in ui_faces + content_faces:
        ghosts = face["cps"] - font_codepoints(face["path"])
        if ghosts:
            ghost_total += len(ghosts)
            sample = "".join(chr(c) for c in sorted(ghosts)[:12])
            print(f"✗ {face['url']} 宣告了 {len(ghosts)} 個沒有字形的碼位，例如：{sample}")
    if ghost_total:
        print(f"✗ 共 {ghost_total} 個碼位宣告了卻沒有字形，這些字會靜靜掉到系統字")
        ok = False
    else:
        print(f"✓ {len(ui_faces) + len(content_faces)} 個 @font-face 宣告的碼位都有對應字形")

    # ── 4. 下載成本
    # 介面層三份（見 build.py）：首頁開場那份每頁都預載，-front 是編輯器這些前台頁面另外預載的，
    # -more（後台、LED 牆、條款頁才有的字）用到才下載
    home = [f for f in ui_faces if "/line-seed-ui-front-" not in f["url"] and "/line-seed-ui-more-" not in f["url"]]
    front = [f for f in ui_faces if "/line-seed-ui-front-" in f["url"]]
    on_demand = [f for f in ui_faces if "/line-seed-ui-more-" in f["url"]]
    print(f"\n首頁固定成本（首頁開場的介面字 400／700／800）: {sum(f['size'] for f in home)/1024:.0f} KB")
    print(f"其他前台頁面另外預載（編輯器、我的便利貼）: {sum(f['size'] for f in front)/1024:.0f} KB")
    print(f"介面字其他（後台、LED 牆、條款頁才下載）: {sum(f['size'] for f in on_demand)/1024:.0f} KB")

    # 以編輯器為準（首頁開場與前台兩份都預載了），算一張便利貼還要多抓多少。便利貼上的字一律是 700
    free_cps: set[int] = set().union(*[f["cps"] for f in home + front if f["weight"] == 700])
    paid_faces = [f for f in on_demand if f["weight"] == 700] + content_faces

    def cost(text: str) -> tuple[int, int, str]:
        hit, missing = set(), []
        for ch in set(text):
            cp = ord(ch)
            if cp in free_cps:
                continue
            for i, f in enumerate(paid_faces):
                if cp in f["cps"]:
                    hit.add(i)
                    break
            else:
                missing.append(ch)
        return len(hit), sum(paid_faces[i]["size"] for i in hit), "".join(missing)

    print("額外成本（依畫面上的文字）:")
    for label, text in SAMPLES.items():
        n, b, miss = cost(text)
        flag = "✓"
        if miss:
            flag = "✗"
            ok = False
        elif b > MAX_NOTE_COST_BYTES:
            flag = "✗"
            ok = False
        note = f"  ← 未涵蓋: {miss}" if miss else ""
        print(f"  {flag} {label:<16} 額外 {n:>3} 片 / {b/1024:>6.1f} KB{note}")

    total = sum(p.stat().st_size for p in FONT_DIR.rglob("*") if p.is_file())
    count = sum(1 for p in FONT_DIR.rglob("*") if p.is_file())
    print(f"\npublic/fonts 總計 {total/1048576:.2f} MB / {count} 個檔案")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
