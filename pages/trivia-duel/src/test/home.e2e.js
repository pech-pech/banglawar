// Playwright e2e for the Candle Duel home redesign (td-home-1), written against BUILD-CONTRACT.md.
// Run from /home/user/banglawar after `python3 pages/trivia-duel/src/inline.py`:
//   node pages/trivia-duel/src/test/home.e2e.js
const { chromium } = require('playwright');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const failList = [];
function ok(c, m) { if (!c) { failList.push(m); console.log('FAIL', m); } else console.log('ok  ', m); }
function freePort() { return new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

(async () => {
  const port = await freePort();
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, path.normalize(p));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(port, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + port + '/index.html';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const home = async () => { await page.waitForSelector('#scr-home.active'); await sleep(250); };

  async function noScroll(label) {
    const m = await page.evaluate(() => {
      const s = document.querySelector('#scr-home'), d = document.documentElement;
      return { sh: s.scrollHeight, ch: s.clientHeight, dh: d.scrollHeight, ih: innerHeight, bh: document.body.scrollHeight };
    });
    ok(m.sh <= m.ch + 1 && m.dh <= m.ih + 1 && m.bh <= m.ih + 1, 'home no vertical scroll ' + label + ' ' + JSON.stringify(m));
  }

  await page.goto(url);
  await home();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await home();

  // --- 475x638 baseline
  await noScroll('475x638');
  await shot('home-475');

  // gender button position
  const pos = await page.evaluate(() => {
    const g = document.querySelector('#btn-gender'), n = document.querySelector('#in-name');
    if (!g || !n) return null;
    const a = g.getBoundingClientRect(), b = n.getBoundingClientRect();
    return { gx: a.left, nx: b.left, nr: b.right, gcy: a.top + a.height / 2, ncy: b.top + b.height / 2, nh: b.height };
  });
  ok(!!pos, '#btn-gender and #in-name exist');
  if (pos) {
    ok(pos.gx > pos.nx && pos.gx >= pos.nr - 2, '#btn-gender right of #in-name ' + JSON.stringify(pos));
    ok(Math.abs(pos.gcy - pos.ncy) <= Math.max(pos.nh, 40), '#btn-gender same row as #in-name');
  }

  // --- gender toggle
  const g0 = await page.evaluate(() => ({ g: document.querySelector('#btn-gender').dataset.g, al: document.querySelector('#btn-gender').getAttribute('aria-label'), src: (document.querySelector('#home-pav img') || {}).src || '' }));
  ok(g0.g === 'b', 'default data-g is b (' + g0.g + ')');
  const rival0 = (await page.textContent('#home-rival-name') || '').trim();
  ok(rival0.length > 0, '#home-rival-name non-empty (' + rival0 + ')');
  await page.click('#btn-gender');
  await sleep(250);
  const g1 = await page.evaluate(() => ({ g: document.querySelector('#btn-gender').dataset.g, al: document.querySelector('#btn-gender').getAttribute('aria-label'), src: (document.querySelector('#home-pav img') || {}).src || '' }));
  ok(g1.g === 'g', 'tap flips data-g b->g (' + g1.g + ')');
  ok(g1.al !== g0.al && !!g1.al, 'aria-label changed ' + g0.al + ' -> ' + g1.al);
  ok(/-g\.webp/.test(g1.src), '#home-pav img src contains -g.webp (' + g1.src + ')');
  const rival1 = (await page.textContent('#home-rival-name') || '').trim();
  ok(rival1 === rival0, 'rival name unchanged by gender toggle (' + rival0 + ' / ' + rival1 + ')');
  const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('td.save')).gender; } catch (e) { return 'ERR'; } });
  ok(saved === 'g', 'localStorage td.save.gender === g (' + saved + ')');
  await shot('home-475-girl');

  // --- seal tap changes avatar seal digit
  const sealOf = () => page.evaluate(() => { const i = document.querySelector('#home-pav img'); const m = i && /player-(\d)-/.exec(i.src); return m ? m[1] : null; });
  const sealsN = await page.evaluate(() => document.querySelectorAll('#scr-home .hc-gem').length);
  ok(sealsN === 4, '4 seal gems (' + sealsN + ')');
  await page.click('#scr-home .hc-gem[data-i="1"]'); await sleep(200);
  const s1 = await sealOf();
  await page.click('#scr-home .hc-gem[data-i="3"]'); await sleep(200);
  const s3 = await sealOf();
  ok(s1 === '1' && s3 === '3', 'seal tap changes avatar seal digit (1->' + s1 + ', 3->' + s3 + ')');

  // --- reload keeps girl
  await page.reload();
  await home();
  const g2 = await page.evaluate(() => ({ g: document.querySelector('#btn-gender').dataset.g, src: (document.querySelector('#home-pav img') || {}).src || '' }));
  ok(g2.g === 'g' && /-g\.webp/.test(g2.src), 'reload keeps girl (' + g2.g + ' ' + g2.src + ')');
  const rival2 = (await page.textContent('#home-rival-name') || '').trim();
  ok(rival2.length > 0, 'rival name present after reload (' + rival2 + ')');

  // --- topics
  const tc = await page.evaluate(() => ({ tiles: document.querySelectorAll('#topic-row .topic-tile').length, n: Array.isArray(TD.TOPICS) ? TD.TOPICS.length : Object.keys(TD.TOPICS).length }));
  ok(tc.tiles === tc.n && tc.n > 0, '#topic-row tile count == TD.TOPICS.length (' + tc.tiles + '/' + tc.n + ')');

  // --- images loaded
  await sleep(500);
  const imgs = await page.evaluate(() => [...document.querySelectorAll('#scr-home img')].map(i => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0, vis: !!i.offsetParent })));
  const broken = imgs.filter(i => !i.ok).map(i => i.src.replace(/^.*\/\/[^/]+\//, ''));
  ok(imgs.length > 0 && broken.length === 0, 'all ' + imgs.length + ' home <img> loaded; broken: ' + (broken.length ? broken.join(', ') : 'none'));

  // --- 344x882
  await page.setViewportSize({ width: 344, height: 882 });
  await sleep(300);
  await noScroll('344x882');
  await shot('home-344');
  const over = await page.evaluate(() => { const w = document.documentElement.clientWidth; return document.documentElement.scrollWidth > w + 1; });
  ok(!over, 'no horizontal overflow at 344');
  await page.setViewportSize({ width: 475, height: 638 });
  await sleep(300);

  // --- play reaches duel (vs screen, as e2e.js)
  await page.click('#btn-play');
  let reached = true;
  try { await page.waitForSelector('#scr-vs.active', { timeout: 5000 }); } catch (e) { reached = false; }
  ok(reached, 'tap #btn-play reaches duel (#scr-vs.active)');
  if (reached) {
    let q = true;
    try { await page.waitForSelector('#scr-duel.active .btn-ans:not([disabled])', { timeout: 8000 }); } catch (e) { q = false; }
    ok(q, 'duel question screen shows answers');
  }

  ok(errs.length === 0, 'no console errors ' + errs.join(' || '));
  await browser.close(); srv.close();
  if (failList.length) { console.log('\nFAILED ' + failList.length + ':'); failList.forEach(f => console.log(' - ' + f)); }
  else console.log('ALL GREEN');
  process.exit(failList.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
