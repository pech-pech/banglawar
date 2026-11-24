// Bad Trade Bazaar e2e (CONTRACT section 4). Run: node pages/bad-trade-bazaar/tools/e2e.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.execPath, '../../lib/node_modules/playwright'))); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); // pages/
const SHOTS = '/tmp/btb-e2e';
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
// Contract says ?tick=5; 5 ms would auto-run the whole 180 s run in about 1 s and race the test.
// admin default: use a huge tick so only __btb.step() drives time (still a ?tick override, DEV badge shows).
const URL = `http://127.0.0.1:${PORT}/bad-trade-bazaar/?tick=3600000`;

const results = [];
let failed = false;
async function step(name, fn) {
  try { await fn(); results.push([name, true, '']); console.log('PASS ' + name); }
  catch (e) { failed = true; const m = String(e && e.message || e).split('\n')[0]; results.push([name, false, m]); console.log('FAIL ' + name + ' :: ' + m); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

async function tap(page, sel) {
  const l = page.locator(sel).first();
  const b = await l.boundingBox();
  if (!b) throw new Error('no box for ' + sel);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.mouse.up();
}
const scr = (page) => page.evaluate(() => document.body.dataset.screen);
const activeCount = (page) => page.evaluate(() => document.querySelectorAll('#screen-start.active,#screen-run.active,#screen-end.active,#screen-slot.active').length);
const st = (page) => page.evaluate(() => window.__btb.getState());
const prof = (page) => page.evaluate(() => window.__btb.getProfile());

async function layoutCheck(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
    bw: document.body.scrollWidth, bh: document.body.scrollHeight, iw: innerWidth, ih: innerHeight }));
  ok(r.sw <= r.iw && r.bw <= r.iw, `${label}: horizontal scroll ${JSON.stringify(r)}`);
  ok(r.sh <= r.ih && r.bh <= r.ih, `${label}: vertical scroll ${JSON.stringify(r)}`);
}
async function fontCheck(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || r.width === 0 || r.height === 0) continue;
      let hidden = false;
      for (let a = el; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden') { hidden = true; break; } }
      if (hidden) continue;
      if (parseFloat(cs.fontSize) < 14) out.push(`${el.tagName}#${el.id}.${el.className} "${n.nodeValue.trim().slice(0, 20)}" ${cs.fontSize}`);
    }
    return out;
  });
  ok(!bad.length, `${label}: text < 14px: ${bad.slice(0, 4).join(' | ')}`);
}
async function buttonCheck(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('button,[role=button]')) {
      const cs = getComputedStyle(b), r = b.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
      let hidden = false;
      for (let a = b; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden') { hidden = true; break; } }
      if (hidden) continue;
      if (r.height < 55.5) out.push(`${b.tagName}#${b.id}.${b.className} h=${r.height.toFixed(1)}`);
    }
    return out;
  });
  ok(!bad.length, `${label}: buttons < 56px: ${bad.slice(0, 4).join(' | ')}`);
}

// Play the current run to its end through the UI: buy every flat stock, sell on a loss.
async function playRun(page, maxIter = 200) {
  for (let k = 0; k < maxIter; k++) {
    if ((await scr(page)) !== 'run') return;
    let bought = false;
    for (let i = 0; i < 3; i++) {
      const d = await page.evaluate((i) => { const t = document.querySelector('#tog-' + i); return { m: t.dataset.mode, l: t.dataset.loss }; }, i);
      if (d.m === 'buy') { await tap(page, '#tog-' + i); bought = true; }
      else if (d.m === 'sell' && d.l === '1') await tap(page, '#tog-' + i);
    }
    if (bought) await page.waitForTimeout(350); // buyLockMs
    await page.evaluate(() => window.__btb.step(1));
  }
  await page.evaluate(() => window.__btb.step(400));
}
async function fillSlots(page) {
  const p = await prof(page);
  for (let t = 0; t < 6; t++) {
    const n = Math.min(2, p.collection[t]);
    for (let k = 0; k < n; k++) {
      const sel = `#collection .coll-card[data-type="${t}"]`;
      if (!(await page.locator(sel).count())) break;
      const dis = await page.evaluate((s) => { const e = document.querySelector(s); return e.disabled || e.getAttribute('aria-disabled') === 'true' || e.classList.contains('disabled'); }, sel);
      if (dis) break;
      await tap(page, sel);
    }
  }
}

const browser = await chromium.launch();
const errors = [];
let page, ctx;
let spareFound = false;

try {
  ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await step('start: title + build id + one active screen', async () => {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('#title');
    ok((await page.textContent('#title')).includes('Bad Trade Bazaar'), 'title text');
    ok((await page.textContent('#build-id')).includes('btb-tune-1'), 'build id text');
    ok((await scr(page)) === 'start', 'body[data-screen]=start');
    ok((await activeCount(page)) === 1, 'exactly one .active screen');
    ok(await page.evaluate(() => !!(window.__btb && __btb.getState && __btb.getProfile && __btb.getConfig && __btb.step && __btb.report)), '__btb hooks');
  });

  await step('play -> run screen, HUD, rows', async () => {
    await tap(page, '#btn-play');
    await page.waitForFunction(() => document.body.dataset.screen === 'run', null, { timeout: 3000 });
    ok((await activeCount(page)) === 1, 'one active screen');
    ok(/^\d+:\d\d$/.test((await page.textContent('#hud-timer')).trim()), 'hud-timer m:ss');
    ok((await page.textContent('#hud-cash')).trim().length > 0, 'hud-cash');
    for (let i = 0; i < 3; i++) ok(await page.locator(`#row-${i} .stock-name`).count() && await page.locator(`#row-${i} canvas.spark`).count() && await page.locator('#tog-' + i).count(), 'row ' + i);
    ok((await page.locator('#build-strip .slot').count()) === 3, '3 .slot in build strip');
    ok((await page.getAttribute('#tog-0', 'data-mode')) === 'buy', 'tog-0 starts as buy');
  });

  await step('buy row 0 -> toggle becomes sell, held shown', async () => {
    await tap(page, '#tog-0');
    await page.waitForFunction(() => document.querySelector('#tog-0').dataset.mode === 'sell', null, { timeout: 2000 });
    ok((await st(page)).pos[0] !== null, 'state.pos[0] set');
    ok(/SELL/.test(await page.textContent('#tog-0')), 'face says SELL');
  });

  await step('shots: run 344x882', async () => { await page.screenshot({ path: SHOTS + '/run-344x882.png' }); });

  await step('step until sell preview is a loss (data-loss=1), face has minus + chip SCAR', async () => {
    let hit = false;
    for (let k = 0; k < 170; k++) {
      await page.evaluate(() => window.__btb.step(1));
      if ((await scr(page)) !== 'run') break;
      if ((await page.getAttribute('#tog-0', 'data-loss')) === '1') { hit = true; break; }
    }
    ok(hit, 'no loss on row 0 within the run (state t=' + (await st(page)).t + ')');
    const face = await page.textContent('#tog-0');
    ok(/SELL/.test(face) && /[−-]\$/.test(face), 'loss face text: ' + face.trim());
    const chip = (await page.textContent('#tog-0 .chip')).trim();
    ok(/SCAR|SPARE/.test(chip), 'chip: ' + chip);
  });

  await step('sell -> tray card appears, toast shows', async () => {
    await page.waitForTimeout(350);
    await tap(page, '#tog-0');
    await page.waitForSelector('#tray .tray-card', { timeout: 2000 });
    ok((await page.getAttribute('#tog-0', 'data-mode')) === 'buy', 'toggle back to buy');
    const toast = await page.evaluate(() => { const t = document.querySelector('#toast'); return t ? { txt: t.textContent.trim(), vis: getComputedStyle(t).visibility !== 'hidden' && getComputedStyle(t).display !== 'none' } : null; });
    ok(toast && toast.txt.length > 0, 'toast empty');
    ok((await st(page)).drops.length >= 1, 'state.drops has a scar');
  });

  await step('run screen: layout, fonts >= 14px, buttons >= 56px', async () => {
    await layoutCheck(page, 'run 344x882');
    await fontCheck(page, 'run');
    await buttonCheck(page, 'run');
  });

  await step('step to end -> end screen with cash and scar card', async () => {
    await page.evaluate(() => window.__btb.step(400));
    await page.waitForFunction(() => document.body.dataset.screen === 'end', null, { timeout: 3000 });
    ok((await activeCount(page)) === 1, 'one active screen');
    ok(/→/.test(await page.textContent('#end-cash')), 'end-cash arrow: ' + (await page.textContent('#end-cash')).trim());
    ok((await page.locator('#end-scars .scar-card').count()) >= 1, 'no .scar-card in #end-scars');
    ok((await page.textContent('#end-pl')).trim().length > 0, 'end-pl');
    ok((await page.locator('#end-proto').count()) === 1, '#end-proto');
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOTS + '/end-344x882.png' });
    await layoutCheck(page, 'end 344x882');
    await fontCheck(page, 'end');
  });

  await step('reset run (tap 1) -> slot screen with collection', async () => {
    await page.waitForTimeout(700); // ui ignores end taps for 600 ms
    await tap(page, '#btn-reset-run');
    await page.waitForFunction(() => document.body.dataset.screen === 'slot', null, { timeout: 3000 });
    ok((await page.locator('#slots .slot-big').count()) === 3, '3 .slot-big');
    ok((await page.locator('#collection .coll-card').count()) >= 1, '.coll-card present');
    ok((await page.locator('#spare-note').count()) === 1, '#spare-note');
    ok((await page.locator('#slot-effect').count()) === 1, '#slot-effect');
  });

  await step('slot a scar: tap card -> build filled', async () => {
    await fillSlots(page);
    await page.waitForTimeout(150);
    const b = (await prof(page)).build;
    ok(b.some(x => x !== null && x !== undefined), 'profile.build empty: ' + JSON.stringify(b));
    await page.screenshot({ path: SHOTS + '/slot-344x882.png' });
    await layoutCheck(page, 'slot 344x882');
    await fontCheck(page, 'slot');
  });

  await step('start run (tap 2) -> run screen shows slot filled', async () => {
    await tap(page, '#btn-start-run');
    await page.waitForFunction(() => document.body.dataset.screen === 'run', null, { timeout: 3000 });
    const s = await st(page);
    ok(s.build.some(x => x !== null && x !== undefined), 'state.build empty');
    const filled = await page.evaluate(() => [...document.querySelectorAll('#build-strip .slot')].filter(e => e.children.length || e.dataset.type !== undefined && e.dataset.type !== '' || /filled|full/.test(e.className) || e.textContent.trim()).length);
    ok(filled >= 1, 'no filled .slot in #build-strip');
  });

  await step('force a spare within 12 runs (scar dup of owned x2)', async () => {
    let runs = 0;
    // we are in run 2 now; play, check end, loop
    while (runs < 12) {
      runs++;
      await playRun(page);
      await page.waitForFunction(() => document.body.dataset.screen === 'end', null, { timeout: 3000 });
      const n = await page.locator('#end-scars .scar-card[data-spare="1"]').count();
      if (n > 0) { spareFound = true; break; }
      await page.waitForTimeout(700); // ui ignores end taps for 600 ms
    await tap(page, '#btn-reset-run');
      await page.waitForFunction(() => document.body.dataset.screen === 'slot', null, { timeout: 3000 });
      await fillSlots(page);
      await tap(page, '#btn-start-run');
      await page.waitForFunction(() => document.body.dataset.screen === 'run', null, { timeout: 3000 });
    }
    const p = await prof(page);
    console.log(`  spare loop: ${runs} extra runs, collection ${JSON.stringify(p.collection)}, spares per run ${JSON.stringify(p.runs.map(r => r.spares))}`);
    ok(spareFound, `no data-spare="1" card after ${runs} extra runs; collection ${JSON.stringify(p.collection)}`);
  });

  await step('spare: #spare-note shows +N on slot screen', async () => {
    ok(spareFound, 'skipped: no spare');
    await page.waitForTimeout(700); // ui ignores end taps for 600 ms
    await tap(page, '#btn-reset-run');
    await page.waitForFunction(() => document.body.dataset.screen === 'slot', null, { timeout: 3000 });
    const note = (await page.textContent('#spare-note')).trim();
    ok(/\+\s*\$?\s*\d+/.test(note), 'spare-note text: "' + note + '"');
    ok((await prof(page)).sparesNext > 0, 'profile.sparesNext = 0');
  });

  await step('report contains btb-tune-1 and Bad Trade Bazaar header', async () => {
    const r = await page.evaluate(() => window.__btb.report());
    ok(typeof r === 'string' && r.includes('btb-tune-1') && r.startsWith('Bad Trade Bazaar btb-tune-1 report'), 'report head: ' + String(r).slice(0, 60));
    ok(/PROTO/.test(r) && /run 1 seed/.test(r), 'report body lacks PROTO / run lines');
  });

  await step('settings: opens, Tweak rows present, change saleCut, dev badge', async () => {
    await tap(page, '#btn-settings-start').catch(() => {}); // not visible off start; fallback below
    if (!(await page.evaluate(() => getComputedStyle(document.querySelector('#settings')).display !== 'none' && document.querySelector('#settings').offsetHeight > 0))) {
      // gear lives on run screen; go there
      await tap(page, '#btn-start-run');
      await page.waitForFunction(() => document.body.dataset.screen === 'run', null, { timeout: 3000 });
      await tap(page, '#btn-settings');
    }
    await page.waitForFunction(() => document.querySelector('#settings').offsetHeight > 0, null, { timeout: 2000 });
    const inputs = await page.locator('#settings-body input').count();
    ok(inputs >= 25, `Tweak inputs found: ${inputs} (expect >= 25)`);
    ok((await page.locator('#btn-copy-report-settings').count()) === 1, '#btn-copy-report-settings');
    const before = await page.evaluate(() => window.__btb.getConfig().saleCut);
    // find the saleCut input: smallest element whose text mentions it, nearest ancestor with a number input
    const done = await page.evaluate(() => {
      const body = document.querySelector('#settings-body');
      const all = [...body.querySelectorAll('*')].filter(e => /sale\s*_?cut/i.test(e.textContent) && !/pUp|lossLine/i.test(e.textContent));
      all.sort((a, b) => a.textContent.length - b.textContent.length);
      for (const e of all) {
        const inp = (e.matches('input') ? e : e.querySelector('input[type=number],input:not([type=checkbox])')) || e.parentElement?.querySelector('input[type=number]');
        if (inp) { const v = 0.03; inp.focus(); inp.value = String(v); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.blur(); return true; }
      }
      return false;
    });
    ok(done, 'saleCut input not found in #settings-body');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__btb.getConfig().saleCut);
    ok(after === 0.03 && after !== before, `saleCut ${before} -> ${after}`);
    await page.screenshot({ path: SHOTS + '/settings-344x882.png' });
    await fontCheck(page, 'settings');
    await tap(page, '#btn-settings-close');
    await page.waitForFunction(() => document.querySelector('#settings').offsetHeight === 0 || getComputedStyle(document.querySelector('#settings')).display === 'none', null, { timeout: 2000 });
    ok(await page.locator('#dev-badge').isVisible(), '#dev-badge not visible');
  });

  await step('settings: toggle sameMarkets, report shows markets: same', async () => {
    const open = () => page.evaluate(() => document.querySelector('#settings').offsetHeight > 0);
    if (!(await open())) {
      await tap(page, '#btn-settings').catch(() => {});
      if (!(await open())) await tap(page, '#btn-settings-start').catch(() => {});
    }
    await page.waitForFunction(() => document.querySelector('#settings').offsetHeight > 0, null, { timeout: 2000 });
    ok((await page.evaluate(() => window.__btb.report())).includes('markets: fresh'), 'report should start with markets: fresh');
    await page.evaluate(() => document.querySelector('#tw-sameMarkets').scrollIntoView());
    await tap(page, '#tw-sameMarkets');
    await page.waitForTimeout(200);
    ok((await page.evaluate(() => window.__btb.getConfig().sameMarkets)) === true, 'sameMarkets not true after toggle');
    const r = await page.evaluate(() => window.__btb.report());
    ok(r.includes('markets: same'), 'report lacks markets: same: ' + r.slice(0, 160));
    await tap(page, '#tw-sameMarkets'); // restore
    await tap(page, '#btn-settings-close');
    await page.waitForFunction(() => document.querySelector('#settings').offsetHeight === 0 || getComputedStyle(document.querySelector('#settings')).display === 'none', null, { timeout: 2000 });
  });

  await step('no console errors / page errors', async () => { ok(!errors.length, errors.slice(0, 3).join(' | ')); });
  await ctx.close();

  // 475x638
  ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  const errs2 = [];
  page.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
  page.on('pageerror', e => errs2.push(e.message));
  await step('475x638: run screen no scroll + screenshot', async () => {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('#btn-play');
    await tap(page, '#btn-play');
    await page.waitForFunction(() => document.body.dataset.screen === 'run', null, { timeout: 3000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: SHOTS + '/run-475x638.png' });
    await layoutCheck(page, 'run 475x638');
  });
  await step('475x638: end + slot no scroll', async () => {
    await tap(page, '#tog-0'); await page.waitForTimeout(350);
    for (let k = 0; k < 170; k++) { await page.evaluate(() => window.__btb.step(1)); if ((await page.getAttribute('#tog-0', 'data-loss')) === '1') break; }
    await tap(page, '#tog-0');
    await page.evaluate(() => window.__btb.step(400));
    await page.waitForFunction(() => document.body.dataset.screen === 'end', null, { timeout: 3000 });
    await page.waitForTimeout(500);
    await layoutCheck(page, 'end 475x638');
    await page.waitForTimeout(700); // ui ignores end taps for 600 ms
    await tap(page, '#btn-reset-run');
    await page.waitForFunction(() => document.body.dataset.screen === 'slot', null, { timeout: 3000 });
    await fillSlots(page);
    await layoutCheck(page, 'slot 475x638');
  });
  await step('475x638: no console errors', async () => { ok(!errs2.length, errs2.slice(0, 3).join(' | ')); });
} catch (e) {
  failed = true; console.log('FATAL ' + e.message);
} finally {
  await browser.close().catch(() => {});
  server.close();
}

console.log('\nSUMMARY');
for (const [n, p, m] of results) console.log((p ? 'PASS ' : 'FAIL ') + n + (p ? '' : ' :: ' + m));
console.log(`screenshots: ${SHOTS}/`);
process.exit(failed || results.some(r => !r[1]) ? 1 : 0);
