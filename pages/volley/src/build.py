"""Build Project Volley into one installable PWA page.
Usage: python3 pages/volley/src/build.py
Inlines <script src="parts/x.js"></script> from src/game.html, adds the PWA head and
service worker registration (portrait game: no landscape lock), writes ../index.html,
and (re)generates the icons with stdlib only."""
import re, os, struct, zlib
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

def inline(src):
    s = open(src, encoding='utf-8').read()
    def rep(mo):
        fp = os.path.join(HERE, mo.group(1))
        if not os.path.exists(fp):          # home parts written by other agents may not exist yet
            print('WARN missing part', mo.group(1)); return '<script>/* missing ' + mo.group(1) + ' */</script>'
        js = open(fp, encoding='utf-8').read()
        assert '</script' not in js.lower(), mo.group(1)
        return '<script>\n' + js + '\n</script>'
    s = re.sub(r'<script\s+src="(parts/[\w-]+\.js)"\s*></script>', rep, s)
    assert 'src="parts/' not in s, 'unresolved parts script tag'
    return s

def assets(s):
    """Single offline file: every webp in src/assets/ is embedded as a data URI in V.ASSETS (key = file name),
    and src/home.css is inlined. No asset files ship next to index.html, so sw.js needs no change for them."""
    import base64, glob
    m = {}
    for f in sorted(glob.glob(os.path.join(HERE, 'assets', '*.webp'))):
        m[os.path.basename(f)[:-5]] = 'data:image/webp;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
    import json
    al = []
    for alias, k in (('P-02', 'portrait'), ('P-05', 'rifle'), ('P-08', 'coin'), ('R-10', 'operator'), ('R-01', 'keyart'), ('R-07', 'shield-cell'), ('key-art-card', 'keyart')):
        if k in m: al.append("V.ASSETS['%s']=V.ASSETS['%s'];" % (alias, k))   # design-thread ids, no duplicated data
    js = 'window.V=window.V||{};V.ASSETS=' + json.dumps(m) + ';' + ''.join(al)
    assert '/*{{assets}}*/' in s and '/*{{home.css}}*/' in s
    s = s.replace('/*{{assets}}*/', js)
    css = open(os.path.join(HERE, 'home.css'), encoding='utf-8').read()
    return s.replace('/*{{home.css}}*/', css)

def pwa(s):
    head = ('<link rel="manifest" href="manifest.webmanifest">\n'
            '<meta name="theme-color" content="#1b1a17">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n'
            '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
    reg = ("<script>if('serviceWorker' in navigator&&isSecureContext)"
           "addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.warn('sw',e)));"
           "try{screen.orientation&&screen.orientation.lock&&matchMedia('(display-mode: fullscreen)').matches&&screen.orientation.lock('portrait').catch(()=>{});}catch(_){}</script>\n")
    assert s.count('</head>') == 1 and s.count('</body>') == 1
    return s.replace('</head>', head + '</head>').replace('</body>', reg + '</body>')

def png(path, n, pad):
    """Dark square, cyan chevron + reticle ring. pad = fraction kept clear at each edge (maskable)."""
    bg, fg = (0x1b, 0x1a, 0x17), (0x3f, 0xd0, 0xe0)
    c = n / 2; r = n * (0.5 - pad)  # usable radius
    t = max(2.0, r * 0.11)          # stroke width
    def seg(px, py, ax, ay, bx, by):
        dx, dy = bx - ax, by - ay
        k = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return ((px - ax - k * dx) ** 2 + (py - ay - k * dy) ** 2) ** 0.5
    # chevron pointing up (north door), centred
    ax, ay = c - r * 0.42, c + r * 0.18
    tx, ty = c, c - r * 0.30
    bx, by = c + r * 0.42, c + r * 0.18
    ring = r * 0.82
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            px, py = x + 0.5, y + 0.5
            d = min(seg(px, py, ax, ay, tx, ty), seg(px, py, tx, ty, bx, by))
            dr = abs(((px - c) ** 2 + (py - c) ** 2) ** 0.5 - ring)
            # reticle ring with 4 gaps (at N/E/S/W)
            ang_gap = min(abs(px - c), abs(py - c)) < r * 0.14
            cov = max(0, min(1, t / 2 + 0.5 - d))
            if not ang_gap:
                cov = max(cov, max(0, min(1, t * 0.35 + 0.5 - dr)))
            row += bytes(round(bg[i] + (fg[i] - bg[i]) * cov) for i in range(3))
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', raw) + chunk(b'IEND', b''))
    open(path, 'wb').write(data)

if __name__ == '__main__':
    s = pwa(assets(inline(os.path.join(HERE, 'game.html'))))
    out = os.path.join(OUT, 'index.html')
    open(out, 'w', encoding='utf-8').write(s)
    print('wrote', out, round(len(s.encode()) / 1e3, 1), 'KB')
    for name, n, pad in (('icon-192.png', 192, 0.08), ('icon-512.png', 512, 0.08), ('icon-maskable-512.png', 512, 0.2)):
        png(os.path.join(OUT, name), n, pad)
    print('icons ok')
