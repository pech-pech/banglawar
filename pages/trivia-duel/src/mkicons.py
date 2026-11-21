#!/usr/bin/env python3
"""Draw a wax seal with a candle. Writes icons next to the page folder."""
import os
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
def draw(size, safe):
    S = size * 4
    im = Image.new('RGBA', (S, S), (22, 19, 15, 255))
    d = ImageDraw.Draw(im)
    c = S / 2
    r = S * safe / 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=(138, 28, 28, 255))
    d.ellipse([c - r * .82, c - r * .82, c + r * .82, c + r * .82], outline=(176, 52, 44, 255), width=int(S * .014))
    w, h = r * .26, r * .72
    d.rounded_rectangle([c - w / 2, c - h * .25, c + w / 2, c + h * .6], radius=int(w * .2), fill=(240, 226, 190, 255))
    d.rectangle([c - w * .04, c - h * .38, c + w * .04, c - h * .25], fill=(40, 30, 20, 255))
    fx, fy = c, c - h * .62
    d.ellipse([fx - w * .42, fy - h * .02, fx + w * .42, fy + h * .36], fill=(255, 170, 40, 255))
    d.polygon([(fx, fy - h * .2), (fx - w * .34, fy + h * .2), (fx + w * .34, fy + h * .2)], fill=(255, 170, 40, 255))
    d.ellipse([fx - w * .17, fy + h * .06, fx + w * .17, fy + h * .34], fill=(255, 238, 160, 255))
    return im.resize((size, size), Image.LANCZOS)
for name, size, safe in (('icon-192.png', 192, .88), ('icon-512.png', 512, .88), ('icon-maskable-512.png', 512, .62)):
    draw(size, safe).convert('RGB').save(os.path.join(OUT, name))
    print('wrote', name)
