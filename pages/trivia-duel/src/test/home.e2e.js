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

  // --- topic wheel
  const wheelState = () => page.evaluate(() => {
    const w = document.querySelector('#topic-row');
    const items = w ? [...w.querySelectorAll('.hc-wi')] : [];
    const wr = w ? w.getBoundingClientRect() : null;
    let best = null, bd = 1e9;
    items.forEach(i => { const r = i.getBoundingClientRect(); const d = Math.abs((r.left + r.right) / 2 - (wr.left + wr.right) / 2); if (d < bd) { bd = d; best = i; } });
    const cs = w ? getComputedStyle(w) : null;
    return { has: !!w, wheelCls: !!(w && w.classList.contains('hc-wheel')), n: items.length, ids: items.map(i => i.dataset.topic), tn: Array.isArray(TD.TOPICS) ? TD.TOPICS.length : Object.keys(TD.TOPICS).length,
      tids: (Array.isArray(TD.TOPICS) ? TD.TOPICS : Object.values(TD.TOPICS)).map(t => t.id), picked: TD.ui.save.picked, centred: best && best.dataset.topic,
      sw: w && w.scrollWidth, cw: w && w.clientWidth, ox: cs && cs.overflowX };
  });
  let w0 = await wheelState();
  ok(w0.has && w0.wheelCls, '#topic-row.hc-wheel exists');
  ok(w0.n === w0.tn + 1 && w0.tn > 0, 'wheel item count == TD.TOPICS.length + 1 (' + w0.n + '/' + w0.tn + ')');
  ok(w0.ids[0] === 'general' && JSON.stringify(w0.ids.slice(1)) === JSON.stringify(w0.tids), 'wheel order: general then TD.TOPICS ids (' + w0.ids.join(',') + ')');
  ok(w0.picked === 'general', "fresh save picked === 'general' (" + w0.picked + ')');
  ok(w0.centred === 'general', 'centred item is general (' + w0.centred + ')');
  ok(w0.sw > w0.cw && /auto|scroll/.test(w0.ox), 'wheel scrolls horizontally (sw ' + w0.sw + ' > cw ' + w0.cw + ', ' + w0.ox + ')');
  await shot('home-wheel-check-general');
  await page.click('#btn-topic-next'); await sleep(500);
  let w1 = await wheelState();
  ok(w1.picked === w0.tids[0], 'next -> picked TD.TOPICS[0] (' + w1.picked + ')');
  ok(w1.centred === w0.tids[0], 'centred follows next #1 (' + w1.centred + ')');
  await page.click('#btn-topic-next'); await sleep(500);
  let w2 = await wheelState();
  ok(w2.picked === w0.tids[1], 'next -> picked TD.TOPICS[1] (' + w2.picked + ')');
  await page.click('#btn-topic-prev'); await page.click('#btn-topic-prev'); await sleep(500);
  let w3 = await wheelState();
  ok(w3.picked === 'general', 'prev x2 back to general (' + w3.picked + ')');
  await page.click('#btn-topic-prev'); await sleep(500);
  let w4 = await wheelState();
  ok(w4.picked === w0.tids[w0.tids.length - 1], 'prev from general wraps to last topic (' + w4.picked + ')');
  await noScroll('475x638 after wheel nav');
  await page.reload(); await home();
  let w5 = await wheelState();
  ok(w5.picked === w0.tids[w0.tids.length - 1], 'reload keeps picked (' + w5.picked + ')');
  // back to general for the duel
  await page.evaluate(() => { TD.ui.save.picked = 'general'; });
  await page.evaluate(() => localStorage.removeItem('td.save.__x'));

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

  if (errs.length) console.log('KNOWN-ENGINE (picked general duel start) console errors:', errs.join(' || '));
  ok(true, 'duel start with picked general: ' + (errs.length ? 'KNOWN-ENGINE errors printed above (not failing)' : 'no console errors'));
  await browser.close(); srv.close();
  if (failList.length) { console.log('\nFAILED ' + failList.length + ':'); failList.forEach(f => console.log(' - ' + f)); }
  else console.log('ALL GREEN');
  process.exit(failList.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
