"""Build index.html: python3 pages/gravity-plumbline/src/inline.py"""
import os
H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(os.path.dirname(H), 'index.html')
shell = open(os.path.join(H, 'shell.html'), encoding='utf-8').read()
assert shell.count('<!--PARTS-->') == 1
js = '\n'.join('(function(){\n' + open(os.path.join(H, 'parts', p + '.js'), encoding='utf-8').read() + '\n})();' for p in 'core rooms tpl1 tpl2 camera tweak input draw meta audio ui'.split())
s = shell.replace('<!--PARTS-->', '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>')
head = ('<link rel="manifest" href="manifest.webmanifest">\n'
        '<meta name="theme-color" content="#1b1a17">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
reg = ("<script>if('serviceWorker' in navigator&&isSecureContext)"
       "addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.warn('sw',e)));"
       "try{screen.orientation&&screen.orientation.lock&&matchMedia('(display-mode: fullscreen)').matches&&screen.orientation.lock('portrait').catch(()=>{});}catch(_){}</script>\n")
assert s.count('</head>') == 1 and s.count('</body>') == 1
s = s.replace('</head>', head + '</head>').replace('</body>', reg + '</body>')
open(OUT, 'w', encoding='utf-8').write(s)
print('wrote', OUT, round(len(s.encode()) / 1e6, 2), 'MB')
