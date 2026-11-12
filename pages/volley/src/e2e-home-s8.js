#!/usr/bin/env node
// Project Volley step 8 Home checks (AR2): Armory buyable slots + tab dots. Playwright, headless, phone touch, ?gpu=0&fresh=1.
// Usage: node src/e2e-home-s8.js [path/to/index.html]   (or VOLLEY_INDEX=/path/to/index.html)
// Point it at a built scratch copy (cp -r pages/volley SCRATCH; python3 src/build.py there). Never writes to the repo.
// Stills of failures: STILLS dir (default /mnt/project-files/games-proto/volley/v2/stills-s8/), file ar2-<name>.png.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const INDEX = process.argv[2] || process.env.VOLLEY_INDEX || path.join(__dirname, '..', 'index.html');
const STILLS = process.env.STILLS || '/mnt/project-files/games-proto/volley/v2/stills-s8/';
const SIZES = [[344, 882], [475, 638], [704, 783]];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rows = []; let tag = '';
function row(t, st, d) { rows.push({ tag, t, st, d }); console.log(`[${st}] ${tag} | ${t}${d ? ' | ' + d : ''}`); }

async function run() {
  if (!fs.existsSync(INDEX)) { console.log('index.html not found: ' + INDEX); process.exit(2); }
  try { fs.mkdirSync(STILLS, { recursive: true }); } catch (e) { /* mount may be read-only */ }
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'] });
  for (const [w, h] of SIZES) await session(browser, w, h, w === 344);
  await browser.close();
  const c = s => rows.filter(r => r.st === s).length;
  console.log(`\nTOTAL ${rows.length}: PASS ${c('PASS')}, FAIL ${c('FAIL')}, SKIP ${c('SKIP')}, INFO ${c('INFO')}`);
  process.exit(c('FAIL') ? 1 : 0);
}

async function session(browser, w, h, full) {
  tag = `${w}x${h}`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  const ok = async (c, t, d, still) => {
    row(t, c ? 'PASS' : 'FAIL', d);
    if (!c && still) { try { await page.screenshot({ path: path.join(STILLS, `ar2-${w}x${h}-${still}.png`) }); } catch (e) { /* ignore */ } }
  };
  const url = q => 'file://' + path.resolve(INDEX) + '?gpu=0&title=0&seed=777' + q;
  const boot = async q => {
    await page.goto(url(q));
    await page.waitForFunction(() => window.V && V.Meta && V.Home && V.Tabs && V.Home.current, null, { timeout: 20000 });
    await sleep(600);
  };
  const tapSel = async sel => {
    const c = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    if (!c) return false; await page.touchscreen.tap(c.x, c.y); return true;
  };
  const goTab = async id => { await tapSel(`.pv-tab[data-tab="${id}"]`); await sleep(350); };
  // set credits through the real save path (notifies listeners like a real change)
  const setCredits = n => page.evaluate(n => { V.Meta.state.credits = n; V.Meta.save(); }, n);
  const credits = () => page.evaluate(() => V.Meta.state.credits);
  const pip = id => page.evaluate(id => { const p = document.querySelector(`.pv-tab[data-tab="${id}"] .pv-pip`); return !!p && !p.hidden && getComputedStyle(p).display !== 'none'; }, id);
  const slotCell = id => page.evaluate(id => { const e = document.querySelector(`.ta-slot[data-id="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { w: r.width, h: r.height, txt: e.textContent.replace(/\s+/g, ' ').trim(), act: e.dataset.act, gear: e.classList.contains('is-gear'), tag: e.tagName, hit: !!at && e.contains(at), inView: r.bottom <= innerHeight && r.top >= 0 }; }, id);
  const buyBtn = () => page.evaluate(() => { const b = document.querySelector('.ta-buy'); return b ? { txt: b.textContent.trim(), dis: b.disabled || b.getAttribute('aria-disabled') === 'true', arming: b.classList.contains('is-arming') } : null; });

  try { await boot('&fresh=1'); } catch (e) { await ok(false, 'boot to Home', e.message.split('\n')[0]); await ctx.close(); return; }
  await ok(errors.length === 0, 'boots with 0 errors', errors.join(' | ') || 'none');
  const api = await page.evaluate(() => ({ slots: !!V.Meta.SLOTS, gl: typeof V.Meta.gearLevel, bs: typeof V.Meta.buySlot, sw: typeof V.Meta.slotWhy, items: typeof V.Meta.items }));
  await ok(api.slots && api.gl === 'function' && api.bs === 'function' && api.sw === 'function', 'META slot API present', JSON.stringify(api));
  if (!api.slots) { await ctx.close(); return; }

  // sample save (mid: 12480 credits), memory + saved
  await page.evaluate(() => { V.Meta.loadSample('mid', { save: true }); });
  const slots = await page.evaluate(() => V.Meta.SLOTS.map(s => ({ id: s.id, price: s.price })));
  const fmtP = n => n.toLocaleString('en-US');
  await goTab('armory');

  // ---- 1. locked cells ----
  for (const s of slots.filter(s => s.id !== 'perk2')) {
    const c = await slotCell(s.id);
    await ok(!!c && !c.gear && c.act === 'slot' && c.tag === 'BUTTON', `locked cell ${s.id} is a tappable button`, JSON.stringify(c), 'cell-' + s.id);
    if (c) {
      await ok(c.w >= 71.5 && c.h >= 71.5, `locked cell ${s.id} >= 72x72`, `${c.w.toFixed(1)}x${c.h.toFixed(1)}`, 'size-' + s.id);
      await ok(c.txt.includes(fmtP(s.price)), `locked cell ${s.id} shows price ${fmtP(s.price)}`, c.txt, 'price-' + s.id);
      await ok(c.hit, `locked cell ${s.id} centre hits the cell (not covered)`, `inView=${c.inView}`, 'hit-' + s.id);
    }
  }

  // ---- 2. dots (Armory tab selected) ----
  const dots = async (label, expUp, expArm, selected) => {
    const up = await pip('upgrades'), ar = await pip('armory');
    await ok(up === expUp, `${label}: Upgrades dot ${expUp ? 'on' : 'off'}`, `got ${up}`, 'dot-up-' + label.replace(/\W+/g, '_'));
    await ok(ar === expArm, `${label}: Armory dot ${expArm ? 'on' : 'off'}`, `got ${ar}`, 'dot-arm-' + label.replace(/\W+/g, '_'));
  };
  await page.evaluate(() => { V.Meta.state.credits = 12480; V.Meta.save(); });
  await goTab('armory');
  await dots('armory selected, rich', true, false);
  await goTab('upgrades');
  await dots('upgrades selected, rich', false, true);
  await goTab('deploy');
  await dots('deploy, rich', true, true);
  await setCredits(0); await sleep(100);
  await dots('deploy, 0 CR', false, false);
  await setCredits(850); await sleep(100);
  const basicAff = await page.evaluate(() => V.Meta.items().some(i => i.affordable));
  await dots('deploy, 850 CR (exo exactly)', basicAff && await page.evaluate(() => V.Meta.visitLeft() > 0), true);
  await setCredits(849); await sleep(100);
  await dots('deploy, 849 CR', await page.evaluate(() => V.Meta.items().some(i => i.affordable) && V.Meta.visitLeft() > 0), false);
  // rolls exhausted -> Upgrades dot off even when rich
  const spent = await page.evaluate(() => { const M = V.Meta; M.state.credits = 99999; M.save(); let n = 0; while (M.visitLeft() > 0 && n < 5) { const it = M.items().find(i => i.affordable); if (!it) break; if (!M.roll(it.kind, it.id, 'basic', {})) break; n++; } M.state.credits = 99999; M.save(); return { n, left: M.visitLeft() }; });
  await sleep(100);
  if (spent.left === 0) await dots('deploy, rolls 0, rich', false, true); else row('rolls-0 dot rule', 'SKIP', 'could not use up rolls: ' + JSON.stringify(spent));
  await page.evaluate(() => { V.Meta.loadSample('mid', { save: true }); });

  // sweep: the Upgrades dot must equal "rolls left and any item affordable at Basic" at every credit level (fresh save, Deploy tab)
  await page.evaluate(() => { V.Meta.loadSample('fresh', { save: false }); });
  await goTab('deploy');
  const bad = [];
  for (let cr = 0; cr <= 3000; cr += 25) {
    await setCredits(cr);
    const r = await page.evaluate(() => { const p = document.querySelector('.pv-tab[data-tab="upgrades"] .pv-pip'); return { dot: !!p && !p.hidden, exp: V.Meta.visitLeft() > 0 && V.Meta.items().some(i => i.affordable) }; });
    if (r.dot !== r.exp) bad.push(cr + ':' + (r.dot ? 'on' : 'off') + '!=' + r.exp);
  }
  await ok(bad.length === 0, 'sweep 0..3000 CR (121 steps): Upgrades dot follows items() affordable rule', bad.slice(0, 6).join(' ') || 'all match', 'dot-sweep');
  await page.evaluate(() => { V.Meta.loadSample('mid', { save: true }); });

  if (!full) { await ctx.close(); return; }

  // ---- 3. short credits ----
  await goTab('armory');
  await setCredits(750); await sleep(150);
  await tapSel('.ta-slot[data-id="exo"]'); await sleep(500);
  let b = await buyBtn();
  await ok(!!b, 'tap locked Exo cell opens Buy sheet', JSON.stringify(b), 'sheet-open');
  await ok(b && /Need 100 more CR/.test(b.txt) && b.dis, 'short: Buy disabled, "Need 100 more CR"', JSON.stringify(b), 'short-text');
  const cr0 = await credits();
  await tapSel('.ta-buy'); await sleep(700);
  await ok((await credits()) === cr0 && (await page.evaluate(() => V.Meta.gearLevel('exo'))) === 0, 'short: tapping Buy buys nothing', `credits ${cr0} -> ${await credits()}`, 'short-buy');
  await tapSel('.ta-notnow'); await sleep(400);
  await ok(!(await buyBtn()), 'Not now closes the sheet', '', 'notnow');

  // ---- 4. 350 ms arm guard ----
  await setCredits(5000); await sleep(150);
  const rolls0 = await page.evaluate(() => V.Meta.visitLeft());
  const t0 = Date.now();
  await tapSel('.ta-slot[data-id="exo"]');
  await sleep(40);
  await tapSel('.ta-buy');
  const dt = Date.now() - t0;
  await sleep(60);
  const early = { credits: await credits(), lvl: await page.evaluate(() => V.Meta.gearLevel('exo')) };
  await ok(dt < 330 && early.credits === 5000 && early.lvl === 0, 'arm guard: tap at ~' + dt + ' ms does nothing', JSON.stringify(early) + ' (tap at ' + dt + ' ms; must be < 350)', 'guard');
  if (dt >= 330) row('arm guard timing', 'INFO', 'harness too slow to hit the window: ' + dt + ' ms');

  // ---- 5. enough credits: buy once ----
  await sleep(450);
  b = await buyBtn();
  await ok(b && /Buy for 850 CR/.test(b.txt) && !b.dis, 'rich: "Buy for 850 CR" enabled after guard', JSON.stringify(b), 'rich-text');
  await tapSel('.ta-buy');
  await tapSel('.ta-buy');   // immediate second tap must not double-spend
  await sleep(1200);
  const after = await page.evaluate(() => ({ cr: V.Meta.state.credits, g: V.Meta.gearLevel('exo'), left: V.Meta.visitLeft(), purchases: (V.Meta.state.purchases || []).length }));
  await ok(after.cr === 5000 - 850, 'buy once: Credits drop by exactly 850 (no double spend)', `5000 -> ${after.cr}`, 'buy-credits');
  await ok(after.g === 1, 'V.Meta.gearLevel("exo") === 1', String(after.g), 'buy-level');
  await ok(after.left === rolls0, 'no roll used: visitLeft unchanged', `${rolls0} -> ${after.left}`, 'buy-roll');
  const doneTxt = await page.evaluate(() => { const s = document.querySelector('.ta-bsheet'); return s ? s.textContent.replace(/\s+/g, ' ').trim() : ''; });
  await ok(/Lv 1/.test(doneTxt) && /upgrade list/i.test(doneTxt), 'done card shows Lv 1 + "Now in your upgrade list"', doneTxt.slice(0, 120), 'done-card');
  await sleep(300);
  await tapSel('[data-act="bdone"]'); await sleep(500);
  await ok(!(await buyBtn()) && !(await page.evaluate(() => !!document.querySelector('.ta-bsheet'))), 'Done closes the card', '', 'done-close');
  const cell = await slotCell('exo');
  await ok(!!cell && cell.gear && /Lv 1/.test(cell.txt) && /Reactive Plate/.test(cell.txt), 'cell now shows Reactive Plate Lv 1', cell && cell.txt, 'cell-owned');
  await ok(!!cell && cell.w >= 71.5 && cell.h >= 71.5, 'owned cell still >= 72x72', cell && `${cell.w.toFixed(1)}x${cell.h.toFixed(1)}`, 'cell-owned-size');
  // owned cell opens the upgrade sheet when it exists
  const hasUp = await page.evaluate(() => !!(V.UpSheet && V.UpSheet.open));
  if (hasUp) {
    await page.evaluate(() => { window.__upCalls = []; const o = V.UpSheet.open; V.UpSheet.open = function (k, i) { window.__upCalls.push([k, i]); return o.apply(this, arguments); }; });
    await tapSel('.ta-slot[data-id="exo"]'); await sleep(500);
    const calls = await page.evaluate(() => window.__upCalls);
    await ok(calls.length === 1 && calls[0][0] === 'gear' && calls[0][1] === 'exo', 'owned gear cell calls V.UpSheet.open("gear","exo")', JSON.stringify(calls), 'owned-open');
  } else row('owned cell -> V.UpSheet.open', 'SKIP', 'V.UpSheet not present yet');
  // already-owned: a second buy attempt is refused by the model
  await ok((await page.evaluate(() => V.Meta.buySlot('exo'))) === false, 'buySlot on an owned slot is refused', '', 'owned-refuse');

  // ---- 6. persistence ----
  await page.evaluate(() => { document.querySelectorAll('.pv-scrim').forEach(e => e.remove()); });
  await boot('');   // no fresh=1: loads the save
  await goTab('armory');
  const re = await page.evaluate(() => ({ g: V.Meta.gearLevel('exo'), cr: V.Meta.state.credits }));
  const cell2 = await slotCell('exo');
  await ok(re.g === 1 && re.cr === 4150, 'after reload: gearLevel exo 1, credits 4150', JSON.stringify(re), 'reload-state');
  await ok(!!cell2 && cell2.gear && /Lv 1/.test(cell2.txt), 'after reload: Exo cell still owned (Lv 1)', cell2 && cell2.txt, 'reload-cell');
  const rest = await slotCell('modA');
  await ok(!!rest && !rest.gear, 'after reload: Module A still locked', rest && rest.txt, 'reload-locked');

  await ok(errors.length === 0, 'no page errors during the run', errors.join(' | ') || 'none');
  await ctx.close();
}

run().catch(e => { console.error(e); process.exit(2); });
