#!/usr/bin/env python3
"""
產生 LINE Seed 網頁字型資產到 public/fonts/。

分三層，對應這個專案實際的用字行為：

  UI 層   介面文字是編譯時就固定的（約 1,300 字），裁成單一檔案直接 preload，
          介面永遠不會有 FOUT。便利貼內容沒有粗體選項（TextBlockInstance 只有
          color / align），所以 700 / 800 只需要這一層（800 是新視覺的大標字重）。
  TW 層   使用者輸入的中文，無法預先得知，依 unicode-range 分片讓瀏覽器只抓用到的字。
          已扣掉 UI 層的字，兩者 unicode-range 不重疊。
  KR 層   使用者輸入的韓文，同上。介面沒有韓文，所以只有 400。

來源字型會自動從 seed.line.me 下載到 .src/（已 gitignore）。
產出會 commit 進 repo，所以正常開發與部署都不需要跑這支腳本。

用法：
    python3 scripts/fonts/build.py

需要：python3、fonttools、brotli、npx（會自動取用 cn-font-split）
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = Path(__file__).resolve().parent / ".src"
OUT_DIR = ROOT / "public" / "fonts"

FAMILY = "LINE Seed"
CN_FONT_SPLIT = "cn-font-split@7.4.3"

# 每片越小，單張便利貼抓得越少，但每片有約 4.7KB 固定開銷。
# 實測（見 scripts/fonts/README.md）：8000 在編輯器情境最省。
CHUNK_SIZE = "8000"

DOWNLOADS = {
    "LINE_Seed_TW.zip": "https://seed.line.me/src/images/fonts/LINE_Seed_TW.zip",
    "LINE_Seed_Sans_KR.zip": "https://seed.line.me/src/images/fonts/LINE_Seed_Sans_KR.zip",
}

# zip 內的來源檔（zip 目錄名含空白，所以用 endswith 比對）
MEMBERS = {
    "tw-400": ("LINE_Seed_TW.zip", "WOFF2/LINESeedTW_OTF_Rg.woff2"),
    "tw-700": ("LINE_Seed_TW.zip", "WOFF2/LINESeedTW_OTF_Bd.woff2"),
    "tw-800": ("LINE_Seed_TW.zip", "WOFF2/LINESeedTW_OTF_Eb.woff2"),
    "kr-400": ("LINE_Seed_Sans_KR.zip", "Web/woff2/LINESeedKR-Rg.woff2"),
}

HANGUL_RANGES = "U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7A3,U+D7B0-D7FF"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def log(msg: str) -> None:
    print(f"[fonts] {msg}", flush=True)


def fetch_sources() -> None:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in DOWNLOADS.items():
        target = SRC_DIR / name
        if target.exists():
            log(f"已有 {name}（{target.stat().st_size / 1048576:.1f} MB）")
            continue
        log(f"下載 {name} …")
        # 先寫到 .part 再改名。中途斷線若直接留下正式檔名，之後每次執行都會
        # 因為「檔案已存在」而跳過下載，然後死在 BadZipFile，而且看不出原因。
        part = target.with_name(target.name + ".part")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=600) as resp:
            part.write_bytes(resp.read())
        part.rename(target)
        log(f"  {target.stat().st_size / 1048576:.1f} MB")

    for key, (zip_name, suffix) in MEMBERS.items():
        dest = SRC_DIR / f"{key}.woff2"
        if dest.exists():
            continue
        with zipfile.ZipFile(SRC_DIR / zip_name) as zf:
            member = next(
                n for n in zf.namelist() if n.endswith(suffix) and "__MACOSX" not in n
            )
            dest.write_bytes(zf.read(member))
        log(f"取出 {dest.name}（{dest.stat().st_size / 1048576:.2f} MB）")


def ui_charset() -> set[str]:
    """掃出介面可能渲染的每一個 CJK 字元。註解也一併納入：成本極低，
    但能保證不會漏掉任何字串常數（例如 showAlert 的訊息）。"""
    cjk = re.compile(r"[　-〿㄀-ㄯ一-鿿＀-￯]")
    chars: set[str] = set()
    patterns = ("app/**/*.vue", "app/**/*.ts", "app/**/*.scss", "server/**/*.ts", "nuxt.config.ts")
    for pattern in patterns:
        for path in ROOT.glob(pattern):
            chars.update(cjk.findall(path.read_text(encoding="utf-8", errors="replace")))

    # 不靠掃描也一定要有的：拉丁字母、數字、標點、全形符號
    chars.update(chr(c) for c in range(0x20, 0x7F))
    chars.update(chr(c) for c in range(0xA0, 0x100))
    chars.update("–—''“”…‰′″")
    chars.update(chr(c) for c in range(0x3000, 0x3040))
    chars.update(chr(c) for c in range(0xFF01, 0xFF61))
    return chars


def font_codepoints(path: Path) -> set[int]:
    from fontTools.ttLib import TTFont

    font = TTFont(path, lazy=True)
    cps: set[int] = set()
    for table in font["cmap"].tables:
        cps.update(table.cmap.keys())
    font.close()
    return cps


def subset(src: Path, dest: Path, *, text: str | None = None, unicodes: str | None = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    args = [
        sys.executable, "-m", "fontTools.subset", str(src),
        f"--output-file={dest}", "--flavor=woff2",
        "--no-hinting", "--desubroutinize",
    ]
    if unicodes:
        args.append(f"--unicodes={unicodes}")

    # 字集暫存檔放系統暫存目錄，不要寫進 public/fonts/：
    # 那是已進版控的目錄，中途失敗留下的檔案會被 git add -A 一起提交。
    charset_file: Path | None = None
    try:
        if text is not None:
            handle, path = tempfile.mkstemp(prefix="willmusic-charset-", suffix=".txt")
            charset_file = Path(path)
            with os.fdopen(handle, "w", encoding="utf-8") as fh:
                fh.write(text)
            args.append(f"--text-file={charset_file}")
        subprocess.run(args, check=True, capture_output=True)
    finally:
        if charset_file is not None:
            charset_file.unlink(missing_ok=True)


def split_font(src: Path, out_dir: Path, weight: int) -> None:
    """先產生到暫存目錄，成功之後才換掉正式目錄。

    不能先 rmtree 再跑外部指令：public/fonts/tw 底下有近七百個已進版控的
    分片，指令一失敗（離線、npm registry 連不上）就會留下一個空目錄，
    之後 `git add -A` 會把這幾百個刪除一起提交。
    """
    with tempfile.TemporaryDirectory(prefix="willmusic-fontsplit-") as tmp:
        staging = Path(tmp) / "out"
        staging.mkdir()
        subprocess.run(
            [
                "npx", "--yes", CN_FONT_SPLIT, "run",
                "-i", str(src), "-o", str(staging),
                "--css.fontFamily", FAMILY,
                "--css.fontWeight", str(weight),
                "--css.fontDisplay", "swap",
                "--chunkSize", CHUNK_SIZE,
                "--languageAreas", "true",
                "--testHtml", "false",
                "-r", "false",
            ],
            check=True,
            capture_output=True,
        )
        for junk in ("index.proto", "reporter.bin"):
            (staging / junk).unlink(missing_ok=True)

        if out_dir.exists():
            shutil.rmtree(out_dir)
        shutil.copytree(staging, out_dir)


def format_unicode_range(codepoints) -> str:
    """把散落的碼位合併成連續區間，CSS 會短很多也比較好讀。"""
    parts: list[str] = []
    ordered = sorted(set(codepoints))
    i = 0
    while i < len(ordered):
        start = end = ordered[i]
        while i + 1 < len(ordered) and ordered[i + 1] == end + 1:
            i += 1
            end = ordered[i]
        parts.append(f"U+{start:04X}" if start == end else f"U+{start:04X}-{end:04X}")
        i += 1
    return ",".join(parts)


def collect_faces(css_path: Path, url_prefix: str) -> list[str]:
    """取出 @font-face 區塊，改寫檔案路徑，並移除 local()。

    local() 會讓裝了同名字型的機器改用本機版本。本機版本可能是 LINE Seed Sans EN
    之類不含漢字的版本，會直接變成豆腐字；大螢幕必須逐字一致，所以一律走網路字型。
    """
    css = css_path.read_text(encoding="utf-8")
    faces: list[str] = []
    for block in re.findall(r"@font-face\{.*?\}", css, re.S):
        block = re.sub(r'src:\s*local\("[^"]*"\)\s*,\s*', "src:", block)
        block = block.replace('url("./', f'url("{url_prefix}')
        faces.append(block)
    return faces


def main() -> None:
    fetch_sources()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    ui_chars = ui_charset()
    log(f"介面字集：{len(ui_chars)} 字")

    # ── UI 層：400 / 700 / 800 各一個檔案，preload 用
    ui_ranges: dict[int, str] = {}
    ui_covered: set[int] = set()
    for weight in (400, 700, 800):
        dest = OUT_DIR / f"line-seed-ui-{weight}.woff2"
        subset(SRC_DIR / f"tw-{weight}.woff2", dest, text="".join(sorted(ui_chars)))
        # unicode-range 必須以「產出的字型實際有哪些字形」為準，不能用請求的字集。
        # 字集裡有不少字（例如大半個 Latin-1 補充區）LINE Seed TW 根本沒有收，
        # 宣告了卻沒有字形的話，那些字會靜靜掉到系統字，沒有任何地方會報錯。
        actual = font_codepoints(dest)
        ui_ranges[weight] = format_unicode_range(actual)
        ui_covered |= actual
        log(f"UI {weight}：{dest.stat().st_size / 1024:.0f} KB，實際收錄 {len(actual)} 字")

    log(f"介面字集請求 {len(ui_chars)} 字，字型實際有 {len(ui_covered)} 字")

    # ── TW 內容層：全字集扣掉 UI 層「實際涵蓋」的字，確保兩層既不重疊也不留縫
    tw_all = font_codepoints(SRC_DIR / "tw-400.woff2")
    tw_content = "".join(sorted(chr(c) for c in tw_all if c not in ui_covered))
    log(f"中文內容字集：{len(tw_content)} 字")
    tw_src = SRC_DIR / "tw-content-400.woff2"
    subset(SRC_DIR / "tw-400.woff2", tw_src, text=tw_content)
    split_font(tw_src, OUT_DIR / "tw", 400)
    tw_faces = collect_faces(OUT_DIR / "tw" / "result.css", "/fonts/tw/")
    (OUT_DIR / "tw" / "result.css").unlink()
    log(f"中文內容分片：{len(tw_faces)} 片")

    # ── KR 內容層：只留韓文，拉丁與標點交給 TW，避免兩邊搶同一個字
    kr_src = SRC_DIR / "kr-hangul-400.woff2"
    subset(SRC_DIR / "kr-400.woff2", kr_src, unicodes=HANGUL_RANGES)
    split_font(kr_src, OUT_DIR / "kr", 400)
    kr_faces = collect_faces(OUT_DIR / "kr" / "result.css", "/fonts/kr/")
    (OUT_DIR / "kr" / "result.css").unlink()
    log(f"韓文內容分片：{len(kr_faces)} 片")

    # ── 輸出兩個 CSS，因為兩者的載入時機需求不同：
    #    line-seed-ui.css  介面字，約 13KB，由 nuxt.config 在建置時內嵌進 <head>，
    #                      零額外請求，介面不會有 FOUT。
    #    line-seed.css     內容分片，約 250KB，獨立樣式表，可被快取。
    #    兩者 unicode-range 完全不重疊（build 後可用 scripts/fonts/verify.py 驗證）。
    header = (
        "/* LINE Seed — 由 scripts/fonts/build.py 產生，請勿手動編輯。\n"
        " * LINE Seed TW / LINE Seed Sans KR, (c) LY Corporation,\n"
        " * SIL Open Font License 1.1 — https://seed.line.me/\n"
        " */\n"
    )
    ui_faces = [
        f'@font-face{{font-family:"{FAMILY}";'
        f'src:url("/fonts/line-seed-ui-{w}.woff2")format("woff2");'
        f"font-style:normal;font-display:swap;font-weight:{w};"
        f"unicode-range:{ui_ranges[w]};}}"
        for w in (400, 700, 800)
    ]
    (OUT_DIR / "line-seed-ui.css").write_text(
        header + "\n".join(ui_faces) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "line-seed.css").write_text(
        header + "\n".join(tw_faces + kr_faces) + "\n", encoding="utf-8"
    )

    total = sum(p.stat().st_size for p in OUT_DIR.rglob("*") if p.is_file())
    log(f"完成：public/fonts 共 {total / 1048576:.2f} MB")


if __name__ == "__main__":
    main()
