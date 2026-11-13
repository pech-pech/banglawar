"""Measure HUD edge contrast in a still: darkest-edge colour inside a box vs the median colour of a band just outside it.
Pure Python PNG reader (8-bit RGB/RGBA, non-interlaced). Usage: still_contrast.py <png> <name:x0,y0,x1,y1> ..."""
import sys, zlib, struct

def read_png(path):
    data = open(path, 'rb').read()
    pos, idat, w = 8, b'', 0
    while pos < len(data):
        ln, typ = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + ln]; pos += 12 + ln
        if typ == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', body[:10])
        elif typ == b'IDAT': idat += body
    ch = {2: 3, 6: 4}[ct]; raw = zlib.decompress(idat); stride = w * ch
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for x in range(stride):
            a = line[x - ch] if x >= ch else 0; b = prev[x]; c = prev[x - ch] if x >= ch else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    return w, h, ch, rows

def lum(px):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * c(px[0]) + 0.7152 * c(px[1]) + 0.0722 * c(px[2])

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

def main():
    w, h, ch, rows = read_png(sys.argv[1])
    get = lambda x, y: tuple(rows[y][x * ch:x * ch + 3])
    for spec in sys.argv[2:]:
        name, box = spec.split(':'); x0, y0, x1, y1 = map(int, box.split(','))
        inside = sorted((get(x, y) for y in range(y0, y1, 2) for x in range(x0, x1, 2)), key=lum)
        edge = inside[len(inside) // 50]
        band = []
        for d in range(4, 16, 2):
            for x in range(max(0, x0 - d), min(w, x1 + d), 3):
                for y in (y0 - d, y1 + d):
                    if 0 <= y < h: band.append(get(x, y))
            for y in range(max(0, y0 - d), min(h, y1 + d), 3):
                for x in (x0 - d, x1 + d):
                    if 0 <= x < w: band.append(get(x, y))
        band.sort(key=lum); bg = band[len(band) // 2]; bright = band[-len(band) // 20]
        print(f"{name}: edge #{bytes(edge).hex()} vs surround median #{bytes(bg).hex()} = {ratio(edge, bg):.2f}:1, vs brightest 5% #{bytes(bright).hex()} = {ratio(edge, bright):.2f}:1")

main()
