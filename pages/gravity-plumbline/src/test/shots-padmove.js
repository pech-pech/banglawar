// node shots-padmove.js : 475x638 Fold cover shots of centre pad + top Retry (room 7 short, tutorial 1, left hand, pad side right). OUT env = folder.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = process.env.OUT || path.join(__dirname, '..', 'review', 'shots-padmove');
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  for (const [tag, mode, room, side, hand] of [['centre-room7', 'short', 7, 2, 'right'], ['centre-tutorial1', 'tutorial', 1, 2, 'right'], ['centre-lefthand', 'short', 7, 2, 'left'], ['side-right-room7', 'short', 7, 0, 'right']]) {
    const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?seed=1`);
    await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.scene, null, { timeout: 5000 });
    await page.evaluate(([mode, room, side, hand]) => { PL.Tweak.set('PAD_SIDE', side); PL.Input.setHand(hand); PL_TEST.startMode(mode, room); }, [mode, room, side, hand]);
    await sleep(1200); await page.screenshot({ path: path.join(OUT, tag + '.png') }); await ctx.close(); console.log('shot', tag);
  }
  await browser.close(); srv.close();
})();
