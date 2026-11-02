"""Measure review stills (L-MM-28 clipping rule, L-MM-33 on/off proof). Pure Python: PIL if present, else a
small built-in PNG decoder (zlib), so nothing has to be installed.

Usage:
  python3 still_metrics.py <png or folder>... [--csv out.csv] [--band 0.30,0.65] [--step 2]
                           [--clip-max 0.15] [--contrast BOX:BOX] [--min-contrast 1.3]
  python3 still_metrics.py <folder> --pairs [--pairs-csv pairs.csv] [--min-area 0.0005]

Per still (all inside the play band = rows from 30% to 65% of the height unless --band says otherwise):
  clip_white   share of flat near-white pixels: min channel >= 230 and channel spread < 8 (L-MM-28: must be < 15%)
  clip_black   share of near-black pixels: max channel <= 20
  lum_p1/p99   1st and 99th percentile of luma (0-255)
  sat_mean     mean HSV saturation (0-1); low = washed out
  contrast_rms standard deviation of luma / 255; low = flat
  dark_channel mean of the smallest channel / 255 (dark-channel haze prior; high = hazy)
  frame_clip   clip_white over the whole frame, for reference
  verdict      PASS when clip_white < --clip-max
--contrast x0,y0,x1,y1:x0,y0,x1,y1 compares two boxes (fractions 0-1 of width/height, or pixels) with the WCAG
  luminance ratio, e.g. shade on the road vs lit road; PASS needs >= --min-contrast (L-MM-28: 1.3).
--pairs finds fx_<flag>_on.png / fx_<flag>_off.png and measures WHERE they differ, because a real effect is local
  (a fence shadow, a lamp) and a whole-frame mean averages it away. A pixel has changed when |dR|+|dG|+|dB| > 24.
  fx__baseline_a/_b (two shots of the same frozen frame) and fx__baseline_live_a/_b (particles running) are the
  noise: every pixel that changed between them is masked out (stills.csv says which baseline a pair uses). Per pair:
    changed_area       share of the frame that changed outside the noise mask (verdict input)
    mean_diff_changed  mean |d| per channel (0-255) inside those changed pixels
    noise_area         share of the frame masked as noise
    mean_abs_diff, changed_share, noise_floor   the old whole-frame numbers, kept for comparison
    threshold          --min-area (default 0.0005 = 0.05%, about 1150 px at 1920x1200) + noise_area, because noise
                       that moves somewhere else in the next shot is not masked
  PASS when changed_area >= threshold; else NO-CHANGE: the effect did nothing visible there (or the frame was not
  truly frozen: then noise_area is large and says so).
Exit code 1 when any still or pair fails.
"""
import argparse, csv, os, re, struct, sys, zlib

FLAT_MIN, FLAT_SPREAD, BLACK_MAX, CHANGED = 230, 8, 20, 8


# ---------------------------------------------------------------- decoding
def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc: return a
    return b if pb <= pc else c


def _unfilter(raw, width, height, bpp):
    stride = width * bpp
    out, prev, pos = [], bytearray(stride), 0
    for _ in range(height):
        f = raw[pos]; row = bytearray(raw[pos + 1:pos + 1 + stride]); pos += 1 + stride
        if f == 1:
            for i in range(bpp, stride): row[i] = (row[i] + row[i - bpp]) & 255
        elif f == 2:
            for i in range(stride): row[i] = (row[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride): row[i] = (row[i] + (((row[i - bpp] if i >= bpp else 0) + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = row[i - bpp] if i >= bpp else 0; c = prev[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + _paeth(a, prev[i], c)) & 255
        elif f != 0:
            raise ValueError('bad PNG filter %d' % f)
        out.append(row); prev = row
    return out


def _decode_png(path):
    """Returns (width, height, rows) with rows as RGB bytearrays (3 bytes per pixel)."""
    with open(path, 'rb') as fh: data = fh.read()
    if data[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('not a PNG: ' + path)
    pos, idat, palette = 8, [], None
    while pos < len(data):
        n, kind = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + n]; pos += 12 + n
        if kind == b'IHDR': w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif kind == b'PLTE': palette = body
        elif kind == b'IDAT': idat.append(body)
        elif kind == b'IEND': break
    if interlace: raise ValueError('interlaced PNG not supported: ' + path)
    if depth not in (8, 16) and ctype != 3: raise ValueError('bit depth %d not supported' % depth)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bpp = channels * (depth // 8) if depth >= 8 else 1
    if ctype == 3 and depth != 8: raise ValueError('only 8-bit palette PNGs are supported')
    rows = _unfilter(zlib.decompress(b''.join(idat)), w, h, bpp)
    rgb = []
    for r in rows:
        if depth == 16: r = r[0::2]                      # keep the high byte
        if ctype == 2: rgb.append(r)
        elif ctype == 6: rgb.append(bytearray(b for i, b in enumerate(r) if i % 4 != 3))
        elif ctype == 0: rgb.append(bytearray(v for v in r for _ in range(3)))
        elif ctype == 4: rgb.append(bytearray(r[i] for i in range(0, len(r), 2) for _ in range(3)))
        else: rgb.append(bytearray(palette[3 * v + k] for v in r for k in range(3)))
    return w, h, rgb


def load_rgb(path):
    try:
        from PIL import Image  # optional
        im = Image.open(path).convert('RGB'); w, h = im.size; raw = im.tobytes()
        return w, h, [bytearray(raw[y * w * 3:(y + 1) * w * 3]) for y in range(h)]
    except ImportError:
        return _decode_png(path)


# ---------------------------------------------------------------- metrics
def _pixels(rows, y0, y1, step):
    for y in range(y0, y1, step):
        row = rows[y]
        yield from zip(row[0::3 * step], row[1::3 * step], row[2::3 * step])


def band_rows(h, band):
    return max(0, int(h * band[0])), min(h, max(int(h * band[1]), int(h * band[0]) + 1))


def measure(rows, w, h, band, step):
    y0, y1 = band_rows(h, band)
    hist, n, flat, black = [0] * 256, 0, 0, 0
    sat_sum = lum_sum = lum_sq = dark_sum = 0.0
    for r, g, b in _pixels(rows, y0, y1, step):
        mx = max(r, g, b); mn = min(r, g, b)
        lum = (54 * r + 183 * g + 19 * b) >> 8           # Rec.709 luma weights in 8.8 fixed point
        hist[lum] += 1; n += 1
        lum_sum += lum; lum_sq += lum * lum; dark_sum += mn
        if mn >= FLAT_MIN and mx - mn < FLAT_SPREAD: flat += 1
        if mx <= BLACK_MAX: black += 1
        if mx: sat_sum += (mx - mn) / mx
    frame_n = frame_flat = 0
    for r, g, b in _pixels(rows, 0, h, step * 2):
        frame_n += 1
        if min(r, g, b) >= FLAT_MIN and max(r, g, b) - min(r, g, b) < FLAT_SPREAD: frame_flat += 1
    mean = lum_sum / n
    return {
        'clip_white': flat / n, 'clip_black': black / n,
        'lum_p1': _percentile(hist, n, 0.01), 'lum_p99': _percentile(hist, n, 0.99), 'lum_mean': mean,
        'sat_mean': sat_sum / n, 'contrast_rms': max(0.0, lum_sq / n - mean * mean) ** 0.5 / 255.0,
        'dark_channel': dark_sum / n / 255.0, 'frame_clip': frame_flat / max(1, frame_n),
    }


def _percentile(hist, n, q):
    target, acc = q * n, 0
    for v, c in enumerate(hist):
        acc += c
        if acc >= target: return v
    return 255


def _box(spec, w, h):
    vals = [float(v) for v in spec.split(',')]
    if len(vals) != 4: raise ValueError('a box is x0,y0,x1,y1: ' + spec)
    if all(v <= 1.0 for v in vals): vals = [vals[0] * w, vals[1] * h, vals[2] * w, vals[3] * h]
    x0, y0, x1, y1 = (int(round(v)) for v in vals)
    if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h): raise ValueError('box outside the image: ' + spec)
    return x0, y0, x1, y1


def _linear(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def box_luminance(rows, box):
    x0, y0, x1, y1 = box; total = n = 0
    for y in range(y0, y1):
        row = rows[y]
        for x in range(x0, x1):
            r, g, b = row[3 * x], row[3 * x + 1], row[3 * x + 2]
            total += 0.2126 * _linear(r) + 0.7152 * _linear(g) + 0.0722 * _linear(b); n += 1
    return total / n


def contrast_ratio(rows, w, h, spec):
    a, b = spec.split(':')
    la, lb = box_luminance(rows, _box(a, w, h)), box_luminance(rows, _box(b, w, h))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def mean_abs_diff(a_rows, b_rows, h, step):
    total = n = changed = 0
    for y in range(0, h, step):
        ra, rb = a_rows[y], b_rows[y]
        for i in range(0, len(ra), 3 * step):
            d = abs(ra[i] - rb[i]) + abs(ra[i + 1] - rb[i + 1]) + abs(ra[i + 2] - rb[i + 2])
            total += d; n += 1
            if d > 3 * CHANGED: changed += 1
    return total / (3.0 * n), changed / n


def diff_mask(a_rows, b_rows, h, step):
    """One byte per sampled pixel (row-major over the sample grid): 1 where the two frames differ by more than 3 x CHANGED."""
    out = bytearray()
    for y in range(0, h, step):
        ra, rb = a_rows[y], b_rows[y]
        out += bytes(1 if abs(ra[i] - rb[i]) + abs(ra[i + 1] - rb[i + 1]) + abs(ra[i + 2] - rb[i + 2]) > 3 * CHANGED else 0
                     for i in range(0, len(ra), 3 * step))
    return out


def pair_change(on_rows, off_rows, h, step, noise):
    """(changed_area, mean_diff_inside, changed_count): pixels that changed between on and off, minus the noise mask.
    The mean is per channel on the 0-255 scale; noise None means nothing is masked."""
    n = changed = total = k = 0
    for y in range(0, h, step):
        ra, rb = on_rows[y], off_rows[y]
        for i in range(0, len(ra), 3 * step):
            d = abs(ra[i] - rb[i]) + abs(ra[i + 1] - rb[i + 1]) + abs(ra[i + 2] - rb[i + 2])
            if d > 3 * CHANGED and not (noise and noise[k]): changed += 1; total += d
            n += 1; k += 1
    return (changed / n if n else 0.0), (total / (3.0 * changed) if changed else 0.0), changed


def pair_threshold(min_area, noise_area):
    """The mask only removes pixels that moved in the baseline; noise that moves elsewhere next time (a flake, a
    twinkle) is not masked, so the pair must also clear the baseline's own changed area."""
    return min_area + noise_area


def pair_verdict(changed_area, min_area, noise_area):
    return 'PASS' if changed_area >= pair_threshold(min_area, noise_area) else 'NO-CHANGE'


# ---------------------------------------------------------------- commands
def find_pngs(paths):
    out = []
    for p in paths:
        if os.path.isdir(p): out += sorted(os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith('.png'))
        elif p.lower().endswith('.png'): out.append(p)
        else: sys.exit('not a PNG or folder: ' + p)
    return out


def run_stills(args):
    files = find_pngs(args.paths)
    if not files: sys.exit('no PNG files found')
    cols = ['file', 'width', 'height', 'clip_white', 'clip_black', 'lum_p1', 'lum_p99', 'lum_mean', 'sat_mean',
            'contrast_rms', 'dark_channel', 'frame_clip', 'contrast', 'verdict']
    results, failed = [], 0
    for f in files:
        w, h, rows = load_rgb(f)
        m = measure(rows, w, h, args.band, args.step)
        ok = m['clip_white'] < args.clip_max
        m['contrast'] = ''
        if args.contrast:
            ratio = contrast_ratio(rows, w, h, args.contrast); m['contrast'] = round(ratio, 3)
            ok = ok and ratio >= args.min_contrast
        m.update(file=os.path.basename(f), width=w, height=h, verdict='PASS' if ok else 'FAIL')
        failed += not ok; results.append(m)
        print('%-32s clip %5.1f%%  black %4.1f%%  p1/p99 %3d/%3d  sat %.2f  rms %.3f  dark %.2f%s  %s' % (
            m['file'], 100 * m['clip_white'], 100 * m['clip_black'], m['lum_p1'], m['lum_p99'], m['sat_mean'],
            m['contrast_rms'], m['dark_channel'], ('  contrast %.2f:1' % m['contrast']) if args.contrast else '', m['verdict']))
    if args.csv: write_csv(args.csv, cols, results)
    print('%d stills, %d FAIL (clip_white must be < %.0f%% of the play band %.2f-%.2f)' % (
        len(results), failed, 100 * args.clip_max, args.band[0], args.band[1]))
    return failed


PAIR = re.compile(r'^fx_(?P<flag>[a-z0-9_]+?)_(?P<state>on|off)\.png$')


def find_pairs(folder):
    found = {}
    for f in os.listdir(folder):
        m = PAIR.match(f)
        if m and not m.group('flag').startswith('_'): found.setdefault(m.group('flag'), {})[m.group('state')] = os.path.join(folder, f)
    return found


def _baseline(folder, a_name, b_name, step):
    """(whole-frame mean diff, per-pixel noise mask) of a baseline pair, or None when it is missing."""
    a, b = os.path.join(folder, a_name), os.path.join(folder, b_name)
    if not (os.path.exists(a) and os.path.exists(b)): return None
    wa, ha, ra = load_rgb(a); wb, hb, rb = load_rgb(b)
    if (wa, ha) != (wb, hb): return None
    return mean_abs_diff(ra, rb, ha, step)[0], diff_mask(ra, rb, ha, step)


def _particles_by_still(folder):
    """stills.csv (written by the full set) says whether particles were frozen or live for each still."""
    path = os.path.join(folder, 'stills.csv')
    if not os.path.exists(path): return {}
    with open(path) as fh: return {r['name']: r.get('particles', '') for r in csv.DictReader(fh)}


PAIR_COLS = ['flag', 'particles', 'changed_area', 'changed_px', 'mean_diff_changed', 'noise_area', 'threshold',
             'mean_abs_diff', 'changed_share', 'noise_floor', 'verdict']


def run_pairs(args):
    if len(args.paths) != 1 or not os.path.isdir(args.paths[0]): sys.exit('--pairs takes one folder')
    folder = args.paths[0]
    base = {'frozen': _baseline(folder, 'fx__baseline_a.png', 'fx__baseline_b.png', args.step),
            'live': _baseline(folder, 'fx__baseline_live_a.png', 'fx__baseline_live_b.png', args.step)}
    particles = _particles_by_still(folder)
    for kind, b in base.items():
        print('noise %-6s %s' % (kind, '-' if b is None else 'mean %.3f, %.3f%% of the frame moved' % (
            b[0], 100.0 * sum(b[1]) / max(1, len(b[1])))))
    rows, failed = [], 0
    for flag, states in sorted(find_pairs(folder).items()):
        if set(states) != {'on', 'off'}:
            rows.append({'flag': flag, 'verdict': 'MISSING'})
            failed += 1; print('%-24s MISSING one half' % flag); continue
        kind = 'live' if particles.get('fx_%s_on' % flag) == 'live' else 'frozen'
        noise_mad, mask = base[kind] if base[kind] else (0.0, None)
        w1, h1, on = load_rgb(states['on']); w2, h2, off = load_rgb(states['off'])
        if (w1, h1) != (w2, h2): sys.exit('size differs in pair ' + flag)
        if mask is not None and len(mask) != len(range(0, w1, args.step)) * len(range(0, h1, args.step)):
            sys.exit('baseline size differs from pair ' + flag)
        area, inside, count = pair_change(on, off, h1, args.step, mask)
        mad, share = mean_abs_diff(on, off, h1, args.step)
        noise_area = sum(mask) / len(mask) if mask else 0.0
        verdict = pair_verdict(area, args.min_area, noise_area); failed += verdict != 'PASS'
        rows.append({'flag': flag, 'particles': kind, 'changed_area': round(area, 6), 'changed_px': count * args.step * args.step,
                     'mean_diff_changed': round(inside, 2), 'noise_area': round(noise_area, 6),
                     'threshold': round(pair_threshold(args.min_area, noise_area), 6),
                     'mean_abs_diff': round(mad, 4), 'changed_share': round(share, 4), 'noise_floor': round(noise_mad, 4),
                     'verdict': verdict})
        print('%-20s area %6.3f%% (%7d px)  inside %5.1f  | old diff %6.3f noise %.3f (%s)  %s' % (
            flag, 100 * area, count * args.step * args.step, inside, mad, noise_mad, kind, verdict))
    if not rows: sys.exit('no fx_<flag>_on/off pairs in ' + folder)
    print('PASS needs changed_area >= %.3f%% + the baseline noise area, outside the noise mask' % (100 * args.min_area))
    if args.pairs_csv: write_csv(args.pairs_csv, PAIR_COLS, rows)
    return failed


def write_csv(path, cols, rows):
    with open(path, 'w', newline='') as fh:
        wr = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore'); wr.writeheader()
        for r in rows: wr.writerow({k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()})
    print('wrote ' + path)


def parse_band(text):
    lo, hi = (float(v) for v in text.split(','))
    if not 0.0 <= lo < hi <= 1.0: raise argparse.ArgumentTypeError('band is lo,hi with 0 <= lo < hi <= 1')
    return lo, hi


def main_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--csv'); ap.add_argument('--pairs', action='store_true'); ap.add_argument('--pairs-csv')
    ap.add_argument('--band', type=parse_band, default=(0.30, 0.65))
    ap.add_argument('--step', type=int, default=2, help='sample every Nth pixel and row (1 = every pixel)')
    ap.add_argument('--clip-max', type=float, default=0.15)
    ap.add_argument('--contrast'); ap.add_argument('--min-contrast', type=float, default=1.3)
    ap.add_argument('--min-area', type=float, default=0.0005, help='share of the frame a pair must change (0.0005 = 0.05%%)')
    args = ap.parse_args(argv)
    if args.step < 1: ap.error('--step must be 1 or more')
    return args


def main(argv=None):
    args = main_args(argv)
    failed = run_pairs(args) if args.pairs else run_stills(args)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
