#!/usr/bin/env python3
"""Build ../index.html from src/index.src.html + JS modules (inlined in order).
Usage: python3 src/build.py [--allow-missing]"""
import sys, os, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'index.html')
FILES = ['sim.js', 'gen.js', 'report.js', 'tweak.js', 'audio.js', 'render.js', 'ui.js', 'game.js']
allow = '--allow-missing' in sys.argv
s = open(os.path.join(HERE, 'index.src.html'), encoding='utf-8').read()
parts = []
for f in FILES:
    p = os.path.join(HERE, f)
    if not os.path.exists(p):
        if allow:
            print('warning: missing', f, '(skipped)'); continue
        sys.exit('ERROR: missing source file src/%s (use --allow-missing to skip)' % f)
    js = open(p, encoding='utf-8').read().replace('</script', '<\\/script')
    parts.append('<script>\n/* %s */\n%s\n</script>\n' % (f, js))
assert s.count('<!--SRC-->') == 1, 'marker <!--SRC--> must appear exactly once'
assert s.count('</head>') == 1 and s.count('</body>') == 1
head = ('<link rel="manifest" href="manifest.webmanifest">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
reg = ("<script>if('serviceWorker' in navigator&&isSecureContext)"
       "addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.warn('sw',e)));"
       "try{screen.orientation&&screen.orientation.lock&&(matchMedia('(display-mode: fullscreen)').matches||matchMedia('(display-mode: standalone)').matches)&&screen.orientation.lock('portrait').catch(()=>{});}catch(_){}</script>\n")
s = s.replace('<!--SRC-->', ''.join(parts)).replace('</head>', head + '</head>').replace('</body>', reg + '</body>')
open(OUT, 'w', encoding='utf-8').write(s)
b = s.encode()
print('wrote', os.path.normpath(OUT), round(len(b) / 1e6, 3), 'MB', hashlib.md5(b).hexdigest()[:8])
