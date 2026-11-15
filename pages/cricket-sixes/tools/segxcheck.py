#!/usr/bin/env python3
"""Wheel match segment fold: Python reference fixture for the JS parity test (SEGX).

Run (from pages/cricket-sixes):  python3 -I tools/segxcheck.py [out.json]
Default out: test/fixtures/wheelmatch-segx.json. Stdlib only, seeded, deterministic.

What it does
  1. Builds ~40 outcome-count tables (hand-made edge cases + seeded random over sims; bowl and bat sides,
     chases with WIN, all-out AO, very thin classes, one dominant outcome, >10 outcomes, ties).
  2. Folds each one with fold_spec() = SPEC s2 + 01a, written out below, and dumps kept labels, masses and rim order.
  3. Imports the reference fold (sim/segments.py fold()) and cross-checks the reserve + fill + nearest-fold steps on
     the normal (non-ending) outcomes; every difference is recorded per table in `ref` and is a known SPEC-vs-sim gap.

SPEC s2 vs segments.py (SPEC wins; each is applied in fold_spec):
  a. WIN / ALL OUT: segments.py folds ending overs like any (runs, wkts). SPEC + CONTRACT: ONE WIN seg and ONE ALL OUT
     seg (mass = all samples with that end), kept out of the fold. Normals get K_SEG - (#specials) slots so the wheel
     has at most K_SEG = 10 segments (as wheel_match_sim target_n).
  b. Reserve threshold uses mass over ALL N samples (p on the wheel), not over normals only.
  c. High-tail label (85th pct, 0-wkt class): segments.py appends it even when it is already kept (duplicate, one slot
     lost). Here it is added only when not already kept.
  d. MIN_P merge (step 4): not in segments.py. Here: while >1 normal seg and the thinnest normal seg has p < MIN_P,
     merge the thinnest (tie: lower wkts, then lower runs) into the nearest other normal seg by the same fold rule.
  e. Rim order: segments.py has none; wheel_match_sim zigzags all segs incl. AO by value. SPEC: zigzag the normals by
     value for us, WIN at the top end (first), ALL OUT at the bottom end (last).
Tie-breaks (not in SPEC; chosen so the result is deterministic; match segments.py when it is deterministic):
  - fill: count desc, then wkts asc, runs asc.   - class-mean label: |runs - mean| asc, count desc, runs asc.
  - fold: same wkts -> |dr| asc, runs asc; else |dw| asc, |dr| asc, runs asc, wkts asc.
  - value sort: value desc, then wkts asc, runs asc.
Value for us: bowl  v = -runs + 7*wk;  bat  v = runs - cw*wk, cw = clamp(14 - 1.2*rr, 3, 10), rr = needRuns*6/ballsLeft
(rr = 6 when no need given).
"""
import sys, os, json, random, collections

REF_DIR = "/mnt/project-files/games-design/cricket-sixes/2026-11-15-wheel-match/sim"
K_SEG, MIN_P, RESERVE_MIN, HIGH_TAIL_Q, CIRC = 10, 0.025, 0.03, 0.85, 10
WK_VAL_BOWL, WK_A, WK_B, WK_LO, WK_HI = 7, 14, 1.2, 3, 10

# ------------------------------------------------------------------ fold (SPEC s2)
def fold_normals(cnt, N, K):
    """cnt {(runs, wk): count} of normal outcomes. Returns (mass {key: count}, members {key: [keys]}, keep order)."""
    if not cnt or K <= 0: return {}, {}, []
    ranked = sorted(cnt, key=lambda k: (-cnt[k], k[1], k[0]))
    keep = []
    byw = collections.Counter()
    for k, c in cnt.items(): byw[k[1]] += c
    for w in sorted(byw):
        c = byw[w]
        if c / N >= RESERVE_MIN and len(keep) < K:
            ks = [k for k in cnt if k[1] == w]
            mu = sum(k[0] * cnt[k] for k in ks) / c
            m = min(ks, key=lambda k: (abs(k[0] - mu), -cnt[k], k[0]))
            if m not in keep: keep.append(m)
            if w == 0 and len(keep) < K:
                acc = 0
                for k in sorted(ks):
                    acc += cnt[k]
                    if acc >= HIGH_TAIL_Q * c:
                        if k not in keep: keep.append(k)
                        break
    for k in ranked:
        if len(keep) >= K: break
        if k not in keep: keep.append(k)
    mass = {k: cnt[k] for k in keep}
    mem = {k: [k] for k in keep}
    for k in sorted(cnt, key=lambda q: (q[1], q[0])):
        if k in mass: continue
        t = nearest(k, keep)
        mass[t] += cnt[k]; mem[t].append(k)
    return mass, mem, keep

def nearest(k, labels):
    same = [q for q in labels if q[1] == k[1]]
    if same: return min(same, key=lambda q: (abs(q[0] - k[0]), q[0]))
    return min(labels, key=lambda q: (abs(q[1] - k[1]), abs(q[0] - k[0]), q[0], q[1]))

def min_p_merge(mass, mem, N):
    while len(mass) > 1:
        thin = min(mass, key=lambda k: (mass[k], k[1], k[0]))
        if mass[thin] / N >= MIN_P: break
        t = nearest(thin, [q for q in mass if q != thin])
        mass[t] += mass.pop(thin); mem[t] += mem.pop(thin)
    return mass, mem

def cw_of(ctx):
    if ctx["side"] == "bowl": return WK_VAL_BOWL
    need, balls = ctx.get("needRuns"), ctx.get("ballsLeft")
    rr = need * 6 / balls if (need is not None and balls) else 6.0
    return min(max(WK_A - WK_B * rr, WK_LO), WK_HI)

def value(ctx, runs, wk):
    cw = cw_of(ctx)
    return (-runs + cw * wk) if ctx["side"] == "bowl" else (runs - cw * wk)

def zigzag(items):
    out = []; lo, hi = 0, len(items) - 1; turn = True
    while lo <= hi:
        if turn: out.append(items[lo]); lo += 1
        else: out.append(items[hi]); hi -= 1
        turn = not turn
    return out

def fold_spec(samples, ctx):
    """samples: list of (runs, wk, end). Returns list of seg dicts in rim order."""
    N = len(samples)
    norm = collections.Counter((r, w) for r, w, e in samples if e == "")
    nwin = sum(1 for s in samples if s[2] == "WIN"); nao = sum(1 for s in samples if s[2] == "AO")
    specials = (nwin > 0) + (nao > 0)
    mass, mem, _ = fold_normals(norm, N, K_SEG - specials)
    mass, mem = min_p_merge(mass, mem, N)
    segs = [dict(id="%dw%d" % k, label=str(k[0]), runs=k[0], wk=k[1], end="", p=mass[k] / N, count=mass[k],
                 value=value(ctx, k[0], k[1]), members=["%dw%d" % m for m in sorted(mem[k], key=lambda q: (q[1], q[0]))])
            for k in mass]
    segs.sort(key=lambda s: (-s["value"], s["wk"], s["runs"]))
    order = zigzag(segs)
    if nwin: order.insert(0, dict(id="WIN", label="WIN", end="WIN", p=nwin / N, count=nwin))
    if nao: order.append(dict(id="AO", label="ALL OUT", end="AO", p=nao / N, count=nao))
    x = 0.0
    for s in order:
        s["start"] = x; s["width"] = s["p"] * CIRC; x += s["width"]
    return order

# ------------------------------------------------------------------ reference cross-check
def ref_check(ref_fold, samples):
    """Run segments.fold on the normal outcomes only (no specials, so K = K_SEG) and compare the kept set and masses
    to fold_normals with the same N. Only meaningful where no WIN/AO; threshold uses N(normals) on both sides."""
    norm_list = [(r, w) for r, w, e in samples if e == ""]
    if len(norm_list) != len(samples) or not norm_list: return dict(compared=False)
    cnt = collections.Counter()
    for k in sorted(set(norm_list), key=lambda q: (q[1], q[0])): cnt[k] = 0     # canonical insertion order -> stable ties
    for k in norm_list: cnt[k] += 1
    ref_seg, _ = ref_fold(cnt, K_SEG, True, False)
    mine, _, _ = fold_normals(dict(cnt), len(norm_list), K_SEG)
    rk = {"%dw%d" % k: v for k, v in ref_seg.items()}; mk = {"%dw%d" % k: v for k, v in mine.items()}
    agree = rk == mk
    note = "" if agree else ("ref kept %d labels (high-tail duplicate lost a slot)" % len(rk)
                             if len(rk) < len(mk) else "differs")
    return dict(compared=True, agree=agree, note=note, ref={k: rk[k] for k in sorted(rk)})

# ------------------------------------------------------------------ tables
def expand(tbl):
    out = []
    for runs, wk, end, c in tbl: out += [(runs, wk, end)] * c
    return out

def sim_table(rng, n, start_wk=0, need=None, pw=0.08, p6=0.08, p4=0.12, p2=0.1, p1=0.35):
    """Toy over sim (not the engine; only to get realistic-looking count tables)."""
    out = []
    for _ in range(n):
        r = w = 0; end = ""
        for _b in range(6):
            x = rng.random()
            if x < pw:
                w += 1
                if start_wk + w >= 5: end = "AO"; break
                continue
            x -= pw
            o = 6 if x < p6 else 4 if x < p6 + p4 else 2 if x < p6 + p4 + p2 else 1 if x < p6 + p4 + p2 + p1 else 0
            r += o
            if need is not None and r >= need: end = "WIN"; break
        out.append((r, w, end))
    return out

def cases():
    C = []
    def add(name, ctx, samples): C.append(dict(name=name, ctx=ctx, samples=samples))
    bowl = {"side": "bowl"}
    # hand-made
    add("bowl-few-outcomes", bowl, expand([(0, 0, "", 300), (1, 0, "", 500), (4, 0, "", 400), (6, 1, "", 300), (8, 0, "", 500)]))
    add("bowl-single-outcome", bowl, expand([(5, 0, "", 2000)]))
    add("bowl-dominant", bowl, expand([(6, 0, "", 1900), (0, 0, "", 20), (12, 0, "", 30), (3, 1, "", 30), (9, 2, "", 20)]))
    add("bowl-dominant-mixed", bowl, expand([(7, 0, "", 1800), (2, 0, "", 40), (14, 0, "", 49), (4, 1, "", 51), (10, 1, "", 20),
                                              (1, 2, "", 25), (3, 2, "", 15)]))
    t = [(r, 0, "", 60 + 7 * r) for r in range(0, 20)] + [(r, 1, "", 25 + r) for r in range(0, 14)] + [(r, 2, "", 10) for r in range(0, 8)]
    add("bowl-many-outcomes", bowl, expand(t))
    add("bowl-thin-classes-boundary", bowl, expand([(4, 0, "", 900), (8, 0, "", 600), (12, 0, "", 380), (5, 1, "", 60),   # wk1 = 60/2000 = 0.03 exactly
                                                     (3, 2, "", 30), (9, 2, "", 28), (6, 3, "", 2)]))                     # wk2 = 0.029
    add("bowl-minp-boundary", bowl, expand([(4, 0, "", 1000), (8, 0, "", 900), (13, 0, "", 50), (2, 1, "", 50)]))          # 50/2000 = 0.025 not under
    add("bowl-minp-just-under", bowl, expand([(4, 0, "", 1001), (8, 0, "", 900), (13, 0, "", 49), (2, 1, "", 50)]))
    add("bowl-minp-tie", bowl, expand([(10, 0, "", 1940), (2, 0, "", 30), (3, 0, "", 30)]))                       # two thin segs, equal mass
    add("bowl-count-ties", bowl, expand([(r, 0, "", 100) for r in range(0, 14)] + [(r, 1, "", 100) for r in range(0, 6)]))
    add("bowl-value-ties", bowl, expand([(0, 0, "", 400), (7, 1, "", 400), (14, 2, "", 400), (3, 0, "", 400), (10, 1, "", 400)]))
    add("bowl-ao-wk4", bowl, expand([(5, 0, "", 900), (9, 0, "", 500), (2, 0, "", 300), (4, 0, "AO", 200), (0, 0, "AO", 100)]))
    add("bowl-ao-only", bowl, expand([(3, 1, "AO", 1000), (0, 1, "AO", 1000)]))
    add("bowl-3wk-stars", bowl, expand([(6, 0, "", 700), (3, 1, "", 500), (2, 2, "", 400), (1, 3, "", 250), (8, 3, "", 150)]))
    add("bowl-high-tail-is-mean", bowl, expand([(6, 0, "", 1800), (7, 0, "", 200)]))
    add("bowl-small-n", bowl, expand([(0, 0, "", 40), (1, 0, "", 30), (4, 0, "", 15), (6, 1, "", 10), (12, 0, "", 5)]))
    chase = lambda n, b: {"side": "bat", "needRuns": n, "ballsLeft": b}
    add("bat-chase-win", chase(8, 6), expand([(8, 0, "WIN", 700), (9, 0, "WIN", 300), (4, 0, "", 400), (6, 0, "", 300), (2, 1, "", 200), (7, 0, "", 100)]))
    add("bat-all-win", chase(1, 12), expand([(1, 0, "WIN", 1500), (4, 0, "WIN", 300), (6, 0, "WIN", 200)]))
    add("bat-win-and-ao", chase(10, 6), expand([(10, 0, "WIN", 500), (5, 1, "", 400), (8, 0, "", 600), (3, 0, "AO", 300), (0, 1, "", 200)]))
    add("bat-no-need", {"side": "bat"}, expand([(r, 0, "", 100 + 10 * r) for r in range(0, 13)] + [(r, 1, "", 40) for r in range(0, 9)]))
    add("bat-big-need-cw-lo", chase(60, 12), expand([(r, 0, "", 90 + 5 * r) for r in range(0, 15)] + [(r, 1, "", 50) for r in range(0, 10)]))
    add("bat-small-need-cw-hi", chase(30, 60), expand([(r, 0, "", 90 + 5 * r) for r in range(0, 15)] + [(r, 1, "", 50) for r in range(0, 10)] + [(r, 2, "", 30) for r in range(0, 4)]))
    # seeded random (toy over sim)
    rng = random.Random(20261115)
    for i in range(10):
        add("rand-bowl-%d" % i, bowl, sim_table(rng, 2000, start_wk=rng.choice([0, 0, 1, 2, 3, 4]), pw=rng.uniform(0.03, 0.2),
                                                 p6=rng.uniform(0.02, 0.15), p4=rng.uniform(0.05, 0.2)))
    for i in range(8):
        need = rng.randint(2, 40); balls = rng.choice([6, 12, 18, 24, 36, 60])
        add("rand-chase-%d" % i, chase(need, balls), sim_table(rng, 2000, start_wk=rng.choice([0, 1, 2, 3, 4]), need=need,
                                                                pw=rng.uniform(0.03, 0.2), p6=rng.uniform(0.02, 0.15)))
    for i in range(3):
        add("rand-thin-%d" % i, bowl, sim_table(rng, rng.choice([100, 300, 777]), start_wk=rng.choice([0, 3]), pw=rng.uniform(0.1, 0.25)))
    return C

def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test", "fixtures", "wheelmatch-segx.json")
    sys.dont_write_bytecode = True; sys.path.insert(0, REF_DIR)
    try:
        import segments as REF
        ref_fold = REF.fold
    except Exception as e:                                   # reference unreachable: still write the spec fixture
        print("reference import failed: %r" % e); ref_fold = None
    res = []; agree = compared = 0
    for c in cases():
        segs = fold_spec(c["samples"], c["ctx"])
        assert abs(sum(s["p"] for s in segs) - 1) < 1e-9, c["name"]
        assert len(segs) <= K_SEG, c["name"]
        rc = ref_check(ref_fold, c["samples"]) if ref_fold else dict(compared=False)
        if rc["compared"]: compared += 1; agree += rc["agree"]
        tbl = collections.Counter(c["samples"])
        res.append(dict(name=c["name"], ctx=c["ctx"], n=len(c["samples"]),
                        table=[[r, w, e, n] for (r, w, e), n in sorted(tbl.items(), key=lambda kv: (kv[0][2], kv[0][1], kv[0][0]))],
                        segs=[{k: s[k] for k in ("id", "label", "end", "p", "start", "width", "count") if k in s} |
                              ({"runs": s["runs"], "wk": s["wk"], "value": s["value"], "members": s["members"]} if s["end"] == "" else {})
                              for s in segs],
                        ref=rc))
        print("%-28s n=%4d segs=%2d  %s%s" % (c["name"], len(c["samples"]), len(segs), " ".join(s["id"] for s in segs),
                                             "" if not rc["compared"] else ("  [ref ok]" if rc["agree"] else "  [ref: %s]" % rc["note"])))
    meta = dict(source="tools/segxcheck.py", spec="2026-11-15-wheel-match SPEC s2 + 01a; reference sim/segments.py fold()",
                consts=dict(K_SEG=K_SEG, MIN_P=MIN_P, RESERVE_MIN=RESERVE_MIN, HIGH_TAIL_Q=HIGH_TAIL_Q, CIRC=CIRC),
                ref_compared=compared, ref_agree=agree)
    with open(out_path, "w") as f:
        json.dump(dict(meta=meta, cases=res), f, indent=0, separators=(",", ":"))
        f.write("\n")
    print("cases %d; reference fold compared %d, agree %d -> %s" % (len(res), compared, agree, os.path.normpath(out_path)))

if __name__ == "__main__":
    main()
