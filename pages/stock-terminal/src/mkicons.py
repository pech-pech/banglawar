#!/usr/bin/env python3
"""Draw dark tile with blue X beside orange O. Writes icons next to the page folder."""
import os
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BG, X, O = (14, 19, 25, 255), (77, 163, 255, 255), (255, 159, 67, 255)
def draw(size, safe):
    S = size * 4
    im = Image.new('RGBA', (S, S), BG)
    d = ImageDraw.Draw(im)
    c = S / 2
    u = S * safe / 2          # half extent of content
    lw = int(u * .26)
    r = u * .5                # glyph half size
    cx1, cx2 = c - u * .5, c + u * .5
    d.line([cx1 - r, c - r, cx1 + r, c + r], fill=X, width=lw)
    d.line([cx1 - r, c + r, cx1 + r, c - r], fill=X, width=lw)
    d.ellipse([cx2 - r, c - r, cx2 + r, c + r], outline=O, width=lw)
    return im.resize((size, size), Image.LANCZOS)
for name, size, safe in (('icon-192.png', 192, .8), ('icon-512.png', 512, .8), ('icon-maskable-512.png', 512, .55)):
    draw(size, safe).convert('RGB').save(os.path.join(OUT, name))
    print('wrote', name)
