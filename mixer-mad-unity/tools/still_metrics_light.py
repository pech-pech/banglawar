#!/usr/bin/env python3
"""Lighting metrics for Mixer Mad 3D stills (L-MM-28, L-MM-29).

Usage: python3 still_metrics_light.py <png or dir> [...]

For each PNG it reports, inside the play band (rows 30.6%..64.8% of the height,
which is rows ~330-700 of a 1080p still):
  clip%    share of flat near-white pixels (min channel >= 230 and channel spread < 8).
           Target: under 15%.
  shade    contrast between lit snow and shaded snow: relative luminance of the 95th
           and the 10th percentile of snow-like pixels (low saturation, not dark),
           as (L1 + 0.05) / (L2 + 0.05). Target: at least 1.3.
  haze     dark-channel estimate: mean over 16x16 blocks of the darkest channel value,
           0..1. Clear air is near 0; fog lifts it. Compared before/after, not absolute.
  black    1st percentile luminance (0..255) of the whole frame. Near the navy line
           (#2a3550 ~ 52) means blacks are not washed out.

Reads 8-bit RGB/RGBA PNGs with any filter. Uses numpy when it is installed, plain
Python otherwise (slower). No other dependencies.
"""
import os
import struct
import sys
import zlib

try:
    import numpy as np
except ImportError:  # plain-Python fallback
    np = None

BAND_TOP, BAND_BOTTOM = 330 / 1080, 700 / 1080
CLIP_MIN, CLIP_SPREAD = 230, 8
BLOCK = 16


def read_png(path):
    """Return (width, height, channels, rows) with rows as a list of bytes objects (RGB or RGBA)."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path}: not a PNG")
    pos, idat, w = 8, [], None
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or ctype not in (2, 6) or interlace:
                raise ValueError(f"{path}: only 8-bit RGB/RGBA non-interlaced PNGs are supported")
            ch = 3 if ctype == 2 else 4
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
        pos += 12 + length
    if w is None:
        raise ValueError(f"{path}: no IHDR")
    raw = zlib.decompress(b"".join(idat))
    stride = w * ch
    rows, prev = [], bytearray(stride)
    for y in range(h):
        ft = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        unfilter(ft, line, prev, ch)
        rows.append(bytes(line))
        prev = line
    return w, h, ch, rows


def unfilter(ft, line, prev, bpp):
    n = len(line)
    if ft == 0:
        return
    if ft == 1:
        for i in range(bpp, n):
            line[i] = (line[i] + line[i - bpp]) & 255
    elif ft == 2:
        for i in range(n):
            line[i] = (line[i] + prev[i]) & 255
    elif ft == 3:
        for i in range(n):
            left = line[i - bpp] if i >= bpp else 0
            line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
    elif ft == 4:
        for i in range(n):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
            line[i] = (line[i] + pred) & 255
    else:
        raise ValueError(f"bad PNG filter {ft}")


def srgb_to_lin(v):
    v = v / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


LIN = [srgb_to_lin(i) for i in range(256)]


def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def metrics_numpy(w, h, ch, rows):
    img = np.frombuffer(b"".join(rows), dtype=np.uint8).reshape(h, w, ch)[:, :, :3].astype(np.int16)
    y0, y1 = int(h * BAND_TOP), int(h * BAND_BOTTOM)
    band = img[y0:y1]
    mn, mx = band.min(axis=2), band.max(axis=2)
    clip = float(((mn >= CLIP_MIN) & ((mx - mn) < CLIP_SPREAD)).mean())

    lut = np.array(LIN)
    lum = 0.2126 * lut[band[:, :, 0]] + 0.7152 * lut[band[:, :, 1]] + 0.0722 * lut[band[:, :, 2]]
    snowish = ((mx - mn) < 60) & (mx > 110)
    vals = lum[snowish]
    shade = ratio(np.percentile(vals, 95), np.percentile(vals, 10)) if vals.size > 100 else float("nan")

    dark = band.min(axis=2)
    bh, bw = dark.shape[0] // BLOCK, dark.shape[1] // BLOCK
    blocks = dark[:bh * BLOCK, :bw * BLOCK].reshape(bh, BLOCK, bw, BLOCK).min(axis=(1, 3))
    haze = float(blocks.mean()) / 255.0

    full = img
    lum8 = 0.2126 * full[:, :, 0] + 0.7152 * full[:, :, 1] + 0.0722 * full[:, :, 2]
    black = float(np.percentile(lum8, 1))
    return clip, shade, haze, black


def percentile(sorted_vals, q):
    if not sorted_vals:
        return float("nan")
    k = min(len(sorted_vals) - 1, max(0, int(round(q / 100.0 * (len(sorted_vals) - 1)))))
    return sorted_vals[k]


def metrics_plain(w, h, ch, rows):
    y0, y1 = int(h * BAND_TOP), int(h * BAND_BOTTOM)
    clip_n = total = 0
    snow_l, lum_all = [], []
    bw = w // BLOCK
    block_sum, block_n = 0, 0
    for by in range(y0, y1 - BLOCK + 1, BLOCK):
        mins = [255] * bw
        for y in range(by, by + BLOCK):
            r = rows[y]
            for x in range(w):
                o = x * ch
                cr, cg, cb = r[o], r[o + 1], r[o + 2]
                lo, hi = min(cr, cg, cb), max(cr, cg, cb)
                total += 1
                if lo >= CLIP_MIN and hi - lo < CLIP_SPREAD:
                    clip_n += 1
                if hi - lo < 60 and hi > 110:
                    snow_l.append(0.2126 * LIN[cr] + 0.7152 * LIN[cg] + 0.0722 * LIN[cb])
                bx = x // BLOCK
                if bx < bw and lo < mins[bx]:
                    mins[bx] = lo
        block_sum += sum(mins)
        block_n += bw
    for y in range(0, h, 4):
        r = rows[y]
        for x in range(0, w, 4):
            o = x * ch
            lum_all.append(0.2126 * r[o] + 0.7152 * r[o + 1] + 0.0722 * r[o + 2])
    snow_l.sort()
    lum_all.sort()
    shade = ratio(percentile(snow_l, 95), percentile(snow_l, 10)) if len(snow_l) > 100 else float("nan")
    return clip_n / max(1, total), shade, block_sum / max(1, block_n) / 255.0, percentile(lum_all, 1)


def measure(path):
    w, h, ch, rows = read_png(path)
    fn = metrics_numpy if np is not None else metrics_plain
    clip, shade, haze, black = fn(w, h, ch, rows)
    return {"file": os.path.basename(path), "size": f"{w}x{h}", "clip": clip, "shade": shade, "haze": haze, "black": black}


def main(args):
    if not args:
        print(__doc__)
        return 2
    paths = []
    for a in args:
        if os.path.isdir(a):
            paths += sorted(os.path.join(a, f) for f in os.listdir(a) if f.lower().endswith(".png"))
        else:
            paths.append(a)
    print(f"{'file':28} {'size':10} {'clip%':>7} {'shade':>6} {'haze':>6} {'black':>6}  verdict")
    worst = 0
    for p in paths:
        try:
            m = measure(p)
        except (OSError, ValueError, zlib.error) as e:
            print(f"{os.path.basename(p):28} ERROR {e}")
            worst = 1
            continue
        ok = m["clip"] < 0.15 and m["shade"] >= 1.3
        print(f"{m['file']:28} {m['size']:10} {m['clip'] * 100:6.1f}% {m['shade']:6.2f} {m['haze']:6.3f} {m['black']:6.1f}  {'ok' if ok else 'FAIL'}")
    return worst


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
