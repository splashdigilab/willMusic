"""產生「只有簡體才用的字」清單：server/utils/simplified-chars.ts。

    python3 scripts/moderation/build_simplified_chars.py

來源是 Unicode 官方的 Unihan 資料庫（Unihan_Variants.txt），每次執行重新下載到暫存目錄。
產物已進版控，部署不需要跑這支。

為什麼不交給 AI 判斷：2026-10-13 實測 gpt-4o-mini 對「我爱你们」「谢谢微乐客」都回 PASS，
簡體字靠模型判斷不可靠，改成查表。

怎麼算「只有簡體才用」：
  有 kTraditionalVariant（有對應的、不是它自己的繁體字），而且不在台灣的標準字集裡
  （CP950，Big5 的微軟擴充版，Python 內建的編碼）。
  不加香港的 Big5-HKSCS：Python 的 HKSCS 收了大量簡體字（发、国、会、门 都在），加了就等於沒擋。
  香港粵語用字（嘅、咗、啲）沒有簡繁對應，本來就不會被算進來。
  例如 爱 → 愛、这 → 這 算；台、后、干、面、只 不算 —— 這些字繁體也照用（都在 Big5 裡），
  算進去就會擋到台灣人寫的字。
  不能只看 Unihan 自己的標記：它把「这」「会」「乐」也列成自己的繁體寫法之一（古籍用過），
  照它判斷的話最常見的簡體字反而都不算。
"""
from __future__ import annotations

import io
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "server" / "utils" / "simplified-chars.ts"
UNIHAN_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip"


def parse_codepoints(field: str) -> set[str]:
    # 值的格式像 "U+611B" 或 "U+81FA<kMatthews"，取 U+ 後面的十六進位
    chars: set[str] = set()
    for token in field.split():
        code = token.split("<")[0]
        if code.startswith("U+"):
            chars.add(chr(int(code[2:], 16)))
    return chars


def in_traditional_charset(char: str) -> bool:
    """台灣的標準字集（CP950）裡有這個字，就是繁體也在用的字"""
    try:
        char.encode("cp950")
        return True
    except UnicodeEncodeError:
        return False


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        data = urllib.request.urlopen(UNIHAN_URL, timeout=300).read()
        Path(tmp, "Unihan.zip").write_bytes(data)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            variants = zf.read("Unihan_Variants.txt").decode("utf-8")

    traditional_of: dict[str, set[str]] = {}
    for line in variants.splitlines():
        if not line or line.startswith("#"):
            continue
        code, field, value = line.split("\t", 2)
        if field == "kTraditionalVariant":
            traditional_of[chr(int(code[2:], 16))] = parse_codepoints(value)

    simplified_only = sorted(
        c for c, targets in traditional_of.items()
        if (targets - {c}) and not in_traditional_charset(c)
    )

    OUT.write_text(
        "/**\n"
        " * 只有簡體中文才用的字（繁體不用）。由 scripts/moderation/build_simplified_chars.py\n"
        " * 從 Unicode Unihan 資料庫產生，請勿手動編輯。用法見 server/utils/simplified.ts。\n"
        " */\n"
        f"export const SIMPLIFIED_ONLY_CHARS = '{''.join(simplified_only)}'\n",
        encoding="utf-8",
    )
    print(f"{OUT.relative_to(ROOT)}：{len(simplified_only)} 字")


if __name__ == "__main__":
    main()
