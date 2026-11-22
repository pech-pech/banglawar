// Playwright e2e for desktop/laptop layout (BUILD-CONTRACT ADDENDUM D).
// Run from /home/user/banglawar after `python3 pages/trivia-duel/src/inline.py`:
//   node pages/trivia-duel/src/test/desktop.e2e.js
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

  async function run(W, H, desktop) {
    const tag = W + 'x' + H;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    const shot = n => page.screenshot({ path: path.join(SHOTS, 'desk-' + n + '-' + W + '.png') });
    const home = async () => { await page.waitForSelector('#scr-home.active'); await sleep(300); };
    await page.goto(url); await home();
    await page.evaluate(() => localStorage.clear());
    await page.reload(); await home();

    // --- home layout (measure with a middle topic selected so both neighbours exist)
    if (desktop) { await page.click('#btn-topic-next').catch(() => {}); await sleep(500); }
    const m = await page.evaluate(() => {
      const s = document.querySelector('#scr-home'), d = document.documentElement;
      const R = e => { const x = document.querySelector(e); return x ? x.getBoundingClientRect() : null; };
      const pc = R('.hc-pcard'), wh = R('#topic-row');
      const w = document.querySelector('#topic-row');
      const items = w ? [...w.querySelectorAll('.hc-wi')] : [];
      const wr = w ? w.getBoundingClientRect() : null;
      const vis = wr ? items.filter(i => { const r = i.getBoundingClientRect(); const cx = (r.left + r.right) / 2; return r.width > 0 && cx > wr.left && cx < wr.right && r.left >= wr.left - 2 && r.right <= wr.right + 2; }).length : 0;
      const wv = wr ? items.filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.right > wr.left + 1 && r.left < wr.right - 1 && r.bottom > wr.top + 1 && r.top < wr.bottom - 1; }).length : 0;
      return { sh: s.scrollHeight, ch: s.clientHeight, dh: d.scrollHeight, ih: innerHeight, bh: document.body.scrollHeight,
        dw: d.scrollWidth, iw: innerWidth, pcx: pc && pc.left, pcr: pc && pc.right, whx: wh && wh.left, whr: wh && wh.right, pcw: pc && pc.width, vis, wv,
        picked: TD.ui.save.picked };
    });
    if (desktop) { await page.click('#btn-topic-prev').catch(() => {}); await sleep(400); }
    ok(m.sh <= m.ch + 1 && m.dh <= m.ih + 1 && m.bh <= m.ih + 1, tag + ' home no vertical scroll ' + JSON.stringify({ sh: m.sh, ch: m.ch, dh: m.dh, ih: m.ih, bh: m.bh }));
    ok(m.dw <= m.iw + 1, tag + ' home no horizontal overflow');
    if (desktop) {
      ok(m.pcx != null && m.whx != null && m.pcx < m.whx && m.pcr <= m.whx + 2, tag + ' pcard left of wheel (pcx ' + m.pcx + ', pcr ' + m.pcr + ', wheel x ' + m.whx + ')');
      ok(m.vis >= 3 || m.wv >= 3, tag + ' wheel shows >=3 items (fully ' + m.vis + ', partly ' + m.wv + ')');
    } else {
      ok(m.pcx != null && m.whx != null && !(m.pcr <= m.whx + 2 && m.pcx < m.whx && Math.abs(m.pcx - m.whx) > 60), tag + ' phone single column (pcx ' + m.pcx + ', wheel x ' + m.whx + ')');
    }
    await shot('home');
    if (!desktop) {
    }

    if (desktop) {
      // keyboard wheel
      const p0 = await page.evaluate(() => TD.ui.save.picked);
      await page.keyboard.press('ArrowRight'); await sleep(500);
      const p1 = await page.evaluate(() => TD.ui.save.picked);
      ok(p1 !== p0, tag + ' ArrowRight changes picked (' + p0 + ' -> ' + p1 + ')');
      await page.keyboard.press('ArrowLeft'); await sleep(500);
      const p2 = await page.evaluate(() => TD.ui.save.picked);
      ok(p2 === p0, tag + ' ArrowLeft returns picked (' + p2 + ')');
      ok(await page.evaluate(() => { const k = document.querySelector('.hc-keyhint'); return !!k && k.offsetParent !== null; }), tag + ' .hc-keyhint visible on desktop');
      // typing in name must not trigger
      await page.focus('#in-name');
      await page.keyboard.press('ArrowRight');
      await sleep(200);
      ok(await page.evaluate(() => TD.ui.save.picked) === p0, tag + ' ArrowRight ignored while #in-name focused');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
    }

    // --- start duel
    if (desktop) await page.keyboard.press('Enter'); else await page.click('#btn-play');
    let vs = true;
    try { await page.waitForSelector('#scr-vs.active', { timeout: 5000 }); } catch (e) { vs = false; }
    ok(vs, tag + (desktop ? ' Enter' : ' tap') + ' starts duel (#scr-vs.active)');
    if (!vs) { await ctx.close(); return; }
    await sleep(500); await shot('vs');
    const fit = async (sel, label) => {
      const r = await page.evaluate(s => { const d = document.documentElement; const e = document.querySelector(s); return { dh: d.scrollHeight, ih: innerHeight, sh: e.scrollHeight, ch: e.clientHeight }; }, sel);
      ok(r.dh <= r.ih + 1 && r.sh <= r.ch + 1, tag + ' ' + label + ' no scroll ' + JSON.stringify(r));
    };
    await fit('#scr-vs', 'vs');
    await page.waitForSelector('#scr-duel.active .btn-ans:not([disabled])', { timeout: 10000 });
    await sleep(500);
    await fit('#scr-duel', 'question');
    const lay = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#scr-duel .btn-ans')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect());
      const r = v => Math.round(v / 4) * 4;
      return { n: b.length, xs: [...new Set(b.map(x => r(x.left)))].length, ys: [...new Set(b.map(x => r(x.top)))].length, minH: Math.min(...b.map(x => x.height)) };
    });
    ok(lay.n === 4, tag + ' 4 answers visible (' + lay.n + ')');
    if (desktop) {
      ok(lay.xs === 2 && lay.ys === 2, tag + ' answers 2x2 grid ' + JSON.stringify(lay));
      ok(lay.minH >= 60, tag + ' answer min height >=60 (' + lay.minH + ')');
      ok(await page.evaluate(() => { const k = [...document.querySelectorAll('#scr-duel .hc-keyhint, #scr-duel [class*=keyhint]')]; return k.some(e => e.offsetParent !== null); }), tag + ' duel key hint visible');
    } else {
      ok(lay.xs === 1 && lay.ys === 4, tag + ' phone answers stacked ' + JSON.stringify(lay));
    }
    await shot('question');
    // answer: key '1' on desktop, click on phone
    const qn0 = await page.evaluate(() => document.querySelector('#q-num').textContent.trim());
    if (desktop) await page.keyboard.press('1'); else await page.click('#scr-duel .btn-ans[data-pos="0"]');
    let answered = true;
    try { await page.waitForSelector('#btn-next', { state: 'visible', timeout: 4000 }); } catch (e) { answered = false; }
    ok(answered, tag + (desktop ? " key '1'" : ' tap') + ' answers question (#btn-next visible)');
    await sleep(500);
    if (desktop) ok(await page.evaluate(() => document.querySelectorAll('#scr-duel .btn-ans[disabled], #scr-duel .btn-ans.correct, #scr-duel .btn-ans.wrong, #scr-duel .btn-ans.picked, #scr-duel .btn-ans.sel').length > 0), tag + " key '1' marked an answer");
    await fit('#scr-duel', 'reveal');
    await shot('reveal');

    // play through to results
    let wagerSeen = false, guard = 0;
    while (guard++ < 40) {
      const st = await page.evaluate(() => ({ res: !!document.querySelector('#scr-result.active'), wag: !!document.querySelector('#scr-wager.active'),
        nxt: (() => { const b = document.querySelector('#btn-next'); return !!b && b.offsetParent !== null; })(),
        ans: !!document.querySelector('#scr-duel.active .btn-ans:not([disabled])') }));
      if (st.res) break;
      if (st.wag) {
        if (!wagerSeen) { wagerSeen = true; await sleep(500); await fit('#scr-wager', 'wager'); await shot('wager'); }
        await sleep(300); await page.click('#btn-wager-go').catch(() => {}); await sleep(300); continue;
      }
      if (st.nxt) { await page.click('#btn-next').catch(() => {}); await sleep(250); continue; }
      if (st.ans) { if (desktop) await page.keyboard.press(String(1 + (guard % 4))); else await page.click('#scr-duel .btn-ans[data-pos="1"]').catch(() => {}); await sleep(250); continue; }
      await sleep(250);
    }
    let res = true;
    try { await page.waitForSelector('#scr-result.active', { timeout: 6000 }); } catch (e) { res = false; }
    ok(res, tag + ' reaches results');
    if (res) {
      await sleep(900);
      await fit('#scr-result', 'results');
      if (desktop) {
        const c = await page.evaluate(() => { const b = [...document.querySelectorAll('#res-cells .c')].map(e => e.getBoundingClientRect()); return { n: b.length, ys: [...new Set(b.map(x => Math.round(x.top / 8)))].length }; });
        ok(c.n === 7 && c.ys === 1, tag + ' results breakdown cells in one row ' + JSON.stringify(c));
      }
      await shot('results');
      if (desktop) {
        await page.keyboard.press('h'); // H = home
        let back = true; try { await page.waitForSelector('#scr-home.active', { timeout: 4000 }); } catch (e) { back = false; }
        ok(back, tag + " key 'H' returns home from results");
      }
    }
    ok(errs.length === 0, tag + ' no console errors' + (errs.length ? ': ' + errs.join(' || ') : ''));
    await ctx.close();
  }

  await run(1366, 768, true);
  await run(1920, 1080, true);
  await run(1024, 768, true); // must not break: no-scroll checks apply
  await run(475, 638, false);

  await browser.close(); srv.close();
  if (failList.length) { console.log('\nFAILED ' + failList.length + ':'); failList.forEach(f => console.log(' - ' + f)); }
  else console.log('ALL GREEN');
  process.exit(failList.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
