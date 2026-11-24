"""Build index.html: python3 pages/gravity-plumbline/src/inline.py"""
import os
H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(os.path.dirname(H), 'index.html')
shell = open(os.path.join(H, 'shell.html'), encoding='utf-8').read()
assert shell.count('<!--PARTS-->') == 1
# part order (join-beta, admin default). skin is optional: included only when parts/skin.js exists.
ORDER = 'core rooms tpl1 tpl2 camera tweak input assets light vfx skin draw meta audio music-data music strings uikit screens ui'.split()
PARTS = [p for p in ORDER if p != 'skin' or os.path.exists(os.path.join(H, 'parts', 'skin.js'))]
js = '\n'.join('(function(){\n' + open(os.path.join(H, 'parts', p + '.js'), encoding='utf-8').read() + '\n})();' for p in PARTS)
s = shell.replace('<!--PARTS-->', '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>')
head = ('<link rel="manifest" href="manifest.webmanifest">\n'
        '<meta name="theme-color" content="#232a5c">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n'
        '<meta name="pgs-build" content="__PGS_BUILD__">\n<script src="../_shared/update.js" defer></script>\n')
reg = ('<span data-pgs-build style="position:fixed;left:6px;bottom:calc(3px + env(safe-area-inset-bottom));font:10px system-ui,sans-serif;opacity:.6;color:#fff;pointer-events:none;z-index:6"></span>\n'
       "<script>try{screen.orientation&&screen.orientation.lock&&matchMedia('(display-mode: fullscreen)').matches&&screen.orientation.lock('portrait').catch(()=>{});}catch(_){}</script>\n")
assert s.count('</head>') == 1 and s.count('</body>') == 1
s = s.replace('</head>', head + '</head>').replace('</body>', reg + '</body>')
open(OUT, 'w', encoding='utf-8').write(s)
print('parts:', ' '.join(PARTS)); print('wrote', OUT, round(len(s.encode()) / 1e6, 2), 'MB')
