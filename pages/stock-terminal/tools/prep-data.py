#!/usr/bin/env python3
"""prep-data.py: build masked weekly.json (v1) from jacksoncrow CSVs. stdlib only.
Run: python3 -I tools/prep-data.py <srcdir with stocks/ etfs/> <out weekly.json>
Writes id->ticker map to tools/prep-data.log (not shipped)."""
import csv, json, math, os, sys, datetime

def num(s):
    try:
        x = float(s)
        return x if math.isfinite(x) else None
    except (ValueError, TypeError):
        return None

def read(path):
    rows = []
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            try:
                d = datetime.date.fromisoformat((r.get("Date") or "").strip()[:10])
            except ValueError:
                continue
            o, h, l, c = (num(r.get(k)) for k in ("Open", "High", "Low", "Close"))
            if o is None and h is None and l is None and c is None:
                continue  # all-blank row
            v = num(r.get("Volume")) or 0
            rows.append((d, o, h, l, c, v))
    rows.sort(key=lambda t: t[0])
    return rows

def main():
    src, out = sys.argv[1], sys.argv[2]
    files = []  # (kind, ticker, path)
    for sub, kind in (("stocks", "stock"), ("etfs", "etf")):
        d = os.path.join(src, sub)
        for fn in sorted(os.listdir(d)):
            if fn.lower().endswith(".csv"):
                files.append((kind, fn[:-4], os.path.join(d, fn)))
    data = {}
    for kind, tk, p in files:
        data[(kind, tk)] = read(p)
    alld = [r[0] for rs in data.values() for r in rs]
    mn, mx = min(alld), max(alld)
    base = mn.toordinal() - mn.weekday()  # Monday of earliest week
    wk = lambda d: (d.toordinal() - base) // 7
    nW = wk(mx) + 1

    U = lambda p: int(round(math.log(p) * 2000))
    series, log = [], []
    counts = {"stock": 0, "etf": 0}
    # admin default: stocks sorted by ticker, then ETFs sorted by ticker
    order = sorted(data, key=lambda k: (0 if k[0] == "stock" else 1, k[1]))
    for kind, tk in order:
        rows = data[(kind, tk)]
        weeks = {}
        prev_c = None
        for d, o, h, l, c, v in rows:
            if c is None or c <= 0:
                if prev_c is None:
                    continue
                c = prev_c  # admin default: bad close -> previous close
            if o is None or o <= 0:
                o = prev_c if prev_c is not None else c
            hi = max(x for x in (h, o, c) if x is not None and x > 0)
            lo = min(x for x in (l, o, c) if x is not None and x > 0)
            hi = max(hi, o, c); lo = min(lo, o, c)
            prev_c = c
            w = wk(d)
            if w not in weeks:
                weeks[w] = [o, hi, lo, c, v]
            else:
                b = weeks[w]
                b[1] = max(b[1], hi); b[2] = min(b[2], lo); b[3] = c; b[4] += v
        if not weeks:
            continue
        f, last = min(weeks), max(weeks)
        counts[kind] += 1
        sid = ("s%02d" if kind == "stock" else "e%02d") % counts[kind]
        cs, os_, hs, ls, vs = [], [], [], [], []
        pc = None; pcu = None
        for w in range(f, last + 1):
            if w in weeks:
                o, h, l, c, v = weeks[w]
            else:
                o = h = l = c = pc; v = 0
            cu = U(c); ou = U(o); hu = max(U(h), ou, cu); lu = min(U(l), ou, cu)
            cs.append(cu if pcu is None else cu - pcu)
            os_.append(ou - cu); hs.append(hu - cu); ls.append(lu - cu)
            vs.append(int(round(math.log(v + 1) * 100)))
            pc, pcu = c, cu
        series.append({"id": sid, "k": kind, "f": f, "c": cs, "o": os_, "h": hs, "l": ls, "v": vs})
        log.append("%s\t%s\t%s\tf=%d n=%d" % (sid, tk, kind, f, last - f + 1))
    with open(out, "w") as fh:
        json.dump({"v": 1, "nW": nW, "series": series}, fh, separators=(",", ":"))
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "prep-data.log"), "w") as fh:
        fh.write("\n".join(log) + "\nnW=%d base_monday=%s\n" % (nW, datetime.date.fromordinal(base)))
    print("wrote", out, "series", len(series), "nW", nW)

main()
