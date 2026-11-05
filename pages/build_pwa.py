"""Turn a single-file game build into the installable PWA page.
Usage: python3 pages/build_pwa.py <built-game.html> pages/hollow-blade/index.html"""
import sys
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
head = ('<link rel="manifest" href="manifest.webmanifest">\n'
        '<meta name="theme-color" content="#05060d">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
reg = ("<script>if('serviceWorker' in navigator&&isSecureContext)"
       "addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.warn('sw',e)));"
       "try{screen.orientation&&screen.orientation.lock&&matchMedia('(display-mode: fullscreen)').matches&&screen.orientation.lock('landscape').catch(()=>{});}catch(_){}</script>\n")
assert s.count('</head>') == 1 and s.count('</body>') == 1
s = s.replace('</head>', head + '</head>').replace('</body>', reg + '</body>')
open(out, 'w', encoding='utf-8').write(s)
print('wrote', out, round(len(s.encode()) / 1e6, 2), 'MB')
