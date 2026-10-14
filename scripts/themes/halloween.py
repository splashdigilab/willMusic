"""萬聖節主題素材：從稿子「(Draft) 萬聖節便利貼 - WillMusic.ai」取出、轉正，輸出到 public/。
說明見同資料夾的 README.md。

用法：python3 scripts/themes/halloween.py           # 只輸出到暫存資料夾，附預覽表 sheet.png
      python3 scripts/themes/halloween.py --write   # 寫進 public/"""
import re, json, math, io, sys, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'ai2svg.py')).read().split("if __name__ == '__main__':")[0])
from PIL import Image, ImageDraw
import numpy as np

REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
WRITE = '--write' in sys.argv
OUT = os.environ.get('THEME_OUT', '/tmp/willmusic-theme-halloween')
os.makedirs(OUT, exist_ok=True)

def page_paths(pi):
    paths_out.clear()
    pnum = page_list()[pi - 1]
    d = obj_body(pnum)
    ab = [float(x) for x in re.search(rb'/ArtBox\s*\[([^\]]*)\]', d).group(1).split()]
    cont = re.search(rb'/Contents\s*(\[[^\]]*\]|\d+ 0 R)', d).group(1)
    content = b''.join((stream_of(int(n))[0] or b'') + b'\n' for n in re.findall(rb'(\d+) 0 R', cont))
    run(content, resources_of(d), [1, 0, 0, 1, 0, 0])
    return [dict(p) for p in paths_out], ab

P1, AB1 = page_paths(1)
P2, AB2 = page_paths(2)

# ---------- 路徑工具：段落 = (cmd, [(x,y), ...]) ----------
def parse(d):
    segs = []
    for cmd, body in re.findall(r'([MLCZ])([^MLCZ]*)', d):
        nums = [float(v) for v in re.findall(r'-?\d+\.?\d*(?:e-?\d+)?', body)]
        pts = list(zip(nums[0::2], nums[1::2]))
        if cmd == 'M' and len(pts) > 1:  # 「M a L b L c」被我寫成 M 後接 L 串
            segs.append(('M', [pts[0]]))
            segs += [('L', [p]) for p in pts[1:]]
        else:
            segs.append((cmd, pts))
    return segs

def to_artboard(segs, H=1920):
    return [(c, [(x - 10, H + 10 - y) for x, y in pts]) for c, pts in segs]

def xform(segs, f):
    return [(c, [f(x, y) for x, y in pts]) for c, pts in segs]

def to_d(segs, prec=2):
    out = []
    for c, pts in segs:
        if c == 'Z':
            out.append('Z')
        else:
            out.append(c + ' '.join(f'{x:.{prec}f},{y:.{prec}f}' for x, y in pts))
    return ''.join(out)

def flatten(segs, steps=16):
    polys, cur, last = [], [], (0, 0)
    for c, pts in segs:
        if c == 'M':
            if cur: polys.append(cur)
            cur = [pts[0]]; last = pts[0]
        elif c == 'L':
            cur.append(pts[0]); last = pts[0]
        elif c == 'C':
            p0 = last; p1, p2, p3 = pts
            for i in range(1, steps + 1):
                t = i / steps; u = 1 - t
                cur.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                            u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
            last = p3
        elif c == 'Z':
            if cur: polys.append(cur); cur = []
    if cur: polys.append(cur)
    return polys

def bbox(segs_list):
    pts = [p for s in segs_list for poly in flatten(s) for p in poly]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)

def centroid(segs):
    pts = [p for poly in flatten(segs, 32) for p in poly]
    a = cx = cy = 0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]
        k = x0 * y1 - x1 * y0
        a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k
    a *= 0.5
    return cx / (6 * a), cy / (6 * a)

def rot(cx, cy, deg):
    t = math.radians(deg); c, s = math.cos(t), math.sin(t)
    return lambda x, y: (cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c)

def art(P, i):
    return to_artboard(parse(P[i]['d']))

# ---------- 轉正角度 ----------
def raster(segs_list, size=360):
    """以面積正規化（質心置中、面積相同）後點陣化，用來比對形狀"""
    allpts = [p for s in segs_list for poly in flatten(s) for p in poly]
    return allpts

def mask_of(segs, deg, size=300):
    cx, cy = centroid(segs)
    polys = flatten(xform(segs, rot(cx, cy, deg)), 24)
    # 面積正規化
    area = 0
    for poly in polys:
        for i in range(len(poly)):
            x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % len(poly)]
            area += x0 * y1 - x1 * y0
    k = (size * 0.45) / math.sqrt(abs(area) / 2)
    img = Image.new('L', (size, size), 0)
    dr = ImageDraw.Draw(img)
    for poly in polys:
        dr.polygon([((x - cx) * k + size / 2, (y - cy) * k + size / 2) for x, y in poly], fill=255)
    return np.array(img) > 127

def best_angle(src, ref, lo=-180, hi=180, step=1.0):
    target = mask_of(ref, 0)
    best = None
    for _ in range(3):
        a = lo
        while a <= hi:
            m = mask_of(src, a)
            iou = (m & target).sum() / (m | target).sum()
            if not best or iou > best[1]:
                best = (a, iou)
            a += step
        lo, hi, step = best[0] - step, best[0] + step, step / 10
    return best

skull = {'body': art(P2, 7), 'parts': [(art(P2, i), P2[i]['fill']) for i in (8, 9, 10)], 'fill': P2[7]['fill']}
pumpkin = {'body': art(P2, 15), 'parts': [(art(P2, i), P2[i]['fill']) for i in (16, 17, 18, 19)], 'fill': P2[15]['fill']}
ghost_tilted = art(P2, 4)
ghost = {'body': art(P2, 1), 'parts': [(art(P2, i), P2[i]['fill']) for i in (2, 3)], 'fill': P2[1]['fill']}

# 骷髏：兩眼是同尺寸的橢圓，眼心連線水平即為正
e1 = centroid(skull['parts'][0][0]); e2 = centroid(skull['parts'][1][0])
skull_angle = -math.degrees(math.atan2(e2[1] - e1[1], e2[0] - e1[0]))
# 南瓜：開場畫板的大南瓜是正的，同一個輪廓 → 用形狀比對找角度
card = to_artboard(parse(P1[28]['d']))
pumpkin_angle, pumpkin_iou = best_angle(pumpkin['body'], card)
# 幽靈：牆上中左那隻是正的。拿歪的那隻比對它，確認兩者同一個輪廓（素材那隻跟歪的同角度）
ghost_check, ghost_iou = best_angle(ghost_tilted, ghost['body'])
ghost_angle = 0.0
print(f'skull {skull_angle:.2f}°  pumpkin {pumpkin_angle:.2f}° (IoU {pumpkin_iou:.3f})  '
      f'ghost: 歪的那隻需轉 {ghost_check:.2f}° 才與正的吻合 (IoU {ghost_iou:.3f})')

def outer_only(segs):
    """只留面積最大的子路徑。牆上的骷髏本體是複合路徑（眼窩、鼻孔是挖空的），
    當遮罩會變成便利貼上的破洞；圖一的素材本體是實心的，以那個為準"""
    subs, cur = [], []
    for s in segs:
        if s[0] == 'M' and cur:
            subs.append(cur); cur = []
        cur.append(s)
    if cur: subs.append(cur)
    def area(sp):
        a = 0
        for poly in flatten(sp, 24):
            for i in range(len(poly)):
                x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % len(poly)]
                a += x0 * y1 - x1 * y0
        return abs(a) / 2
    return max(subs, key=area)

def upright(item, deg):
    cx, cy = centroid(outer_only(item['body']))
    f = rot(cx, cy, deg)
    return {'body': outer_only(xform(item['body'], f)), 'fill': item['fill'],
            'parts': [(xform(s, f), c) for s, c in item['parts']]}

U = {'pumpkin': upright(pumpkin, pumpkin_angle),
     'skull': upright(skull, skull_angle),
     'ghost': upright(ghost, ghost_angle)}

# ---------- 輸出 ----------
def square_box(segs_list, pad_ratio=0.0):
    x0, y0, x1, y1 = bbox(segs_list)
    side = max(x1 - x0, y1 - y0) * (1 + 2 * pad_ratio)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return cx - side / 2, cy - side / 2, side

def svg_doc(view, body):
    vx, vy, vw, vh = view
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.2f} {vy:.2f} {vw:.2f} {vh:.2f}">'
            f'{body}</svg>\n')

def shape_svg(item):
    # 跟既有造型同格式：正方形 viewBox、形狀撐滿長邊、填黑（遮罩只看填色區域）
    x, y, s = square_box([item['body']], 0.004)
    return svg_doc((x, y, s, s), f'<path fill="#000000" d="{to_d(item["body"])}"/>')

def sticker_svg(item):
    segs = [p for p, _ in item['parts']]
    x, y, s = square_box(segs, 0.03)
    body = ''.join(f'<path fill="{c}" d="{to_d(p)}"/>' for p, c in item['parts'])
    return svg_doc((x, y, s, s), body)

def combo_svg(item):
    """預覽用：本體＋臉，確認轉正與五官位置"""
    x, y, s = square_box([item['body']], 0.06)
    body = f'<path fill="{item["fill"]}" d="{to_d(item["body"])}"/>' + \
           ''.join(f'<path fill="{c}" d="{to_d(p)}"/>' for p, c in item['parts'])
    return svg_doc((x, y, s, s), body)

files = {}
for name, item in U.items():
    files[f'shapes/{name}.svg'] = shape_svg(item)
    files[f'stickers/halloween-{name}-face.svg'] = sticker_svg(item)
    files[f'preview/{name}-combo.svg'] = combo_svg(item)

for rel, txt in files.items():
    p = f'{OUT}/{rel}'
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(txt)

# 預覽表：上排 本體＋臉、中排 遮罩、下排 貼紙
tiles = []
for name in U:
    row = []
    for rel in (f'preview/{name}-combo.svg', f'shapes/{name}.svg', f'stickers/halloween-{name}-face.svg'):
        png = f'{OUT}/{rel}.png'
        subprocess.run(['rsvg-convert', '-w', '260', '-h', '260', '-b', '#404040', f'{OUT}/{rel}', '-o', png], check=True)
        row.append(Image.open(png).convert('RGB'))
    tiles.append(row)
sheet = Image.new('RGB', (3 * 270, 3 * 270), '#202020')
for c, row in enumerate(tiles):
    for r, im in enumerate(row):
        sheet.paste(im, (c * 270 + 5, r * 270 + 5))
sheet.save(f'{OUT}/sheet.png')
print('wrote', len(files), 'files to', OUT)

# ---------- 開場：標題轉外框（用 PDF 內嵌的 LINE Seed TW ExtraBold 子集，版面與稿子逐字一致） ----------
from fontTools.cffLib import CFFFontSet
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

def deref(b):
    m = re.match(rb'\s*(\d+) 0 R', b)
    return obj_body(int(m.group(1))) if m else b

def cid_font(type0):
    b = obj_body(type0)
    db = obj_body(int(re.search(rb'/DescendantFonts\s*(\d+) 0 R', b).group(1)))
    if db.strip().startswith(b'['):
        db = obj_body(int(re.search(rb'(\d+) 0 R', db).group(1)))
    dw = re.search(rb'/DW\s*(\d+)', db)
    widths = {'_dw': float(dw.group(1)) if dw else 1000.0}
    wm = re.search(rb'/W\s*(\d+ 0 R|\[)', db)
    if wm:
        wsrc = obj_body(int(wm.group(1).split()[0])) if wm.group(1) != b'[' else db[wm.start(1):]
        toks = re.findall(rb'\[|\]|-?\d+\.?\d*', wsrc)
        i, depth_ok = 0, True
        # 跳過最外層的 [
        if toks and toks[0] == b'[': i = 1
        while i < len(toks) and toks[i] != b']':
            c = int(float(toks[i]))
            if toks[i + 1] == b'[':
                j = i + 2; k = 0
                while toks[j] != b']':
                    widths[c + k] = float(toks[j]); j += 1; k += 1
                i = j + 1
            else:
                c2 = int(float(toks[i + 1])); w = float(toks[i + 2])
                for k in range(c, c2 + 1): widths[k] = w
                i += 3
    fd = obj_body(int(re.search(rb'/FontDescriptor\s*(\d+) 0 R', db).group(1)))
    ff = int(re.search(rb'/FontFile3\s*(\d+) 0 R', fd).group(1))
    raw, _ = stream_of(ff)
    cff = CFFFontSet(); cff.decompile(io.BytesIO(raw), None)
    return cff[cff.fontNames[0]], widths

def text_line(font, widths, tm, items, tc):
    """items：TJ 陣列（字串是 4 位 hex 的 CID 串、數字是字距調整）。回傳畫板座標的 SVG path d"""
    top = font
    s, e, f = tm[0], tm[4], tm[5]
    x = 0.0
    ds = []
    for it in items:
        if isinstance(it, (int, float)):
            x -= it / 1000.0
            continue
        for k in range(0, len(it), 4):
            cid = int(it[k:k + 4], 16)
            name = f'cid{cid:05d}'
            if name not in top.CharStrings:
                name = top.charset[cid] if cid < len(top.charset) else None
            from fontTools.pens.recordingPen import RecordingPen
            rec = RecordingPen()
            tpen = TransformPen(rec, (s * 0.001, 0, 0, -s * 0.001, s * x + e - 10, 1930 - f))
            if name:
                top.CharStrings[name].draw(tpen)
            out = []
            for op, pts in rec.value:
                fmt = ' '.join(f'{px:.2f},{py:.2f}' for px, py in pts)
                if op == 'moveTo': out.append('M' + fmt)
                elif op == 'lineTo': out.append('L' + fmt)
                elif op == 'curveTo':
                    for k in range(0, len(pts), 3):
                        out.append('C' + ' '.join(f'{px:.2f},{py:.2f}' for px, py in pts[k:k + 3]))
                elif op == 'closePath': out.append('Z')
            ds.append(''.join(out))
            x += widths.get(cid, widths['_dw']) / 1000.0 + tc
    return ' '.join(ds)

xb_font, xb_w = cid_font(142)   # C0_1 = LINESeedTW_OTF-ExtraBold
title_d = ' '.join([
    text_line(xb_font, xb_w, (109.0886, 0, 0, 109.0886, 246.7334, 976.6455), ['12A706CC09CF0ADB0840'], 0.14),
    text_line(xb_font, xb_w, (130, 0, 0, 130, 256.9243, 1279.1475), ['00310030', -3.9, '0034', -15.7, '0035'], -0.052),
    text_line(xb_font, xb_w, (130, 0, 0, 130, 256.9243, 1279.1475 - 1.133 * 130),
              ['000100010023', 22.7, '0030', 61.2, '0022', 11.2, '0033', 11.9, '0025'], -0.035),
])
TITLE_FILL = P1[29]['fill']  # 標題與蝙蝠同一個黑 #141414

# ---------- 開場素材 ----------
def page_group(paths, idxs, H=1920, keep_style=True):
    """把第 1 頁的幾個物件（頁面座標）包成一組，含漸層定義"""
    defs, body = [], []
    BM = {'Overlay': 'overlay', 'SoftLight': 'soft-light', 'Multiply': 'multiply', 'Screen': 'screen',
          'Color': 'color', 'Luminosity': 'luminosity', 'Hue': 'hue', 'Saturation': 'saturation'}
    for i in idxs:
        p = paths[i]
        if not p['d'] or p['fill'] == 'IMAGE':
            continue
        if p['fill'] == 'SHADING':
            if not p.get('grad'): continue
            defs.append(p['grad'])
            fill = f'url(#g{i})'
        else:
            fill = p['fill'] or 'none'
        attrs = f'fill="{fill}"'
        if p['stroke']: attrs += f' stroke="{p["stroke"]}" stroke-width="{p["lw"]:.2f}"'
        if keep_style and p['alpha'] < 1: attrs += f' opacity="{p["alpha"]:.3f}"'
        if keep_style and p['bm'] in BM: attrs += f' style="mix-blend-mode:{BM[p["bm"]]}"'
        if p['evenodd']: attrs += ' fill-rule="evenodd"'
        body.append(f'<path {attrs} d="{p["d"]}"/>')
    return ''.join(defs), f'<g transform="matrix(1 0 0 -1 -10 {H + 10})">' + ''.join(body) + '</g>'

def art_bbox(paths, idxs):
    return bbox([to_artboard(parse(paths[i]['d'])) for i in idxs if paths[i]['d']])

def pad_box(b, pad):
    return b[0] - pad, b[1] - pad, b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad

layout = {}   # 給 CSS 用的設計座標（1080×1920）

# 南瓜主視覺：漸層南瓜＋兩隻蝙蝠＋標題外框
hero_idx = [28, 29, 30]
hb = art_bbox(P1, hero_idx)
tb = bbox([parse(title_d)])
hb = (min(hb[0], tb[0]), min(hb[1], tb[1]), max(hb[2], tb[2]), max(hb[3], tb[3]))
# 陰影只掛在南瓜上（稿子的陰影圖只有南瓜的輪廓），數值是下面「南瓜陰影」那段量出來的
SH_DX, SH_DY, SH_SIGMA, SH_OPACITY = 8.8, 8.8, 9.0, 0.5
pb = art_bbox(P1, [28])
hb = (hb[0], hb[1], max(hb[2], pb[2] + SH_DX + 3 * SH_SIGMA), max(hb[3], pb[3] + SH_DY + 3 * SH_SIGMA))
hv = pad_box(hb, 2)
pdefs, pgrp = page_group(P1, [28])
bdefs, bgrp = page_group(P1, [29, 30])
shadow_filter = (f'<filter id="hw-pumpkin-shadow" x="-5%" y="-5%" width="115%" height="115%" color-interpolation-filters="sRGB">'
                 f'<feGaussianBlur in="SourceAlpha" stdDeviation="{SH_SIGMA}"/><feOffset dx="{SH_DX}" dy="{SH_DY}" result="o"/>'
                 f'<feFlood flood-color="#000" flood-opacity="{SH_OPACITY}"/><feComposite in2="o" operator="in"/>'
                 f'<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
files['themes/halloween/intro-hero.svg'] = svg_doc(
    hv, f'<defs>{pdefs}{shadow_filter}</defs><g filter="url(#hw-pumpkin-shadow)">{pgrp}</g>{bgrp}'
        f'<path fill="{TITLE_FILL}" d="{title_d}"/>')
layout['hero'] = hv
pumpkin_box = art_bbox(P1, [28])
layout['pumpkin'] = pumpkin_box

# 角落裝飾
def deco(name, idxs, clip_top=None):
    b = art_bbox(P1, idxs)
    if clip_top is not None: b = (b[0], max(b[1], clip_top), b[2], b[3])
    v = pad_box(b, 1)
    if clip_top is not None: v = (v[0], max(v[1], clip_top), v[2], b[3] + 1 - max(v[1], clip_top))
    defs, grp = page_group(P1, idxs, keep_style=False)
    files[f'themes/halloween/{name}.svg'] = svg_doc(v, f'<defs>{defs}</defs>{grp}')
    layout[name] = v

deco('web-top-left', [76], clip_top=0)
deco('web-bottom-right', [77])
deco('spider-top', list(range(62, 74)), clip_top=0)
deco('spider-start', list(range(50, 62)))
layout['start'] = art_bbox(P1, [74, 75])
layout['logo'] = art_bbox(P1, list(range(31, 50)))

# 開場字標的實際顏色：稿子是白色字標經過混合模式後的淡紫，直接從預覽圖取樣
PREVIEW = os.environ.get('AI_PREVIEW', os.path.join(os.path.dirname(AI), '00 - Preview', '(Draft) 萬聖節便利貼 - WillMusic_01.png'))
prev = Image.open(PREVIEW).convert('RGB')
pr = np.array(prev).reshape(-1, 3)
lb = layout['logo']
crop = np.array(prev.crop((int(lb[0] + 10), int(lb[1] + 10), int(lb[2] + 10), int(lb[3] + 10)))).reshape(-1, 3)
bright = crop[crop.sum(axis=1) > np.percentile(crop.sum(axis=1), 92)]
logo_color = '#%02X%02X%02X' % tuple(int(v) for v in np.median(bright, axis=0))
lv = pad_box(lb, 1)
defs, grp = page_group(P1, list(range(31, 50)), keep_style=False)
grp = re.sub(r'fill="#FFFFFF"', f'fill="{logo_color}"', grp)
files['themes/halloween/logo-intro.svg'] = svg_doc(lv, grp)
layout['logo'] = lv
print('intro logo color', logo_color)

# 便利貼牆原本有一張南瓜、骷髏、幽靈的圖樣（第 2 頁 1–27），已決定拿掉（820d23f），這裡不再產生

# 開場背景：紫色斜紋 → 點陣 webp。
# 不能走上面的 SVG 轉換：斜紋的摺痕是「細長漸層 ＋ soft mask（明度遮罩）」做的，
# 轉換不支援 soft mask，摺痕會變成一條糊糊的深色帶（第一版就是這樣）。
# 改成只留內容流裡背景那一段，交給 MuPDF 照 PDF 規格算圖，2 倍解析度（2160×3840）。
def render_page_raster(page_index, end_marker, scale, png_path):
    import pymupdf
    doc = pymupdf.open(AI)
    page = doc[page_index]
    xrefs = page.get_contents()
    content = b''.join(doc.xref_stream(x) for x in xrefs)
    cut = content.find(end_marker)
    assert cut > 0, '找不到背景結尾，稿子的內容流變了'
    keep = content[:cut + len(end_marker)]
    tok = lambda t: len(re.findall(rb'(?<![^\s])' + t + rb'(?![^\s])', keep))
    keep += b'\n' + b'Q\n' * (tok(b'q') - tok(b'Q')) + b'EMC\n' * (tok(b'BDC') - tok(b'EMC'))
    doc.update_stream(xrefs[0], keep)
    for x in xrefs[1:]:
        doc.update_stream(x, b'')
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=pymupdf.Rect(10, 10, 1090, 1930), alpha=False)
    pix.save(png_path)

# 背景到 Fm7（GS4，最後一層紫色 Multiply）為止，之後是說明文字、南瓜、蝙蝠
render_page_raster(0, b'/GS4 gs\n0 TL/Fm7 Do\nQ\nQ', 2.0, f'{OUT}/intro-bg.png')
subprocess.run(['cwebp', '-quiet', '-q', '90', '-m', '6', '-sharp_yuv', f'{OUT}/intro-bg.png', '-o', f'{OUT}/intro-bg.webp'], check=True)

# 南瓜陰影：稿子是一張模糊過的黑色點陣（Multiply 50%）。量出位移與模糊程度，改用 CSS drop-shadow
def img_arr(ref):
    raw, d = stream_of(ref)
    w = int(re.search(rb'/Width (\d+)', d).group(1)); h = int(re.search(rb'/Height (\d+)', d).group(1))
    return np.frombuffer(raw[:w * h], dtype=np.uint8).reshape(h, w)
alpha = img_arr(422).astype(np.float32) / 255
ib = art_bbox(P1, [27])               # 陰影圖在畫板上的位置
sx = (ib[2] - ib[0]) / alpha.shape[1]; sy = (ib[3] - ib[1]) / alpha.shape[0]
ys, xs = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
tot = alpha.sum()
sh_cx = ib[0] + (alpha * xs).sum() / tot * sx
sh_cy = ib[1] + (alpha * ys).sum() / tot * sy
pk = to_artboard(parse(P1[28]['d']))
pk_cx, pk_cy = centroid(pk)
# 模糊程度：拿南瓜輪廓做遮罩、平移到陰影位置，比較不同 σ 的高斯模糊與實際陰影
from PIL import ImageFilter
scale = 0.25
W_, H_ = int(alpha.shape[1] * scale), int(alpha.shape[0] * scale)
real = np.array(Image.fromarray((alpha * 255).astype(np.uint8)).resize((W_, H_), Image.BILINEAR)).astype(np.float32) / 255
m = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(m)
dx, dy = sh_cx - pk_cx, sh_cy - pk_cy
for poly in flatten(pk, 24):
    dr.polygon([((x + dx - ib[0]) / sx * scale, (y + dy - ib[1]) / sy * scale) for x, y in poly], fill=255)
best = None
for sigma_px in [float(v) for v in range(2, 40)]:        # 以畫板 px 計
    r = sigma_px / sx * scale
    blur = np.array(m.filter(ImageFilter.GaussianBlur(float(r)))).astype(np.float32) / 255
    k = (blur * real).sum() / (blur * blur).sum()
    err = ((blur * k - real) ** 2).mean()
    if not best or err < best[1]: best = (sigma_px, err, k)
layout['pumpkin_shadow'] = {'dx': round(float(dx), 1), 'dy': round(float(dy), 1), 'sigma': float(best[0]),
                            'opacity': round(float(0.5 * min(1, best[2])), 3)}
print('shadow', layout['pumpkin_shadow'])

# ---------- 寫檔 ----------
for rel, txt in files.items():
    p = f'{OUT}/{rel}'
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(txt)
os.makedirs(f'{OUT}/themes/halloween', exist_ok=True)
subprocess.run(['cp', f'{OUT}/intro-bg.webp', f'{OUT}/themes/halloween/intro-bg.webp'], check=True)
json.dump({k: [round(v, 1) for v in val] if isinstance(val, tuple) else val for k, val in layout.items()},
          open(f'{OUT}/layout.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: [round(v, 1) for v in val] if isinstance(val, tuple) else val for k, val in layout.items()}, ensure_ascii=False))

if WRITE:
    for rel in [r for r in files if not r.startswith('preview/')] + ['themes/halloween/intro-bg.webp']:
        dst = f'{REPO}/public/svg/{rel}' if rel.startswith(('shapes/', 'stickers/')) else f'{REPO}/public/{rel}'
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(['cp', f'{OUT}/{rel}', dst], check=True)
        print('->', dst.replace(REPO + '/', ''), os.path.getsize(dst), 'bytes')
