"""mixer_truck.py - Mixer Mad 3D: the cement mixer truck (hero asset), LOD0 + LOD1, rigged.

Run on the Mac:   blender -b -P mixer_truck.py -- [--skin 1..4] [--out DIR] [--strict]
Check anywhere:   python3 mixer_truck.py --dry-run          (no Blender needed; builds the geometry
                                                              in pure Python and runs every numeric check)

Outputs (in --out, default ../exports):
  MM_Truck_Mixer.fbx          meshes + armature + sockets, LOD0 and LOD1, 1 m scale, Apply Transform
  MM_Truck_Mixer.blend        the same scene for render_check.py and for editing
  MM_Truck_Mixer_meta.json    pivots, bone axes, tri counts, skin colours (for the Unity importer tool)
  MM_Truck_Mixer_qa.json      the numeric QA rows (also printed)
  textures/MM_GlassStreak.png painted streak for the cab glass

Lessons applied: AL-1 (cab at the +X end, stated in the file, README and meta; the render check
draws it next to the sprite), AL-2 (no magenta/pink/violet anywhere; glass has an explicit pale-blue
colour), AL-4 (the collider is described as several convex parts: the fit check below tests the
art against the 5 convex parts of mixer_skin1, never against one hull).
"""
import math
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mm_common import *  # noqa

ASSET = 'MM_Truck_Mixer'
PFX = 'MM_Mixer'

# ----------------------------------------------------------------------------------------
# Parameters (all in metres, sprite frame: x forward (cab end = +X), z up, origin = chassis bottom centre)
# ----------------------------------------------------------------------------------------
HUB_Y = 0.80            # wheel centre offset from the truck centre line (track = 1.60 m hub to hub)
HUB_Y_INNER = 0.40      # rear dual wheel
TYRE_HW = 0.18          # half tyre width
CHASSIS_HW = 0.78       # half widths (Y)
CAB_HW = 0.92
BUMPER_HW = 0.88
DRUM_TILT = math.radians(14.3)      # axis points down toward the cab
DRUM_C = (-1.035, 1.675)            # drum centre (x, z)
DRUM_A, DRUM_B, DRUM_P = 1.09, 0.867, 2.337   # half length, radius, superellipse exponent (fitted to the sim collider; radius 0.01 under the fit so the raised fins stay inside it)
FIN_H = 0.035           # raised spiral fin height above the drum skin (fit-checked as drum r + FIN_H)
FIN_W = 0.18            # fin width at its base
FIN_TURNS = 1.0         # turns per fin over the drum length: reads as a spiral, not as crossing straps
FIN_U = 0.84            # fins run over -FIN_U..+FIN_U of the drum half length
ARCH_R = 0.54
SEAT_POS = (0.95, 0.0, 1.16)        # driver hips (driver.py uses the same point)
CHUTE_REST = math.radians(-26.0)    # rest angle, rear end down (sim default is about -0.45 rad)
CHUTE_LEN = 1.5

SKINS = {   # material swaps only (sprite skins 1..4)
    1: dict(body='#ffc21a', accent='#ff7a1a', drum='#ff7a1a', stripe='#f4ecd6'),
    2: dict(body='#ff7a1a', accent='#ffc21a', drum='#ff7a1a', stripe='#f4ecd6'),
    3: dict(body='#ffc21a', accent='#ffc21a', drum='#f4f6fa', stripe='#ffc21a'),
    4: dict(body='#ff7a1a', accent='#f4ecd6', drum='#fff0cf', stripe='#ff7a1a'),
}

BUDGET = {0: 12000, 1: 5000}       # S1 section 6: hero LOD0 10-12k (High), LOD1 5k (Low)

QUALITY = {
    0: dict(wseg=20, dseg=30, drings=18, rr=3, bev=0.035, bsegs=2, detail=True, fin_steps=40, lugs=20),
    1: dict(wseg=12, dseg=14, drings=8, rr=1, bev=0.0, bsegs=0, detail=False, fin_steps=14, lugs=0),
}


# ----------------------------------------------------------------------------------------
# Silhouette polygons (x, z). These ARE the art: the meshes are extrusions of them, and the
# fit check tests the same polygons against the sim colliders.
# ----------------------------------------------------------------------------------------
def arch(xc, R=ARCH_R, z0=0.02, n=10):
    h = math.sqrt(R * R - (z0 - WHEEL_CZ) ** 2)
    a_r = math.atan2(z0 - WHEEL_CZ, h)
    a_l = math.atan2(z0 - WHEEL_CZ, -h) + 2 * math.pi
    return [(xc + R * math.cos(a_l + (a_r - a_l) * k / n), WHEEL_CZ + R * math.sin(a_l + (a_r - a_l) * k / n)) for k in range(n + 1)]


def chassis_poly():
    return ([(-2.16, 0.02)] + arch(WHEEL_CX[0]) + [(-0.606, 0.02), (0.117, 0.089), (0.152, 0.083), (0.513, 0.015)]
            + arch(WHEEL_CX[1]) + [(1.80, 0.02), (1.80, 0.86), (-2.08, 0.86), (-2.147, 0.818), (-2.28, 0.37), (-2.28, 0.14)])


BUMPER = [(1.806, 0.013), (2.174, 0.013), (2.273, 0.112), (2.296, 0.18), (2.296, 0.382), (2.258, 0.458), (2.189, 0.526), (1.806, 0.526)]
# Side window: sill 1.30 (was 1.42) and rear pillar edge 0.42 (was 0.50) so the driver's face shows at drive zoom.
SILL_Z = 1.30
CAB_LOWER = [(0.15, 0.86), (1.80, 0.86), (1.80, 0.54), (2.19, 0.54), (2.233, 0.63), (2.233, 0.89), (2.16, 1.14), (2.125, 1.21), (2.04, 1.29), (1.806, 1.41), (1.786, 1.42), (1.64, 1.42), (1.64, SILL_Z), (0.15, SILL_Z)]
ROOF = [(0.152, 2.20), (0.152, 2.205), (0.323, 2.376), (1.443, 2.376), (1.616, 2.202), (1.61, 2.20)]
PILLAR_R = [(0.15, SILL_Z), (0.42, SILL_Z), (0.42, 2.20), (0.15, 2.20)]
PILLAR_F = [(1.786, 1.42), (1.616, 2.202), (1.60, 2.20), (1.44, 2.20), (1.56, SILL_Z), (1.64, SILL_Z)]
# Supports start 6 cm INSIDE the chassis (its top is z 0.86): a bottom face lying exactly on the chassis top
# made their outline hull fight the chassis for depth, drawing a dashed navy line along the join.
SUPPORT_Z0 = 0.80
PED_F = [(-0.60, SUPPORT_Z0), (0.12, SUPPORT_Z0), (0.12, 1.96), (-0.2, 2.25), (-0.6, 1.75)]
# Hopper and front pedestal are frame parts (body colour): in the drum colour they merged with the drum
# into one lumpy mass with three bulges (GAMEUP-REVIEW P2, fix 8).
SUPPORT_MAT = 'MM_Truck_Body'
HOPPER = [(-2.28, 1.45), (-2.06, SUPPORT_Z0), (-1.7, SUPPORT_Z0), (-1.6, 2.15), (-1.9, 2.35), (-2.07, 2.31)]
WINDOW = [(0.42, SILL_Z), (1.56, SILL_Z), (1.44, 2.20), (0.42, 2.20)]


def drum_r(u):
    t = abs(u) / DRUM_A
    return 0.0 if t >= 1.0 else DRUM_B * (1.0 - t ** DRUM_P) ** (1.0 / DRUM_P)


def drum_axis():
    return (math.cos(DRUM_TILT), 0.0, -math.sin(DRUM_TILT))


def drum_origin():
    return (DRUM_C[0], 0.0, DRUM_C[1])


def drum_silhouette(n=40, extra=None):
    """Side silhouette of the drum; extra(u) grows the radius (used for the fins)."""
    ex = extra or (lambda u: 0.0)
    A = (math.cos(DRUM_TILT), -math.sin(DRUM_TILT))
    N = (math.sin(DRUM_TILT), math.cos(DRUM_TILT))
    us = [-DRUM_A * math.cos(math.pi * k / n) for k in range(n + 1)]
    top = [(DRUM_C[0] + A[0] * u + N[0] * (drum_r(u) + ex(u)), DRUM_C[1] + A[1] * u + N[1] * (drum_r(u) + ex(u))) for u in us]
    bot = [(DRUM_C[0] + A[0] * u - N[0] * (drum_r(u) + ex(u)), DRUM_C[1] + A[1] * u - N[1] * (drum_r(u) + ex(u))) for u in reversed(us)]
    return top + bot


# ----------------------------------------------------------------------------------------
# Part builders
# ----------------------------------------------------------------------------------------
def wheel_mesh(hub, side, q, outer=True, mats=('MM_Rubber', 'MM_Truck_Hub', 'MM_Chrome')):
    """Wheel with its axis along Y. hub = (x, y, z) centre; side = +1/-1 = which way the hub dish faces.
    Outer radius is exactly WHEEL_R (tread lugs included)."""
    m = Mesh()
    rub, hubm, chr_ = mats
    hw = TYRE_HW
    base = WHEEL_R - 0.04 if q['lugs'] else WHEEL_R
    if q['detail']:
        prof = [(-hw, 0.30), (-hw, 0.40), (-hw + 0.03, base - 0.015), (-hw + 0.08, base),
                (hw - 0.08, base), (hw - 0.03, base - 0.015), (hw, 0.40), (hw, 0.30)]
    else:
        base = WHEEL_R
        prof = [(-hw, 0.30), (-hw, WHEEL_R - 0.06), (-hw + 0.07, WHEEL_R), (hw - 0.07, WHEEL_R), (hw, WHEEL_R - 0.06), (hw, 0.30)]
    m.revolve(hub, (0, 1, 0), prof, q['wseg'], rub, closed_profile=True, tag='tyre')
    if q['lugs'] and outer:
        n = q['lugs']
        for k in range(n):
            th = 2 * math.pi * (k + 0.5) / n
            d = (math.cos(th), math.sin(th))
            t = (-math.sin(th), math.cos(th))
            r0, r1 = base - 0.02, WHEEL_R
            poly = [(hub[0] + d[0] * r0 - t[0] * 0.065, hub[2] + d[1] * r0 - t[1] * 0.065),
                    (hub[0] + d[0] * r0 + t[0] * 0.065, hub[2] + d[1] * r0 + t[1] * 0.065),
                    (hub[0] + d[0] * r1 + t[0] * 0.04, hub[2] + d[1] * r1 + t[1] * 0.04),
                    (hub[0] + d[0] * r1 - t[0] * 0.04, hub[2] + d[1] * r1 - t[1] * 0.04)]
            m.extrude(poly, hub[1] - 0.15, hub[1] + 0.15, rub, tag='lug')
    if outer:
        s = side
        dish = [(s * 0.20, 0.0), (s * 0.20, 0.20), (s * 0.185, 0.29), (s * 0.15, 0.31), (0.0, 0.31)]
        if not q['detail']:
            dish = [(s * 0.19, 0.0), (s * 0.19, 0.30), (0.0, 0.30)]
        m.revolve(hub, (0, 1, 0), dish, q['wseg'], hubm, tag='hub')
        if q['detail']:
            for k in range(5):
                ang = 2 * math.pi * k / 5
                c = (hub[0] + 0.2 * math.cos(ang), hub[1] + s * 0.205, hub[2] + 0.2 * math.sin(ang))
                m.cyl((c[0], c[1] + s * 0.015, c[2]), (0, 1, 0), 0.028, 0.04, 6, chr_, tag='nut')
            m.cyl((hub[0], hub[1] + s * 0.22, hub[2]), (0, 1, 0), 0.075, 0.06, 12, chr_, tag='cap')
    return m


def build_chassis(q, sil):
    m = Mesh()
    cp = round_poly(chassis_poly(), 0.06, q['rr'])
    sil['chassis'] = cp
    m.extrude(cp, -CHASSIS_HW, CHASSIS_HW, 'MM_Truck_Body', q['bev'], q['bsegs'], tag='frame')
    bp = round_poly(BUMPER, 0.06, q['rr'])
    sil['bumper'] = bp
    m.extrude(bp, -BUMPER_HW, BUMPER_HW, 'MM_Truck_Accent', q['bev'], q['bsegs'], tag='bumper')
    hp = round_poly(HOPPER, 0.09, q['rr'])
    sil['hopper'] = hp
    m.extrude(hp, -0.50, 0.50, SUPPORT_MAT, q['bev'], q['bsegs'], tag='hopper')
    pp = round_poly(PED_F, 0.09, q['rr'])
    sil['ped_f'] = pp
    m.extrude(pp, -0.62, 0.62, SUPPORT_MAT, q['bev'], q['bsegs'], tag='pedestal')
    if q['detail']:
        for sgn in (-1, 1):
            m.rbox((-2.285, sgn * 0.62, 0.50), (0.06, 0.18, 0.14), 0.02, 'MM_Light_Tail', tag='taillight')
            m.rbox((-1.78, sgn * 0.80, 0.30), (0.04, 0.46, 0.36), 0.015, 'MM_Truck_Trim', tag='mudflap')
            # shock absorber bodies (upper half, fixed to the chassis)
            for xc in WHEEL_CX:
                m.cyl((xc, sgn * 0.15, 0.55), (0, 0, 1), 0.05, 0.30, 8, 'MM_Chrome', tag='shock_top')
        # rear ladder, on the hopper's back face, leans with it (rails + rungs)
        e0, e1 = (-2.109, 0.98), (-2.28, 1.43)
        dx, dz = e1[0] - e0[0], e1[1] - e0[1]
        L = math.hypot(dx, dz)
        d = (dx / L, dz / L)
        nrm = (-d[1], d[0])
        for sgn in (-1, 1):
            a = (e0[0] + nrm[0] * 0.03, sgn * 0.30, e0[1] + nrm[1] * 0.03)
            b = (e1[0] + nrm[0] * 0.03, sgn * 0.30, e1[1] + nrm[1] * 0.03)
            m.tube([a, b], 0.022, 6, 'MM_Chrome', tag='ladder_rail')
        for k in range(1, 5):
            t = k / 5.0
            c = (e0[0] + dx * t + nrm[0] * 0.03, 0.0, e0[1] + dz * t + nrm[1] * 0.03)
            m.cyl(c, (0, 1, 0), 0.018, 0.60, 6, 'MM_Chrome', tag='ladder_rung')
    else:
        for sgn in (-1, 1):
            m.rbox((-2.285, sgn * 0.62, 0.50), (0.06, 0.18, 0.14), 0.0, 'MM_Light_Tail', tag='taillight')
    return m


def build_cab(q, sil):
    """Cab = lower body (with hood) + roof + 2 pillars around a real window opening, glass panes set
    into it, headlights, grille, mirrors, seat back and steering wheel. Pivot = (1.0, 0, 0.86)."""
    m = Mesh()
    rr, bev, bs = q['rr'], q['bev'], q['bsegs']
    lo = round_poly(CAB_LOWER, 0.07, rr, sharp=(0, 1, 11, 12, 13))
    sil['cab_lower'] = lo
    m.extrude(lo, -CAB_HW, CAB_HW, 'MM_Truck_Body', bev, bs, tag='cab_lower')
    roof = round_poly(ROOF, 0.07, rr)
    sil['roof'] = roof
    m.extrude(roof, -CAB_HW, CAB_HW, 'MM_Truck_Body', bev, bs, tag='roof')
    pr = round_poly(PILLAR_R, 0.04, rr, sharp=(0, 1))
    sil['pillar_r'] = pr
    m.extrude(pr, -CAB_HW, CAB_HW, 'MM_Truck_Body', bev, bs, tag='pillar_rear')
    pf = round_poly(PILLAR_F, 0.04, rr, sharp=(0, 4, 5))
    sil['pillar_f'] = pf
    m.extrude(pf, -CAB_HW, CAB_HW, 'MM_Truck_Body', bev, bs, tag='pillar_front')
    # glass: one pane per side, recessed 0.04 inside the body face, with painted streak UVs
    gy = CAB_HW - 0.045
    wp = [(x, z) for (x, z) in WINDOW]
    m.quad_sheet([(x, -gy, z) for (x, z) in wp], 'MM_Glass', axes=(0, 2), tag='glass')
    m.quad_sheet([(x, gy, z) for (x, z) in reversed(wp)], 'MM_Glass', axes=(0, 2), tag='glass')
    # headlights + grille on the hood nose (x = 2.233)
    for sgn in (-1, 1):
        m.rbox((2.21, sgn * 0.58, 0.77), (0.06, 0.30, 0.17), 0.03 if q['detail'] else 0.0, 'MM_Light_Head', tag='headlight')
    m.rbox((2.215, 0.0, 0.76), (0.05, 0.66, 0.20), 0.02 if q['detail'] else 0.0, 'MM_Truck_Trim', tag='grille')
    if q['detail']:
        for k in range(4):
            m.rbox((2.24, 0.0, 0.70 + k * 0.045), (0.02, 0.6, 0.018), 0.0, 'MM_Chrome', tag='grille_bar')
        for sgn in (-1, 1):
            # mirrors on arms, door handles, door seam
            m.cyl((0.62, sgn * 0.98, 1.88), (0, 1, 0), 0.016, 0.14, 6, 'MM_Chrome', tag='mirror_arm')
            m.rbox((0.62, sgn * 1.05, 1.88), (0.10, 0.05, 0.26), 0.02, 'MM_Truck_Trim', tag='mirror')
            m.rbox((1.12, sgn * 0.935, 1.18), (0.20, 0.03, 0.045), 0.012, 'MM_Chrome', tag='handle')
            m.rbox((0.42, sgn * 0.93, 1.08), (0.016, 0.02, 0.42), 0.0, 'MM_Truck_Trim', tag='door_seam')
        # interior seen through the glass
        m.rbox((0.62, 0.0, 1.70), (0.14, 0.70, 0.55), 0.04, 'MM_Truck_Interior', tag='seat_back')
        m.cyl((1.40, 0.0, 1.47), (0.6, 0, 0.8), 0.022, 0.30, 6, 'MM_Truck_Trim', tag='steer_col')
        ring = []
        c0 = (1.27, 0.0, 1.58)
        ax = v_norm((0.8, 0.0, -0.6))
        _, p, qv = perp_basis(ax)
        for k in range(12):
            a = 2 * math.pi * k / 12
            ring.append(v_add(c0, v_add(v_mul(p, 0.14 * math.cos(a)), v_mul(qv, 0.14 * math.sin(a)))))
        m.tube(ring, 0.022, 6, 'MM_Truck_Trim', closed=True, tag='steer_wheel')
    return m


def fin_taper(t):
    """Fin height/width factor along the fin (t = 0..1): grows out of the skin, full height in the middle."""
    return smoothstep(0.0, 0.14, t) * smoothstep(1.0, 0.86, t)


def fin_height_at(u):
    """Highest fin point above the drum skin at axial position u (both fins share the same u range)."""
    t = (u / DRUM_A + FIN_U) / (2.0 * FIN_U)
    return FIN_H * fin_taper(t) if 0.0 <= t <= 1.0 else 0.0


def spiral_fin(m, org, ax, u0, u1, phi0, turns, width, height, steps, mat, tag):
    """A raised spiral fin on the drum skin: a rounded closed profile (base sunk 0.015 m into the skin,
    so it never shows a gap) that tapers to nothing at both ends, so it grows out of the drum smoothly."""
    a, p, qv = perp_basis(ax)
    prof = [(-1.0, -0.015), (-0.85, 0.55), (-0.45, 1.0), (0.45, 1.0), (0.85, 0.55), (1.0, -0.015)]   # (across, up)
    n = len(prof)
    V, F = [], []
    for i in range(steps + 1):
        t = i / steps
        u = u0 + (u1 - u0) * t
        r = drum_r(u)
        taper = fin_taper(t)
        hw = 0.5 * width * (0.35 + 0.65 * taper)
        h = height * taper
        phi = phi0 + 2 * math.pi * turns * t
        c = v_add(org, v_mul(a, u))
        for (sx, sy) in prof:
            rr = r + (sy * h if sy > 0 else sy)
            ang = phi + sx * hw / max(r, 0.2)
            V.append(v_add(c, v_add(v_mul(p, rr * math.cos(ang)), v_mul(qv, rr * math.sin(ang)))))
    for i in range(steps):
        b0, b1 = i * n, (i + 1) * n
        for k in range(n - 1):
            F.append((b0 + k, b0 + k + 1, b1 + k + 1, b1 + k))
    F.append(tuple(range(n - 1, -1, -1)))
    e = steps * n
    F.append(tuple(e + k for k in range(n)))
    mid = steps // 2
    phm = phi0 + 2 * math.pi * turns * mid / steps
    radial = v_add(v_mul(p, math.cos(phm)), v_mul(qv, math.sin(phm)))
    # orientation probe: the top face of the middle cross-section must point away from the drum axis
    probe = mid * (n - 1) + 2
    m._add(V, F, mat, None, closed=False, flip_test=(probe, radial), tag=tag)


def build_drum(q, sil):
    """Drum: one smooth superellipse body (more rings and segments than before, weighted normals in Blender)
    and two raised spiral fins in the stripe colour that taper into the skin. The cream drive ring is gone:
    with the old flat ribbons it read as straps. Pivot = drum centre, spin axis = the drum axis (tilted
    DRUM_TILT, front end down)."""
    m = Mesh()
    ax, org = drum_axis(), drum_origin()
    n = q['drings']
    prof = [(-DRUM_A * math.cos(math.pi * k / n), drum_r(-DRUM_A * math.cos(math.pi * k / n))) for k in range(n + 1)]
    prof[0] = (prof[0][0], 0.0)
    prof[-1] = (prof[-1][0], 0.0)
    m.revolve(org, ax, prof, q['dseg'], 'MM_Truck_Drum', tag='drum_body')
    for k, ph in enumerate((0.0, math.pi)):
        spiral_fin(m, org, ax, -FIN_U * DRUM_A, FIN_U * DRUM_A, ph, FIN_TURNS, FIN_W, FIN_H, q['fin_steps'],
                   'MM_Truck_DrumStripe', 'fin%d' % k)
    sil['drum'] = drum_silhouette()
    return m


def build_chute(q):
    """Chute: trough + hinge boss, built straight (pointing -X) then swung to the rest angle about
    the hinge (axis +Y). Pivot = hinge (CHUTE_PIN)."""
    m = Mesh()
    hx, hz = CHUTE_PIN[0], CHUTE_PIN[1]
    L = CHUTE_LEN
    rb = 0.025 if q['detail'] else 0.0
    m.rbox((hx - L / 2 - 0.05, 0.0, hz - 0.04), (L, 0.50, 0.06), rb, 'MM_Truck_Chute', tag='trough_floor')
    for sgn in (-1, 1):
        m.rbox((hx - L / 2 - 0.05, sgn * 0.245, hz + 0.04), (L, 0.05, 0.20), rb, 'MM_Truck_Chute', tag='trough_wall')
    m.rbox((hx - L - 0.06, 0.0, hz - 0.01), (0.07, 0.56, 0.13), rb, 'MM_Truck_DrumStripe', tag='lip')
    m.cyl((hx, 0.0, hz), (0, 1, 0), 0.085, 0.62, 12 if q['detail'] else 8, 'MM_Chrome', tag='hinge_boss')
    m.rot_y(CHUTE_REST, (hx, 0.0, hz))
    return m


def build_axle(xc, q, front):
    """Axle beam + two leaf springs + two shock rods (lower halves). Pivot = axle centre."""
    m = Mesh()
    m.cyl((xc, 0.0, WHEEL_CZ), (0, 1, 0), 0.07, 1.30, 10 if q['detail'] else 6, 'MM_Truck_Trim', tag='axle_beam')
    if q['detail']:
        for sgn in (-1, 1):
            pts = []
            for k in range(7):
                t = k / 6.0
                x = xc - 0.55 + 1.10 * t
                z = WHEEL_CZ + 0.10 + 0.07 * (1 - (2 * t - 1) ** 2)
                pts.append((x, sgn * 0.15, z))
            m.tube(pts, 0.03, 5, 'MM_Truck_Trim', tag='leaf_spring')
            m.cyl((xc, sgn * 0.15, 0.40), (0, 0, 1), 0.028, 0.30, 6, 'MM_Chrome', tag='shock_rod')
    return m


def build_wheels(q):
    """Returns {bone: (pivot, mesh)}; the rear pair of each side is a dual (outer + inner tyre)."""
    out = {}
    xr, xf = WHEEL_CX
    for name, x, dual in (('Wheel_FL', xf, False), ('Wheel_FR', xf, False), ('Wheel_RL', xr, True), ('Wheel_RR', xr, True)):
        side = 1 if name.endswith('L') else -1
        hub = (x, side * HUB_Y, WHEEL_CZ)
        m = wheel_mesh(hub, side, q, True)
        if dual:
            m.merge(wheel_mesh((x, side * HUB_Y_INNER, WHEEL_CZ), side, q, False))
        out[name] = (hub, m)
    return out


def bone_list():
    xr, xf = WHEEL_CX
    ax = drum_axis()
    oc = drum_origin()
    hx, hz = CHUTE_PIN
    B = [dict(name='Root', head=(0, 0, 0), tail=(0, 0, 0.25), parent=None),
         dict(name='Chassis', head=(0, 0, 0), tail=(0, 0, 0.3), parent='Root'),
         dict(name='Cab', head=(1.0, 0, 0.86), tail=(1.0, 0, 1.15), parent='Chassis'),
         dict(name='Drum', head=oc, tail=(oc[0] + ax[0] * 0.4, 0, oc[2] + ax[2] * 0.4), parent='Chassis'),
         dict(name='Chute', head=(hx, 0, hz), tail=(hx, 0.30, hz), parent='Chassis'),
         dict(name='Axle_F', head=(xf, 0, WHEEL_CZ), tail=(xf, 0, WHEEL_CZ + 0.25), parent='Chassis'),
         dict(name='Axle_R', head=(xr, 0, WHEEL_CZ), tail=(xr, 0, WHEEL_CZ + 0.25), parent='Chassis')]
    for name, x, ax_b in (('Wheel_FL', xf, 'Axle_F'), ('Wheel_FR', xf, 'Axle_F'), ('Wheel_RL', xr, 'Axle_R'), ('Wheel_RR', xr, 'Axle_R')):
        y = HUB_Y if name.endswith('L') else -HUB_Y
        B.append(dict(name=name, head=(x, y, WHEEL_CZ), tail=(x, y + 0.20, WHEEL_CZ), parent=ax_b))   # all +Y: same spin sign
    return B


SOCKETS = [
    ('Socket_Driver', SEAT_POS, 'Cab'),
    ('Socket_Exhaust', (0.08, 0.75, 1.55), 'Chassis'),
    ('Socket_HeadlightL', (2.25, 0.58, 0.77), 'Cab'),
    ('Socket_HeadlightR', (2.25, -0.58, 0.77), 'Cab'),
    ('Socket_ChuteTip', (CHUTE_PIN[0] - (CHUTE_LEN + 0.06) * math.cos(CHUTE_REST), 0.0, CHUTE_PIN[1] + (CHUTE_LEN + 0.06) * math.sin(CHUTE_REST)), 'Chute'),
    ('Socket_ContactF', (WHEEL_CX[1], 0.0, WHEEL_CZ - WHEEL_R), 'Chassis'),
    ('Socket_ContactR', (WHEEL_CX[0], 0.0, WHEEL_CZ - WHEEL_R), 'Chassis'),
]


def build_lod(lod):
    """Returns (parts, sil). parts: list of Part for this LOD."""
    q = QUALITY[lod]
    sil = {}
    parts = []
    L = '_LOD%d' % lod

    def add(name, mesh, pivot, bone):
        parts.append(Part('%s_%s%s' % (PFX, name, L), mesh, pivot, bone, lod))

    add('Chassis', build_chassis(q, sil), (0.0, 0.0, 0.0), 'Chassis')
    add('Cab', build_cab(q, sil), (1.0, 0.0, 0.86), 'Cab')
    add('Drum', build_drum(q, sil), drum_origin(), 'Drum')
    add('Chute', build_chute(q), (CHUTE_PIN[0], 0.0, CHUTE_PIN[1]), 'Chute')
    add('AxleF', build_axle(WHEEL_CX[1], q, True), (WHEEL_CX[1], 0.0, WHEEL_CZ), 'Axle_F')
    add('AxleR', build_axle(WHEEL_CX[0], q, False), (WHEEL_CX[0], 0.0, WHEEL_CZ), 'Axle_R')
    for bone, (pivot, mesh) in build_wheels(q).items():
        add(bone.replace('_', ''), mesh, pivot, bone)
    return parts, sil


# ----------------------------------------------------------------------------------------
# Numeric checks (pure Python; the same code runs in dry-run and in Blender)
# ----------------------------------------------------------------------------------------
def fit_check(sil, step=0.04):
    """art vs the 5 convex sim colliders of mixer_skin1. Returns (art_outside_max, collider_outside_max)."""
    polys = list(sil.values())
    wheels = [(x, WHEEL_CZ, WHEEL_R) for x in WHEEL_CX]
    worst_out = 0.0
    for k, poly in sil.items():
        for p in sample_poly(poly, step):
            if any(point_in_poly(p, q) for kk, q in sil.items() if kk != k):
                continue
            worst_out = max(worst_out, dist_to_shapes(p, COLLIDERS_SKIN1))
    worst_in = 0.0
    gaps = [(x, WHEEL_CZ, 0.437 + 0.06) for x in WHEEL_CX]       # declared wheel-arch gaps are exempt
    for q in COLLIDERS_SKIN1:
        for p in sample_poly(q, step):
            if any(math.hypot(p[0] - g[0], p[1] - g[1]) < g[2] for g in gaps):
                continue
            worst_in = max(worst_in, dist_to_shapes(p, polys, wheels))
    return worst_out, worst_in


def fin_fit(sil, step=0.04):
    """Worst distance outside the colliders of the drum silhouette grown by the fin height (the fins can reach
    no further than r + FIN_H). Points hidden inside another art part are skipped, as in fit_check."""
    others = [p for k, p in sil.items() if k != 'drum']
    worst = 0.0
    for p in sample_poly(drum_silhouette(extra=fin_height_at), step):
        if any(point_in_poly(p, q) for q in others):
            continue
        worst = max(worst, dist_to_shapes(p, COLLIDERS_SKIN1))
    return worst


def run_checks(rep, lods, sil0):
    rb = WHEEL_CX[1] - WHEEL_CX[0]
    rep.check('wheelbase 2.368 +-0.02', abs(rb - 2.368) <= 0.02, '%.3f m' % rb)
    rep.check('wheel radius const 0.50', WHEEL_R == 0.5, str(WHEEL_R))
    for lod, parts in lods.items():
        tot = sum(p.mesh.tris() for p in parts)
        tri_budget_check(rep, 'LOD%d total' % lod, tot, BUDGET[lod])
        for p in parts:
            rep.check('  %s' % p.name, True, '%d tris, %d verts, %d mats' % (p.mesh.tris(), len(p.mesh.verts), len(p.mesh.mats())))
    # tyre radius from the built mesh: furthest tyre vertex from the hub, in the wheel plane
    for p in lods[0]:
        if p.name.startswith(PFX + '_Wheel'):
            hx, _, hz = p.pivot
            rmax = max(math.hypot(x - hx, z - hz) for (x, y, z) in p.mesh.verts)
            rep.check('tyre radius 0.50 +-0.02 (%s)' % p.name[len(PFX) + 1:], abs(rmax - WHEEL_R) <= 0.02, '%.3f' % rmax)
            rep.check('pivot at hub z (%s)' % p.name[len(PFX) + 1:], abs(hz - WHEEL_CZ) < 1e-6, '%.3f' % hz)
    o, i = fit_check(sil0)
    rep.check('art outside collider <= 0.04 m', o <= TOL_ART_OUT + 0.003, '%.3f m (limit 0.04, sample tol 0.003)' % o)
    rep.check('collider outside art <= 0.06 m', i <= TOL_COL_OUT + 0.01, '%.3f m (limit 0.06, sample tol 0.01; wheel arches exempt)' % i)
    fo = fin_fit(sil0)
    rep.check('drum + fins outside collider <= 0.06 m', fo <= 0.06, '%.3f m (drum silhouette grown by the tapered fin height, FIN_H %.3f; thin raised trim may use the 0.06 limit)' % (fo, FIN_H))
    xs = [x for p in lods[0] if p.name.split('_')[2] not in ('Chute',) for (x, y, z) in p.mesh.verts]
    zs = [z for p in lods[0] for (x, y, z) in p.mesh.verts]
    rep.check('body x extent inside sprite rect', min(xs) >= SPRITE_RECT[0] - 0.05 and max(xs) <= SPRITE_RECT[2] + 0.05, '%.3f .. %.3f' % (min(xs), max(xs)))
    rep.check('top inside sprite rect (<= 2.61+0.04)', max(zs) <= SPRITE_RECT[3] + 0.04, 'max z %.3f' % max(zs))
    rep.check('cab at +X end (AL-1)', sum(1 for (x, y, z) in lods[0][1].mesh.verts) > 0 and lods[0][1].pivot[0] > 0, 'cab pivot x = %.2f' % lods[0][1].pivot[0])
    rep.check('rear (drum) at -X end (AL-1)', lods[0][2].pivot[0] < 0, 'drum pivot x = %.2f' % lods[0][2].pivot[0])


# ----------------------------------------------------------------------------------------
# Blender build
# ----------------------------------------------------------------------------------------
def material_specs(skin):
    s = SKINS[skin]
    return {
        'MM_Truck_Body': dict(color=s['body'], rough=0.55, coat=1.0, coat_rough=0.1),
        'MM_Truck_Hub': dict(color=s['body'], rough=0.35, coat=0.6, coat_rough=0.15),
        'MM_Truck_Accent': dict(color=s['accent'], rough=0.55, coat=1.0, coat_rough=0.1),
        'MM_Truck_Drum': dict(color=s['drum'], rough=0.45, coat=1.0, coat_rough=0.08),
        'MM_Truck_Chute': dict(color=s['drum'], rough=0.55, coat=0.6, coat_rough=0.15),
        'MM_Truck_DrumStripe': dict(color=s['stripe'], rough=0.45, coat=1.0, coat_rough=0.08),
        'MM_Truck_Trim': dict(color='#2b2f3a', rough=0.5),
        'MM_Truck_Interior': dict(color='#6b7385', rough=0.8),
        'MM_Rubber': dict(color=PALETTE['rubber'], rough=0.75),
        'MM_Chrome': dict(color=PALETTE['chrome'], rough=0.15, metal=0.9),
        'MM_Light_Head': dict(color='#fff6d0', rough=0.2, emit='#fff1b0', emit_strength=1.2),
        'MM_Light_Tail': dict(color='#d42a2a', rough=0.3, emit='#d42a2a', emit_strength=0.5),
        'MM_Glass': dict(color=PALETTE['glass'], rough=0.05, alpha=0.7, tex='GLASS'),
    }


def crisp_normals(o):
    """Face-area weighted normals (exported as the FBX normals). Every part is shade-smooth and welded, so plain
    vertex normals bend the big flat faces toward their bevels; the long n-gon slivers then shade in a sawtooth
    and the 2 px bevels sparkle as a dotted white line (the P2 "stipple" on the chassis top and drum straps).
    Weighting by face area keeps flat faces flat and leaves the roundness to the bevel strips."""
    wn = o.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
    wn.mode = 'FACE_AREA'
    wn.weight = 50
    wn.keep_sharp = True
    return wn


def build_blender(args, lods, rep):
    out = args.out
    tex_dir = os.path.join(out, 'textures')
    glass = make_glass_streak_png(os.path.join(tex_dir, 'MM_GlassStreak.png'))
    bl_reset()
    col = bl_collection('MM_Mixer')
    mats = {}
    for name, sp in material_specs(args.skin).items():
        sp = dict(sp)
        if sp.get('tex') == 'GLASS':
            sp['tex'] = glass
        mats[name] = bl_material(name, **sp)
    bones = bone_list()
    arm = bl_armature('MM_Mixer_Rig', bones, col)
    objs = [arm]
    for lod in sorted(lods):
        for p in lods[lod]:
            o = bl_mesh_object(p, col, mats)
            crisp_normals(o)
            bl_parent_to_bone(o, arm, p.bone)
            objs.append(o)
    for name, pos, bone in SOCKETS:
        e = bl_empty('%s_%s' % (PFX, name), pos, col)
        bl_parent_to_bone(e, arm, bone)
        objs.append(e)
    bl_qa(objs, rep)
    return arm, objs, col


# ----------------------------------------------------------------------------------------
# Unity drop-in: the node contract of Unity/README.md ("Blender art drop-in") and TruckView.
# Plain empties + LOD0 meshes, no armature: Truck_Mixer > Visual > Body > (Chassis, Cab, axles,
# Drum_Tilt > Drum > mesh, Chute > mesh, Driver_Seat, Headlight_L/R) and Visual > Susp_F_n > Wheel_F_n.
# n = 0 is the near side (Blender -Y, Unity -Z, facing the camera), 1 the far side.
# ----------------------------------------------------------------------------------------
UNITY_ASSET = 'Truck_Mixer'
UNITY_WHEELS = {'Wheel_FR': ('F', 0), 'Wheel_FL': ('F', 1), 'Wheel_RR': ('R', 0), 'Wheel_RL': ('R', 1)}


def _bl_child(name, parent, local, collection, data=None):
    o = bpy.data.objects.new(name, data)
    if data is None:
        o.empty_display_type = 'PLAIN_AXES'
        o.empty_display_size = 0.15
    collection.objects.link(o)
    o.parent = parent
    o.location = local
    return o


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def build_unity_rig(lod0, mats):
    """Second export for Unity: same LOD0 geometry, re-parented under the README node names."""
    col = bl_collection('Unity_Truck_Mixer')
    by_bone = {}
    for p in lod0:
        by_bone.setdefault(p.bone, []).append(p)

    def mesh_obj(p, name):
        o = bl_mesh_object(Part(name, p.mesh, p.pivot, p.bone, p.lod, p.outline), col, mats)
        # Unity's importer drops concave n-gons it cannot triangulate ("self-intersecting"): triangulate here.
        tri = o.modifiers.new('Triangulate', 'TRIANGULATE')
        tri.quad_method = 'BEAUTY'
        tri.ngon_method = 'BEAUTY'
        crisp_normals(o)
        return o

    root = _bl_child(UNITY_ASSET, None, (0.0, 0.0, 0.0), col)
    visual = _bl_child('Visual', root, (0.0, 0.0, 0.0), col)
    body = _bl_child('Body', visual, (0.0, 0.0, 0.0), col)
    for bone, label in (('Chassis', 'Chassis_Mesh'), ('Cab', 'Cab_Mesh'), ('Axle_F', 'Axle_F_Mesh'), ('Axle_R', 'Axle_R_Mesh')):
        for p in by_bone.get(bone, []):
            o = mesh_obj(p, label)
            o.parent = body
            o.location = p.pivot
    # drum: the tilt node's local +X runs along the drum axis, so "spin on local X" spins about the real axis
    oc = drum_origin()
    ax = drum_axis()
    theta = math.atan2(-ax[2], ax[0])
    tilt = _bl_child('Drum_Tilt', body, oc, col)
    tilt.rotation_euler = (0.0, theta, 0.0)
    drum = _bl_child('Drum', tilt, (0.0, 0.0, 0.0), col)
    for p in by_bone.get('Drum', []):
        o = mesh_obj(p, 'Drum_Mesh')
        o.parent = drum
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, -theta, 0.0)
    hinge = (CHUTE_PIN[0], 0.0, CHUTE_PIN[1])
    chute = _bl_child('Chute', body, hinge, col)
    for p in by_bone.get('Chute', []):
        o = mesh_obj(p, 'Chute_Mesh')
        o.parent = chute
        o.location = _sub(p.pivot, hinge)
    _bl_child('Driver_Seat', body, SEAT_POS, col)
    for sock, name in (('Socket_HeadlightL', 'Headlight_L'), ('Socket_HeadlightR', 'Headlight_R')):
        pos = next(s[1] for s in SOCKETS if s[0] == sock)
        _bl_child(name, body, pos, col)
    for bone, (axle, n) in UNITY_WHEELS.items():
        for p in by_bone.get(bone, []):
            susp = _bl_child('Susp_%s_%d' % (axle, n), visual, p.pivot, col)
            o = mesh_obj(p, 'Wheel_%s_%d' % (axle, n))
            o.parent = susp
            o.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    return [o for o in col.objects]


def unity_rig_checks(rep, objs):
    names = {o.name for o in objs}
    need = ['Visual', 'Body', 'Drum', 'Chute', 'Driver_Seat', 'Headlight_L', 'Headlight_R'] + \
           ['%s_%s_%d' % (k, a, n) for k in ('Susp', 'Wheel') for a in 'FR' for n in (0, 1)]
    missing = [n for n in need if n not in names]
    rep.check('unity node names present', not missing, ','.join(missing))
    w = bpy.data.objects.get('Wheel_F_0')
    if w is not None:
        rep.check('unity near wheel on -Y (camera side)', w.matrix_world.translation.y < 0, '%.2f' % w.matrix_world.translation.y)
    d = bpy.data.objects.get('Drum_Mesh')
    if d is not None:
        drift = max(abs(a - b) for a, b in zip(d.matrix_world.translation, drum_origin()))
        rot = max(abs(r) for r in d.matrix_world.to_euler())
        rep.check('unity drum mesh keeps its world pose', drift < 1e-4 and rot < 1e-4, 'pos %.5f rot %.5f' % (drift, rot))


def write_meta(args, lods, rep):
    meta = {
        'asset': ASSET, 'blender_axes': 'x = forward (cab end), y = depth (camera at -Y), z = up; 1 unit = 1 m; origin = chassis bottom centre',
        'unity_mapping': 'FBX exported -Z forward / Y up with Apply Transform: Blender X -> Unity X, Blender Z -> Unity Y, Blender Y -> Unity Z. Truck drives toward +X.',
        'skin': args.skin, 'skins': SKINS, 'budget_tris': BUDGET,
        'wheel_radius': WHEEL_R, 'hub_z': WHEEL_CZ, 'wheel_x': list(WHEEL_CX), 'track_hub_to_hub': 2 * HUB_Y,
        'ground_contact_z': WHEEL_CZ - WHEEL_R,
        'bones': [{k: (list(v) if isinstance(v, tuple) else v) for k, v in b.items()} for b in bone_list()],
        'rotation_axes_model_space': {
            'Wheel_*': {'axis': [0, 1, 0], 'note': 'positive rotation about +Y = rolling forward'},
            'Drum': {'axis': list(drum_axis()), 'note': 'spin about the drum axis, front end tilted down %.0f deg' % math.degrees(DRUM_TILT)},
            'Chute': {'axis': [0, 1, 0], 'rest_angle_deg': math.degrees(CHUTE_REST), 'note': 'swing about the hinge; rest = sim default (about -0.45 rad)'},
            'Axle_F/R': {'axis': [0, 0, 1], 'note': 'translate along +Z, visual travel -0.10 .. +0.12 m (arch clearance 0.04 m at rest)'},
        },
        'parts': [{'name': p.name, 'bone': p.bone, 'lod': p.lod, 'pivot': list(p.pivot), 'tris': p.mesh.tris(), 'materials': p.mesh.mats()} for l in sorted(lods) for p in lods[l]],
        'sockets': [{'name': n, 'pos': list(pos), 'bone': b} for n, pos, b in SOCKETS],
        'outline': 'vertex colour attribute OutlineN = smoothed normal * 0.5 + 0.5 (object space) for the inverted-hull shader; hull 0.06 m, colour #22252b',
        'uv': 'box projection, 1 UV unit = 1 m; glass panes have 0..1 UVs for the painted streak. Hero materials are flat colour (no unique textures).',
        'qa': rep.rows,
    }
    path = os.path.join(args.out, ASSET + '_meta.json')
    os.makedirs(args.out, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(meta, f, indent=2)
    return path


def main():
    args = parse_args(lambda p: p.add_argument('--unity-forward', default='Z', help='FBX forward axis for the Unity drop-in export'))
    rep = Report(ASSET)
    lods, sil0 = {}, None
    for lod in (0, 1):
        parts, sil = build_lod(lod)
        lods[lod] = parts
        if lod == 0:
            sil0 = sil
    run_checks(rep, lods, sil0)
    if args.dry_run:
        finish(rep, args, args.out)
        return
    arm, objs, col = build_blender(args, lods, rep)
    mats = {m.name: m for m in bpy.data.materials}
    unity_objs = build_unity_rig(lods[0], mats)
    unity_rig_checks(rep, unity_objs)
    blend = bl_save_blend(os.path.join(args.out, ASSET + '.blend'))
    print('[mm] saved', blend)
    if not args.no_export:
        fbx = bl_export_fbx(os.path.join(args.out, ASSET + '.fbx'), objs, bake_space=not args.no_bake_space)
        print('[mm] exported', fbx)
        # Unity drop-in: Blender +Y (far side) -> FBX +Z, Z up -> FBX +Y, so after Unity's handedness flip the
        # truck lands as Blender X -> Unity +X, Z -> +Y, Y -> +Z (near side at -Z). No bake: the importer handles a
        # plain node hierarchy correctly only when every node carries its own converted transform.
        ufbx = bl_export_fbx(os.path.join(args.out, UNITY_ASSET + '.fbx'), unity_objs, bake_space=False,
                             axis_forward=args.unity_forward, axis_up='Y')
        print('[mm] exported (Unity drop-in)', ufbx)
    print('[mm] meta', write_meta(args, lods, rep))
    print('[mm] qa', rep.save(args.out))
    finish(rep, args, args.out)


if __name__ == '__main__':
    main()
