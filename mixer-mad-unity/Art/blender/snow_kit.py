"""snow_kit.py - Mixer Mad 3D: snowy pass set pieces (the pilot biome).

Run on the Mac:   blender -b -P snow_kit.py -- [--only NAME] [--out DIR] [--strict]
Check anywhere:   python3 snow_kit.py --dry-run

Makes: road-edge snow banks (3), pine trees (3 variants, LOD0/1/2), rocks (3), snow-capped
background mountain layers (5 depth layers), guard rails (straight + end), a small cabin,
signs (3), and the falling-snow particle atlas texture.

Every asset is its own FBX (MM_Env_<Name>.fbx) with a root empty named like the asset and
LOD meshes MM_Env_<Name>_LOD0/1/2 as its children, so Unity builds the LODGroup by itself.
Pivot = bottom centre of the object, on the ground. Props face -Y (toward the side camera).
No rig. Background pieces carry no outline (S1: outline only on gameplay layers).

Lessons applied: AL-2 (no pink / magenta / violet; the mountains and snow shade use blue-grey,
the sign plates use yellow + navy, never hazard red). Contract role colours: snow #f4f8ff,
shade #b9d3ef, never hazard red + stripes on decor. AL-1/AL-4: nothing here is a vehicle
and nothing here has a collider; guard rails, signs and the cabin are L0/L2 decor and must stay
OFF the play lane (L1). If one is ever put in the lane it needs its own convex collider part(s).
"""
import math
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mm_common import *  # noqa

SNOW, SHADE = PALETTE['snow'], PALETTE['snow_shade']
SKY = '#cfe4f6'


def mix(a, b, t):
    ca, cb = hex_rgb(a), hex_rgb(b)
    return '#%02x%02x%02x' % tuple(int(round((ca[i] + (cb[i] - ca[i]) * t) * 255)) for i in range(3))


def desat(h, k):
    r, g, b = hex_rgb(h)
    y = 0.299 * r + 0.587 * g + 0.114 * b
    return '#%02x%02x%02x' % tuple(int(round((y + (c - y) * (1 - k)) * 255)) for c in (r, g, b))


def hnoise(x, y=0.0, z=0.0, seed=0.0):
    v = math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1414) * 43758.5453
    return v - math.floor(v)


def vnoise(x, seed=0.0):
    """smooth 1D value noise in [0,1]"""
    i = math.floor(x)
    f = x - i
    f = f * f * (3 - 2 * f)
    return hnoise(i, 0, 0, seed) * (1 - f) + hnoise(i + 1, 0, 0, seed) * f


# ------------------------------------------------------------------------------ builders
def rb(m, c, size, r, mat, tag='box'):
    """rounded box with a single bevel segment (cheap toy edge)"""
    m.rbox(c, size, r, mat, None, 1, tag)


def snow_bank(variant, lod):
    """4 m modular berm. Ends are 0.30 m high so neighbours join. Lumpy top, rounded sides."""
    h = {'A': 0.55, 'B': 0.75, 'C': 0.95}[variant]
    seed = {'A': 1.0, 'B': 7.0, 'C': 13.0}[variant]
    n = 16 if lod == 0 else 7
    pts = [(-2.0, 0.0), (2.0, 0.0)]
    top = []
    for k in range(n + 1):
        x = 2.0 - 4.0 * k / n
        edge = math.sin(math.pi * (k / n)) ** 0.6
        z = 0.34 + (h - 0.34) * edge * (0.55 + 0.45 * vnoise(k * 0.9, seed))
        top.append((x, z))
    top[0] = (2.0, 0.34)
    top[-1] = (-2.0, 0.34)
    poly = pts + top
    m = Mesh()
    f0 = len(m.faces)
    m.extrude(poly, -0.65, 0.65, SNOW_MAT, 0.14 if lod == 0 else 0.0, 2, tag='bank')
    m.assign_by_normal(f0, SNOW_MAT, 0.35)
    for i in range(f0, len(m.faces)):
        if m.fmat[i] != SNOW_MAT:
            m.fmat[i] = SHADE_MAT
    return m


SNOW_MAT, SHADE_MAT = 'MM_Env_Snow', 'MM_Env_SnowShade'


def pine(variant, lod):
    spec = {'A': dict(tiers=5, h=5.6, r0=1.25, trunk=0.9), 'B': dict(tiers=4, h=4.2, r0=1.35, trunk=0.7), 'C': dict(tiers=3, h=3.0, r0=1.45, trunk=0.55)}[variant]
    seg = {0: 12, 1: 6, 2: 5}[lod]
    m = Mesh()
    tiers = spec['tiers'] if lod < 2 else 2
    trunk_h = spec['trunk']
    m.cyl((0, 0, (trunk_h + 0.4) / 2), (0, 0, 1), 0.16, trunk_h + 0.4, 8 if lod == 0 else 5, 'MM_Env_Trunk', tag='trunk')
    span = spec['h'] - trunk_h
    th = span / (tiers * 0.62 + 0.38)           # tier height, tiers overlap by ~38%
    for k in range(tiers):
        z0 = trunk_h + k * th * 0.62
        r = spec['r0'] * (1.0 - 0.72 * k / max(tiers, 1)) * (1.0 if lod < 2 else 0.9)
        ph = k * 2.399
        if lod == 0:
            prof = [(0.0, r), (th * 0.40, r * 0.62), (th, 0.0)]
            cap = [(th * 0.38, r * 0.64), (th * 0.62, r * 0.40), (th, 0.0)]
        else:
            prof = [(0.0, r), (th, 0.0)]
            cap = [(th * 0.45, r * 0.55), (th, 0.0)]
        m.revolve((0, 0, z0), (0, 0, 1), prof, seg, 'MM_Env_Pine', phase=ph, tag='tier')
        if lod < 2:
            m.revolve((0, 0, z0 + 0.03), (0, 0, 1), [(t, rr + 0.03) if rr > 0 else (t, 0.0) for t, rr in cap], seg, SNOW_MAT, phase=ph, tag='snowcap')
    return m


def rock(variant, lod):
    sx, sy, sz, seed = {'A': (1.1, 0.9, 0.7, 2.0), 'B': (1.7, 1.2, 1.0, 5.0), 'C': (0.8, 0.8, 0.9, 9.0)}[variant]
    segs, rings = (12, 5) if lod == 0 else (7, 3)
    m = Mesh()
    f0 = len(m.faces)
    prof = [(math.sin(math.pi / 2 * k / rings), math.cos(math.pi / 2 * k / rings) if k < rings else 0.0) for k in range(rings + 1)]
    m.revolve((0, 0, 0), (0, 0, 1), prof, segs, 'MM_Env_Rock', tag='rock')
    for i, (x, y, z) in enumerate(m.verts):
        ang = math.atan2(y, x)
        d = 1.0 + 0.16 * (vnoise(ang * 1.6 + seed + z * 1.5, seed) - 0.5) * 2
        m.verts[i] = (x * d * sx, y * d * sy, z * d * sz)
    m.assign_by_normal(f0, SNOW_MAT, 0.45)
    return m


MTN = {   # layer: (distance behind lane m, half length m, peak height m, seed)
    1: (40.0, 70.0, 22.0, 1.0), 2: (80.0, 110.0, 34.0, 4.0), 3: (130.0, 160.0, 52.0, 8.0),
    4: (200.0, 230.0, 75.0, 12.0), 5: (300.0, 340.0, 105.0, 17.0),
}


def mountain(layer, lod):
    dist, half, hmax, seed = MTN[layer]
    n = 48 if lod == 0 else 16
    haze = [0.10, 0.25, 0.40, 0.55, 0.70][layer - 1]          # farther = hazier (contract grade: 40% desat, 25% haze at the mid layer)
    rm, sm = 'MM_Env_MtnRock_L%d' % layer, 'MM_Env_MtnSnow_L%d' % layer
    W = hmax * 0.9
    cols = []
    for i in range(n + 1):
        x = -half + 2 * half * i / n
        r = 0.40 * vnoise(x / (hmax * 1.3), seed) + 0.30 * vnoise(x / (hmax * 0.55) + 3, seed + 1) + 0.45 * max(0.0, vnoise(x / (hmax * 0.30) + 9, seed + 2) - 0.45) * 1.8
        edge = min(1.0, 3.0 * (1 - abs(x) / half) + 0.15)
        cols.append(max(0.18, r) * hmax * edge)
    rows = []
    for (yy, zf) in ((-1.0, 0.0), (-0.38, 0.62), (0.0, 1.0), (0.38, 0.62), (1.0, 0.0)):
        rows.append([(-half + 2 * half * i / n, yy * W, cols[i] * zf) for i in range(n + 1)])
    m = Mesh()
    V = [p for row in rows for p in row]
    F, M = [], []
    ni = n + 1
    for j in range(len(rows) - 1):
        for i in range(ni - 1):
            a, b = j * ni + i, j * ni + i + 1
            c, d = (j + 1) * ni + i + 1, (j + 1) * ni + i
            F.append((a, b, c, d))          # front slope faces -Y/up, back slope +Y/up (checked: see README)
            M.append(sm if j in (1, 2) else rm)
    m._add(V, F, M, None, closed=False, tag='ridge')
    return m


def guard_rail(variant, lod):
    m = Mesh()
    r = 0.03 if lod == 0 else 0.0
    L = 4.0 if variant == 'A' else 2.0
    xs = (-1.0, 1.0) if variant == 'A' else (-0.4,)
    for x in xs:
        rb(m, (x, 0.0, 0.40), (0.12, 0.14, 0.80), r, 'MM_Env_RailPost', tag='post')
        rb(m, (x, -0.09, 0.62), (0.10, 0.06, 0.18), r, 'MM_Env_RailPost', tag='spacer')
        if lod == 0:
            m.cyl((x, -0.15, 0.30), (0, 1, 0), 0.04, 0.02, 8, 'MM_Env_Reflector', tag='reflector')
    cx = 0.0 if variant == 'A' else -0.0
    rb(m, (cx, -0.15, 0.62), (L, 0.07, 0.30), r, 'MM_Env_Rail', tag='beam')
    if lod == 0:
        for dz in (-0.07, 0.07):
            rb(m, (cx, -0.195, 0.62 + dz), (L, 0.03, 0.05), 0.012, 'MM_Env_Rail', tag='rib')
    if variant == 'B':        # terminal: rounded end cap (-X end is the free end)
        m.sphere((-L / 2 + cx, -0.15, 0.62), 0.15, 10 if lod == 0 else 6, 6 if lod == 0 else 4, 'MM_Env_Rail', scale=(0.5, 0.5, 1.0), tag='endcap')
    snow = 0.05
    rb(m, (cx, -0.15, 0.62 + 0.15 + snow / 2), (L * 0.9, 0.09, snow), 0.02, SNOW_MAT, tag='snow_top')
    return m


def cabin(lod):
    """Small log cabin, 5 x 4 m, door and warm window on the -Y (camera) side, chimney, snowy roof."""
    m = Mesh()
    detail = lod == 0
    W, D, H = 5.0, 4.0, 2.3
    rb(m, (0, 0, H / 2 + 0.2), (W, D, H), 0.06 if detail else 0.0, 'MM_Env_Log', tag='walls')
    rb(m, (0, 0, 0.1), (W + 0.3, D + 0.3, 0.2), 0.04 if detail else 0.0, 'MM_Env_Stone', tag='base')
    if detail:
        for k in range(1, 5):
            z = 0.2 + k * H / 9
            rb(m, (0, -D / 2 - 0.012, z), (W + 0.04, 0.03, 0.035), 0.01, 'MM_Env_LogDark', tag='groove')
            rb(m, (0, D / 2 + 0.012, z), (W + 0.04, 0.03, 0.035), 0.01, 'MM_Env_LogDark', tag='groove')
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.cyl((sx * W / 2, sy * D / 2, H / 2 + 0.2), (0, 0, 1), 0.14, H + 0.1, 6, 'MM_Env_LogDark', tag='corner')
    # gable roof along X: two slabs + snow slabs
    rz = H + 0.2
    rise = 1.25
    ov = 0.45
    slab = [(-(D / 2 + ov), rz - 0.05), (0.0, rz + rise), (D / 2 + ov, rz - 0.05), (D / 2 + ov, rz + 0.07), (0.0, rz + rise + 0.12), (-(D / 2 + ov), rz + 0.07)]
    m.extrude_x(slab, -(W / 2 + 0.4), W / 2 + 0.4, 'MM_Env_Roof', 0.03 if detail else 0.0, 1, tag='roof')
    sn = [(-(D / 2 + ov) + 0.10, rz + 0.06), (0.0, rz + rise + 0.11), (D / 2 + ov - 0.10, rz + 0.06), (D / 2 + ov - 0.10, rz + 0.24), (0.0, rz + rise + 0.30), (-(D / 2 + ov) + 0.10, rz + 0.24)]
    m.extrude_x(sn, -(W / 2 + 0.3), W / 2 + 0.3, SNOW_MAT, 0.07 if detail else 0.0, 1, tag='roof_snow')
    # gable fill triangles (log colour) closing the roof ends
    tri = [(-D / 2, rz), (D / 2, rz), (0.0, rz + rise - 0.05)]
    m.extrude_x(tri, -W / 2 + 0.02, W / 2 - 0.02, 'MM_Env_Log', 0.0, 1, tag='gable')
    # chimney
    rb(m, (1.5, 0.6, rz + rise + 0.2), (0.6, 0.6, 1.6), 0.04 if detail else 0.0, 'MM_Env_Stone', tag='chimney')
    rb(m, (1.5, 0.6, rz + rise + 1.04), (0.74, 0.74, 0.14), 0.04 if detail else 0.0, SNOW_MAT, tag='chimney_snow')
    # door + window (front = -Y)
    rb(m, (-1.2, -D / 2 - 0.05, 1.25), (0.95, 0.12, 2.0), 0.03 if detail else 0.0, 'MM_Env_Door', tag='door')
    rb(m, (-1.2, -D / 2 - 0.12, 0.28), (1.3, 0.35, 0.16), 0.02 if detail else 0.0, 'MM_Env_Stone', tag='step')
    rb(m, (1.1, -D / 2 - 0.04, 1.45), (1.0, 0.10, 0.85), 0.02 if detail else 0.0, 'MM_Env_WindowGlow', tag='window')
    if detail:
        for dx in (-0.55, 0.55):
            rb(m, (1.1 + dx, -D / 2 - 0.11, 1.45), (0.07, 0.07, 0.95), 0.01, 'MM_Env_LogDark', tag='frame')
        rb(m, (1.1, -D / 2 - 0.11, 1.45), (1.1, 0.07, 0.07), 0.01, 'MM_Env_LogDark', tag='frame')
        rb(m, (1.1, -D / 2 - 0.11, 1.02), (1.2, 0.16, 0.07), 0.01, 'MM_Env_LogDark', tag='sill')
        for k in range(3):                       # snow on the step and ground drift
            m.sphere((-0.2 + k * 0.9, -D / 2 - 0.7, 0.12), 0.45, 7, 4, SNOW_MAT, scale=(1.4, 1.0, 0.35), tag='drift')
    return m


def pole(m, h=2.3, r=0.04):
    m.cyl((0, 0, h / 2), (0, 0, 1), r, h, 8, 'MM_Env_RailPost', tag='pole')


def sign(variant, lod):
    m = Mesh()
    d = lod == 0
    if variant == 'Ice':          # diamond warning plate, navy rim, skid-curve glyph (no text)
        pole(m, 2.1)
        dm = [(0, -0.55), (0.55, 0), (0, 0.55), (-0.55, 0)]
        c = (0.0, 1.9)
        rim = round_poly([(c[0] + x, c[1] + z) for x, z in [(0, -0.62), (0.62, 0), (0, 0.62), (-0.62, 0)]], 0.07, 2)
        pl = round_poly([(c[0] + x, c[1] + z) for x, z in dm], 0.05, 2)
        m.extrude(rim, -0.07, -0.02, 'MM_Env_SignNavy', 0.01 if d else 0, 1, tag='rim')
        m.extrude(pl, -0.10, -0.04, 'MM_Env_SignYellow', 0.01 if d else 0, 1, tag='plate')
        if d:
            pts = [(c[0] + 0.28 * math.sin(t * 2 * math.pi) * (1 - t * 0.4), -0.115, c[1] - 0.30 + 0.60 * t) for t in [k / 10 for k in range(11)]]
            m.tube(pts, 0.025, 5, 'MM_Env_SignNavy', tag='skid')
        m.sphere((0.0, -0.05, c[1] + 0.58), 0.12, 8, 4, SNOW_MAT, scale=(1.3, 0.8, 0.5), tag='snow')
    elif variant == 'Chevron':    # arrow board, 3 chevrons, two posts
        for x in (-0.45, 0.45):
            m.cyl((x, 0, 0.9), (0, 0, 1), 0.04, 1.8, 8, 'MM_Env_RailPost', tag='pole')
        rb(m, (0.0, -0.03, 1.55), (1.45, 0.06, 0.78), 0.05 if d else 0, 'MM_Env_SignNavy', tag='back')
        rb(m, (0.0, -0.08, 1.55), (1.35, 0.05, 0.68), 0.04 if d else 0, 'MM_Env_SignYellow', tag='plate')
        for k in range(3):
            cx = -0.38 + k * 0.38
            ch = [(cx + 0.10, 1.55 + 0.26), (cx - 0.07, 1.55), (cx + 0.10, 1.55 - 0.26), (cx + 0.19, 1.55 - 0.26), (cx + 0.02, 1.55), (cx + 0.19, 1.55 + 0.26)]
            m.extrude(ch, -0.12, -0.09, 'MM_Env_SignNavy', 0.0, 1, tag='chevron')
        m.sphere((0.0, -0.05, 1.95), 0.16, 8, 4, SNOW_MAT, scale=(2.5, 0.7, 0.4), tag='snow')
    else:                         # 'Chains': round blue plate with a wheel + chain links glyph
        pole(m, 2.1)
        c = (0.0, 1.85)
        m.revolve((0.0, -0.06, c[1]), (0, 1, 0), [(0.0, 0.5), (-0.05, 0.5)], 16 if d else 10, 'MM_Env_SignBlue', tag='disc')
        m.revolve((0.0, -0.095, c[1]), (0, 1, 0), [(0.0, 0.40), (0.01, 0.40), (0.01, 0.44), (0.0, 0.44)], 16 if d else 10, 'MM_Env_SignWhite', closed_profile=True, tag='ring')
        m.revolve((0.0, -0.10, c[1]), (0, 1, 0), [(0.0, 0.26), (0.02, 0.26), (0.02, 0.30), (0.0, 0.30)], 14 if d else 8, 'MM_Env_SignWhite', closed_profile=True, tag='tyre')
        if d:
            for k in range(8):
                a = 2 * math.pi * k / 8
                rb(m, (0.15 * math.cos(a) * 1.0, -0.11, c[1] + 0.15 * math.sin(a)), (0.05, 0.03, 0.05), 0.0, 'MM_Env_SignWhite', tag='link')
        m.sphere((0.0, -0.05, c[1] + 0.5), 0.12, 8, 4, SNOW_MAT, scale=(1.4, 0.8, 0.5), tag='snow')
    return m


# ------------------------------------------------------------------------------ asset table
ASSETS = {}


def reg(name, builder, lods, budget, note, group):
    ASSETS[name] = dict(builder=builder, lods=lods, budget=budget, note=note, group=group)


for v in 'ABC':
    reg('SnowBank' + v, (lambda lod, v=v: snow_bank(v, lod)), (0, 1), 800, 'road-edge berm, 4 m module, ends 0.34 m high', 'bank')
    reg('Pine' + v, (lambda lod, v=v: pine(v, lod)), (0, 1, 2), 900, 'pine tree, trunk base at origin', 'pine')
    reg('Rock' + v, (lambda lod, v=v: rock(v, lod)), (0, 1), 400, 'rounded decor rock with snow cap', 'rock')
for L in range(1, 6):
    reg('MtnL%d' % L, (lambda lod, L=L: mountain(L, lod)), (0, 1), 1500, 'background ridge layer %d, place %.0f m behind the lane' % (L, MTN[L][0]), 'mountain')
reg('GuardRailA', (lambda lod: guard_rail('A', lod)), (0, 1), 600, '4 m straight module, rail faces -Y', 'rail')
reg('GuardRailB', (lambda lod: guard_rail('B', lod)), (0, 1), 600, '2 m end terminal (free end at -X)', 'rail')
reg('CabinA', cabin, (0, 1), 1500, 'log cabin 5 x 4 m, door and window face -Y', 'cabin')
for v in ('Ice', 'Chevron', 'Chains'):
    reg('Sign' + v, (lambda lod, v=v: sign(v, lod)), (0, 1), 500, 'road sign, plate faces -Y (no text)', 'sign')


def env_materials(mm_extra=None):
    mats = {
        SNOW_MAT: dict(color=SNOW, rough=0.85),
        SHADE_MAT: dict(color=SHADE, rough=0.85),
        'MM_Env_Pine': dict(color='#2e6b4f', rough=0.8),
        'MM_Env_Trunk': dict(color='#6b4a2f', rough=0.9),
        'MM_Env_Rock': dict(color='#6a7686', rough=0.8),
        'MM_Env_Rail': dict(color='#c9ced6', rough=0.5, metal=0.5),
        'MM_Env_RailPost': dict(color='#8a929c', rough=0.6, metal=0.4),
        'MM_Env_Reflector': dict(color='#ffb000', rough=0.3, emit='#ffb000', emit_strength=0.3),
        'MM_Env_Log': dict(color='#a8703c', rough=0.85),
        'MM_Env_LogDark': dict(color='#6b4426', rough=0.9),
        'MM_Env_Stone': dict(color='#8e959c', rough=0.9),
        'MM_Env_Roof': dict(color='#5b4a42', rough=0.85),
        'MM_Env_Door': dict(color='#4b3020', rough=0.8),
        'MM_Env_WindowGlow': dict(color='#ffd27a', rough=0.3, emit='#ffc860', emit_strength=2.0),
        'MM_Env_SignYellow': dict(color=PALETTE['yellow'], rough=0.4, coat=0.5),
        'MM_Env_SignNavy': dict(color=NAVY, rough=0.5),
        'MM_Env_SignBlue': dict(color='#2a6fb0', rough=0.4, coat=0.5),
        'MM_Env_SignWhite': dict(color='#f4f6fa', rough=0.4),
    }
    for L in range(1, 6):
        dist, half, hmax, seed = MTN[L]
        haze = [0.10, 0.25, 0.40, 0.55, 0.70][L - 1]
        mats['MM_Env_MtnRock_L%d' % L] = dict(color=mix(desat('#58708f', 0.4), SKY, haze), rough=0.95)
        mats['MM_Env_MtnSnow_L%d' % L] = dict(color=mix(SNOW, SKY, haze * 0.5), rough=0.95)
    return mats


# ------------------------------------------------------------------------------ checks + build
def check_asset(rep, name, lod_meshes, spec):
    t0 = lod_meshes[0].tris()
    tri_budget_check(rep, '%s LOD0' % name, t0, spec['budget'])
    for lod, m in lod_meshes.items():
        if lod > 0:
            rep.check('  %s LOD%d lighter than LOD%d' % (name, lod, lod - 1), m.tris() < lod_meshes[lod - 1].tris(), '%d tris' % m.tris())
    lo, hi = lod_meshes[0].bbox()
    if spec['group'] != 'mountain':
        rep.check('  %s sits on the ground (min z ~ 0)' % name, abs(lo[2]) < 0.06, 'min z %.3f' % lo[2])
    return lo, hi


def build_blender(args, built, rep):
    tex_dir = os.path.join(args.out, 'textures')
    make_snowflake_atlas_png(os.path.join(tex_dir, 'MM_SnowFlakes.png'))
    for name, sp in built.items():
        bl_reset()
        col = bl_collection('MM_Env')
        mats = {k: bl_material(k, **v) for k, v in env_materials().items()}
        root = bl_empty('MM_Env_' + name, (0, 0, 0), col, 0.3)
        objs = [root]
        for lod, mesh in sp['meshes'].items():
            o = bl_mesh_object(Part('MM_Env_%s_LOD%d' % (name, lod), mesh, (0, 0, 0), None, lod, outline=False), col, mats)
            o.parent = root
            objs.append(o)
        sub = Report('MM_Env_' + name)
        bl_qa(objs, sub)
        if not sub.ok:
            rep.check('blender qa ' + name, False, str([r for r in sub.rows if not r['pass']][:2]))
        bl_save_blend(os.path.join(args.out, 'MM_Env_%s.blend' % name))
        if not args.no_export:
            bl_export_fbx(os.path.join(args.out, 'MM_Env_%s.fbx' % name), objs, bake_space=not args.no_bake_space)
        print('[mm] exported', name)


def main():
    def extra(p):
        p.add_argument('--only', default='', help='comma list of asset names (e.g. PineA,CabinA)')
    args = parse_args(extra)
    rep = Report('MM_Env_SnowKit')
    only = [s for s in args.only.split(',') if s]
    built = {}
    for name, spec in ASSETS.items():
        if only and name not in only:
            continue
        meshes = {lod: spec['builder'](lod) for lod in spec['lods']}
        lo, hi = check_asset(rep, name, meshes, spec)
        built[name] = dict(meshes=meshes, bbox=[list(lo), list(hi)], spec=spec)
    # mountain layers: colours come from the mesh (per-layer haze); also checked for 5 distinct layers
    n_m = sum(1 for k in built if k.startswith('Mtn'))
    if not only:
        rep.check('5 mountain depth layers', n_m == 5, str(n_m))
        rep.check('3 pine variants', sum(1 for k in built if k.startswith('Pine')) == 3, '')
        rep.check('3 snow banks / 3 rocks / 3 signs', all(sum(1 for k in built if k.startswith(p)) == c for p, c in (('SnowBank', 3), ('Rock', 3), ('Sign', 3))), '')
    if args.dry_run:
        finish(rep, args, args.out)
        return
    build_blender(args, built, rep)
    meta = {'assets': {n: dict(lods={str(l): m.tris() for l, m in b['meshes'].items()}, bbox=b['bbox'], budget_lod0=b['spec']['budget'], note=b['spec']['note'])
                       for n, b in built.items()},
            'mountain_layers': {str(k): dict(distance_m=v[0], half_length_m=v[1], peak_m=v[2]) for k, v in MTN.items()},
            'snow_particles': {'texture': 'textures/MM_SnowFlakes.png', 'atlas': '2x2 tiles: soft dot, six-arm flake, fuzzy blob, hex crystal', 'unity': 'Particle System > Texture Sheet Animation, 2x2, random row; Additive or Alpha-blended, white'},
            'outline': 'none on any env asset (background rule); only gameplay layers get the navy hull',
            'qa': rep.rows}
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'MM_Env_SnowKit_meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    rep.save(args.out)
    finish(rep, args, args.out)


if __name__ == '__main__':
    main()
