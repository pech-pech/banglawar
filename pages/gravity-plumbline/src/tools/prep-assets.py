#!/usr/bin/env python3
"""prep-assets.py - build pages/gravity-plumbline/assets/ from the beta art folder.
Usage: python3 src/tools/prep-assets.py [SRC_ART_DIR] [--sheet]
Needs only PIL + numpy. Repeatable: wipes and rewrites assets/ and the 3 icons.
Fixes (VQA-beta-art): D1 seamless platform-mid, D2/D7 body-only hero, D5 taller ledge,
D6 clean hero-hurt ring, D8 ship only what the game uses (no masters/qa/sheets)."""
import sys, os, shutil
from collections import deque
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, '..', '..'))
DEF_SRC = '/mnt/project-files/games-design/plumbline/2026-11-19-beta/art'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC = args[0] if args else DEF_SRC
OUT = os.path.join(GAME, 'assets')
WHITE = (238, 240, 244)

def wp(im, name, q=88, **kw):
    im.save(os.path.join(OUT, name), 'WEBP', quality=q, method=6, **kw)

def W(p): return Image.open(os.path.join(SRC, 'world', p)).convert('RGBA')

# ---------- D1 seamless platform-mid ----------
def edge_diff(a, b):
    """mean abs diff of last col of a vs first col of b (RGB, rows with alpha in both)."""
    A = np.asarray(a, dtype=float); B = np.asarray(b, dtype=float)
    m = (A[:, -1, 3] > 200) & (B[:, 0, 3] > 200)
    return float(np.abs(A[m, -1, :3] - B[m, 0, :3]).mean())

def seamless_mid(mid, capL, capR):
    """make left col == right col exactly (per row/channel), blending the correction smoothly inward (14 px),
    so mid|mid joins with no step; brick pattern is also nudged by a wrap crossfade to soften the repeat."""
    m = np.asarray(mid, dtype=float).copy()
    h, w, _ = m.shape
    n = 14
    # wrap crossfade first: blend each edge zone with the opposite edge zone
    k = 8
    src = m.copy()
    for i in range(k):
        t = 0.5 * (1 - i / k)  # weight of the opposite edge, 0.5 at the very edge
        m[:, i] = src[:, i] * (1 - t) + src[:, w - k + i] * t
        j = w - k + i
        t2 = 0.5 * ((i + 1) / k)
        m[:, j] = src[:, j] * (1 - t2) + src[:, i] * t2
    for c in range(3):
        l = m[:, 0, c].copy(); r = m[:, -1, c].copy(); tgt = (l + r) / 2
        for i in range(n):
            wt = (1 - i / n) ** 2
            m[:, i, c] += (tgt - l) * wt
            m[:, w - 1 - i, c] += (tgt - r) * wt
    m[:, :, 3] = 255 * (np.asarray(mid)[:, :, 3] > 127)
    return Image.fromarray(np.clip(m, 0, 255).astype(np.uint8), 'RGBA')

def match_cap(cap, mid, side):
    """join column == mid's matching edge column exactly; the cap's last 5 px are an interpolation
    between a clean reference column (6 px in) and that edge, so there is no wide brightening."""
    c = np.asarray(cap, dtype=float).copy(); m = np.asarray(mid, dtype=float)
    w = c.shape[1]; n = 5
    for i in range(n):          # i=0 at the join
        t = 1 - i / n           # 1 at the join
        if side == 'L':
            ref = c[:, w - 1 - n - 1, :3]; tgt = m[:, 0, :3]
            c[:, w - 1 - i, :3] = ref * (1 - t) + tgt * t
            c[:, w - 1 - i, 3] = np.maximum(c[:, w - 1 - i, 3], 255 * (c[:, w - 1 - n - 1, 3] > 200))
        else:
            ref = c[:, n + 1, :3]; tgt = m[:, -1, :3]
            c[:, i, :3] = ref * (1 - t) + tgt * t
            c[:, i, 3] = np.maximum(c[:, i, 3], 255 * (c[:, n + 1, 3] > 200))
    return Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGBA')

def tile_world():
    mid, capL, capR = W('platform-mid.webp'), W('platform-capL.webp'), W('platform-capR.webp')
    before = (edge_diff(mid, mid), edge_diff(capL, mid), edge_diff(mid, capR))
    mid2 = seamless_mid(mid, capL, capR)
    capL2 = match_cap(capL, mid2, 'L'); capR2 = match_cap(capR, mid2, 'R')
    after = (edge_diff(mid2, mid2), edge_diff(capL2, mid2), edge_diff(mid2, capR2))
    print('SEAM before  mid|mid %.1f  capL|mid %.1f  mid|capR %.1f' % before)
    print('SEAM after   mid|mid %.1f  capL|mid %.1f  mid|capR %.1f' % after)
    wp(mid2, 'platform-mid.webp', 90); wp(capL2, 'platform-capL.webp', 90); wp(capR2, 'platform-capR.webp', 90)
    return before, after

# ---------- D5 ledge ----------
def ledge():
    im = W('ledge-crumble.webp')
    w, h = im.size  # 160x21
    # scale 1.0 -> 160 wide is ~100 px in game (0.625), so need >=18 px at 100 wide => >=29 px at 160.
    # stretch y only mildly (1.45x) and add a soft teal-ice underside to reach 30 px without distortion of the pattern.
    nh = 30
    top = im.resize((w, int(h * 1.35)), Image.LANCZOS)
    canvas = Image.new('RGBA', (w, nh), (0, 0, 0, 0)); canvas.alpha_composite(top, (0, 0))
    a = np.asarray(canvas, dtype=float).copy()
    # underside: extend last opaque row downward as fading icy teal
    for x in range(w):
        col = a[:, x, 3]; ys = np.where(col > 128)[0]
        if len(ys) == 0: continue
        y0 = ys.max(); base = a[max(y0 - 1, 0), x, :3]
        tint = np.array([150, 205, 215.])
        for y in range(y0 + 1, nh):
            t = (y - y0) / (nh - y0 + 1)
            a[y, x, :3] = base * 0.5 + tint * 0.5
            a[y, x, 3] = 255 * (1 - t) ** 1.2
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    wp(out, 'ledge-crumble.webp', 90)
    ys = np.where(np.asarray(out)[:, :, 3].max(1) > 128)[0]
    print('LEDGE size %s, opaque rows %d (at 100 px wide: %.1f px tall)' % (out.size, ys.max() - ys.min() + 1, (ys.max() - ys.min() + 1) * 100 / w))

# ---------- hero ----------
def hsv_arr(rgb):
    return np.asarray(Image.fromarray(rgb, 'RGB').convert('HSV'), dtype=float)

def largest(mask):
    h, w = mask.shape; seen = np.zeros_like(mask, bool); best = None; bn = 0
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]: continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; cur = []
        while q:
            y, x = q.popleft(); cur.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; q.append((yy, xx))
        if len(cur) > bn: bn = len(cur); best = cur
    out = np.zeros_like(mask)
    if best:
        ys, xs = zip(*best); out[list(ys), list(xs)] = True
    return out

def fill_holes(mask):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    pad = Image.new('L', (im.width + 2, im.height + 2), 0); pad.paste(im, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    a = np.asarray(pad)[1:-1, 1:-1]
    return a != 128

def mf(mask, f, size):
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(f(size))
    return np.asarray(im) > 127

def body_only(path, work=360, bump=False):
    """returns RGBA body-only sprite (tight crop, new closed white border) at working res."""
    im = Image.open(path).convert('RGBA')
    sc = work / max(im.size)
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    arr = np.asarray(im).copy(); rgb = arr[:, :, :3]; al = arr[:, :, 3]
    hsv = hsv_arr(rgb); hue = hsv[:, :, 0] * 360 / 255; sat = hsv[:, :, 1] / 255; val = hsv[:, :, 2] / 255
    opaque = al > 128
    teal = (hue > 125) & (hue < 205) & (sat > 0.10) & (val > 0.35)
    gold = (hue > 5) & (hue < 62) & (sat > 0.30)            # body gold/orange
    purple = (hue > 235) | (hue < 5)                         # tips: purple/violet/magenta
    purple = ((hue > 225) & (hue < 330) & (sat > 0.2) & (val < 0.85))
    dark = val < 0.45
    core = opaque & ~teal & (gold | purple | dark)
    if bump:  # D6: hurt bump (orange lump above the left point) + ring are not part of the star outline
        yy, xx = np.mgrid[0:core.shape[0], 0:core.shape[1]]
        lump = (xx > 30) & (xx < 78) & (yy > 166) & (yy < 197) & (hue < 32) & (sat > 0.38)
        lump = mf(lump, ImageFilter.MaxFilter, 7)
        # keep only pixels above the star edge line (the lump sits on top of the edge)
        core = core & ~(lump & (yy < 193))
    core = mf(core, ImageFilter.MaxFilter, 3); core = mf(core, ImageFilter.MinFilter, 3)  # close pinholes
    core = largest(core)
    core = fill_holes(core)
    core = mf(core, ImageFilter.MinFilter, 3)                 # open (remove teal-edge fringe)
    core = largest(core)
    core = mf(core, ImageFilter.MaxFilter, 5); core = mf(core, ImageFilter.MinFilter, 5)  # smooth, close cuts
    core = fill_holes(core)
    return im, core

def make_sprite(im, core, bw_final, size, shrink=0):
    """compose: body pixels inside core, white border = dilation of core by bw (final px), tight crop to `size` max side."""
    # work scale -> final scale
    h, w = core.shape
    ys, xs = np.nonzero(core)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    bw_work = max(2, round(bw_final * max(x1 - x0, y1 - y0) / size))
    pad = bw_work + 4
    core_i = Image.fromarray((core * 255).astype(np.uint8))
    box = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    core_c = core_i.crop(box); rgb = im.convert('RGB').crop(box)
    # border: dilate core by bw_work (circle-ish: repeated 3x3 max)
    big = core_c.resize((core_c.width * 4, core_c.height * 4), Image.BICUBIC)
    k = bw_work * 4 * 2 + 1
    k = k if k % 2 else k + 1
    dil = big.filter(ImageFilter.GaussianBlur(1.5)).point(lambda v: 255 if v > 100 else 0).filter(ImageFilter.MaxFilter(min(k, 99) if min(k, 99) % 2 else min(k, 99) + 1))
    dil = dil.filter(ImageFilter.GaussianBlur(1.2))
    inner = big.filter(ImageFilter.GaussianBlur(2.0))
    # body colour: fill from the core region (colour extended outward a little so AA edge has body colour)
    bigrgb = rgb.resize(big.size, Image.LANCZOS)
    r = Image.new('RGBA', big.size, WHITE + (0,))
    r.putalpha(dil)
    body = bigrgb.copy().convert('RGBA'); body.putalpha(inner)
    r.alpha_composite(body)
    # fix interior: pixels with alpha from core but still teal-tinted -> leave (core excludes teal)
    # fit to square canvas
    w2, h2 = r.size; s = size / max(w2, h2)
    r = r.resize((max(1, round(w2 * s)), max(1, round(h2 * s))), Image.LANCZOS)
    return r

def teal_fringe(sp):
    a = np.asarray(sp).astype(float); rgb = a[:, :, :3].astype(np.uint8)
    hsv = hsv_arr(rgb); hue = hsv[:, :, 0] * 360 / 255; sat = hsv[:, :, 1] / 255
    m = (a[:, :, 3] > 128) & (hue > 130) & (hue < 205) & (sat > 0.18)
    return int(m.sum())

HERO = {  # name: (master, work res)
    'idle': 'hero-idle.png', 'land': 'hero-land.png', 'hurt': 'hero-hurt.png', 'win': 'hero-win.png'}

def hero():
    if os.path.isdir(os.path.join(SRC, 'hero')) is False: return {}
    info = {}
    for nm, f in HERO.items():
        im, core = body_only(os.path.join(SRC, 'hero', 'masters', f), bump=(nm == 'hurt'))
        if nm == 'hurt': pass
        sp = make_sprite(im, core, bw_final=4.0, size=192)
        wp(sp, 'hero-%s.webp' % nm, 90)
        info[nm] = (sp.size, teal_fringe(sp))
        # full flame menu versions
        if nm in ('idle', 'win'):
            full = Image.open(os.path.join(SRC, 'hero', 'hero-%s.webp' % nm)).convert('RGBA')
            wp(full, 'hero-%s-flame.webp' % nm, 86)
    return info

# ---------- D6 hero-hurt ring: handled inside body_only (ring is grey/white, not core) ----------

def icons():
    for n in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png'):
        shutil.copy(os.path.join(SRC, 'world', n), os.path.join(GAME, n))

def passthrough():
    for src, dst in (('platform-full.webp', None), ('crusher-head.webp', None), ('gate-aurora.webp', None),
                     ('portal-moon.webp', None), ('spikes-row4.webp', None), ('pip-full.webp', None), ('pip-empty.webp', None),
                     ('bg-portrait-720x1280.webp', None), ('bg-landscape-1280x720.webp', None), ('keyart-720x1280.webp', None)):
        shutil.copy(os.path.join(SRC, 'world', src), os.path.join(OUT, src))

def main():
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    passthrough(); tile_world(); ledge(); info = hero(); icons()
    for k, v in info.items(): print('HERO %s size %s teal-fringe px %d' % (k, v[0], v[1]))
    tot = 0
    print('%-28s %8s' % ('file', 'bytes'))
    for f in sorted(os.listdir(OUT)):
        s = os.path.getsize(os.path.join(OUT, f)); tot += s
        print('%-28s %8d  %s' % (f, s, Image.open(os.path.join(OUT, f)).size))
    print('TOTAL assets/ %d bytes (%.1f KB)' % (tot, tot / 1024))

def sheet():
    """check sheet: bodies at 192/48/28 px on dusk blue and on a moonstone platform, soft drop shadow (D3)."""
    names = ['idle', 'land', 'hurt', 'win']
    spr = {n: Image.open(os.path.join(OUT, 'hero-%s.webp' % n)).convert('RGBA') for n in names}
    capL, mid, capR = [Image.open(os.path.join(OUT, 'platform-%s.webp' % n)).convert('RGBA') for n in ('capL', 'mid', 'capR')]
    def strip(wn):
        st = Image.new('RGBA', (capL.width + mid.width * wn + capR.width, 96), (0, 0, 0, 0))
        st.alpha_composite(capL, (0, 0))
        for i in range(wn): st.alpha_composite(mid, (capL.width + i * mid.width, 0))
        st.alpha_composite(capR, (capL.width + wn * mid.width, 0)); return st
    def put(bgim, sp, h, cx, base, shadow=True):
        k = h / sp.height; s2 = sp.resize((max(1, round(sp.width * k)), h), Image.LANCZOS)
        if shadow:
            sh = Image.new('RGBA', bgim.size, (0, 0, 0, 0)); d = ImageDraw.Draw(sh)
            rw = s2.width * 0.42; d.ellipse([cx - rw, base - h * 0.05, cx + rw, base + h * 0.07], fill=(8, 10, 30, 150))
            bgim.alpha_composite(sh.filter(ImageFilter.GaussianBlur(max(1.5, h / 22))))
        bgim.alpha_composite(s2, (round(cx - s2.width / 2), base - h))
    im = Image.new('RGBA', (1000, 560), (35, 42, 92, 255)); d = ImageDraw.Draw(im)
    d.text((8, 4), 'bodies on dusk blue #232a5c: 192 px', fill=(255, 255, 255, 255))
    x = 120
    for n in names: put(im, spr[n], 192, x, 220, False); x += 235
    d.text((8, 232), '48 px and 28 px on dusk blue', fill=(255, 255, 255, 255))
    for i, n in enumerate(names): put(im, spr[n], 48, 40 + i * 70, 300, False); put(im, spr[n], 28, 40 + i * 70 + 280, 300, False)
    d.text((8, 320), 'on moonstone platform, soft shadow: 96 / 48 / 28 px', fill=(255, 255, 255, 255))
    top = 450
    im.alpha_composite(strip(3), (20, top)); im.alpha_composite(strip(5), (400, top))
    for xx, n in zip([60, 160, 260], ['idle', 'win', 'land']): put(im, spr[n], 96, xx + 20, top + 12)
    for xx, n in zip([420, 500, 580], ['idle', 'hurt', 'land']): put(im, spr[n], 48, xx, top + 14)
    for xx, n in zip([660, 710, 760, 810], names): put(im, spr[n], 28, xx, top + 14)
    out = os.path.join(GAME, 'src', 'review', 'shots-beta'); os.makedirs(out, exist_ok=True)
    im.convert('RGB').save(os.path.join(out, 'assets-hero-check.png'))
    z = Image.new('RGBA', (4 * 400, 400), (255, 0, 255, 255))   # fringe test on magenta
    for i, n in enumerate(names):
        sp = spr[n]; k = 380 / max(sp.size); s2 = sp.resize((round(sp.width * k), round(sp.height * k)), Image.LANCZOS)
        z.alpha_composite(s2, (i * 400 + (400 - s2.width) // 2, (400 - s2.height) // 2))
    z.convert('RGB').save(os.path.join(out, 'assets-hero-fringe.png'))

if __name__ == '__main__':
    main()
    if '--sheet' in sys.argv: sheet()
