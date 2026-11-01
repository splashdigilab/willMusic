#!/usr/bin/env python3
"""
產生 LINE Seed 網頁字型資產到 public/fonts/。

分三層，對應這個專案實際的用字行為：

  UI 層   介面文字是編譯時就固定的（約 900 字）。三種字重：400 內文、700 強調、800 新視覺大標。
          每個字重依「多早需要」拆成三個檔案，前台介面不會有 FOUT：
            line-seed-ui-*        首頁開場的字（約 40KB），每一頁都 preload
            line-seed-ui-front-*  其他前台頁面（編輯器、我的便利貼）的字，那些頁面 preload；
                                  首頁等 START 能按之後才抓，點進編輯器時已經在手機裡
            line-seed-ui-more-*   只有後台、LED 牆、條款與隱私權頁才有的字，不 preload，
                                  靠 unicode-range 讓瀏覽器畫到那些字才下載
  TW 層   使用者輸入的中文，無法預先得知，依 unicode-range 分片讓瀏覽器只抓用到的字。
          已扣掉 UI 層的字，兩者 unicode-range 不重疊。
          字重為 700：便利貼上的文字統一走粗體。這一層只有單一字重，
          所以是「換一份」而非「多一份」，檔案數與體積不變。
  KR 層   使用者輸入的韓文，同上，字重同樣是 700。
  語言層  日文、韓文介面的字（app/locales/ja、ko 掃出來的），各一個小檔，
          只有選了那個語言才載入（app/utils/locale-fonts.ts）。用獨立的 font-family，
          不跟上面幾層搶同一個字：日文介面不能沿用 TW，日文的漢字（応、気）TW 沒有，
          共用的漢字字形也是台灣的寫法。

來源字型會自動從 seed.line.me 下載到 .src/（已 gitignore）。
產出會 commit 進 repo，所以正常開發與部署都不需要跑這支腳本。

用法：
    python3 scripts/fonts/build.py              # 全部重建
    python3 scripts/fonts/build.py --locale-ui  # 只重建語言層（改了日文、韓文翻譯之後跑這個）
    python3 scripts/fonts/build.py --ui         # 只重新分配介面層的三份（涵蓋的字不變，內容分片不動）

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
    "LINE_Seed_JP.zip": "https://seed.line.me/src/images/fonts/LINE_Seed_JP.zip",
}

# zip 內的來源檔（zip 目錄名含空白，所以用 endswith 比對）
MEMBERS = {
    "tw-400": ("LINE_Seed_TW.zip", "WOFF2/LINESeedTW_OTF_Rg.woff2"),
    "tw-700": ("LINE_Seed_TW.zip", "WOFF2/LINESeedTW_OTF_Bd.woff2"),
    "tw-800": ("LINE_Seed_TW.zip", "WOFF2/LINESeedTW_OTF_Eb.woff2"),
    "kr-400": ("LINE_Seed_Sans_KR.zip", "Web/woff2/LINESeedKR-Rg.woff2"),
    "kr-700": ("LINE_Seed_Sans_KR.zip", "Web/woff2/LINESeedKR-Bd.woff2"),
    "jp-400": ("LINE_Seed_JP.zip", "Web/WOFF2/LINESeedJP_OTF_Rg.woff2"),
    "jp-700": ("LINE_Seed_JP.zip", "Web/WOFF2/LINESeedJP_OTF_Bd.woff2"),
    "jp-800": ("LINE_Seed_JP.zip", "Web/WOFF2/LINESeedJP_OTF_Eb.woff2"),
}

# 語言層：每個介面語言用哪一套字、哪幾個字重、收哪些字。
# 韓文沒有 800（LINE Seed Sans KR 只有 Th／Rg／Bd），800 的大標由瀏覽器挑 700。
# 拉丁字母與一般標點不收，交給介面層的 TW，各語言的英數字長得一樣。
LOCALE_UI = {
    "ja": {
        "family": "LINE Seed JP UI",
        "source": "jp",
        "weights": (400, 700, 800),
        # 全形標點、假名、漢字、全形英數
        "chars": re.compile(r"[　-ヿ㐀-䶿一-鿿＀-￯]"),
    },
    "ko": {
        "family": "LINE Seed KR UI",
        "source": "kr",
        "weights": (400, 700),
        "chars": re.compile(r"[ᄀ-ᇿ㄰-㆏가-힣]"),
    },
}

# 這些語言的翻譯檔不算進繁中介面字集，否則日文的漢字會被塞進每個人都要預載的 TW 介面字型
LOCALE_DIRS_EXCLUDED_FROM_TW = ("app/locales/en/", "app/locales/ja/", "app/locales/ko/")

UI_WEIGHTS = (400, 700, 800)

# 介面層的三份怎麼分，下面兩組都是路徑開頭比對。列錯只影響快慢、不影響顯示：
# 每個字都一定在其中一份裡，只是那份晚一點下載的話，那幾個字會先用系統字、載完再換（font-display: swap）。
# 每一份的 700 都由 plugins/content-font.client.ts 在畫面接手後提前抓：便利貼的字一律 700，
# 常用字（快樂、希望）不一定在首頁那份裡。

# 首頁一進來、按 START 之前畫面上會出現的字（line-seed-ui-*，每一頁都 preload）。
# 登入卡片、牆上的其他文字要按 START 之後才看得到，不必列：首頁在 START 能按之後就會抓 -front。
# 首頁多了新的元件或翻譯檔要加進來，不然開場會有幾個字晚一點才換成 LINE Seed。
UI_HOME_SOURCES = (
    "app/pages/index.vue",
    "app/components/theme/HalloweenIntro.vue",
    "app/components/LocaleMenu.vue",
    "app/components/AppModal.vue",
    "app/locales/zh-TW/home.ts",
    "app/locales/zh-TW/common.ts",
    # 語言選單上的語言名稱
    "app/utils/i18n.ts",
    "app/assets/scss/pages/_index.scss",
    "app/assets/scss/themes/",
)

# 只有後台、LED 牆、條款與隱私權頁會用到的檔案。這些檔案「獨有」的字
# 放進 line-seed-ui-more-*，不 preload，前台的人不用下載。
# data/terms.ts 不能列：編輯器開場的活動規範（TERMS_RULES）就在裡面。
UI_SECONDARY_SOURCES = (
    "app/pages/admin.vue",
    "app/pages/canvas.vue",
    "app/pages/qrcode.vue",
    "app/pages/login.vue",
    "app/pages/terms.vue",
    "app/pages/privacy.vue",
    "app/components/Admin",
    "app/components/CanvasPromo.vue",
    "app/components/LegalBlocks.vue",
    "app/composables/useAdmin",
    "app/composables/useVideoMirror.ts",
    "app/data/privacy-policy.ts",
    "app/assets/scss/pages/_admin.scss",
    "app/assets/scss/pages/_canvas.scss",
    "app/assets/scss/pages/_qrcode.scss",
    "app/assets/scss/components/_canvas-promo.scss",
    "server/",
)

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


def strip_comments(text: str) -> str:
    """拿掉 HTML／JS／SCSS 的註解。

    註解標記前面必須是行首、空白或標點才算數：`accept="image/*"`、`https://` 這類字串裡的
    斜線不能被當成註解開頭，否則會一路吃到下一個 */，把真正的介面文字也拿掉。
    就算有漏網之魚也只是少一個字：那個字會改由內容分片供應，顯示正常。"""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"(^|[\s;{}(),])/\*.*?\*/", r"\1", text, flags=re.S | re.M)
    return re.sub(r"(^|[\s;{}(),])//[^\n]*", r"\1", text, flags=re.M)


def ui_charset(exclude: tuple[str, ...] = (), only: tuple[str, ...] | None = None) -> set[str]:
    """掃出介面可能渲染的每一個 CJK 字元。

    註解不算：這個專案的中文註解很多，原本連註解一起掃，字集有三分之一以上是只出現在註解裡、
    永遠不會畫出來的字，三個字重的介面字型各多了約 100KB，每一頁都要預載。
    字串常數（例如 showAlert 的訊息）照樣會被掃到。

    exclude／only 是要略過／只看的路徑開頭（相對專案根目錄）：
    exclude=UI_SECONDARY_SOURCES 是前台的字集，only=UI_HOME_SOURCES 是首頁開場的字集。
    拉丁字母與標點不管怎麼篩都會收。"""
    cjk = re.compile(r"[　-〿㄀-ㄯ一-鿿＀-￯]")
    chars: set[str] = set()
    patterns = ("app/**/*.vue", "app/**/*.ts", "app/**/*.scss", "server/**/*.ts", "nuxt.config.ts")
    for pattern in patterns:
        for path in ROOT.glob(pattern):
            rel = path.relative_to(ROOT).as_posix()
            if rel.startswith(LOCALE_DIRS_EXCLUDED_FROM_TW + exclude):
                continue
            if only is not None and not rel.startswith(only):
                continue
            text = strip_comments(path.read_text(encoding="utf-8", errors="replace"))
            chars.update(cjk.findall(text))

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


def locale_charset(locale: str) -> set[str]:
    """某個介面語言要收的字：那個語言的翻譯檔，加上語言選單上的名稱（utils/i18n.ts 的 LOCALE_LABELS，
    例如韓文介面上的「日本語」也要用韓文介面的字型畫得出來才一致——對不到的字會退回 TW）。"""
    pattern = LOCALE_UI[locale]["chars"]
    paths = list((ROOT / "app" / "locales" / locale).rglob("*.ts")) + [ROOT / "app" / "utils" / "i18n.ts"]
    chars: set[str] = set()
    for path in paths:
        text = strip_comments(path.read_text(encoding="utf-8", errors="replace"))
        chars.update(pattern.findall(text))
    return chars


def build_locale_ui() -> None:
    """語言層：日文、韓文介面字各裁一份小字型，產生各自的 @font-face 樣式表。

    樣式表由 app/utils/locale-fonts.ts 在建置時讀進來，選了那個語言才內嵌到 <head>，
    跟介面層一樣不用多一次樣式表往返。"""
    header = (
        "/* 由 scripts/fonts/build.py 產生，請勿手動編輯。\n"
        " * LINE Seed JP / LINE Seed Sans KR, (c) LY Corporation,\n"
        " * SIL Open Font License 1.1 — https://seed.line.me/\n"
        " */\n"
    )
    for locale, spec in LOCALE_UI.items():
        chars = locale_charset(locale)
        if not chars:
            log(f"{locale}：翻譯檔裡沒有要收的字，跳過")
            continue
        faces: list[str] = []
        for weight in spec["weights"]:
            dest = OUT_DIR / f"line-seed-ui-{locale}-{weight}.woff2"
            subset(SRC_DIR / f"{spec['source']}-{weight}.woff2", dest, text="".join(sorted(chars)))
            # unicode-range 以字型實際收到的字為準（理由同介面層）
            actual = font_codepoints(dest)
            missing = sorted(c for c in chars if ord(c) not in actual)
            faces.append(
                f'@font-face{{font-family:"{spec["family"]}";'
                f'src:url("/fonts/line-seed-ui-{locale}-{weight}.woff2")format("woff2");'
                f"font-style:normal;font-display:swap;font-weight:{weight};"
                f"unicode-range:{format_unicode_range(actual)};}}"
            )
            log(f"{locale} {weight}：{dest.stat().st_size / 1024:.0f} KB，{len(actual)} 字")
            if missing:
                # 字型沒有的字會退回 $font-sans（LINE Seed TW → 系統字），顯示得出來，但字形不一致
                log(f"  {spec['source']} 沒有的字：{''.join(missing)}")
        (OUT_DIR / f"line-seed-ui-{locale}.css").write_text(
            header + "\n".join(faces) + "\n", encoding="utf-8"
        )


HEADER = (
    "/* LINE Seed — 由 scripts/fonts/build.py 產生，請勿手動編輯。\n"
    " * LINE Seed TW / LINE Seed Sans KR, (c) LY Corporation,\n"
    " * SIL Open Font License 1.1 — https://seed.line.me/\n"
    " */\n"
)


def build_ui(
    chars_by_weight: dict[int, set[str]], home: set[str], front: set[str]
) -> tuple[list[str], set[int]]:
    """介面層：每個字重拆成三份，首頁開場（line-seed-ui-*）、其他前台頁面（-front）、其餘（-more）。

    回傳 @font-face 區塊，以及三份實際涵蓋的碼位（內容層要扣掉這些）。"""
    faces: list[str] = []
    covered: set[int] = set()
    for weight in UI_WEIGHTS:
        chars = chars_by_weight[weight]
        claimed: set[int] = set()
        tiers = (("", chars & home), ("-front", (chars & front) - home), ("-more", chars - front - home))
        for suffix, text in tiers:
            name = f"line-seed-ui{suffix}-{weight}.woff2"
            dest = OUT_DIR / name
            actual: set[int] = set()
            if text:
                subset(SRC_DIR / f"tw-{weight}.woff2", dest, text="".join(sorted(text)))
                # unicode-range 必須以「產出的字型實際有哪些字形」為準，不能用請求的字集。
                # 字集裡有不少字（例如大半個 Latin-1 補充區）LINE Seed TW 根本沒有收，
                # 宣告了卻沒有字形的話，那些字會靜靜掉到系統字，沒有任何地方會報錯。
                # 同一個碼位只由一份宣告，越早需要的那份優先
                actual = font_codepoints(dest) - claimed
            if not actual:
                dest.unlink(missing_ok=True)
                continue
            claimed |= actual
            faces.append(
                f'@font-face{{font-family:"{FAMILY}";'
                f'src:url("/fonts/{name}")format("woff2");'
                f"font-style:normal;font-display:swap;font-weight:{weight};"
                f"unicode-range:{format_unicode_range(actual)};}}"
            )
            log(f"UI {weight}{suffix}：{dest.stat().st_size / 1024:.0f} KB，實際收錄 {len(actual)} 字")
        covered |= claimed
    return faces, covered


def current_ui_coverage() -> dict[int, set[str]]:
    """目前 line-seed-ui.css 每個字重宣告的字（三份合起來）。

    --ui 只重新拆分、不改涵蓋範圍：內容分片是「全字集扣掉介面層」產生的，
    介面層多收或少收一個字，就會跟內容分片重疊或留下缺口，那要整套重建。"""
    css = (OUT_DIR / "line-seed-ui.css").read_text(encoding="utf-8")
    coverage: dict[int, set[str]] = {w: set() for w in UI_WEIGHTS}
    for weight, ranges in re.findall(r"font-weight:(\d+);unicode-range:([^;}]+)", css):
        for part in ranges.split(","):
            lo, _, hi = part.strip().removeprefix("U+").partition("-")
            coverage[int(weight)].update(chr(c) for c in range(int(lo, 16), int(hi or lo, 16) + 1))
    return coverage


def write_ui_css(faces: list[str]) -> None:
    (OUT_DIR / "line-seed-ui.css").write_text(HEADER + "\n".join(faces) + "\n", encoding="utf-8")


def main() -> None:
    fetch_sources()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if "--locale-ui" in sys.argv[1:]:
        build_locale_ui()
        return

    ui_chars = ui_charset()
    front_chars = ui_charset(exclude=UI_SECONDARY_SOURCES)
    home_chars = ui_charset(only=UI_HOME_SOURCES)

    if "--ui" in sys.argv[1:]:
        coverage = current_ui_coverage()
        faces, _ = build_ui(coverage, home_chars, front_chars)
        write_ui_css(faces)
        # 程式裡新出現、介面層還沒收的字，現在由內容分片（只有 700）供應，顯示正常；要收進介面層得整套重建
        tw = font_codepoints(SRC_DIR / "tw-700.woff2")
        uncovered = sorted(c for c in ui_chars if ord(c) in tw and c not in coverage[700])
        if uncovered:
            log(f"有 {len(uncovered)} 個介面字不在介面層（由內容分片供應）：{''.join(uncovered[:40])}")
        return

    log(f"介面字集：{len(ui_chars)} 字，其中前台 {len(front_chars)} 字、首頁開場 {len(home_chars)} 字")

    # ── UI 層：400 / 700 / 800 各拆成首頁開場、其他前台頁面、其餘三個檔案
    ui_faces, ui_covered = build_ui({w: ui_chars for w in UI_WEIGHTS}, home_chars, front_chars)

    log(f"介面字集請求 {len(ui_chars)} 字，字型實際有 {len(ui_covered)} 字")

    # ── TW 內容層：全字集扣掉 UI 層「實際涵蓋」的字，確保兩層既不重疊也不留縫
    #    內容層用 700（Bold）：便利貼上的使用者文字統一走粗體。
    #    這一層只會有單一字重，因此不是「多加一份」而是「換一份」，檔案數與體積不變。
    tw_all = font_codepoints(SRC_DIR / "tw-700.woff2")
    tw_content = "".join(sorted(chr(c) for c in tw_all if c not in ui_covered))
    log(f"中文內容字集：{len(tw_content)} 字")
    tw_src = SRC_DIR / "tw-content-700.woff2"
    subset(SRC_DIR / "tw-700.woff2", tw_src, text=tw_content)
    split_font(tw_src, OUT_DIR / "tw", 700)
    tw_faces = collect_faces(OUT_DIR / "tw" / "result.css", "/fonts/tw/")
    (OUT_DIR / "tw" / "result.css").unlink()
    log(f"中文內容分片：{len(tw_faces)} 片")

    # ── KR 內容層：只留韓文，拉丁與標點交給 TW，避免兩邊搶同一個字
    kr_src = SRC_DIR / "kr-hangul-700.woff2"
    subset(SRC_DIR / "kr-700.woff2", kr_src, unicodes=HANGUL_RANGES)
    split_font(kr_src, OUT_DIR / "kr", 700)
    kr_faces = collect_faces(OUT_DIR / "kr" / "result.css", "/fonts/kr/")
    (OUT_DIR / "kr" / "result.css").unlink()
    log(f"韓文內容分片：{len(kr_faces)} 片")

    # ── 輸出兩個 CSS，因為兩者的載入時機需求不同：
    #    line-seed-ui.css  介面字，約 17KB，由 nuxt.config 在建置時內嵌進 <head>，
    #                      零額外請求，前台介面不會有 FOUT。
    #    line-seed.css     內容分片，約 250KB，獨立樣式表，可被快取。
    #    兩者 unicode-range 完全不重疊（build 後可用 scripts/fonts/verify.py 驗證）。
    write_ui_css(ui_faces)
    (OUT_DIR / "line-seed.css").write_text(
        HEADER + "\n".join(tw_faces + kr_faces) + "\n", encoding="utf-8"
    )

    build_locale_ui()

    total = sum(p.stat().st_size for p in OUT_DIR.rglob("*") if p.is_file())
    log(f"完成：public/fonts 共 {total / 1048576:.2f} MB")


if __name__ == "__main__":
    main()
