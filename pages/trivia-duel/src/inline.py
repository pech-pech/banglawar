#!/usr/bin/env python3
"""Build ../index.html from src files (header order). Fails loudly on a missing file."""
import os, sys
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, '..', 'index.html')
SCRIPTS = ['q-spells.js', 'q-creatures.js', 'q-places.js', 'engine.js', 'tweak.js', 'ui.js']
def rd(n):
    p = os.path.join(H, n)
    if not os.path.isfile(p):
        sys.exit('MISSING src file: ' + p)
    return open(p, encoding='utf-8').read()
shell = rd('shell.html')
for m in ('<!--STYLE-->', '<!--SCRIPTS-->'):
    if m not in shell: sys.exit('shell.html lacks marker ' + m)
style = '<style>\n' + rd('style.css') + '\n</style>'
scripts = '\n'.join('<script>\n' + rd(n).replace('</script', '<\\/script') + '\n</script>' for n in SCRIPTS)
head = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#16130f">\n'
        '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
sw = ('<script>if("serviceWorker"in navigator)addEventListener("load",function(){'
      'navigator.serviceWorker.register("sw.js").catch(function(){})});</script>\n')
html = shell.replace('<!--STYLE-->', head + style).replace('<!--SCRIPTS-->', scripts + '\n' + sw)
open(OUT, 'w', encoding='utf-8').write(html)
print('wrote %s (%.1f KB)' % (os.path.normpath(OUT), len(html.encode('utf-8')) / 1024))
