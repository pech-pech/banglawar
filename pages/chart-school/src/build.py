#!/usr/bin/env python3
"""Build ../index.html from src files (contract order). Fails loudly on a missing file."""
import os, sys
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, '..', 'index.html')
SCRIPTS = ['ui-kit.js', 'engine.js', 'store.js', 'tweak.js', 'chart.js', 'screens-a.js', 'screens-b.js', 'main.js']
def rd(n):
    p = os.path.join(H, n)
    if not os.path.isfile(p):
        sys.exit('MISSING src file: ' + p)
    return open(p, encoding='utf-8').read()
shell = rd('shell.html')
for m in ('<!--STYLE-->', '<!--SCRIPTS-->'):
    if m not in shell: sys.exit('shell.html lacks marker ' + m)
css = rd('pro.css') + '\n' + rd('style.css')
style = '<style>\n' + css + '\n</style>'
scripts = '\n'.join('<script>\n' + rd(n).replace('</script', '<\\/script') + '\n</script>' for n in SCRIPTS)
head = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#0b0e14">\n'
        '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
sw = ('<script>if("serviceWorker"in navigator)addEventListener("load",function(){'
      'navigator.serviceWorker.register("sw.js").catch(function(){})});</script>\n')
html = shell.replace('<!--STYLE-->', head + style).replace('<!--SCRIPTS-->', scripts + '\n' + sw)
open(OUT, 'w', encoding='utf-8').write(html)
print('wrote %s (%.1f KB)' % (os.path.normpath(OUT), len(html.encode('utf-8')) / 1024))
