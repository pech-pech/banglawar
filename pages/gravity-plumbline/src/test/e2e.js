// node e2e.js : playwright end-to-end on built index.html
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function suite(browser, port, W, H) {
  const tag = W + 'x' + H;
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    window.__copied = null;
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {}
  });
  const page = await context.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=1`);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.getState(), null, { timeout: 5000 });
  await sleep(300);
  const st = () => page.evaluate(() => { const s = PL_TEST.getState(); return { g: s.g, flips: s.flips, t: s.t, charges: s.charges, diveCd: s.diveCd, vx: s.vx, vy: s.vy, dead: s.dead, x: s.x, y: s.y }; });
  const stripY = Math.round(H * 0.8), topY = Math.round(H * 0.3), cx = Math.round(W / 2);
  // real pointer events via dispatch on canvas (pointer events; touch type to match phones)
  const ptr = (type, x, y, id = 1) => page.evaluate(([type, x, y, id]) => {
    const el = document.elementFromPoint(x, y) || document.querySelector('canvas');
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
  }, [type, x, y, id]);
  const swipe = async (x, y, dx, dy) => { await ptr('pointerdown', x, y); for (let i = 1; i <= 6; i++) { await ptr('pointermove', x + dx * i / 6, y + dy * i / 6); await sleep(10); } await ptr('pointerup', x + dx, y + dy); await sleep(120); };
  const tap = async (x, y) => { await ptr('pointerdown', x, y); await sleep(50); await ptr('pointerup', x, y); await sleep(120); };

  let a = await st();
  await swipe(cx, stripY, 90, 0);              // right
  let b = await st();
  ok(b.g === 1 && b.flips >= a.flips, `${tag} swipe in strip flips gravity to right (g=${b.g})`);
  await page.screenshot({ path: `/tmp/pl-shots/mid-${tag}.png` });
  // reset room for clean states
  await page.evaluate(() => PL_TEST.room(0));
  await sleep(200); a = await st();
  await swipe(cx, topY, 90, 0);
  b = await st();
  ok(b.g === a.g && b.flips === a.flips, `${tag} swipe in top 60% does NOT flip (g ${a.g}->${b.g})`);
  // dive tap: need diveCd after tap
  await page.evaluate(() => PL_TEST.room(0)); await sleep(200);
  a = await st();
  await tap(cx, stripY);
  b = await st();
  ok(b.diveCd > 0 || b.vy !== a.vy || b.vx !== a.vx, `${tag} tap dives (diveCd=${b.diveCd})`);
  // hold restart
  await swipe(cx, stripY, 0, 90); // make state differ
  const t1 = (await st()).t;
  await ptr('pointerdown', cx, stripY, 7); await sleep(750); await ptr('pointerup', cx, stripY, 7); await sleep(150);
  const t2 = (await st()).t;
  ok(t2 < t1 + 120 && (await st()).flips === 0, `${tag} 600ms hold restarts room (t ${t1}->${t2})`);
  // copy button
  const rect = await page.evaluate(() => { const v = { W: innerWidth, H: innerHeight }; return PL.BTN.copy(v); });
  const [bx, by, bw, bh] = Array.isArray(rect) ? rect : [rect.x, rect.y, rect.w, rect.h];
  ok(Math.round(bw) === 56 && Math.round(bh) === 56, `${tag} Copy button 56x56 (${bw}x${bh})`);
  await page.mouse.click(bx + bw / 2, by + bh / 2);
  await sleep(400);
  const rep = await page.evaluate(() => window.__copied || [...document.querySelectorAll('textarea')].map(t => t.value).join('\n'));
  ok(!!rep && /determinism (OK|FAIL|: no cleared)/.test(rep) && !/determinism FAIL/.test(rep), `${tag} report determinism line present, not FAIL (no room cleared by test, so 'determinism OK' literal needs a cleared room: ${/determinism OK/.test(rep||'')})`);
  ok(!!rep && /"?tick"?\s*[:=]/.test(rep) || /input log/i.test(rep || ''), `${tag} report contains input log`);
  ok(!!rep && /WebGPU output: NOT seen/.test(rep), `${tag} report has WebGPU line`);
  if (rep) fs.writeFileSync(`/tmp/pl-shots/report-${tag}.txt`, rep);
  await page.screenshot({ path: `/tmp/pl-shots/after-${tag}.png` });
  ok(errs.length === 0, `${tag} no console errors ${errs.slice(0, 3).join(' | ')}`);
  await context.close();
}
(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.log('FAIL index.html missing'); process.exit(2); }
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch();
  try { for (const [w, h] of [[344, 882], [475, 638]]) await suite(browser, port, w, h); }
  catch (e) { fails.push('exception ' + e.message); console.log('FAIL exception', e.stack); }
  await browser.close(); srv.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
