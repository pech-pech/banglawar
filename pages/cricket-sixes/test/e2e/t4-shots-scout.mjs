// T4 Scout wheel shots at 344x882 (dsf 2): ready, spinning (1.5 s after SPIN), glow (3.57 s after SPIN), result, plus 3x crops of the wheel (name overlap).
// Per result shot a sibling JSON: stop.sliceId, card name/grade, result text, computed styles (min font-size of visible wheel text / legend, tap target heights).
// Usage (from the app root):  node test/e2e/t4-shots-scout.mjs <outDir>
// Writes: t4-scout-ready.png, -spinning.png, -glow.png, -result.png, -ready-wheel3x.png, -result-wheel3x.png, -result.json
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = resolve(process.argv[2] || '') + '/';
if (!process.argv[2]) { console.error('usage: node test/e2e/t4-shots-scout.mjs <outDir>'); process.exit(2); }
await mkdir(OUT, { recursive: true });
const SEED = 't4-e2e';
const VP = { width: 344, height: 882 };
const { chromium } = createRequire(import.meta.url)('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const errs = [];
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage(); page.setDefaultTimeout(5000);
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
const wait = (ms) => page.waitForTimeout(Math.max(0, ms));
const ovState = () => page.evaluate(() => {
  const ov = document.querySelector('.wh-ov'); if (!ov) return null; const go = ov.querySelector('[data-go]'), r = ov.querySelector('[data-res]');
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
  return { go: go ? go.textContent.trim() : '', res: vis(r) ? r.innerText.trim() : '' };
});
async function tapGo(want) {
  const t0 = Date.now(); while (Date.now() - t0 < 8000) { const st = await ovState(); if (st && new RegExp('^' + want, 'i').test(st.go)) { await page.click('.wh-ov [data-go]'); return true; } await wait(60); }
  throw new Error('no ' + want + ' button');
}
async function crop3x(file) { // CDP clip at scale 3 on the wheel box
  const r = await page.evaluate(() => { const b = document.querySelector('.wh-ov .wh-wrap').getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height }; });
  const cdp = await ctx.newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 3 }, captureBeyondViewport: false });
  await writeFile(OUT + file, Buffer.from(data, 'base64')); await cdp.detach();
}
const styleDump = () => page.evaluate(() => {
  const ov = document.querySelector('.wh-ov'); const vis = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return !e.hidden && c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0 && r.width > 0 && r.height > 0; };
  const text = []; let min = null, minLegend = null;
  for (const e of ov.querySelectorAll('*')) {
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(''); if (!own || !vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize), row = { sel: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''), text: own.slice(0, 30), fontPx: fs };
    text.push(row); if (min === null || fs < min) min = fs;
    if (e.closest('[data-legend]') && (minLegend === null || fs < minLegend)) minLegend = fs;
  }
  const taps = [...ov.querySelectorAll('button, [role="button"], a[href], [data-go], input, [tabindex="0"]')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { label: (e.getAttribute('aria-label') || e.textContent || e.className).toString().trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; });
  const wrap = ov.querySelector('.wh-wrap'), wr = wrap && wrap.getBoundingClientRect();
  return { minFontPx: min, minLegendFontPx: minLegend, tapHeights: taps, minTapHeight: taps.length ? Math.min(...taps.map((t) => t.h)) : null, wheelBox: wr && { w: Math.round(wr.width), h: Math.round(wr.height) }, text };
});
const storeDump = () => page.evaluate(() => {
  const s = window.__store.get(), W = s.wheels || {}, stops = (W.stops && W.stops.scout) || {}, key = Object.keys(stops)[0], rec = key ? stops[key] : null, stop = rec && (rec.stops ? rec.stops[rec.stops.length - 1] : rec);
  const sp = s.scoutSpin || null, sid = stop ? stop.sliceId : sp && sp.sliceId, cards = (W.scoutCards && Object.values(W.scoutCards)[0]) || [];
  return { stop, sliceId: sid, card: cards[sid] || null, scoutSpin: sp };
});
const n = (s) => 't4-scout-' + s + '.png';
try {
  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED + 'scout')}`);
  await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600);
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await wait(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await wait(400); } }
  const r = await page.evaluate(() => {
    const S = window.__store; if (S.get().stage === 'freepick') S.dispatch('TakeFreePick', { what: 'stands' }); if (S.get().matchMode !== 'classic') S.dispatch('SetMatchMode', { mode: 'classic' });
    let g = 0; while (S.get().stage !== 'train' && g++ < 800) {
      const s = S.get(), d = (c, p) => S.dispatch(c, p);
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break; case 'coach': d('PassScout'); break;
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch', { mode: 'classic' }); if (S.get().stage === 'plan') d('StartMatch'); break;
        case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
        case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break;
        case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break; default: return 'stuck:' + s.stage;
      }
      if (S.get() === s) return 'stuck-no-change:' + S.get().stage;
    } return S.get().stage;
  });
  if (r !== 'train') throw new Error('cannot reach train: ' + r);
  if (!(await page.$('[data-scoutspin]'))) { await page.click('[data-ct="scout"]'); await wait(600); }
  if (!(await page.$('.wh-ov'))) { await page.click('[data-scoutspin]'); await wait(600); }
  await page.waitForSelector('.wh-ov'); await wait(800);
  await page.screenshot({ path: OUT + n('ready') }); await crop3x('t4-scout-ready-wheel3x.png');
  await tapGo('SPIN'); const t0 = Date.now();
  await wait(1500 - (Date.now() - t0)); await page.screenshot({ path: OUT + n('spinning') });
  await wait(3570 - (Date.now() - t0)); await page.screenshot({ path: OUT + n('glow') });
  const glowAt = Date.now() - t0, isGlow = await page.evaluate(() => !!document.querySelector('.wh-ov .is-glow'));
  await tapGo('STOP'); await wait(3500);
  await page.screenshot({ path: OUT + n('result') }); await crop3x('t4-scout-result-wheel3x.png');
  const res = await ovState(), st = await storeDump(), sd = await styleDump();
  await writeFile(OUT + 't4-scout-result.json', JSON.stringify({ sliceId: st.sliceId, stop: st.stop, card: st.card && { name: st.card.surname, grade: st.card.grade, focus: st.card.focus }, resultText: res && res.res, glowShotMs: glowAt, glowClassPresent: isGlow, computed: sd, scoutSpin: st.scoutSpin, errors: [...new Set(errs)] }, null, 2));
  console.log('sliceId', st.sliceId, 'card', JSON.stringify(st.card), 'result', JSON.stringify(res && res.res), 'minFont', sd.minFontPx, 'legend', sd.minLegendFontPx, 'minTap', sd.minTapHeight, 'glowAt', glowAt, 'is-glow', isGlow);
} catch (e) { console.error('ERR', e.message); process.exitCode = 1; }
console.log('errs', [...new Set(errs)].slice(0, 5));
await browser.close(); server.close();
