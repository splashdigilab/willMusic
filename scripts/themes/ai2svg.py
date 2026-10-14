"""把 .ai（存檔時有勾「建立 PDF 相容檔案」）的每個頁面（＝畫板）內容流解成向量路徑。

Illustrator 本身不用開：直接讀檔案裡的 PDF 那一層。支援路徑、填色／筆畫、漸層（axial／radial）、
Form XObject、透明度與混合模式；**不支援** soft mask（明度遮罩）與 knockout 群組 ——
遇到那種效果（例如萬聖節開場背景的斜紋摺痕）要改用 MuPDF 算圖，見 halloween.py 的 render_page_raster。

單獨執行會把每頁輸出成 page{n}.svg / page{n}.json（物件索引：填色、外框、混合模式），
用來找出要的物件是第幾個：python3 ai2svg.py [輸出資料夾]"""
import re, zlib, sys, json

import os
# 稿子路徑：環境變數 AI_FILE，沒設就用萬聖節那份
AI = os.environ.get('AI_FILE', "/Users/kevin/Downloads/02 - 萬 聖 節 主 題 - WillMusic/(Draft) 萬聖節便利貼 - WillMusic.ai")
data = open(AI, 'rb').read()

# ---- 物件表 ----
objs = {}
for m in re.finditer(rb'(?<![0-9])(\d+) 0 obj', data):
    objs.setdefault(int(m.group(1)), m.end())

def obj_body(num):
    start = objs[num]
    end = data.find(b'endobj', start)
    return data[start:end]

def stream_of(num):
    body = obj_body(num)
    si = body.find(b'stream')
    if si < 0:
        return None, body
    d = body[:si]
    s = si + len(b'stream')
    if body[s:s+2] == b'\r\n': s += 2
    elif body[s:s+1] in (b'\r', b'\n'): s += 1
    lm = re.search(rb'/Length (\d+)( 0 R)?', d)
    if lm and not lm.group(2):
        raw = body[s:s+int(lm.group(1))]
    else:
        raw = body[s:body.rfind(b'endstream')]
    if b'/FlateDecode' in d:
        try:
            raw = zlib.decompressobj().decompress(raw)
        except Exception:
            raw = b''
    return raw, d

def resolve_dict_entry(d, key):
    m = re.search(rb'/' + key + rb'\s*(\d+) 0 R', d)
    return int(m.group(1)) if m else None

# ---- tokenizer ----
tok_re = re.compile(rb'''\s*(?:(%[^\r\n]*)|(\[)|(\])|(<<)|(>>)|(\((?:\\.|[^\\)])*\))|(<[0-9A-Fa-f\s]*>)|(/[^\s/\[\]()<>{}%]*)|([-+]?(?:\d+\.?\d*|\.\d+))|([A-Za-z'"*]+[0-9]?\*?))''', re.S)

def tokens(buf):
    pos = 0
    n = len(buf)
    while pos < n:
        m = tok_re.match(buf, pos)
        if not m or m.end() == pos:
            pos += 1
            continue
        pos = m.end()
        if m.group(1): continue
        for gi in range(2, 11):
            g = m.group(gi)
            if g is not None:
                yield gi, g
                break

def mul(a, b):
    return [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
            a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3],
            a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]]

def tp(m, x, y):
    return (m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5])

def color_hex(vals):
    if len(vals) == 1: vals = vals*3
    if len(vals) == 4:
        c, m_, y, k = vals
        vals = [(1-c)*(1-k), (1-m_)*(1-k), (1-y)*(1-k)]
    return '#%02X%02X%02X' % tuple(max(0, min(255, round(v*255))) for v in vals[:3])

def parse_dict_refs(d, key):
    """回傳 {名稱: 物件編號}，支援 /Key<< /A 1 0 R >> 與 /Key 12 0 R 兩種寫法"""
    out = {}
    m = re.search(rb'/' + key + rb'\s*<<(.*?)>>', d, re.S)
    if not m:
        m2 = re.search(rb'/' + key + rb'\s*(\d+) 0 R', d)
        if m2:
            sub = obj_body(int(m2.group(1)))
            m = re.search(rb'<<(.*?)>>', sub, re.S)
    if m:
        for k, v in re.findall(rb'/([^\s/<>\[\]]+)\s*(\d+) 0 R', m.group(1)):
            out[k.decode()] = int(v)
    return out

def resources_of(d):
    m = re.search(rb'/Resources\s*(\d+) 0 R', d)
    if m:
        return obj_body(int(m.group(1)))
    i = d.find(b'/Resources')
    if i < 0:
        return b''
    # 取出對應的 << >>（處理巢狀）
    j = d.find(b'<<', i)
    depth = 0; k = j
    while k < len(d):
        if d[k:k+2] == b'<<': depth += 1; k += 2; continue
        if d[k:k+2] == b'>>':
            depth -= 1; k += 2
            if depth == 0: break
            continue
        k += 1
    return d[j:k]

def gs_alpha(num):
    b = obj_body(num)
    ca = re.search(rb'/ca\s+([\d.]+)', b)
    bm = re.search(rb'/BM\s*/(\w+)', b)
    return (float(ca.group(1)) if ca else 1.0), (bm.group(1).decode() if bm else 'Normal')

paths_out = []

def nums_in(b, key):
    m = re.search(rb'/' + key + rb'\s*\[([^\]]*)\]', b)
    return [float(x) for x in m.group(1).split()] if m else None

def func_stops(ref):
    """PDF 函式 → [(offset, [r,g,b]), ...]，支援 type 2 與 type 3（拼接）"""
    b = obj_body(ref)
    ft = int(re.search(rb'/FunctionType\s*(\d)', b).group(1))
    if ft == 2:
        c0 = nums_in(b, b'C0') or [0.0]; c1 = nums_in(b, b'C1') or [1.0]
        return [(0.0, c0), (1.0, c1)]
    if ft == 3:
        fs = [int(x) for x in re.findall(rb'(\d+) 0 R', re.search(rb'/Functions\s*\[([^\]]*)\]', b).group(1))]
        bounds = nums_in(b, b'Bounds') or []
        enc = nums_in(b, b'Encode') or []
        dom = nums_in(b, b'Domain') or [0, 1]
        edges = [dom[0]] + bounds + [dom[1]]
        out = []
        for i, f in enumerate(fs):
            sub = func_stops(f)
            a, z = edges[i], edges[i+1]
            e0, e1 = (enc[2*i], enc[2*i+1]) if len(enc) >= 2*i+2 else (0, 1)
            c_start = sub[0][1] if e0 == 0 else sub[-1][1]
            c_end = sub[-1][1] if e1 == 1 else sub[0][1]
            out += [(a, c_start), (z, c_end)]
        return out
    return [(0.0, [0.0]), (1.0, [1.0])]

def shading_to_svg(ref, ctm, gid):
    b = obj_body(ref)
    stype = int(re.search(rb'/ShadingType\s*(\d)', b).group(1))
    coords = nums_in(b, b'Coords')
    fref = re.search(rb'/Function\s*(\d+) 0 R', b)
    stops = func_stops(int(fref.group(1))) if fref else [(0, [0]), (1, [1])]
    st_xml = ''.join(f'<stop offset="{o:.4f}" stop-color="{color_hex(c)}"/>' for o, c in stops)
    m = ' '.join(f'{v:.6f}' for v in ctm)
    if stype == 2:
        x0, y0, x1, y1 = coords
        return (f'<linearGradient id="g{gid}" gradientUnits="userSpaceOnUse" x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" '
                f'gradientTransform="matrix({m})">{st_xml}</linearGradient>')
    if stype == 3:
        x0, y0, r0, x1, y1, r1 = coords
        return (f'<radialGradient id="g{gid}" gradientUnits="userSpaceOnUse" fx="{x0}" fy="{y0}" fr="{r0}" cx="{x1}" cy="{y1}" r="{r1}" '
                f'gradientTransform="matrix({m})">{st_xml}</radialGradient>')
    return None

def run(content, res, ctm, depth=0, inherit=None):
    xobjs = parse_dict_refs(res, b'XObject')
    gss = parse_dict_refs(res, b'ExtGState')
    st = {'ctm': ctm, 'fill': '#000000', 'stroke': '#000000', 'lw': 1.0, 'alpha': (inherit or {}).get('alpha', 1.0), 'bm': (inherit or {}).get('bm', 'Normal')}
    stack = []
    operands = []
    cur = []  # 目前路徑（已轉換座標）
    pending_clip = False
    cx = cy = 0
    for kind, t in tokens(content):
        if kind == 10:  # operator
            op = t.decode('latin1')
            nums = [float(x) for x in operands if isinstance(x, float)]
            if op == 'q': stack.append(dict(st))
            elif op == 'Q': st = stack.pop() if stack else st
            elif op == 'cm' and len(nums) >= 6: st['ctm'] = mul(nums[-6:], st['ctm'])
            elif op in ('sc', 'scn', 'rg', 'g', 'k') and nums: st['fill'] = color_hex(nums)
            elif op in ('SC', 'SCN', 'RG', 'G', 'K') and nums: st['stroke'] = color_hex(nums)
            elif op == 'w' and nums: st['lw'] = nums[-1]
            elif op == 'gs' and operands:
                name = operands[-1]
                if isinstance(name, str) and name in gss:
                    a, b = gs_alpha(gss[name])
                    base = inherit or {}
                    st['alpha'] = base.get('alpha', 1.0) * a
                    st['bm'] = b if b != 'Normal' else base.get('bm', 'Normal')
            elif op == 'm' and len(nums) >= 2:
                x, y = tp(st['ctm'], *nums[-2:]); cur.append(f'M{x:.3f},{y:.3f}'); cx, cy = nums[-2:]
            elif op == 'l' and len(nums) >= 2:
                x, y = tp(st['ctm'], *nums[-2:]); cur.append(f'L{x:.3f},{y:.3f}'); cx, cy = nums[-2:]
            elif op in ('c', 'v', 'y') and len(nums) >= 4:
                if op == 'c': p = nums[-6:]
                elif op == 'v': p = [cx, cy] + nums[-4:]
                else: p = nums[-4:-2] + nums[-2:] + nums[-2:]
                pts = [tp(st['ctm'], p[i], p[i+1]) for i in (0, 2, 4)]
                cur.append('C' + ' '.join(f'{a:.3f},{b:.3f}' for a, b in pts)); cx, cy = p[4], p[5]
            elif op == 're' and len(nums) >= 4:
                x, y, w, h = nums[-4:]
                pts = [tp(st['ctm'], *q) for q in ((x, y), (x+w, y), (x+w, y+h), (x, y+h))]
                cur.append('M' + ' L'.join(f'{a:.3f},{b:.3f}' for a, b in pts) + 'Z')
            elif op == 'h': cur.append('Z')
            elif op in ('f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'S', 's', 'n'):
                if pending_clip and cur:
                    st['clip'] = ' '.join(cur)
                pending_clip = False
                if cur and op != 'n':
                    fill = st['fill'] if op not in ('S', 's') else None
                    stroke = st['stroke'] if op in ('S', 's', 'B', 'B*', 'b', 'b*') else None
                    sc = (abs(st['ctm'][0]*st['ctm'][3] - st['ctm'][1]*st['ctm'][2])) ** 0.5
                    paths_out.append({'d': ' '.join(cur), 'fill': fill, 'stroke': stroke,
                                      'lw': st['lw'] * sc, 'alpha': st['alpha'], 'bm': st['bm'],
                                      'evenodd': op.endswith('*')})
                cur = []
            elif op == 'Do' and operands and isinstance(operands[-1], str):
                ref = xobjs.get(operands[-1])
                if ref is not None and depth < 12:
                    raw, d = stream_of(ref)
                    if b'/Subtype/Form' in d or b'/Subtype /Form' in d:
                        mm = re.search(rb'/Matrix\s*\[([^\]]*)\]', d)
                        mat = [float(x) for x in mm.group(1).split()] if mm else [1, 0, 0, 1, 0, 0]
                        sub_res = resources_of(d) or res
                        saved = dict(st)
                        run(raw or b'', sub_res, mul(mat, st['ctm']), depth + 1, {'alpha': st['alpha'], 'bm': st['bm']})
                        st = saved
                    elif b'/Image' in d:
                        pts = [tp(st['ctm'], *q) for q in ((0, 0), (1, 0), (1, 1), (0, 1))]
                        paths_out.append({'d': 'M' + ' L'.join(f'{a:.3f},{b:.3f}' for a, b in pts) + 'Z',
                                          'fill': 'IMAGE', 'stroke': None, 'lw': 0, 'alpha': st['alpha'],
                                          'bm': st['bm'], 'evenodd': False, 'image': ref})
            elif op == 'sh':
                name = operands[-1] if operands and isinstance(operands[-1], str) else None
                shs = parse_dict_refs(res, b'Shading')
                grad = shading_to_svg(shs.get(name), st['ctm'], len(paths_out)) if name in shs else None
                paths_out.append({'d': st.get('clip') or '', 'fill': 'SHADING', 'grad': grad, 'stroke': None, 'lw': 0,
                                  'alpha': st['alpha'], 'bm': st['bm'], 'evenodd': False})
            elif op in ('W', 'W*'):
                pending_clip = True
                operands = []
                continue
            operands = []
        elif kind == 9:
            operands.append(float(t))
        elif kind == 8:
            operands.append(t[1:].decode('latin1'))
        else:
            operands.append(None)


def page_list():
    cat = re.search(rb'/Pages (\d+) 0 R', data)
    kids = re.search(rb'/Kids\s*\[([^\]]*)\]', obj_body(int(cat.group(1))))
    return [int(x) for x in re.findall(rb'(\d+) 0 R', kids.group(1))]

def bbox_of(d):
    nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', d)]
    xs, ys = nums[0::2], nums[1::2]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

if __name__ == '__main__':
    OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ai2svg'
    os.makedirs(OUTDIR, exist_ok=True)
    pages = page_list()
    for pi, pnum in enumerate(pages, 1):
        paths_out.clear()
        d = obj_body(pnum)
        ab = [float(x) for x in re.search(rb'/ArtBox\s*\[([^\]]*)\]', d).group(1).split()]
        x0, y0, x1, y1 = ab
        cont = re.search(rb'/Contents\s*(\[[^\]]*\]|\d+ 0 R)', d).group(1)
        content = b''.join((stream_of(int(n))[0] or b'') + b'\n' for n in re.findall(rb'(\d+) 0 R', cont))
        run(content, resources_of(d), [1, 0, 0, 1, 0, 0])
        W, H = x1 - x0, y1 - y0
        # 轉成畫板座標（左上原點、Y 向下）
        conv = lambda s: re.sub(r'(-?\d+\.?\d*),(-?\d+\.?\d*)',
                                lambda m: f'{float(m.group(1)) - x0:.3f},{y1 - float(m.group(2)):.3f}', s)
        index = []
        BM = {'Overlay': 'overlay', 'SoftLight': 'soft-light', 'Multiply': 'multiply', 'Screen': 'screen',
              'Darken': 'darken', 'Lighten': 'lighten', 'ColorDodge': 'color-dodge', 'HardLight': 'hard-light', 'Color': 'color', 'Luminosity': 'luminosity', 'Hue': 'hue', 'Saturation': 'saturation'}
        defs = [p['grad'] for p in paths_out if p.get('grad')]
        lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:g}" width="{W:g}" height="{H:g}">',
                 '<defs>' + ''.join(defs) + '</defs>',
                 f'<g transform="matrix(1 0 0 -1 {-x0:g} {y1:g})">']
        for i, p in enumerate(paths_out):
            if not p['d']:
                index.append({'i': i, 'fill': p['fill']}); continue
            dd = conv(p['d'])
            bb = bbox_of(dd)
            if p['fill'] == 'SHADING':
                fill = f'url(#g{i})' if p.get('grad') else '#00ff00'
            elif p['fill'] == 'IMAGE':
                fill = '#ff00ff'
            else:
                fill = p['fill'] or 'none'
            attrs = f'fill="{fill}"'
            if p['stroke']:
                attrs += f' stroke="{p["stroke"]}" stroke-width="{p["lw"]:.3f}"'
            if p['alpha'] < 1: attrs += f' opacity="{p["alpha"]:.3f}"'
            if p['evenodd']: attrs += ' fill-rule="evenodd"'
            if p['fill'] == 'IMAGE': attrs += ' fill-opacity="0.15"'
            if p['bm'] in BM: attrs += f' style="mix-blend-mode:{BM[p["bm"]]}"'
            lines.append(f'<path id="p{i}" {attrs} d="{p["d"]}"/>')
            index.append({'i': i, 'fill': p['fill'], 'stroke': p['stroke'], 'lw': round(p['lw'], 2),
                          'alpha': round(p['alpha'], 3), 'bm': p['bm'],
                          'bbox': [round(v, 1) for v in bb] if bb else None,
                          'segs': dd.count('C') + dd.count('L'), 'image': p.get('image')})
        lines.append('</g></svg>')
        open(f'{OUTDIR}/page{pi}.svg', 'w').write('\n'.join(lines))
        json.dump(index, open(f'{OUTDIR}/page{pi}.json', 'w'), ensure_ascii=False)
        print(f'page{pi}: obj {pnum} artbox {ab} paths {len(paths_out)}')
