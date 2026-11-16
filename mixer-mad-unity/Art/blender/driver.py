"""driver.py - Mixer Mad 3D: the original cartoon builder, seated in the mixer cab.

Run on the Mac:   blender -b -P driver.py -- [--out DIR] [--strict]
Check anywhere:   python3 driver.py --dry-run

Original character (clay-mock option A from S1: round-headed, kid-sized builder, yellow hard hat).
No licensed shapes, no logos, no text.

Frame: the driver is built in its own space with the HIPS at the origin, facing +X, +Z up
(sitting pose is the rest pose). In the truck the hips sit at the cab socket SEAT_POS = (0.95, 0, 1.16),
the same point as MM_Mixer_Socket_Driver, so Unity just parents the driver to that socket.

Rig: 22 bones, rigid weights (toy joints are ball-shaped spheres that hide the seams).
Face: shape keys on MM_Driver_Face_LOD0: idle (basis), gas_grin, woo, scared, crash_daze, win_cheer,
fail_facepalm. LOD1 is a static face (no shape keys), swapped in by the LODGroup far away.

Lessons applied: AL-1 (faces +X, the cab end), AL-2 (no pink / magenta / violet: skin is a warm
tan, mouth dark brown; explicit colours everywhere).
"""
import math
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mm_common import *  # noqa
from mixer_truck import SEAT_POS, WINDOW, ROOF  # same seat point as the truck socket

ASSET = 'MM_Char_Driver'
PFX = 'MM_Driver'
BUDGET = {0: 3500, 1: 1500}      # S1 section 6: driver 3.5k High, 1.5k Low

HEAD_C = (0.0, 0.0, 0.66)
HEAD_R = 0.25
HEAD_SY = 1.05
HAT_BASE = 0.80
HAT_TOP = 1.02

COL = {
    'MM_Driver_Skin': '#f0b48a', 'MM_Driver_Hat': PALETTE['yellow'], 'MM_Driver_Shirt': '#f4ecd6',
    'MM_Driver_Overalls': '#3f78c4', 'MM_Driver_Glove': PALETTE['orange'], 'MM_Driver_Boot': '#2b2f3a',
    'MM_Driver_EyeWhite': '#ffffff', 'MM_Driver_Pupil': NAVY, 'MM_Driver_Brow': '#5a3b22',
    'MM_Driver_Mouth': '#6a2a1f', 'MM_Driver_Belt': '#8a5a2b',
}

Q = {0: dict(seg=10, rings=6, head=(18, 12), limb=8, hat=14, detail=True),
     1: dict(seg=6, rings=4, head=(8, 6), limb=5, hat=8, detail=False)}

HIP_L, HIP_R = (0.0, 0.11, -0.02), (0.0, -0.11, -0.02)
SHOULDER_L, SHOULDER_R = (0.0, 0.22, 0.37), (0.0, -0.22, 0.37)
HAND_L, HAND_R = (0.31, 0.15, 0.43), (0.31, -0.15, 0.39)       # on the steering wheel
KNEE_L, KNEE_R = (0.30, 0.12, 0.00), (0.30, -0.12, 0.00)
ANKLE_L, ANKLE_R = (0.34, 0.12, -0.26), (0.34, -0.12, -0.26)


def ik2(a, target, l1, l2, pole):
    """two-bone IK: returns the elbow position."""
    d = v_sub(target, a)
    dl = min(v_len(d), l1 + l2 - 1e-4)
    u = v_norm(d)
    x = (dl * dl + l1 * l1 - l2 * l2) / (2 * dl)
    h = math.sqrt(max(l1 * l1 - x * x, 0.0))
    pv = v_sub(pole, v_mul(u, v_dot(pole, u)))
    pv = v_norm(pv)
    return v_add(a, v_add(v_mul(u, x), v_mul(pv, h)))


ELBOW_L = ik2(SHOULDER_L, HAND_L, 0.21, 0.19, (0.0, 0.6, -0.8))
ELBOW_R = ik2(SHOULDER_R, HAND_R, 0.21, 0.19, (0.0, -0.6, -0.8))


def head_x(y, z):
    """x of the head surface at (y, z): ellipsoid used to stick the face on."""
    rad = 1.0 - (y / (HEAD_R * HEAD_SY)) ** 2 - ((z - HEAD_C[2]) / HEAD_R) ** 2
    return HEAD_C[0] + HEAD_R * math.sqrt(max(rad, 0.04))


def bone_list():
    def b(name, head, tail, parent):
        return dict(name=name, head=head, tail=tail, parent=parent)
    wl = v_add(HAND_L, (0.0, 0.0, 0.0))
    return [
        b('Hips', (0, 0, 0), (0, 0, 0.12), None),
        b('Spine', (0, 0, 0.0), (0, 0, 0.22), 'Hips'),
        b('Chest', (0, 0, 0.22), (0, 0, 0.42), 'Spine'),
        b('Neck', (0, 0, 0.42), (0, 0, 0.5), 'Chest'),
        b('Head', (0, 0, 0.5), (0, 0, 0.9), 'Neck'),
        b('Hat', (0, 0, 0.80), (0, 0, 1.02), 'Head'),
        b('EyeL', (0.2, 0.092, 0.69), (0.3, 0.092, 0.69), 'Head'),
        b('EyeR', (0.2, -0.092, 0.69), (0.3, -0.092, 0.69), 'Head'),
        b('ShoulderL', (0, 0.06, 0.37), SHOULDER_L, 'Chest'),
        b('ShoulderR', (0, -0.06, 0.37), SHOULDER_R, 'Chest'),
        b('UpperArmL', SHOULDER_L, ELBOW_L, 'ShoulderL'),
        b('UpperArmR', SHOULDER_R, ELBOW_R, 'ShoulderR'),
        b('ForearmL', ELBOW_L, HAND_L, 'UpperArmL'),
        b('ForearmR', ELBOW_R, HAND_R, 'UpperArmR'),
        b('HandL', HAND_L, v_add(HAND_L, v_mul(v_norm(v_sub(HAND_L, ELBOW_L)), 0.10)), 'ForearmL'),
        b('HandR', HAND_R, v_add(HAND_R, v_mul(v_norm(v_sub(HAND_R, ELBOW_R)), 0.10)), 'ForearmR'),
        b('ThighL', HIP_L, KNEE_L, 'Hips'),
        b('ThighR', HIP_R, KNEE_R, 'Hips'),
        b('ShinL', KNEE_L, ANKLE_L, 'ThighL'),
        b('ShinR', KNEE_R, ANKLE_R, 'ThighR'),
        b('FootL', ANKLE_L, v_add(ANKLE_L, (0.2, 0, 0)), 'ShinL'),
        b('FootR', ANKLE_R, v_add(ANKLE_R, (0.2, 0, 0)), 'ShinR'),
    ]


def squash(m, scale, about=(0, 0, 0), shift=(0, 0, 0), start=0):
    """scale + move the vertices added since index `start`."""
    for i in range(start, len(m.verts)):
        x, y, z = m.verts[i]
        m.verts[i] = (about[0] + (x - about[0]) * scale[0] + shift[0],
                      about[1] + (y - about[1]) * scale[1] + shift[1],
                      about[2] + (z - about[2]) * scale[2] + shift[2])


def limb(m, a, b, r, segs, mat, bone):
    c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    m.cyl(c, v_sub(b, a), r, v_len(v_sub(b, a)), segs, mat, bone, tag='limb')


def build_body(q):
    m = Mesh()
    s, rg = q['seg'], q['rings']
    # hips + torso
    n0 = len(m.verts)
    m.sphere((0, 0, 0), 0.19, s, rg, 'MM_Driver_Overalls', 'Hips', tag='hips')
    squash(m, (0.95, 1.2, 0.85), start=n0)
    n0 = len(m.verts)
    m.revolve((0, 0, 0), (0, 0, 1), [(0.0, 0.19), (0.12, 0.205), (0.26, 0.20)], s, 'MM_Driver_Overalls', 'Spine', caps=True, tag='spine')
    squash(m, (0.9, 1.15, 1.0), start=n0)
    n0 = len(m.verts)
    m.revolve((0, 0, 0), (0, 0, 1), [(0.24, 0.20), (0.32, 0.215), (0.40, 0.20), (0.45, 0.12)], s, 'MM_Driver_Shirt', 'Chest', caps=True, tag='chest')
    squash(m, (0.9, 1.2, 1.0), start=n0)
    m.rbox((0.18, 0.0, 0.30), (0.05, 0.26, 0.22), 0.02, 'MM_Driver_Overalls', 'Chest', tag='bib')
    if q['detail']:
        for sg in (-1, 1):
            m.rbox((0.10, sg * 0.10, 0.44), (0.04, 0.05, 0.26), 0.012, 'MM_Driver_Overalls', 'Chest', tag='strap')
        n0 = len(m.verts)
        m.revolve((0, 0, 0.18), (0, 0, 1), [(-0.02, 0.215), (0.02, 0.215), (0.02, 0.225), (-0.02, 0.225)], s, 'MM_Driver_Belt', 'Spine', closed_profile=True, tag='belt')
        squash(m, (0.9, 1.15, 1.0), start=n0)
    m.cyl((0, 0, 0.46), (0, 0, 1), 0.07, 0.10, max(6, s - 2), 'MM_Driver_Skin', 'Neck', tag='neck')
    # head (skin) + ears + nose
    hw, hh = q['head']
    n0 = len(m.verts)
    m.sphere(HEAD_C, HEAD_R, hw, hh, 'MM_Driver_Skin', 'Head', tag='head')
    squash(m, (1.0, HEAD_SY, 1.0), about=HEAD_C, start=n0)
    for sg in (-1, 1):
        m.sphere((0.0, sg * HEAD_R * HEAD_SY * 0.97, 0.66), 0.05, 8 if q['detail'] else 6, 5, 'MM_Driver_Skin', 'Head', scale=(0.5, 0.6, 1.0), tag='ear')
    nz = 0.60
    m.sphere((head_x(0.0, nz) + 0.012, 0.0, nz), 0.04, 8 if q['detail'] else 6, 5, 'MM_Driver_Skin', 'Head', tag='nose')
    # arms
    for sg, sh, el, ha in ((1, SHOULDER_L, ELBOW_L, HAND_L), (-1, SHOULDER_R, ELBOW_R, HAND_R)):
        side = 'L' if sg > 0 else 'R'
        jr = 6 if not q['detail'] else 8
        jg = 5 if q['detail'] else 3
        m.sphere(sh, 0.085, jr, jg, 'MM_Driver_Shirt', 'UpperArm' + side, tag='shoulder')
        limb(m, sh, el, 0.062, q['limb'], 'MM_Driver_Shirt', 'UpperArm' + side)
        m.sphere(el, 0.07, jr, jg, 'MM_Driver_Shirt', 'Forearm' + side, tag='elbow')
        limb(m, el, ha, 0.055, q['limb'], 'MM_Driver_Skin', 'Forearm' + side)
        m.sphere(ha, 0.085, jr, jg, 'MM_Driver_Glove', 'Hand' + side, scale=(1.0, 0.9, 1.0), tag='mitten')
        if q['detail']:
            m.sphere((ha[0] + 0.02, ha[1] - sg * 0.07, ha[2] + 0.04), 0.038, 6, 4, 'MM_Driver_Glove', 'Hand' + side, tag='thumb')
    # legs (hidden by the cab body in game, kept for the garage and results scenes)
    for sg, hp, kn, an in ((1, HIP_L, KNEE_L, ANKLE_L), (-1, HIP_R, KNEE_R, ANKLE_R)):
        side = 'L' if sg > 0 else 'R'
        limb(m, hp, kn, 0.085, q['limb'], 'MM_Driver_Overalls', 'Thigh' + side)
        m.sphere(kn, 0.09, 6 if not q['detail'] else 8, 5 if q['detail'] else 3, 'MM_Driver_Overalls', 'Shin' + side, tag='knee')
        limb(m, kn, an, 0.07, q['limb'], 'MM_Driver_Overalls', 'Shin' + side)
        m.rbox((an[0] + 0.07, an[1], an[2] - 0.05), (0.27, 0.15, 0.13), 0.04, 'MM_Driver_Boot', 'Foot' + side, tag='boot')
    return m


def build_hat(q):
    """Yellow hard hat: half dome, brim ring, front bill, three ridges."""
    m = Mesh()
    s = q['hat']
    R = 0.285
    rings = 6 if q['detail'] else 4
    prof = []
    for k in range(rings + 1):
        a = (math.pi / 2) * k / rings
        prof.append((HAT_BASE - 0.02 + (HAT_TOP - HAT_BASE + 0.02) * math.sin(a), R * math.cos(a) if k < rings else 0.0))
    m.revolve((0, 0, 0), (0, 0, 1), prof, s, 'MM_Driver_Hat', 'Hat', tag='dome')
    if q['detail']:
        ring = [(HAT_BASE - 0.045, 0.28), (HAT_BASE - 0.045, 0.325), (HAT_BASE - 0.015, 0.325), (HAT_BASE - 0.005, 0.30), (HAT_BASE - 0.005, 0.28)]
        m.revolve((0, 0, 0), (0, 0, 1), ring, s, 'MM_Driver_Hat', 'Hat', closed_profile=True, tag='brim')
        m.rbox((0.33, 0.0, HAT_BASE - 0.03), (0.14, 0.36, 0.03), 0.012, 'MM_Driver_Hat', 'Hat', tag='bill')
        zb, dz = HAT_BASE - 0.02, HAT_TOP - HAT_BASE + 0.02
        for off in (-0.085, 0.0, 0.085):
            lim = 0.9 * math.sqrt(R * R - off * off)
            pts = []
            for k in range(8):
                x = -lim + 2 * lim * k / 7
                rho = math.sqrt(x * x + off * off)
                pts.append((x, off, zb + dz * math.sqrt(max(0.0, 1 - (rho / R) ** 2)) + 0.008))
            m.tube(pts, 0.011, 4, 'MM_Driver_Hat', 'Hat', tag='ridge')
    else:
        m.rbox((0.30, 0.0, HAT_BASE - 0.03), (0.14, 0.34, 0.03), 0.0, 'MM_Driver_Hat', 'Hat', tag='bill')
    return m


# ---------------------------------------------------------------- face + expressions
FACE_FEATURES = ('eyeL_w', 'eyeL_p', 'eyeR_w', 'eyeR_p', 'browL', 'browR', 'mouth')
MOUTH_COLS, MOUTH_ROWS = 9, 3
MOUTH_Z = 0.535


def mouth_positions(hw=0.07, smile=0.35, op=0.0, wob=0.0, oy=0.0):
    out = []
    for r in range(MOUTH_ROWS):          # row 0 top, 1 mid, 2 bottom
        for i in range(MOUTH_COLS):
            s = i / (MOUTH_COLS - 1) * 2 - 1
            y = hw * s + oy
            zc = MOUTH_Z + 0.035 * smile * s * s + wob * 0.012 * math.sin(3 * math.pi * s)
            half = 0.011 + 0.5 * op * max(0.0, 1 - s * s) ** 0.6
            z = zc + (half if r == 0 else 0.0 if r == 1 else -half)
            out.append((head_x(y, z) + 0.006, y, z))
    return out


def build_face(q):
    """Eyes (white + pupil), brows and a 9x3 mouth sheet, stuck on the head ellipsoid."""
    m = Mesh()
    seg = 10 if q['detail'] else 6
    for sg, side in ((1, 'L'), (-1, 'R')):
        y, z = sg * 0.092, 0.69
        x = head_x(y, z)
        m.sphere((x - 0.005, y, z), 0.062, seg, 6 if q['detail'] else 4, 'MM_Driver_EyeWhite', 'Head', scale=(0.5, 1.0, 1.12), tag='eye%s_w' % side)
        m.sphere((x + 0.022, y, z - 0.004), 0.034, seg - 2, 4 if not q['detail'] else 5, 'MM_Driver_Pupil', 'Eye' + side, scale=(0.5, 1.0, 1.0), tag='eye%s_p' % side)
    for sg, side in ((1, 'L'), (-1, 'R')):
        y, z = sg * 0.095, 0.775
        m.rbox((head_x(y, z) + 0.004, y, z), (0.03, 0.105, 0.024), 0.008, 'MM_Driver_Brow', 'Head', seg=2, tag='brow' + side)
    pos = mouth_positions()
    F = []
    for r in range(MOUTH_ROWS - 1):
        for i in range(MOUTH_COLS - 1):
            a, b = r * MOUTH_COLS + i, r * MOUTH_COLS + i + 1
            c, d = (r + 1) * MOUTH_COLS + i + 1, (r + 1) * MOUTH_COLS + i
            F.append((a, d, c, b))
    m._add(pos, F, 'MM_Driver_Mouth', 'Head', closed=False, flip_test=(0, (1.0, 0.0, 0.0)), tag='mouth')
    return m


EXPR = {   # name: eye scale z, eye scale all, pupil scale, pupil shift (L, R), brow (tilt, dz) L, R, mouth params
    'idle': dict(ez=1.0, es=1.0, ps=1.0, pl=(0, 0), pr=(0, 0), bl=(0.0, 0.0), br=(0.0, 0.0), mouth=dict(hw=0.07, smile=0.35, op=0.0)),
    'gas_grin': dict(ez=0.85, es=1.0, ps=1.0, pl=(0, 0), pr=(0, 0), bl=(0.30, -0.012), br=(0.30, -0.012), mouth=dict(hw=0.10, smile=0.8, op=0.035)),
    'woo': dict(ez=1.0, es=1.25, ps=0.9, pl=(0, 0.008), pr=(0, 0.008), bl=(0.0, 0.03), br=(0.0, 0.03), mouth=dict(hw=0.045, smile=0.0, op=0.10)),
    'scared': dict(ez=1.0, es=1.35, ps=0.65, pl=(0, 0), pr=(0, 0), bl=(-0.35, 0.035), br=(-0.35, 0.035), mouth=dict(hw=0.08, smile=-0.5, op=0.07, wob=0.6)),
    'crash_daze': dict(ez=0.75, es=1.0, ps=1.2, pl=(0.02, 0.0), pr=(-0.02, 0.0), bl=(0.2, 0.02), br=(-0.35, -0.01), mouth=dict(hw=0.06, smile=-0.2, op=0.05, wob=1.0, oy=0.015)),
    'win_cheer': dict(ez=0.35, es=1.0, ps=1.0, pl=(0, 0.004), pr=(0, 0.004), bl=(-0.1, 0.03), br=(-0.1, 0.03), mouth=dict(hw=0.115, smile=1.0, op=0.085)),
    'fail_facepalm': dict(ez=0.12, es=1.0, ps=1.0, pl=(0, 0), pr=(0, 0), bl=(-0.4, -0.01), br=(-0.4, -0.01), mouth=dict(hw=0.065, smile=-0.7, op=0.01)),
}


def _xf(verts, idx, sc=(1, 1, 1), shift=(0, 0, 0), rot=0.0):
    c = [sum(verts[i][k] for i in idx) / len(idx) for k in range(3)]
    ca, sa = math.cos(rot), math.sin(rot)
    for i in idx:
        x, y, z = verts[i][0] - c[0], verts[i][1] - c[1], verts[i][2] - c[2]
        x, y, z = x * sc[0], y * sc[1], z * sc[2]
        y, z = y * ca - z * sa, y * sa + z * ca          # rotate about X (the face normal)
        verts[i] = (c[0] + x + shift[0], c[1] + y + shift[1], c[2] + z + shift[2])


def expression_verts(face, name):
    """Vertex positions of the face mesh for expression `name` (rest = idle)."""
    e = EXPR[name]
    v = list(face.verts)
    prim = {p['tag']: list(range(p['start'], p['start'] + p['count'])) for p in face.prims}
    for side in ('L', 'R'):
        _xf(v, prim['eye%s_w' % side], (e['es'], e['es'], e['es'] * e['ez']), (0, 0, 0))
        dy, dz = e['pl'] if side == 'L' else e['pr']
        s = e['ps']
        _xf(v, prim['eye%s_p' % side], (1, s, s), (0, dy, dz + (e['ez'] - 1) * 0.0))
        tilt, dz = e['bl'] if side == 'L' else e['br']
        _xf(v, prim['brow' + side], (1, 1, 1), (0, 0, dz), tilt if side == 'L' else -tilt)
    mp = mouth_positions(**e['mouth'])
    for k, i in enumerate(prim['mouth']):
        v[i] = mp[k]
    return v


# ---------------------------------------------------------------- checks
def run_checks(rep, lods, faces):
    names = [b['name'] for b in bone_list()]
    rep.check('22 bones', len(names) == 22, str(len(names)))
    for lod, parts in lods.items():
        tot = sum(p.mesh.tris() for p in parts)
        tri_budget_check(rep, 'LOD%d total' % lod, tot, BUDGET[lod])
        for p in parts:
            rep.check('  ' + p.name, True, '%d tris, %d verts' % (p.mesh.tris(), len(p.mesh.verts)))
    used = set()
    for p in lods[0]:
        used |= {b for b in p.mesh.vbone if b}
    rep.check('every weighted bone exists', used <= set(names), ','.join(sorted(used - set(names))))
    rep.check('shape keys = 7 (idle + 6)', len(EXPR) == 7, ','.join(EXPR))
    base = faces[0].verts
    for name in EXPR:
        if name == 'idle':
            continue
        ev = expression_verts(faces[0], name)
        dmax = max(math.dist(a, b) for a, b in zip(base, ev))
        moved = sum(1 for a, b in zip(base, ev) if math.dist(a, b) > 1e-5)
        rep.check('expr %s moves the face' % name, moved > 20 and dmax < 0.12, '%d verts moved, max %.3f m' % (moved, dmax))
    # fits the cab window: head and hat inside the window opening and under the roof, in truck space
    hx, hz = SEAT_POS[0] + HEAD_C[0], SEAT_POS[2] + HEAD_C[2]
    d_edge = min(dist_seg((hx, hz), WINDOW[i], WINDOW[(i + 1) % 4]) for i in range(4))
    rep.check('head sphere inside window opening', point_in_poly((hx, hz), WINDOW) and d_edge >= HEAD_R, 'edge distance %.2f, head r %.2f' % (d_edge, HEAD_R))
    top = SEAT_POS[2] + HAT_TOP
    rep.check('hat top under roof (2.20)', top <= 2.20, 'hat top %.3f' % top)
    rep.check('driver faces +X (AL-1)', faces[0].verts[prim_index(faces[0], 'mouth')][0] > 0.15, 'mouth x = %.2f' % faces[0].verts[prim_index(faces[0], 'mouth')][0])


def prim_index(face, tag):
    for p in face.prims:
        if p['tag'] == tag:
            return p['start']
    raise KeyError(tag)


# ---------------------------------------------------------------- build
def build_all():
    lods, faces = {}, {}
    for lod in (0, 1):
        q = Q[lod]
        L = '_LOD%d' % lod
        body, hat, face = build_body(q), build_hat(q), build_face(q)
        faces[lod] = face
        lods[lod] = [Part('%s_Body%s' % (PFX, L), body, (0, 0, 0), None, lod),
                     Part('%s_Hat%s' % (PFX, L), hat, (0, 0, 0), None, lod),
                     Part('%s_Face%s' % (PFX, L), face, (0, 0, 0), None, lod, outline=False)]
    return lods, faces


def build_blender(args, lods, faces, rep):
    bl_reset()
    col = bl_collection('MM_Driver')
    mats = {}
    for name, c in COL.items():
        glossy = name in ('MM_Driver_Hat', 'MM_Driver_Glove', 'MM_Driver_Boot')
        mats[name] = bl_material(name, c, rough=0.45 if glossy else 0.6, coat=1.0 if name == 'MM_Driver_Hat' else 0.0)
    bones = bone_list()
    arm = bl_armature('MM_Driver_Rig', bones, col)
    objs = [arm]
    names = [b['name'] for b in bones]
    for lod in (0, 1):
        for p in lods[lod]:
            o = bl_mesh_object(p, col, mats)
            bl_vertex_groups(o, p.mesh, names)
            bl_skin(o, arm)
            objs.append(o)
            if p.name.startswith(PFX + '_Face') and lod == 0:
                o.shape_key_add(name='idle', from_mix=False)
                for ex in EXPR:
                    if ex == 'idle':
                        continue
                    sk = o.shape_key_add(name=ex, from_mix=False)
                    flat = []
                    for (x, y, z) in expression_verts(faces[0], ex):
                        flat.extend((x, y, z))
                    sk.data.foreach_set('co', flat)
    seat = bl_empty('MM_Driver_Socket_Seat', (0, 0, 0), col)
    bl_parent_to_bone(seat, arm, 'Hips')
    objs.append(seat)
    bl_qa(objs, rep)
    return arm, objs


def write_meta(args, lods, rep):
    meta = {'asset': ASSET, 'seat_pos_in_truck': list(SEAT_POS), 'rest_pose': 'seated, hands on the steering wheel',
            'frame': 'hips at origin, +X forward (cab end), +Z up, 1 unit = 1 m',
            'bones': [b['name'] for b in bone_list()], 'blend_shapes': list(EXPR),
            'blend_shape_note': 'on MM_Driver_Face_LOD0 only; idle is the basis. LOD1 face is static.',
            'budget_tris': BUDGET,
            'parts': [{'name': p.name, 'lod': p.lod, 'tris': p.mesh.tris(), 'materials': p.mesh.mats()} for l in lods for p in lods[l]],
            'qa': rep.rows}
    path = os.path.join(args.out, ASSET + '_meta.json')
    os.makedirs(args.out, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(meta, f, indent=2)
    return path


def main():
    args = parse_args()
    rep = Report(ASSET)
    lods, faces = build_all()
    run_checks(rep, lods, faces)
    if args.dry_run:
        finish(rep, args, args.out)
        return
    arm, objs = build_blender(args, lods, faces, rep)
    print('[mm] saved', bl_save_blend(os.path.join(args.out, ASSET + '.blend')))
    if not args.no_export:
        print('[mm] exported', bl_export_fbx(os.path.join(args.out, ASSET + '.fbx'), objs, bake_space=not args.no_bake_space))
    print('[mm] meta', write_meta(args, lods, rep))
    print('[mm] qa', rep.save(args.out))
    finish(rep, args, args.out)


if __name__ == '__main__':
    main()
