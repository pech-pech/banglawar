#!/usr/bin/env python3
"""Draws Squad Duel icons (192, 512, maskable 512). Run: python3 mkicons.py"""
import os
from PIL import Image, ImageDraw
here = os.path.dirname(os.path.abspath(__file__))
BG=(5,10,24); NAVY=(10,19,48); NEON=(44,240,255); GOLD=(255,200,58); HOME=(63,125,255); AWAY=(255,111,134)
def draw(size, safe):
    S=size*4; im=Image.new('RGB',(S,S),BG); d=ImageDraw.Draw(im)
    k=S*safe; o=(S-k)/2
    def p(x,y): return (o+x*k, o+y*k)
    d.rounded_rectangle([o,o,o+k,o+k], radius=k*0.18, fill=NAVY, outline=NEON, width=int(S*0.012))
    # pitch lines
    d.line([p(.5,.14),p(.5,.86)], fill=(60,110,200), width=int(S*0.01))
    d.ellipse([*p(.38,.38),*p(.62,.62)], outline=(60,110,200), width=int(S*0.01))
    # two duelling tokens and a ball
    d.ellipse([*p(.16,.34),*p(.44,.62)], fill=HOME, outline=NEON, width=int(S*0.012))
    d.ellipse([*p(.56,.34),*p(.84,.62)], fill=AWAY, outline=GOLD, width=int(S*0.012))
    d.ellipse([*p(.43,.70),*p(.57,.84)], fill=GOLD)
    # lightning-ish crown bar
    d.polygon([p(.30,.24),p(.40,.14),p(.50,.22),p(.60,.14),p(.70,.24)], fill=GOLD)
    return im.resize((size,size), Image.LANCZOS)
draw(192,.92).save(os.path.join(here,'icon-192.png'))
draw(512,.92).save(os.path.join(here,'icon-512.png'))
draw(512,.66).save(os.path.join(here,'icon-maskable-512.png'))
