"""Import the FINAL art from openart/final/ into src/assets/ (run once; the build then reads only src/assets).
PIL/stdlib only. Each file is copied with the EXIF/XMP/ICC/C2PA (content credentials) metadata chunks stripped at the RIFF level (no re-encode, no quality loss).
Usage: python3 pages/volley/src/tools/optimize-assets.py
Left out by design call: key-art-fold, icon-helmet-192, icon-coin-192, icon-rifle-rot30-192."""
import os, struct
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(os.path.dirname(HERE), 'assets')
FINAL = '/mnt/project-files/games-design/archero-type/2026-11-10-art-menus/openart/final/'
MAP = {   # V.ASSETS key: final file
  'keyart':   'key-art-card.webp',                   # Deploy card, 328x216 css
  'portrait': 'portrait-operator-344x460.webp',      # Operator panel, 172x230 css
  'portrait-kneesup': 'portrait-operator-kneesup-344.webp',   # results header 72x96, Armory rack 104x174
  'coin':     'icon-coin-64.webp',                   # chips 16-20 css
  'rifle':    'icon-rifle-192.webp',                 # drawn only at 48 css px and up
  'shield-cell': 'icon-shield-cell-192.webp',        # R-07, embedded, no slot uses it yet
  'operator': 'icon-operator-tab-192.webp',          # run log header 40, empty state 96
  'cog':      'icon-upgrades-cog-192.webp',          # Upgrades price panel 40
}
def strip(b):
    assert b[:4] == b'RIFF' and b[8:12] == b'WEBP'
    out = b[12:]; i = 12; keep = []; vp8x = None
    while i < len(b):
        tag = b[i:i + 4]; n = struct.unpack('<I', b[i + 4:i + 8])[0]; body = b[i + 8:i + 8 + n]; pad = n & 1
        if tag in (b'EXIF', b'XMP ', b'ICCP', b'C2PA'): pass
        else:
            if tag == b'VP8X': body = bytes([body[0] & ~(0x08 | 0x04 | 0x20)]) + body[1:]
            keep.append(tag + struct.pack('<I', n) + body + (b'\0' if pad else b''))
        i += 8 + n + pad
    data = b'WEBP' + b''.join(keep)
    return b'RIFF' + struct.pack('<I', len(data)) + data
os.makedirs(OUT, exist_ok=True); total = 0
for f in os.listdir(OUT):
    if f.endswith('.webp'): os.remove(os.path.join(OUT, f))
from PIL import Image
for key, fn in MAP.items():
    b = open(FINAL + fn, 'rb').read(); s = strip(b)
    dst = os.path.join(OUT, key + '.webp'); open(dst, 'wb').write(s)
    im = Image.open(dst); im.load(); total += len(s)
    print('%-16s %6d B (was %d)  %s %s' % (key, len(s), len(b), im.size, im.mode))
print('total', total, 'B', round(total / 1024, 1), 'KB')
