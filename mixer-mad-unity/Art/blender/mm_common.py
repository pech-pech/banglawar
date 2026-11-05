"""mm_common.py - shared helpers for the Mixer Mad 3D Blender scripts.

Two layers:
  1. PURE PYTHON geometry (Mesh class, primitives, fit checks, PNG writer). Runs anywhere,
     including machines with no Blender. This is what makes --dry-run useful: the whole
     model is built as plain lists, tri counts and the hitbox-vs-art fit are checked, and
     nothing touches bpy.
  2. THIN BLENDER LAYER (materials, objects, armature, FBX). Only used when bpy exists.

Frame (everything, all scripts): metres, Blender axes, truck faces +X, +Z is up, Y is the
depth axis (the side camera sits at -Y looking toward +Y). Sim 2D (x forward, y up) maps to
Blender (x, z). Origin of a truck = bottom centre of the chassis (the physics datum).

Run (Mac):  blender -b -P mixer_truck.py -- [--dry-run] [--out DIR] [--strict]
"""
import argparse
import json
import math
import os
import struct
import sys
import zlib

try:  # bpy only exists inside Blender
    import bpy  # type: ignore
    HAVE_BPY = True
except Exception:  # pragma: no cover
    bpy = None
    HAVE_BPY = False

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(os.path.join(HERE, '..'))

# ----------------------------------------------------------------------------
# Contract / sim constants (read from CONTRACT.md, art-side.md, v7h manifest)
# ----------------------------------------------------------------------------
NAVY = '#22252b'
PALETTE = {
    'yellow': '#ffc21a', 'orange': '#ff7a1a', 'cream': '#f4ecd6', 'navy': NAVY,
    'rubber': '#3a3d45', 'glass': '#bfe3ff', 'chrome': '#c9ced6',
    'snow': '#f4f8ff', 'snow_shade': '#b9d3ef', 'dirt': '#9a7552',
    'cone': '#ff7a1a', 'rock': '#4a4e57', 'gold': '#ffd84a', 'teal': '#20c0b0',
}
WHEEL_R = 0.5                          # physics radius, exact (tolerance 0.02)
WHEEL_CX = (-1.233, 1.135)             # rear, front hub x, sprite frame
WHEEL_CZ = 0.173                       # hub height above chassis bottom
SPRITE_RECT = (-2.316, -0.016, 2.316, 2.609)   # mixer_skin1 rect_m
TOL_ART_OUT = 0.04                     # art may stick out of the collider by this
TOL_COL_OUT = 0.06                     # collider may stick out of the art by this
CHUTE_PIN = (-2.078, 1.433)            # sim CHUTE_PIN (chute hinge)
# Collider parts of mixer_skin1 (assets.json): convex polys, x forward, y up.
COLLIDERS_SKIN1 = [
    [(-2.295, 1.452), (-2.077, 0.898), (0.122, 0.898), (0.122, 1.96), (-0.288, 2.353), (-0.89, 2.585), (-1.658, 2.528), (-2.07, 2.316)],
    [(-2.281, 0.141), (-2.16, 0.02), (-0.606, 0.02), (0.117, 0.089), (0.117, 0.863), (-2.08, 0.863), (-2.147, 0.818), (-2.281, 0.369)],
    [(0.152, 0.083), (0.513, 0.015), (1.786, 0.015), (1.786, 1.42), (1.616, 2.202), (1.443, 2.376), (0.323, 2.376), (0.152, 2.205)],
    [(1.806, 0.536), (2.188, 0.536), (2.233, 0.626), (2.233, 0.887), (2.16, 1.137), (2.125, 1.208), (2.04, 1.293), (1.806, 1.41)],
    [(1.806, 0.013), (2.174, 0.013), (2.273, 0.112), (2.296, 0.18), (2.296, 0.382), (2.258, 0.458), (2.189, 0.526), (1.806, 0.526)],
]


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------
def parse_args(extra=None):
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser(add_help=True)
    p.add_argument('--dry-run', action='store_true', help='validate parameters and build geometry in pure Python only')
    p.add_argument('--out', default=os.path.join(ART, 'exports'), help='export folder (FBX, .blend, json)')
    p.add_argument('--strict', action='store_true', help='exit non-zero if a budget or fit check fails')
    p.add_argument('--no-export', action='store_true', help='build and save the .blend only')
    p.add_argument('--no-bake-space', action='store_true', help='FBX: do not bake the axis conversion (fallback if bones look rotated in Unity)')
    p.add_argument('--skin', type=int, default=1, choices=[1, 2, 3, 4], help='mixer paint skin (material swap only)')
    if extra:
        extra(p)
    a = p.parse_args(argv)
    if not HAVE_BPY and not a.dry_run:
        print('[mm] bpy not found: running in DRY-RUN mode (pure Python checks only).')
        a.dry_run = True
    return a


class Report:
    """Collects QA lines; written next to the export as <asset>_qa.json."""

    def __init__(self, asset):
        self.asset = asset
        self.rows = []

    def check(self, name, ok, detail=''):
        self.rows.append({'check': name, 'pass': bool(ok), 'detail': detail})
        print('[%s] %-34s %s' % ('PASS' if ok else 'FAIL', name, detail))
        return ok

    @property
    def ok(self):
        return all(r['pass'] for r in self.rows)

    def save(self, folder):
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, self.asset + '_qa.json')
        with open(path, 'w') as f:
            json.dump({'asset': self.asset, 'all_pass': self.ok, 'checks': self.rows}, f, indent=2)
        return path


# ----------------------------------------------------------------------------
# tiny vector helpers (tuples) so the geometry layer needs no mathutils
# ----------------------------------------------------------------------------
def v_add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def v_dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def v_cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def v_len(a): return math.sqrt(v_dot(a, a))


def v_norm(a):
    l = v_len(a)
    return (a[0] / l, a[1] / l, a[2] / l) if l > 1e-12 else (0.0, 0.0, 1.0)


def perp_basis(axis):
    a = v_norm(axis)
    ref = (0.0, 1.0, 0.0) if abs(a[1]) < 0.9 else (1.0, 0.0, 0.0)
    p = v_norm(v_cross(a, ref))
    q = v_cross(a, p)
    return a, p, q


# ----------------------------------------------------------------------------
# 2D profile helpers (points are (x, z))
# ----------------------------------------------------------------------------
def signed_area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def ensure_ccw(pts):
    return list(pts) if signed_area(pts) > 0 else list(reversed(pts))


def dedupe(pts, eps=1e-6):
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > eps:
            out.append(p)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= eps:
        out.pop()
    return out


def round_poly(pts, r, seg=3, sharp=()):
    """Round the corners of a polygon. r: float or per-vertex list. sharp: indices kept sharp."""
    n = len(pts)
    out = []
    for i in range(n):
        ri = r[i] if isinstance(r, (list, tuple)) else r
        p1 = pts[i]
        if ri <= 1e-6 or i in sharp:
            out.append(p1)
            continue
        p0, p2 = pts[i - 1], pts[(i + 1) % n]
        l0 = math.hypot(p0[0] - p1[0], p0[1] - p1[1])
        l1 = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        if l0 < 1e-9 or l1 < 1e-9:
            out.append(p1)
            continue
        d0 = ((p0[0] - p1[0]) / l0, (p0[1] - p1[1]) / l0)
        d1 = ((p2[0] - p1[0]) / l1, (p2[1] - p1[1]) / l1)
        cosv = max(-1.0, min(1.0, d0[0] * d1[0] + d0[1] * d1[1]))
        th = math.acos(cosv)
        if th > math.pi - 0.02 or th < 0.02:
            out.append(p1)
            continue
        t = ri / math.tan(th / 2.0)
        t = min(t, 0.5 * l0, 0.5 * l1)
        re = t * math.tan(th / 2.0)
        s = (p1[0] + d0[0] * t, p1[1] + d0[1] * t)
        e = (p1[0] + d1[0] * t, p1[1] + d1[1] * t)
        bis = (d0[0] + d1[0], d0[1] + d1[1])
        bl = math.hypot(*bis)
        bis = (bis[0] / bl, bis[1] / bl)
        dc = re / math.sin(th / 2.0)
        c = (p1[0] + bis[0] * dc, p1[1] + bis[1] * dc)
        a0 = math.atan2(s[1] - c[1], s[0] - c[0])
        a1 = math.atan2(e[1] - c[1], e[0] - c[0])
        da = a1 - a0
        while da > math.pi:
            da -= 2 * math.pi
        while da < -math.pi:
            da += 2 * math.pi
        for k in range(seg + 1):
            a = a0 + da * k / seg
            out.append((c[0] + re * math.cos(a), c[1] + re * math.sin(a)))
    return dedupe(out)


def arc_pts(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cz + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


def circle_pts(cx, cz, r, n):
    return [(cx + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def inset_poly(pts, d):
    """Move a CCW polygon inward by d (negative = outward). Miter scaled, clamped."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        e0 = (p1[0] - p0[0], p1[1] - p0[1])
        e1 = (p2[0] - p1[0], p2[1] - p1[1])
        l0, l1 = math.hypot(*e0) or 1.0, math.hypot(*e1) or 1.0
        n0 = (e0[1] / l0, -e0[0] / l0)          # outward normal of a CCW polygon
        n1 = (e1[1] / l1, -e1[0] / l1)
        nx, ny = n0[0] + n1[0], n0[1] + n1[1]
        nl = math.hypot(nx, ny) or 1.0
        nx, ny = nx / nl, ny / nl
        miter = 1.0 / max(0.5, nx * n0[0] + ny * n0[1])
        out.append((p1[0] - nx * d * miter, p1[1] - ny * d * miter))
    return out


def point_in_poly(p, poly):
    x, y = p
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def dist_seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def dist_poly_edge(p, poly):
    return min(dist_seg(p, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


def dist_to_shapes(p, polys, circles=()):
    """0 if inside any shape, else distance to nearest edge. circles = (cx, cz, r)."""
    best = 1e9
    for q in polys:
        if point_in_poly(p, q):
            return 0.0
        best = min(best, dist_poly_edge(p, q))
    for c in circles:
        d = math.hypot(p[0] - c[0], p[1] - c[1]) - c[2]
        best = min(best, max(d, 0.0))
    return best


def sample_poly(poly, step=0.02):
    pts = []
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(L / step))
        for j in range(k):
            t = j / k
            pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return pts


# ----------------------------------------------------------------------------
# Pure-Python mesh with primitives
# ----------------------------------------------------------------------------
class Mesh:
    """Polygon soup. Every primitive is added un-welded, with a material name and an
    optional bone name (used for vertex groups / rigid skinning)."""

    def __init__(self, name='mesh'):
        self.name = name
        self.verts = []
        self.faces = []
        self.fmat = []
        self.vbone = []
        self.prims = []
        self.face_uv = {}      # face index -> [(u, v)] explicit UVs (glass panes)

    # --- bookkeeping -----------------------------------------------------------
    def _add(self, V, F, mat, bone=None, closed=True, flip_test=None, tag=''):
        mats = list(mat) if isinstance(mat, (list, tuple)) else [mat] * len(F)
        keep = [i for i, f in enumerate(F) if len(set(f)) >= 3]
        F = [tuple(F[i]) for i in keep]
        mats = [mats[i] for i in keep]
        flip = False
        if closed:
            vol = 0.0
            for f in F:
                a = V[f[0]]
                for k in range(1, len(f) - 1):
                    vol += v_dot(a, v_cross(V[f[k]], V[f[k + 1]]))
            flip = vol < 0
        elif flip_test is not None:
            fi, direction = flip_test
            f = F[fi]
            nrm = v_cross(v_sub(V[f[1]], V[f[0]]), v_sub(V[f[2]], V[f[0]]))
            flip = v_dot(nrm, direction) < 0
        if flip:
            F = [tuple(reversed(f)) for f in F]
        # drop repeated consecutive indices (poles) so Blender never sees a degenerate face
        F = [tuple(i for k, i in enumerate(f) if i != f[k - 1]) for f in F]
        base = len(self.verts)
        self.verts.extend(V)
        self.vbone.extend([bone] * len(V))
        self.faces.extend([tuple(i + base for i in f) for f in F])
        self.fmat.extend(mats)
        self.prims.append({'tag': tag, 'bone': bone, 'start': base, 'count': len(V)})

    def merge(self, other):
        base = len(self.verts)
        self.verts.extend(other.verts)
        self.vbone.extend(other.vbone)
        self.faces.extend([tuple(i + base for i in f) for f in other.faces])
        self.fmat.extend(other.fmat)
        off = len(self.faces) - len(other.faces)
        for k, v in other.face_uv.items():
            self.face_uv[k + off] = v
        for p in other.prims:
            q = dict(p)
            q['start'] += base
            self.prims.append(q)

    def shift(self, dx, dy, dz):
        self.verts = [(x + dx, y + dy, z + dz) for (x, y, z) in self.verts]

    def rot_y(self, ang, pivot=(0.0, 0.0, 0.0)):
        """Rotate about the Y axis through pivot (x,z plane). Positive = x toward -z... (right-handed about +Y)."""
        c, s = math.cos(ang), math.sin(ang)
        out = []
        for (x, y, z) in self.verts:
            dx, dz = x - pivot[0], z - pivot[2]
            out.append((pivot[0] + dx * c + dz * s, y, pivot[2] - dx * s + dz * c))
        self.verts = out

    # --- stats -----------------------------------------------------------------
    def tris(self):
        return sum(max(0, len(f) - 2) for f in self.faces)

    def bbox(self):
        if not self.verts:
            return (0, 0, 0), (0, 0, 0)
        xs, ys, zs = zip(*self.verts)
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

    def mats(self):
        seen = []
        for m in self.fmat:
            if m not in seen:
                seen.append(m)
        return seen

    # --- primitives --------------------------------------------------------------
    def extrude(self, pts, y0, y1, mat, bevel=0.0, bsegs=2, bone=None, tag='extrude'):
        """Extrude an (x,z) profile along Y from y0 to y1, with a rounded (quarter-circle) rim."""
        pts = ensure_ccw(dedupe(pts))
        depth = abs(y1 - y0)
        ya, yb = (y0, y1) if y0 < y1 else (y1, y0)
        b = min(bevel, depth * 0.45)
        s = max(1, bsegs) if b > 1e-6 else 0
        rings = []
        if s == 0:
            rings = [(ya, 0.0), (yb, 0.0)]
        else:
            for j in range(s + 1):
                ph = (math.pi / 2) * j / s
                rings.append((ya + b * (1 - math.cos(ph)), b * (1 - math.sin(ph))))
            for j in range(s, -1, -1):
                ph = (math.pi / 2) * j / s
                rings.append((yb - b * (1 - math.cos(ph)), b * (1 - math.sin(ph))))
        n = len(pts)
        V, F, idx = [], [], []
        for (y, ins) in rings:
            ring = inset_poly(pts, ins) if ins > 1e-9 else pts
            idx.append(list(range(len(V), len(V) + n)))
            V.extend([(p[0], y, p[1]) for p in ring])
        F.append(tuple(idx[0]))
        F.append(tuple(reversed(idx[-1])))
        for k in range(len(rings) - 1):
            for i in range(n):
                j = (i + 1) % n
                F.append((idx[k][i], idx[k + 1][i], idx[k + 1][j], idx[k][j]))
        self._add(V, F, mat, bone, True, tag=tag)

    def extrude_x(self, pts_yz, x0, x1, mat, bevel=0.0, bsegs=2, bone=None, tag='extrude_x'):
        """Like extrude but the profile is in (y, z) and the extrusion runs along X (rails, roofs)."""
        t = Mesh()
        t.extrude(pts_yz, x0, x1, mat, bevel, bsegs, bone, tag)
        t.verts = [(b, a, c) for (a, b, c) in t.verts]          # (profile_y, along, z) -> (along, profile_y, z)
        t.faces = [tuple(reversed(f)) for f in t.faces]          # the axis swap mirrors the winding
        self.merge(t)

    def assign_by_normal(self, start_face, mat, min_nz):
        """Faces from start_face on whose normal points up (nz >= min_nz) get material mat (snow caps)."""
        for fi in range(start_face, len(self.faces)):
            n = self.face_normal(self.faces[fi])
            l = v_len(n)
            if l > 1e-12 and n[2] / l >= min_nz:
                self.fmat[fi] = mat

    def rbox(self, c, size, r, mat, bone=None, seg=2, tag='box'):
        """Rounded box centred on c, size (sx, sy, sz); r = corner radius / edge bevel."""
        sx, sy, sz = size
        rr = min(r, sx * 0.45, sz * 0.45)
        pts = [(c[0] - sx / 2, c[2] - sz / 2), (c[0] + sx / 2, c[2] - sz / 2), (c[0] + sx / 2, c[2] + sz / 2), (c[0] - sx / 2, c[2] + sz / 2)]
        if rr > 1e-6:
            pts = round_poly(pts, rr, seg)
        self.extrude(pts, c[1] - sy / 2, c[1] + sy / 2, mat, bevel=min(r, sy * 0.45) if r > 0 else 0, bsegs=max(1, seg - 1), bone=bone, tag=tag)

    def revolve(self, origin, axis, prof, segs, mat, bone=None, closed_profile=False, caps=True, phase=0.0, tag='revolve'):
        """Lathe. prof = [(t along axis, radius)]; radius 0 makes a pole."""
        a, p, q = perp_basis(axis)
        V, F = [], []
        rings = []
        for (t, r) in prof:
            c = v_add(origin, v_mul(a, t))
            if r <= 1e-9:
                rings.append(('pole', len(V)))
                V.append(c)
            else:
                rings.append(('ring', len(V)))
                for k in range(segs):
                    ang = phase + 2 * math.pi * k / segs
                    V.append(v_add(c, v_add(v_mul(p, r * math.cos(ang)), v_mul(q, r * math.sin(ang)))))
        m = len(prof)
        last = m if closed_profile else m - 1
        for i in range(last):
            ka, ia = rings[i]
            kb, ib = rings[(i + 1) % m]
            for k in range(segs):
                k2 = (k + 1) % segs
                if ka == 'pole' and kb == 'pole':
                    continue
                if ka == 'pole':
                    F.append((ia, ib + k2, ib + k))
                elif kb == 'pole':
                    F.append((ia + k, ia + k2, ib))
                else:
                    F.append((ia + k, ia + k2, ib + k2, ib + k))
        if caps and not closed_profile:
            if rings[0][0] == 'ring':
                F.append(tuple(reversed([rings[0][1] + k for k in range(segs)])))
            if rings[-1][0] == 'ring':
                F.append(tuple(rings[-1][1] + k for k in range(segs)))
        self._add(V, F, mat, bone, True, tag=tag)

    def cyl(self, c, axis, r, length, segs, mat, bone=None, tag='cyl'):
        a = v_norm(axis)
        o = v_sub(c, v_mul(a, length / 2.0))
        self.revolve(o, a, [(0.0, r), (length, r)], segs, mat, bone, tag=tag)

    def sphere(self, c, r, segs, rings, mat, bone=None, scale=(1, 1, 1), tag='sphere'):
        prof = [(-r * math.cos(math.pi * k / rings), r * math.sin(math.pi * k / rings)) for k in range(rings + 1)]
        prof[0] = (prof[0][0], 0.0)
        prof[-1] = (prof[-1][0], 0.0)
        n0 = len(self.verts)
        self.revolve((0.0, 0.0, 0.0), (0, 0, 1), prof, segs, mat, bone, tag=tag)
        for i in range(n0, len(self.verts)):
            x, y, z = self.verts[i]
            self.verts[i] = (c[0] + x * scale[0], c[1] + y * scale[1], c[2] + z * scale[2])

    def tube(self, pts, r, sides, mat, bone=None, closed=False, tag='tube'):
        """Round tube along a 3D polyline (parallel transport frame)."""
        n = len(pts)
        tans = []
        for i in range(n):
            if closed:
                t = v_sub(pts[(i + 1) % n], pts[i - 1])
            else:
                t = v_sub(pts[min(i + 1, n - 1)], pts[max(i - 1, 0)])
            tans.append(v_norm(t))
        a0, p, q = perp_basis(tans[0])
        V, F = [], []
        for i in range(n):
            t = tans[i]
            if i > 0:  # transport p
                p = v_sub(p, v_mul(t, v_dot(p, t)))
                p = v_norm(p)
                q = v_cross(t, p)
            for k in range(sides):
                ang = 2 * math.pi * k / sides
                V.append(v_add(pts[i], v_add(v_mul(p, r * math.cos(ang)), v_mul(q, r * math.sin(ang)))))
        last = n if closed else n - 1
        for i in range(last):
            j = (i + 1) % n
            for k in range(sides):
                k2 = (k + 1) % sides
                F.append((i * sides + k, i * sides + k2, j * sides + k2, j * sides + k))
        if not closed:
            F.append(tuple(reversed(range(0, sides))))
            F.append(tuple(range((n - 1) * sides, n * sides)))
        # closed tubes whose frame twists a little still have consistent winding; volume test fixes sign
        self._add(V, F, mat, bone, True, tag=tag)

    def quad_sheet(self, pts, mat, bone=None, axes=(0, 2), tag='sheet'):
        """Flat one-sided polygon in 3D (glass panes etc), CCW seen from the front. UVs are the
        bounding box of the two chosen axes mapped to 0..1 (so a painted streak sits on the pane)."""
        a, b = axes
        lo = (min(p[a] for p in pts), min(p[b] for p in pts))
        hi = (max(p[a] for p in pts), max(p[b] for p in pts))
        uvs = [((p[a] - lo[0]) / (hi[0] - lo[0]), (p[b] - lo[1]) / (hi[1] - lo[1])) for p in pts]
        self.face_uv[len(self.faces)] = uvs
        self._add([tuple(p) for p in pts], [tuple(range(len(pts)))], mat, bone, closed=False, tag=tag)

    def helix_rib(self, origin, axis, rfun, u0, u1, phi0, turns, width, height, steps, mat, bone=None, tag='rib'):
        """A raised spiral rib riding on a surface of revolution r = rfun(u). Used for the drum fins."""
        a, p, q = perp_basis(axis)
        V, F = [], []
        for i in range(steps + 1):
            t = i / steps
            u = u0 + (u1 - u0) * t
            r = rfun(u)
            phi = phi0 + 2 * math.pi * turns * t
            hw = min(width / max(r, 0.2), 0.6) / 2.0
            c = v_add(origin, v_mul(a, u))
            for (dphi, rr) in ((-hw, r - 0.012), (-hw, r + height), (hw, r + height), (hw, r - 0.012)):
                ang = phi + dphi
                V.append(v_add(c, v_add(v_mul(p, rr * math.cos(ang)), v_mul(q, rr * math.sin(ang)))))
        for i in range(steps):
            b0, b1 = i * 4, (i + 1) * 4
            F.append((b0 + 1, b0 + 2, b1 + 2, b1 + 1))      # top (first face, used as the orientation probe)
            F.append((b0 + 0, b0 + 1, b1 + 1, b1 + 0))
            F.append((b0 + 2, b0 + 3, b1 + 3, b1 + 2))
        F.append((3, 2, 1, 0))
        e = steps * 4
        F.append((e, e + 1, e + 2, e + 3))
        phi_dir = phi0 + 2 * math.pi * turns * 0.0
        radial = v_add(v_mul(p, math.cos(phi_dir)), v_mul(q, math.sin(phi_dir)))
        self._add(V, F, mat, bone, closed=False, flip_test=(0, radial), tag=tag)

    def grid(self, rows, mat_fn, bone=None, tag='grid', flip_up=True):
        """Open height-field sheet. rows[j][i] = (x,y,z). mat_fn(face_centre) -> material name."""
        V, F, M = [], [], []
        nj, ni = len(rows), len(rows[0])
        for j in range(nj):
            for i in range(ni):
                V.append(rows[j][i])
        for j in range(nj - 1):
            for i in range(ni - 1):
                a, b = j * ni + i, j * ni + i + 1
                c, d = (j + 1) * ni + i + 1, (j + 1) * ni + i
                F.append((a, d, c, b))   # normal +Z for a +X,+Y grid
        mats = []
        for f in F:
            cx = sum(V[v][0] for v in f) / len(f)
            cz = sum(V[v][2] for v in f) / len(f)
            mats.append(mat_fn((cx, cz)))
        self._add(V, F, mats, bone, closed=False, tag=tag)

    # --- derived data for Blender ------------------------------------------------
    def face_normal(self, f):
        nx = ny = nz = 0.0
        for i in range(len(f)):
            a, b = self.verts[f[i]], self.verts[f[(i + 1) % len(f)]]
            nx += (a[1] - b[1]) * (a[2] + b[2])
            ny += (a[2] - b[2]) * (a[0] + b[0])
            nz += (a[0] - b[0]) * (a[1] + b[1])
        return (nx, ny, nz)

    def box_uvs(self, scale=1.0):
        """Box projection, 1 UV unit = 1/scale metres. Returns flat per-loop (u, v) list."""
        uvs = []
        for fi, f in enumerate(self.faces):
            if fi in self.face_uv:
                uvs.extend(self.face_uv[fi])
                continue
            n = self.face_normal(f)
            ax = max(range(3), key=lambda k: abs(n[k]))
            for vi in f:
                x, y, z = self.verts[vi]
                if ax == 0:
                    uvs.append((y * scale, z * scale))
                elif ax == 1:
                    uvs.append((x * scale, z * scale))
                else:
                    uvs.append((x * scale, y * scale))
        return uvs

    def outline_normals(self):
        """Smoothed (position-welded, area weighted) normal per loop, packed n*0.5+0.5, for the
        Unity inverted-hull outline shader (stored in the 'OutlineN' colour attribute)."""
        acc = {}
        for f in self.faces:
            n = self.face_normal(f)
            for vi in f:
                v = self.verts[vi]
                k = (round(v[0], 4), round(v[1], 4), round(v[2], 4))
                o = acc.get(k, (0.0, 0.0, 0.0))
                acc[k] = (o[0] + n[0], o[1] + n[1], o[2] + n[2])
        cols = []
        for f in self.faces:
            for vi in f:
                v = self.verts[vi]
                n = v_norm(acc[(round(v[0], 4), round(v[1], 4), round(v[2], 4))])
                cols.append((n[0] * 0.5 + 0.5, n[1] * 0.5 + 0.5, n[2] * 0.5 + 0.5, 1.0))
        return cols

    def verts_of_bone(self, bone):
        return [i for i, b in enumerate(self.vbone) if b == bone]


# ----------------------------------------------------------------------------
# PNG writer (no PIL needed on the Mac) + procedural textures
# ----------------------------------------------------------------------------
def write_png(path, w, h, px):
    """px: bytearray/bytes of RGBA rows, top row first."""
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(px[y * w * 4:(y + 1) * w * 4])

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + \
        chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)
    return path


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def make_glass_streak_png(path, size=128):
    """Pale sky glass, 70% opaque, with a painted diagonal streak (a fake reflection, so it
    works on Low where there is no real reflection)."""
    px = bytearray()
    base = [int(c * 255) for c in hex_rgb(PALETTE['glass'])]
    for y in range(size):
        for x in range(size):
            u, v = x / (size - 1), 1.0 - y / (size - 1)
            d1 = abs((u * 0.8 + v * 0.6) - 0.62)       # wide streak
            d2 = abs((u * 0.8 + v * 0.6) - 0.86)       # thin streak
            s = max(1.0 - smoothstep(0.05, 0.075, d1), 0.8 * (1.0 - smoothstep(0.015, 0.03, d2)))
            grad = 0.12 * v                                 # lighter toward the top
            a = 0.70 + 0.25 * s
            col = [min(255, int(base[k] + (255 - base[k]) * (s * 0.9 + grad))) for k in range(3)]
            px.extend([col[0], col[1], col[2], int(a * 255)])
    return write_png(path, size, size, px)


def make_snowflake_atlas_png(path, size=256):
    """2x2 atlas for the falling-snow particle system (white, alpha only):
    tile0 soft dot, tile1 six-arm flake, tile2 fuzzy blob, tile3 hex crystal.
    Unity: Texture Sheet Animation, 2 x 2 tiles, random row."""
    t = size // 2
    px = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            tx, ty = (x // t), (y // t)
            lx, ly = (x % t + 0.5) / t * 2 - 1, (y % t + 0.5) / t * 2 - 1
            r = math.hypot(lx, ly)
            ang = math.atan2(ly, lx)
            tile = ty * 2 + tx
            if tile == 0:
                a = math.exp(-(r * r) * 6.0)
            elif tile == 1:
                best = 9.0
                for k in range(6):
                    ak = k * math.pi / 3
                    # distance to the arm line, only along its length
                    along = lx * math.cos(ak) + ly * math.sin(ak)
                    perp = abs(-lx * math.sin(ak) + ly * math.cos(ak))
                    if 0 <= along <= 0.9:
                        best = min(best, perp)
                        # little side branches
                        for br in (0.45, 0.7):
                            if abs(along - br) < 0.2:
                                best = min(best, abs(perp - (0.2 - abs(along - br))))
                a = 1.0 - smoothstep(0.05, 0.11, best)
                a = max(a, math.exp(-(r * r) * 40.0))
            elif tile == 2:
                a = 0.7 * math.exp(-((lx - 0.2) ** 2 + (ly + 0.1) ** 2) * 9) + 0.7 * math.exp(-((lx + 0.25) ** 2 + (ly - 0.15) ** 2) * 11)
                a = min(1.0, a)
            else:
                hexr = r * max(abs(math.cos((ang % (math.pi / 3)) - math.pi / 6)), 0.5) * 1.15
                a = 1.0 - smoothstep(0.55, 0.62, hexr)
                a *= 0.55 + 0.45 * smoothstep(0.0, 0.5, r)
            i = (y * size + x) * 4
            px[i:i + 4] = bytes((255, 255, 255, int(max(0.0, min(1.0, a)) * 255)))
    return write_png(path, size, size, px)


# ----------------------------------------------------------------------------
# Tiny software rasteriser: side-on preview with no Blender (used by --dry-run and for the art check)
# ----------------------------------------------------------------------------
def raster_side(meshes, color_of, ppm, x0, x1, z0, z1, bg=(58, 61, 69), light=(0.45, -0.55, 0.70), view='side'):
    """Orthographic software render. view='side': camera at -Y (screen x = X). view='front': camera at +X
    (screen x = Y). Painter's algorithm, flat Lambert shading. color_of(mat_name) -> '#rrggbb'.
    Returns (w, h, RGBA bytearray). x0..x1 is the horizontal screen range, z0..z1 the vertical."""
    w, h = int(round((x1 - x0) * ppm)), int(round((z1 - z0) * ppm))
    buf = bytearray(bytes(bg + (255,)) * (w * h))
    L = v_norm(light if view == 'side' else (0.7, 0.35, 0.6))
    hax, dax, sgn = (0, 1, 1) if view == 'side' else (1, 0, -1)    # horizontal axis, depth axis, depth sign (far = larger key)
    tris = []
    for m in meshes:
        for fi, f in enumerate(m.faces):
            n = m.face_normal(f)
            nl = v_len(n)
            if nl < 1e-12:
                continue
            n = (n[0] / nl, n[1] / nl, n[2] / nl)
            if view == 'side' and n[1] > 0.02:
                continue
            if view == 'front' and n[0] < -0.02:
                continue
            hx = color_of(m.fmat[fi]).lstrip('#')
            base = [int(hx[i:i + 2], 16) for i in (0, 2, 4)]
            k = 0.55 + 0.45 * max(0.0, v_dot(n, L))
            col = bytes([min(255, int(c * k)) for c in base] + [255])
            vs = [m.verts[i] for i in f]
            key = sgn * sum(v[dax] for v in vs) / len(vs)
            for j in range(1, len(vs) - 1):
                tris.append((key, vs[0], vs[j], vs[j + 1], col))
    tris.sort(key=lambda t: -t[0])
    for (_, a, b, c, col) in tris:
        pa = ((a[hax] - x0) * ppm, (z1 - a[2]) * ppm)
        pb = ((b[hax] - x0) * ppm, (z1 - b[2]) * ppm)
        pc = ((c[hax] - x0) * ppm, (z1 - c[2]) * ppm)
        minx, maxx = int(max(0, math.floor(min(pa[0], pb[0], pc[0])))), int(min(w - 1, math.ceil(max(pa[0], pb[0], pc[0]))))
        miny, maxy = int(max(0, math.floor(min(pa[1], pb[1], pc[1])))), int(min(h - 1, math.ceil(max(pa[1], pb[1], pc[1]))))
        den = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
        if abs(den) < 1e-9:
            continue
        for yy in range(miny, maxy + 1):
            py = yy + 0.5
            for xx in range(minx, maxx + 1):
                px = xx + 0.5
                l1 = ((pb[1] - pc[1]) * (px - pc[0]) + (pc[0] - pb[0]) * (py - pc[1])) / den
                l2 = ((pc[1] - pa[1]) * (px - pc[0]) + (pa[0] - pc[0]) * (py - pc[1])) / den
                if l1 >= -0.01 and l2 >= -0.01 and 1 - l1 - l2 >= -0.01:
                    i = (yy * w + xx) * 4
                    buf[i:i + 4] = col
    return w, h, buf


def draw_poly_lines(buf, w, h, poly, ppm, x0, z1, rgb=(0, 255, 120), closed=True):
    pts = [((p[0] - x0) * ppm, (z1 - p[1]) * ppm) for p in poly]
    n = len(pts)
    for i in range(n if closed else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        steps = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
        for s in range(steps + 1):
            t = s / steps
            x, y = int(a[0] + (b[0] - a[0]) * t), int(a[1] + (b[1] - a[1]) * t)
            if 0 <= x < w and 0 <= y < h:
                j = (y * w + x) * 4
                buf[j:j + 4] = bytes(rgb + (255,))


# ----------------------------------------------------------------------------
# LOD / asset description
# ----------------------------------------------------------------------------
class Part:
    """One mesh object of an asset at one LOD. pivot is the object origin in asset space."""

    def __init__(self, name, mesh, pivot=(0.0, 0.0, 0.0), bone=None, lod=0, outline=True, kind='mesh'):
        self.name = name
        self.mesh = mesh
        self.pivot = pivot
        self.bone = bone
        self.lod = lod
        self.outline = outline
        self.kind = kind


class Socket:
    def __init__(self, name, pos, bone=None):
        self.name, self.pos, self.bone = name, pos, bone


def tri_budget_check(rep, label, tris, budget):
    return rep.check('tris ' + label, tris <= budget, '%d / %d' % (tris, budget))


def naming_ok(name):
    import re
    return re.match(r'^MM_[A-Za-z0-9]+(_[A-Za-z0-9]+)*$', name) is not None


# ----------------------------------------------------------------------------
# BLENDER LAYER (only called when HAVE_BPY and not dry-run)
# ----------------------------------------------------------------------------
def bl_reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.unit_settings.length_unit = 'METERS'
    return sc


def bl_collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def _set_in(bsdf, names, val):
    for n in names:
        if n in bsdf.inputs:
            bsdf.inputs[n].default_value = val
            return True
    return False


def bl_material(name, color, rough=0.5, metal=0.0, coat=0.0, coat_rough=0.1, alpha=1.0, emit=None, emit_strength=0.0, tex=None):
    """Principled material. Names start with MM_ so Unity's material remap can key on them."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    rgb = hex_rgb(color)
    lin = tuple(srgb_to_lin(c) for c in rgb) + (1.0,)
    _set_in(bsdf, ('Base Color',), lin)
    _set_in(bsdf, ('Roughness',), rough)
    _set_in(bsdf, ('Metallic',), metal)
    _set_in(bsdf, ('Coat Weight', 'Clearcoat'), coat)
    _set_in(bsdf, ('Coat Roughness', 'Clearcoat Roughness'), coat_rough)
    _set_in(bsdf, ('Alpha',), alpha)
    if emit:
        el = tuple(srgb_to_lin(c) for c in hex_rgb(emit)) + (1.0,)
        _set_in(bsdf, ('Emission Color', 'Emission'), el)
        _set_in(bsdf, ('Emission Strength',), emit_strength)
    m.diffuse_color = rgb + (alpha,)
    if alpha < 0.999:
        for attr, val in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    if tex and os.path.exists(tex):
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(tex, check_existing=True)
        nt.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha < 0.999:
            nt.links.new(node.outputs['Alpha'], bsdf.inputs['Alpha'])
    return m


def bl_mesh_object(part, collection, materials):
    """Create a mesh object from a Part. Verts are made relative to part.pivot; the object sits at the
    pivot with rotation 0 and scale 1 (transforms applied)."""
    mesh = part.mesh
    px, py, pz = part.pivot
    verts = [(x - px, y - py, z - pz) for (x, y, z) in mesh.verts]
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(verts, [], [list(f) for f in mesh.faces])
    names = mesh.mats()
    for mn in names:
        me.materials.append(materials[mn])
    me.polygons.foreach_set('material_index', [names.index(m) for m in mesh.fmat])
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    uv = me.uv_layers.new(name='UVMap')
    flat = []
    for (u, v) in mesh.box_uvs(1.0):
        flat.extend((u, v))
    uv.data.foreach_set('uv', flat)
    if part.outline:
        try:
            ca = me.color_attributes.new(name='OutlineN', type='FLOAT_COLOR', domain='CORNER')
            cf = []
            for c in mesh.outline_normals():
                cf.extend(c)
            ca.data.foreach_set('color', cf)
        except Exception as e:  # very old Blender
            print('[mm] OutlineN colour attribute skipped:', e)
    me.update()
    if me.validate(verbose=False):
        print('[mm] note: Blender repaired the mesh', part.name)
    obj = bpy.data.objects.new(part.name, me)
    obj.location = (px, py, pz)
    collection.objects.link(obj)
    return obj


def bl_vertex_groups(obj, mesh, bone_names):
    """Rigid skin weights from the per-vertex bone tag."""
    for b in bone_names:
        idx = mesh.verts_of_bone(b)
        if idx:
            vg = obj.vertex_groups.new(name=b)
            vg.add(idx, 1.0, 'REPLACE')


def bl_armature(name, bones, collection):
    """bones: list of dict(name, head, tail, parent=None, roll=0.0). Returns the armature object."""
    ad = bpy.data.armatures.new(name)
    ao = bpy.data.objects.new(name, ad)
    collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    ao.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ad.edit_bones
    for b in bones:
        e = eb.new(b['name'])
        e.head = b['head']
        t = b['tail']
        if math.dist(b['head'], t) < 0.05:
            t = (b['head'][0], b['head'][1], b['head'][2] + 0.05)
        e.tail = t
        e.roll = b.get('roll', 0.0)
    for b in bones:
        if b.get('parent'):
            eb[b['name']].parent = eb[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    ao.select_set(False)
    return ao


def bl_parent_to_bone(obj, arm, bone):
    """Bone-parent keeping the world transform exactly (independent of Blender's tail-offset rule)."""
    loc = tuple(obj.location)
    obj.location = (0.0, 0.0, 0.0)
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    from mathutils import Matrix  # only exists inside Blender
    obj.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    obj.matrix_parent_inverse = obj.matrix_world.inverted()
    obj.location = loc
    bpy.context.view_layer.update()


def bl_empty(name, pos, collection, size=0.1):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    e.location = pos
    collection.objects.link(e)
    return e


def bl_skin(obj, arm):
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    obj.parent = arm


def bl_export_fbx(path, objects, bake_space=True, axis_forward='-Z', axis_up='Y'):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=path, check_existing=False, use_selection=True,
        global_scale=1.0, apply_unit_scale=True, apply_scale_options='FBX_SCALE_ALL',
        bake_space_transform=bake_space, axis_forward=axis_forward, axis_up=axis_up,
        object_types={'ARMATURE', 'MESH', 'EMPTY'}, use_mesh_modifiers=True,
        mesh_smooth_type='OFF', use_custom_props=True, add_leaf_bones=False,
        primary_bone_axis='Y', secondary_bone_axis='X', armature_nodetype='NULL',
        bake_anim=False, path_mode='COPY', embed_textures=False, batch_mode='OFF')
    return path


def bl_save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    return path


def bl_qa(objs, rep, tri_limits=None):
    """Scene-level checks that mirror the blender-asset-qa gate (transforms, naming, UVs, materials)."""
    bad_xf, bad_name, no_uv, bad_mat = [], [], [], []
    for o in objs:
        if o.type == 'MESH':
            if any(abs(s - 1.0) > 1e-6 for s in o.scale) or any(abs(r) > 1e-6 for r in o.rotation_euler):
                bad_xf.append(o.name)
            if not o.data.uv_layers:
                no_uv.append(o.name)
            for m in o.data.materials:
                if not m or not m.name.startswith('MM_'):
                    bad_mat.append(o.name)
        if not naming_ok(o.name) and not o.name.endswith(('_Rig',)):
            bad_name.append(o.name)
    rep.check('transforms applied (rot 0, scale 1)', not bad_xf, ','.join(bad_xf[:5]))
    rep.check('object names MM_*', not bad_name, ','.join(bad_name[:5]))
    rep.check('every mesh has UVs', not no_uv, ','.join(no_uv[:5]))
    rep.check('materials named MM_*', not bad_mat, ','.join(sorted(set(bad_mat))[:5]))


def finish(rep, args, out_folder):
    path = rep.save(out_folder) if not args.dry_run else None
    if args.dry_run:
        print('[mm] dry-run finished: %s' % ('all checks pass' if rep.ok else 'SOME CHECKS FAIL'))
    if args.strict and not rep.ok:
        sys.exit(2)
    return path
