// ui-shots.js: Playwright renders every screen (ui-demo.html) at 3 viewports, DSF 2. Run: node src/test/ui-shots.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'review', 'shots-beta'); fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); } }); });
srv.listen(0, async () => {
  const port = srv.address().port, b = await chromium.launch(); let n = 0; const errs = [];
  const SCREENS = ['firstOpen', 'tutorial', 'menu', 'shaftPick', 'play', 'playZero', 'pause', 'pauseConfirm', 'death', 'roomClear', 'shaftComplete', 'settings', 'tweak'];
  for (const [w, h] of [[475, 638], [344, 882], [816, 568]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://localhost:' + port + '/test/ui-demo.html'); await p.evaluate(() => window.ready);
    const shot = async (name, scr, extra) => { await p.evaluate(([s, w, h, e]) => window.render(s, w, h, e), [scr, w, h, extra]); await p.screenshot({ path: path.join(out, `ui-${name}-${w}x${h}.png`) }); n++; };
    for (const s of SCREENS) await shot(s, s);
    await shot('playLeft', 'play', { leftHand: true });
    await shot('settingsText13', 'settings', { textScale: 1.3 });
    await shot('playText13', 'play', { textScale: 1.3, devTuned: true, tweakOn: true, artFallback: true });
    await shot('settingsScrolled', 'settings', { scroll: 200 });
    await p.close();
  }
  { const p = await b.newPage({ viewport: { width: 475, height: 700 }, deviceScaleFactor: 2 }); await p.goto('http://localhost:' + port + '/test/ui-demo.html'); await p.evaluate(() => window.ready);
    await p.evaluate(() => window.render('kit', 475, 700)); await p.screenshot({ path: path.join(out, 'ui-kit-sheet.png') }); n++; await p.close(); }
  console.log('ui-shots: ' + n + ' png, page errors ' + JSON.stringify(errs)); await b.close(); srv.close(); process.exit(errs.length ? 1 : 0);
});
