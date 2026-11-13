"""Code-drawn app icons for the installable page (no art spend). Palette from kit/palette.js.
Run from pages/cricket-sixes: python3 tools/make-icons.py  -> icon-192.png, icon-512.png, icon-maskable-512.png"""
from PIL import Image, ImageDraw

BG = (0x1C, 0x2A, 0x22)
G1, G2, G3 = (0x7E, 0xB2, 0x61), (0x62, 0x97, 0x53), (0x40, 0x73, 0x49)
PITCH, PITCH2 = (0xD5, 0xC7, 0x9D), (0xB0, 0x9C, 0x70)
CREAM = (0xF3, 0xEB, 0xD3)
WOOD, WOOD2, GRIP = (0xD9, 0xB0, 0x78), (0x75, 0x59, 0x40), (0x2A, 0x22, 0x38)
BALL, BALL2 = (0xBD, 0x52, 0x60), (0x7E, 0x3E, 0x3A)


def draw(safe=False):
    """32x32 pixel icon. safe=True shrinks the art into the maskable safe circle (inner 80%)."""
    n = 32
    im = Image.new('RGB', (n, n), BG)
    d = ImageDraw.Draw(im)
    m = 4 if safe else 1
    d.ellipse([m, m, n - 1 - m, n - 1 - m], fill=G3)                     # ground
    d.ellipse([m + 1, m + 1, n - 2 - m, n - 2 - m], fill=G2)
    d.ellipse([m + 5, m + 5, n - 6 - m, n - 6 - m], fill=G1)             # infield
    d.rectangle([14, m + 6, 17, n - 7 - m], fill=PITCH)                   # pitch strip
    d.line([14, m + 9, 17, m + 9], fill=PITCH2)                           # creases
    d.line([14, n - 10 - m, 17, n - 10 - m], fill=PITCH2)
    for x in (14, 16):                                                    # stumps
        d.line([x, m + 6, x, m + 8], fill=CREAM)
    k = 1 if safe else 0
    # bat: blade from bottom-left up to the right, then the dark grip
    for i in range(9):
        x, y = 7 + i + k, 23 - i - k
        d.rectangle([x, y - 1, x + 2, y + 1], fill=WOOD)
        d.point((x, y + 2), fill=WOOD2)
    d.line([18 + k, 13 - k, 21 + k, 10 - k], fill=GRIP, width=2)
    # ball with seam
    bx, by = 20 - k, 19 - k
    d.rectangle([bx, by, bx + 3, by + 3], fill=BALL)
    d.point((bx, by), fill=G1); d.point((bx + 3, by + 3), fill=G1)
    d.line([bx, by + 2, bx + 2, by], fill=CREAM)
    d.point((bx + 3, by + 1), fill=BALL2)
    return im


for name, size, safe in (('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)):
    draw(safe=safe).resize((size, size), Image.NEAREST).save(name, optimize=True)
    print('wrote', name)
