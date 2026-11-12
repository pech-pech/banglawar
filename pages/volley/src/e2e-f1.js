#!/usr/bin/env node
// Project Volley F1 + catch room browser checks (agent T). Playwright, headless, phone touch.
// Failing-first: every group first asks "is the feature's code in this build?" and prints
//   [SKIP] <tag> | <check> | feature not present
// until it lands, then runs for real at 344x882, 475x638 and 704x783.
// Usage (from pages/volley):
//   node src/e2e-f1.js [--game] [--only=shop,levelup,stack,deploy,prompts,title,catch,sheet,stress] [--size=344x882] [--out=/path/results.txt]
//   --game   test src/game.html directly (Home is unstyled there; Home/shop UI checks then use the API only)
//   default  builds a PRIVATE copy (build.py inline()+assets(), never the repo's index.html) into the scratch folder
// Also run by `node src/e2e.js` after its own sessions (use --no-f1 there to leave it out).
// Every number or field name marked ADAPT is a guess from CONTRACT.md / SPEC.md and is aligned to the owner's report when it lands.
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { chromium } = require('playwright');
const E = require('./e2e.js');
const { INIT, HELPERS, T, sleep, GPU_ARGS, SEED, SHOTS } = E;

const SRC = __dirname;
const SCRATCH = process.env.E2E_SCRATCH || '/tmp/claude-0/-home-user/5a341b30-1083-5daf-a1f7-388564b31c82/scratchpad/t-f1';
fs.mkdirSync(SCRATCH, { recursive: true });
const SIZES = [[344, 882], [475, 638], [704, 783]];
const argv = process.argv.slice(2);
const arg = k => (argv.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
const GROUPS = ['shop', 'feel', 'levelup', 'stack', 'deploy', 'prompts', 'title', 'catch', 'sheet', 'stress'];

const ok = (c, test, detail) => E.row(test, c ? 'PASS' : 'FAIL', detail);
const skip = (test, why) => E.row(test, 'SKIP', why || 'feature not present');
const info = (test, detail) => E.row(test, 'INFO', detail);

// ---------- private build ----------
function buildPrivate() {
  // Private copy of game.html: any parts/*.js that exists but has no <script> tag yet (new agent files before the integrator wires them) is
  // added just before parts/main.js, so the checks can run early. Once the integrator adds the tags this is a no-op. Never touches the repo's index.html.
  const gh = fs.readFileSync(path.join(SRC, 'game.html'), 'utf8');
  const have = new Set([...gh.matchAll(/<script\s+src="parts\/([\w-]+\.js)"/g)].map(m => m[1]));
  const extra = fs.readdirSync(path.join(SRC, 'parts')).filter(f => f.endsWith('.js') && !have.has(f));
  const tags = extra.map(f => `<script src="parts/${f}"></script>\n`).join('');
  const html = tags ? gh.replace('<script src="parts/main.js"></script>', tags + '<script src="parts/main.js"></script>') : gh;
  const tmp = path.join(SRC, '.e2e-f1-game.tmp.html');   // inline() resolves parts/ relative to src/; removed again right after the build
  fs.writeFileSync(tmp, html);
  const out = path.join(SCRATCH, 'index.html');
  const py = "import sys; sys.path.insert(0, '.'); import build; s = build.assets(build.inline(sys.argv[2])); open(sys.argv[1], 'w', encoding='utf-8').write(s)";
  try { cp.execFileSync('python3', ['-B', '-c', py, out, tmp], { cwd: SRC, stdio: 'pipe' }); } finally { try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
  if (extra.length) console.log('private build adds unwired parts: ' + extra.join(', '));
  return out;
}

// ---------- extra in-page helpers ----------
const F1H = () => {
  const P = () => window.__pv, V = () => window.V;
  const f = window.__f1 = {};
  f.src = re => [...document.scripts].some(s => re.test(s.textContent || ''));
  f.vis = el => window.__vis(el);
  f.btns = () => window.__targets();
  f.num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  // Run the real loop forward by hand until pred(S) is true. Clears rooms, walks to chest/door, takes the first card / supply.
  f.driveTo = (pred, cap) => {
    const p = P(); let n = 0, guard = 0;
    while (n < cap && guard++ < 4000) {
      const S = p.S;
      if (pred(S)) return { ok: true, n, stage: S.stage, phase: S.phase };
      if (S.phase === 'results' || S.phase === 'dead') return { ok: false, n, stage: S.stage, phase: S.phase };
      if (S.cards && S.cards.length && S.phase !== 'play') { p.pick(0); n++; continue; }
      if (S.phase === 'play') n += window.__clearRoom(300) || 1;
      else if (S.phase === 'clear') n += window.__toTarget(240) || 1;
      else if (S.phase === 'supply') { p.pickSupply(0); n++; }
      else { p.step(30, { mx: 0, my: 0 }); n += 30; }
    }
    return { ok: false, n, stage: P().S.stage, phase: P().S.phase };
  };
  // XP: put the hero exactly on the level-up edge, then run 2 sim steps.
  f.edge = () => { const S0 = P().S, h = S0.hero; S0.pickups.push({ x: h.x, y: h.y, kind: 'xp', v: h.xpNext - h.xp, life: 1e9 }); P().step(3, { mx: 0, my: 0 }); return P().S; };   // a real XP pickup under the hero, so the sim's own level-up path runs
  f.cardKeys = S => (S.cards || []).map(i => { const c = (V().CARDS || [])[i]; return c ? (c.key || c.id || c.name) : String(i); });
  f.cardBtns = () => { const els = [...document.querySelectorAll('.ov.on button, .ov.on .card, #lvlup button, [data-card]')].filter(window.__vis).filter(e => !/reroll|close|resume|pause|restart|home|tuning|sound/i.test((e.id || '') + ' ' + e.textContent + ' ' + (e.getAttribute('aria-label') || ''))); return [...new Set(els)].map(e => { const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, txt: e.textContent.trim().slice(0, 40) }; }); };
  f.rerollBtn = () => { const e = [...document.querySelectorAll('button,[role=button]')].filter(window.__vis).find(b => /reroll|re-roll|roll again/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '') + ' ' + b.id)); if (!e) return null; const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, txt: e.textContent.trim().slice(0, 40), disabled: !!(e.disabled || e.classList.contains('is-disabled') || e.classList.contains('is-dim') || e.getAttribute('aria-disabled') === 'true') }; };
  // ADAPT (G): where the banked reroll count lives. First numeric candidate wins.
  f.bank = () => { const S = P().S, m = (V().Meta && V().Meta.state) || {}; for (const v of [S.rerolls, S.reroll, S.rerollBank, S.bank, S.hero && S.hero.rerolls, m.rerolls, m.rerollBank]) if (typeof v === 'number') return v; return null; };
};

// ---------- opening a page ----------
async function open(browser, file, size, q, opt = {}) {
  const [w, h] = size;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.addInitScript(INIT);
  if (opt.init) await ctx.addInitScript(opt.init);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  const cdp = await ctx.newCDPSession(page);
  await page.goto('file://' + file + '?seed=' + SEED + '&gpu=0' + (opt.title || /(^|&)title=/.test(q || '') ? '' : '&title=0') + (/(^|&)chlen=/.test(q || '') ? '' : '&chlen=10') + (q ? '&' + q : ''));   // F1 (A): title=0 unless the check is about the title
  await page.waitForFunction(() => window.__pv && window.__pv.S && window.__pv.S.hero && window.V && window.V.Meta && window.V.Home, null, { timeout: 20000 });
  await page.evaluate(HELPERS); await page.evaluate(F1H);
  if (/game\.html$/.test(file)) await page.addStyleTag({ content: '#home:not(.on){display:none!important}' });
  await sleep(600);
  return { page, ctx, cdp, errors, w, h };
}
const shot = async (g, tag, name) => { try { await g.page.screenshot({ path: path.join(SHOTS, `f1-${tag}-${g.w}x${g.h}-${name}.png`), timeout: 8000 }); } catch (e) { /* best effort */ } };
const tapAt = async (g, x, y) => g.page.touchscreen.tap(x, y);
const setTune = (g, o) => g.page.evaluate(o => { window.__setTune(o); }, o);
const calm = g => g.page.evaluate(() => { window.__setTune({ AUTO_WALK: false, ENEMY_DMG_MULT: 0, FIRE_INTERVAL: 0.25 }); window.__pv.restart(); });
const has = (g, expr) => g.page.evaluate(expr);

// =====================================================================
// shop (agent P, step 8 rewrite by MT2): chosen upgrades. Upgrades tab -> UPGRADE -> bottom sheet (V.UpSheet) -> tier chips -> one tap -> reveal.
// API: V.Meta.quote(kind,id,tier,{catalyst}) / roll(...) (random buy is gone from the flow; buy() still works for old tests, not used here).
// Steps: Common 1, Rare 2, Epic 3. atk/rate give +2 levels per step, rifle/hp/gear +1. VISIT_MAX 2 rolls per visit; slot buys and Catalyst use no roll.
// =====================================================================
async function shopGroup(browser, file, size) {
  const g = await open(browser, file, size, '');   // no home=0: the real first launch (Home on Deploy)
  try {
    const present = await has(g, () => !!(window.V.Meta && window.V.Meta.quote && window.V.Meta.roll));
    const names = [
      'roll grants steps by grade: atk and rate +2 levels a step, rifle and HP +1; grade words and steps agree',
      'third roll in one Home visit is refused (2 rolls per visit); a refused roll spends nothing',
      'visit limit resets on a new Home visit',
      'starting a run (Deploy) resets the visit allowance',
      'maximum level: atk 20, rate 20, hp 10, rifle 10, gear 5; a roll at the cap is refused (why max)',
      'a roll at too few credits is refused with a price (why credits)',
      'purchase log records each roll (levels, visit, vn)',
      'tier prices = 1.2 / 1.6 / 2.0 x the next rungs, rounded to 25 (rifle L1 350/550/750, atk first 325/450/575, gear L1 350/550/750); odds 80/20/0, 48/44/8, 25/50/25',
      'overshoot refund: credits = before - price + min(floor25((steps - gained) x price / mult), floor25(price - price / mult)); level never above max',
      'buying a slot charges its price, adds the item at Lv 1, uses no roll',
      'Catalyst: refused under 100 Schematics or with 1 step left; never Common; 100 Schematics spent only when it lifted a Common, catUsed counts those',
      'maxed levels, gear, rolls and catUsed survive save and reload',
      'Upgrades tab: UPGRADE button >= 56 px, no overflow, opens the sheet; tab bar stays visible',
      'sheet content: item list (capped last, MAX), 3 tier chips with odds, Catalyst switch, "Upgrade for N CR" matches the quote',
      'one tap spends: confirm inside 350 ms of opening does nothing; after it, one tap rolls and shows the reveal (no second confirm)',
      'reveal: Done inside 350 ms of the card does not close; after it, the sheet returns with rolls left reduced',
      'tier chip tap changes the confirm price; an unaffordable tier is not selected and spends nothing',
      'Catalyst switch: off under 100 Schematics; on with 100+, odds show no Common, confirm spends 100 only if it lifted a Common',
      'a tap on the tab bar closes the sheet with no spend',
      'no rolls left: confirm says no rolls and does not spend; everything maxed: UPGRADE button is disabled',
      'sheet fits the screen with the tab bar visible; targets >= 56 px'
    ];
    if (!present) { names.forEach(n => skip(n)); return; }
    const uiOk = !/game\.html$/.test(file);
    const st = () => has(g, () => { const s = V.Meta.state; return { atk: s.cond.atk, rate: s.cond.rate, hp: s.cond.hp, rifle: s.rifle.lvl, cr: s.credits, vb: V.Meta.visitBuys, sch: s.schematics | 0, cu: s.catUsed | 0, rolls: s.rolls | 0, buys: s.buys, gear: Object.assign({}, s.gear || {}), left: V.Meta.visitLeft() }; });
    const KIND = { rifle: 'rifle', hp: 'cond', atk: 'cond', rate: 'cond', exo: 'gear', modA: 'gear', modB: 'gear', droneA: 'gear', droneB: 'gear', perk2: 'gear' };
    const roll = (id, tier = 'basic', cat = false) => g.page.evaluate(([id, tier, cat, kind]) => { try { const M = window.V.Meta; const q = M.quote(kind, id, tier, { catalyst: cat }); const r = M.roll(kind, id, tier, { catalyst: cat }); return r && r.ok ? Object.assign({ q }, { ok: true, grade: r.grade, steps: r.steps, gained: r.gained, refund: r.refund, price: r.price, lb: r.lvlBefore, la: r.lvlAfter, left: r.left, catalyst: r.catalyst }) : { ok: false, q }; } catch (e) { return { ok: false, err: e.message }; } }, [id, tier, cat, KIND[id]]);
    const quote = (id, tier = 'basic', cat = false) => g.page.evaluate(([id, tier, cat, kind]) => window.V.Meta.quote(kind, id, tier, { catalyst: cat }), [id, tier, cat, KIND[id]]);
    // A new Home visit = V.Meta.resetVisit() (called when a run starts). Quiet reset through the real hook.
    const newVisit = async () => { await g.page.evaluate(() => { V.Meta.resetVisit(); V.Home.show('upgrades'); }); await sleep(250); };
    const setS = fn => g.page.evaluate(`(${fn.toString()})()`);
    await g.page.evaluate(() => { V.Meta.state.credits = 900000; V.Meta.save(); });
    await newVisit();
    const GR = { common: 1, rare: 2, epic: 3 };
    // 1 + 2: first visit
    const a0 = await st();
    const ra = await roll('atk'); const a1 = await st();
    const rr = await roll('rate'); const a2 = await st();
    const rh = await roll('hp'); const a3 = await st();
    const per = { atk: 2, rate: 2 };
    ok(ra.ok && rr.ok && a1.atk === a0.atk + 2 * ra.gained && a2.rate === a1.rate + 2 * rr.gained && ra.steps === GR[ra.grade] && rr.steps === GR[rr.grade] && ra.gained === Math.min(ra.steps, ra.q.stepsLeft) && a1.buys === a0.buys + ra.gained, names[0], `atk ${a0.atk}->${a1.atk} (${ra.grade}, ${ra.steps} steps, price ${ra.price}); rate ${a1.rate}->${a2.rate} (${rr.grade}, ${rr.steps} steps); ladder counter ${a0.buys}->${a1.buys}`);
    ok(!rh.ok && rh.q.why === 'visit' && a3.hp === a2.hp && a3.cr === a2.cr, names[1], `hp roll ok=${rh.ok}, why=${rh.q && rh.q.why}; hp ${a2.hp}->${a3.hp}; credits ${a2.cr}->${a3.cr}; visitBuys=${a3.vb}`);
    await newVisit();
    const b0 = await st(); const rb1 = await roll('rifle'); const b1 = await st(); const rb2 = await roll('hp'); const b2 = await st(); const rx = await roll('rate'); const b3 = await st();
    ok(rb1.ok && rb2.ok && b1.rifle === b0.rifle + rb1.gained && b2.hp === b1.hp + rb2.gained && !rx.ok && b3.rate === b2.rate, names[2], `rifle ${b0.rifle}->${b1.rifle} (${rb1.grade}); hp ${b1.hp}->${b2.hp} (${rb2.grade}); a third roll ok=${rx.ok}; V.Meta.resetVisit() is the visit boundary`);
    await g.page.evaluate(() => { V.Meta.resetVisit(); }); await roll('hp'); await roll('hp'); const vA = await st();
    const dep = await g.page.evaluate(() => { try { V.Run.start(); V.Home.hide(); return true; } catch (e) { return e.message; } }); await sleep(300);
    const vB = await st();
    ok(dep === true && vA.vb === 2 && vB.vb === 0, names[3], `visitBuys ${vA.vb} -> ${vB.vb} after V.Run.start()`);
    await g.page.evaluate(() => { V.Home.show('upgrades'); }); await sleep(250);
    // 5: maxima, one item at a time
    const CAPS = { atk: 20, rate: 20, hp: 10, rifle: 10 };
    const res = [];
    for (const id of ['atk', 'rate', 'hp', 'rifle']) {
      const cap = CAPS[id];
      await g.page.evaluate(([id, v]) => { const s = V.Meta.state; s.credits = 900000; if (id === 'rifle') s.rifle.lvl = v; else s.cond[id] = v; s.buys = s.cond.hp + Math.ceil(s.cond.atk / 2) + Math.ceil(s.cond.rate / 2); V.Meta.save(); }, [id, cap - (id === 'atk' || id === 'rate' ? 2 : 1)]);
      await newVisit();
      const tier = 'std';
      const r1 = await roll(id, tier); const m1 = await st(); await newVisit(); const cr = m1.cr; const r2 = await roll(id, tier); const m2 = await st();
      const lv = id === 'rifle' ? m1.rifle : m1[id], lv2 = id === 'rifle' ? m2.rifle : m2[id];
      const mx = await g.page.evaluate(id => V.Meta.maxLevel(id === 'rifle' ? 'rifle' : 'cond', id), id);
      res.push({ id, ok: lv === cap && lv2 === cap && r1.ok && !r2.ok && r2.q.why === 'max' && m2.cr === cr && mx === cap, d: `${id}: -> ${lv} (${r1.grade}, gained ${r1.gained} of ${r1.steps}, refund ${r1.refund}) -> ${lv2}, second roll ok=${r2.ok} why=${r2.q && r2.q.why}, credits spent ${cr - m2.cr}, maxLevel ${mx}` });
    }
    await g.page.evaluate(() => { const s = V.Meta.state; s.credits = 900000; s.gear = { exo: 4, modA: 0, modB: 0, droneA: 0, droneB: 0, perk2: 0 }; V.Meta.save(); }); await newVisit();
    const gr1 = await roll('exo', 'std'); await newVisit(); const gcr = (await st()).cr; const gr2 = await roll('exo', 'std'); const gm = await st();
    res.push({ id: 'exo', ok: gm.gear.exo === 5 && gr1.ok && !gr2.ok && gr2.q.why === 'max' && gm.cr === gcr, d: `exo: 4 -> ${gm.gear.exo} (${gr1.grade}, gained ${gr1.gained}), second roll why=${gr2.q && gr2.q.why}, credits spent ${gcr - gm.cr}` });
    ok(res.every(r => r.ok), names[4], res.map(r => r.d).join('; '));
    // 6: too few credits
    await g.page.evaluate(() => { const s = V.Meta.state; s.credits = 0; s.cond = { hp: 0, atk: 0, rate: 0 }; s.rifle.lvl = 1; s.buys = 0; V.Meta.save(); });
    await newVisit();
    const z = await roll('atk'); const zs = await st();
    ok(!z.ok && z.q.why === 'credits' && z.q.price > 0 && zs.atk === 0 && zs.cr === 0, names[5], `ok=${z.ok} why=${z.q && z.q.why} price=${z.q && z.q.price} atk ${zs.atk} credits ${zs.cr}`);
    await g.page.evaluate(() => { V.Meta.state.credits = 324; V.Meta.save(); });
    const z2 = await quote('atk'); await g.page.evaluate(() => { V.Meta.state.credits = 325; V.Meta.save(); }); const z3 = await quote('atk');
    // 7: purchase log
    await g.page.evaluate(() => { V.Meta.state.credits = 900000; V.Meta.save(); });
    await newVisit(); await roll('atk');
    const pl = await has(g, () => { const p = V.Meta.state.purchases || []; const l = p[p.length - 1]; return l ? { n: p.length, keys: Object.keys(l), item: l.item, price: l.price, lvl: l.lvl } : null; });
    ok(!!pl && pl.n >= 1 && typeof pl.price === 'number' && pl.price > 0 && pl.keys.includes('levels') && pl.keys.includes('visit') && pl.keys.includes('vn'), names[6], pl ? `${pl.n} entries; last keys ${pl.keys.join(',')}; item ${pl.item} lvl ${pl.lvl} price ${pl.price}; edge: 324 CR -> why ${z2.why}, 325 CR -> why '${z3.why}'` : 'no purchases[]');
    // 8: tier prices (fresh ladder: rifle 350/550/750, atk 325/450/575, gear L1 350/550/750)
    await g.page.evaluate(() => { const s = V.Meta.state; s.credits = 900000; s.cond = { hp: 0, atk: 0, rate: 0 }; s.rifle.lvl = 1; s.buys = 0; s.gear = { exo: 1, modA: 0, modB: 0, droneA: 0, droneB: 0, perk2: 0 }; V.Meta.save(); }); await newVisit();
    const tp = {}; for (const id of ['rifle', 'atk', 'exo']) tp[id] = await Promise.all(['basic', 'std', 'prem'].map(t => quote(id, t)));
    const tierOk = id => { const [b, s, p] = tp[id]; const odd = [b, s, p].every(q => q.odds.reduce((x, y) => x + y, 0) === 100); const exp = { rifle: [350, 550, 750], atk: [325, 450, 575], exo: [350, 550, 750] }[id]; return odd && b.price < s.price && s.price < p.price && [b.price, s.price, p.price].join() === exp.join() && b.odds.join() === '80,20,0' && s.odds.join() === '48,44,8' && p.odds.join() === '25,50,25'; };
    ok(['rifle', 'atk', 'exo'].every(tierOk), names[7], ['rifle', 'atk', 'exo'].map(id => `${id} ${tp[id].map(q => q.price).join('/')}`).join('; ') + '; odds 80/20/0, 48/44/8, 25/50/25');
    // 9: overshoot refund. Gear L4 (1 step left): any Rare/Epic must refund. Loop rolls (the draw is seeded from the save, so vary credits) until both a Rare and an Epic or 80 tries.
    const refs = []; let bad = '';
    for (let i = 0; i < 80 && refs.length < 80; i++) {
      await g.page.evaluate(i => { const s = V.Meta.state; s.credits = 500000 + i * 37; s.gear = { exo: 4, modA: 0, modB: 0, droneA: 0, droneB: 0, perk2: 0 }; s.visitBuys = 0; V.Meta.save(); }, i);
      const tier = ['basic', 'std', 'prem'][i % 3]; const mult = { basic: 1.2, std: 1.6, prem: 2 }[tier];
      const c0 = (await st()).cr; const r = await roll('exo', tier); const c1 = (await st()).cr;
      const expRef = Math.min(Math.floor((r.steps - r.gained) * r.price / mult / 25) * 25, Math.floor((r.price - r.price / mult) / 25) * 25);   // design ruling 03:50: capped so the player pays at least one step
      if (!(r.ok && r.gained === 1 && r.refund === expRef && c1 === c0 - r.price + r.refund)) bad += ` [${tier} ${r.grade} price ${r.price} refund ${r.refund} exp ${expRef} credits ${c0}->${c1}]`;
      refs.push(r);
    }
    const withRef = refs.filter(r => r.refund > 0).length;
    ok(!bad && withRef >= 10 && refs.every(r => r.la === 5), names[8], `${refs.length} rolls at gear L4; ${withRef} paid a refund; max refund ${Math.max(...refs.map(r => r.refund))}; mismatches:${bad || ' none'}`);
    const over = refs.filter(r => r.refund > r.price);
    if (over.length) info('NOTE refund larger than the price paid (Standard Epic with 1 step left)', `${over.length} of ${refs.length} rolls: e.g. price ${over[0].price} refund ${over[0].refund} (net gain of Credits for rolling). SPEC-NUMBERS s4 formula; reported to MT.`);
    // 10: slot buy
    await g.page.evaluate(() => { const s = V.Meta.state; s.credits = 5000; s.gear = { exo: 0, modA: 0, modB: 0, droneA: 0, droneB: 0, perk2: 0 }; s.visitBuys = 0; V.Meta.save(); });
    const sl0 = await st(); const sb = await g.page.evaluate(() => { const M = V.Meta; return { why1: M.slotWhy('exo'), r: M.buySlot('exo'), why2: M.slotWhy('exo'), again: M.buySlot('exo'), lv: M.gearLevel('exo'), inList: M.items().some(x => x.kind === 'gear' && x.id === 'exo' && x.lvl === 1), cr: M.state.credits, vb: M.visitBuys, poor: (function(){ V.Meta.state.credits = 100; return V.Meta.slotWhy('modA') + '/' + V.Meta.buySlot('modA'); })() }; });
    const sl1 = { cr: sb.cr, vb: sb.vb };
    ok(sb.r && sb.r.price === 850 && sl1.cr === 5000 - 850 && sb.lv === 1 && sb.why1 === '' && sb.why2 === 'owned' && sb.again === false && sb.inList && sl1.vb === sl0.vb && sb.poor === 'credits/false', names[9], `exo 850 CR: credits ${sl0.cr}->${sl1.cr}; level ${sb.lv}; why '${sb.why1}' -> '${sb.why2}'; second buy ${sb.again}; in items() ${sb.inList}; visitBuys ${sl0.vb}->${sl1.vb}; poor: ${sb.poor}`);
    // 11: Catalyst
    await g.page.evaluate(() => { const s = V.Meta.state; s.credits = 900000; s.schematics = 99; s.catUsed = 0; s.cond = { hp: 0, atk: 0, rate: 0 }; s.buys = 0; s.visitBuys = 0; V.Meta.save(); });
    const cq1 = await quote('hp', 'basic', true), cn1 = await roll('hp', 'basic', true);
    // Ruling: Schematics are spent only when the plain roll was Common (lifted to Rare); on Rare/Epic nothing is spent (roll().catalyst false, catNotNeeded true).
    let allRare = true, sp = 0, lifted = 0, cwhy = ''; const cu0 = (await st()).cu;
    for (let i = 0; i < 14; i++) {
      await g.page.evaluate(i => { const s = V.Meta.state; s.visitBuys = 0; s.credits = 900000 + i; s.schematics = 1000; s.cond = { hp: 0, atk: 0, rate: 0 }; s.buys = 0; V.Meta.save(); }, i);
      const s0 = await st(); const r = await roll('hp', 'basic', true); const s1 = await st();
      const spent = s0.sch - s1.sch, want = r.catalyst ? 100 : 0;
      if (!r.ok || r.grade === 'common' || spent !== want || s1.cu !== s0.cu + (r.catalyst ? 1 : 0)) { allRare = false; cwhy += ` [#${i} ok=${r.ok} ${r.grade} cat=${r.catalyst} spent ${spent} catUsed ${s0.cu}->${s1.cu}]`; }
      sp += spent; if (r.catalyst) lifted++;
    }
    const cu1 = (await st()).cu;
    await g.page.evaluate(() => { const s = V.Meta.state; s.schematics = 500; s.gear = { exo: 4, modA: 0, modB: 0, droneA: 0, droneB: 0, perk2: 0 }; s.visitBuys = 0; V.Meta.save(); });
    const cl = await quote('exo', 'basic', true), cln = await roll('exo', 'basic', true); const cs2 = await st();
    ok(cq1.why === 'schematics' && !cn1.ok && allRare && lifted >= 1 && sp === 100 * lifted && cu1 === cu0 + lifted && cl.why === 'cat-last-step' && !cln.ok && cs2.sch === 500, names[10], `99 Schem: why ${cq1.why}, roll ok=${cn1.ok}; 14 Basic Catalyst rolls: never Common ${allRare}${cwhy}; Catalyst spent on ${lifted} (only where the plain roll was Common), ${sp} Schem, catUsed ${cu0}->${cu1}; 1 step left: why ${cl.why}, roll ok=${cln.ok}, Schem ${cs2.sch}`);
    // 12: reload survival (gear, rolls, catUsed, maxed)
    await g.page.evaluate(() => { const s = V.Meta.state; s.cond = { hp: 10, atk: 20, rate: 20 }; s.rifle.lvl = 10; s.buys = 30; s.gear = { exo: 5, modA: 3, modB: 0, droneA: 2, droneB: 1, perk2: 4 }; s.rolls = 41; s.catUsed = 6; V.Meta.save(); });
    await g.page.reload(); await g.page.waitForFunction(() => window.V && window.V.Meta && window.V.Home && window.__pv && window.__pv.S, null, { timeout: 20000 });
    await g.page.evaluate(HELPERS); await g.page.evaluate(F1H); await sleep(500);
    const rl = await st();
    ok(rl.atk === 20 && rl.rate === 20 && rl.hp === 10 && rl.rifle === 10 && rl.gear.exo === 5 && rl.gear.modA === 3 && rl.gear.perk2 === 4 && rl.rolls === 41 && rl.cu === 6, names[11], `after reload atk ${rl.atk} rate ${rl.rate} hp ${rl.hp} rifle ${rl.rifle}; gear ${JSON.stringify(rl.gear)}; rolls ${rl.rolls}; catUsed ${rl.cu}`);

    // ---------------- UI rows (private build only: the Home is unstyled in src/game.html) ----------------
    if (!uiOk) { names.slice(12).forEach(n => skip(n, 'src/game.html has the unstyled Home; the sheet checks run on the private build')); return; }
    if (!(await has(g, () => !!(window.V.UpSheet && window.V.UpSheet.open)))) { names.slice(12).forEach(n => skip(n, 'V.UpSheet not present in this build')); return; }
    const reset = async o => { await g.page.evaluate(o => { const s = V.Meta.state; s.credits = o.cr == null ? 5000 : o.cr; s.schematics = o.sch || 0; s.cond = Object.assign({ hp: 0, atk: 0, rate: 0 }, o.cond || {}); s.rifle.lvl = o.rifle || 1; s.buys = s.cond.hp + Math.ceil(s.cond.atk / 2) + Math.ceil(s.cond.rate / 2); s.gear = Object.assign({ exo: 0, modA: 0, modB: 0, droneA: 0, droneB: 0, perk2: 0 }, o.gear || {}); s.visitBuys = o.vb || 0; s.catUsed = 0; V.Meta.save(); V.Home.show('upgrades'); }, o); await sleep(350); };
    const rect = sel => g.page.evaluate(sel => { const e = document.querySelector(sel); if (!e || !window.__vis(e)) return null; const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, txt: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 80), dis: !!e.disabled || e.getAttribute('aria-disabled') === 'true' }; }, sel);
    const tap = async sel => { const r = await rect(sel); if (!r) return false; await tapAt(g, r.cx, r.cy); return true; };
    const sheetState = () => g.page.evaluate(() => ({ open: !!V.UpSheet.isOpen(), reveal: !!document.querySelector('.us-rv'), sheet: !!document.querySelector('.us-sheet'), go: (document.querySelector('.us-go .lbl') || {}).textContent || '', rows: [...document.querySelectorAll('.us-row')].map(r => ({ id: r.dataset.id, max: r.classList.contains('max'), sel: r.classList.contains('sel') })), tiers: [...document.querySelectorAll('.us-tier')].map(t => ({ id: t.dataset.tier, sel: t.classList.contains('sel'), no: t.classList.contains('no'), txt: t.textContent.replace(/\s+/g, ' ').trim() })), cat: (function(){ const c = document.querySelector('.us-cat'); return c ? { on: c.classList.contains('on'), off: c.classList.contains('off'), txt: c.textContent.replace(/\s+/g, ' ').trim() } : null; })() }));
    // 13: Upgrades tab
    await reset({ cr: 5000, cond: { hp: 2 } }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(500);
    const ub = await rect('[data-open="upgrade"]'); const tb0 = await rect('.pv-tabbar');
    const over0 = await g.page.evaluate(() => document.getElementById('home').scrollWidth - innerWidth);
    await shot(g, 'shop', 'upgrades-tab');
    const opened = await tap('[data-open="upgrade"]'); await sleep(120);
    const s13 = await sheetState(); const tb1 = await rect('.pv-tabbar');
    ok(!!ub && ub.h >= 55.5 && ub.w >= 55.5 && over0 <= 1 && opened && s13.open && s13.sheet && !!tb1, names[12], `UPGRADE ${ub ? Math.round(ub.w) + 'x' + Math.round(ub.h) : 'missing'}; overflow ${over0}px; sheet open ${s13.open}; tab bar visible while open ${!!tb1}`);
    // 14: sheet content
    await sleep(400);
    const sq = await quote('rifle', 'basic'); const s14 = await sheetState(); const selRow = s14.rows.find(r => r.sel);
    await shot(g, 'shop', 'sheet-open');
    const quoteFor = async () => g.page.evaluate(() => { const it = V.Meta.items(); return it.map(x => x.id + ':' + x.basicPrice); });
    const goTxt = s14.go, tierSel = s14.tiers.find(t => t.sel);
    const selQ = selRow ? await quote(selRow.id, tierSel ? tierSel.id : 'basic') : null;
    ok(s14.tiers.length === 3 && s14.tiers.every(t => /\d+/.test(t.txt) && /%|common|rare|epic|odds|chance|often|likely|rarely|sometimes|never/i.test(t.txt)) && !!s14.cat && s14.rows.length >= 4 && !!selQ && goTxt.replace(/[, ]/g, '').includes('Upgradefor' + selQ.price + 'CR'), names[13], `${s14.rows.length} rows (${s14.rows.map(r => r.id + (r.max ? '*' : '')).join(',')}); tiers: ${s14.tiers.map(t => t.txt.slice(0, 40)).join(' | ')}; catalyst: ${s14.cat && s14.cat.txt.slice(0, 50)}; confirm "${goTxt}" vs quote ${selQ && selQ.price} (${selRow && selRow.id}/${tierSel && tierSel.id})`);
    // 15: one tap spends, arm guard
    await g.page.evaluate(() => { V.UpSheet.close(); }); await sleep(150); await reset({ cr: 5000, cond: { hp: 2 } }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(400);
    await tap('[data-open="upgrade"]'); await sleep(60);
    const e0 = await st(); const early = await tap('.us-go'); await sleep(150); const e1 = await st(); const se = await sheetState();
    ok(early && e1.cr === e0.cr && e1.rolls === e0.rolls && !se.reveal, names[14] + ' (early tap)', `confirm tapped ~60 ms after open: credits ${e0.cr}->${e1.cr}, rolls ${e0.rolls}->${e1.rolls}, reveal shown ${se.reveal}`);
    await sleep(500);
    const selTier = (await sheetState()).tiers.find(t => t.sel); const selId = (await sheetState()).rows.find(r => r.sel).id; const q15 = await quote(selId, selTier.id);
    await tap('.us-go'); await sleep(60); const f1 = await st(); const sf = await sheetState();
    const d0 = await tap('.us-done'); await sleep(60); const sd0 = await sheetState();   // inside 350 ms of the card: must not close
    await sleep(450);
    const lastRoll = await g.page.evaluate(() => { const p = V.Meta.state.purchases; const l = p[p.length - 1]; return l ? l.price : null; });
    await shot(g, 'shop', 'reveal');
    ok(f1.rolls === e0.rolls + 1 && sf.reveal && f1.cr >= e0.cr - q15.price && f1.cr <= e0.cr - q15.price + q15.price * 2 && lastRoll === q15.price, names[14], `one tap: rolls ${e0.rolls}->${f1.rolls}, reveal ${sf.reveal}, credits ${e0.cr}->${f1.cr} (price ${q15.price}, refund ${f1.cr - (e0.cr - q15.price)}), visit left ${f1.left}`);
    // 16: reveal close guard
    await sleep(300); const d1 = await tap('.us-done'); await sleep(450); const sd1 = await sheetState(); const g2 = await st();
    ok(d0 && sd0.reveal && d1 && !sd1.reveal && sd1.open && g2.left === 1 && /Upgrade for|No rolls|Need/.test(sd1.go), names[15], `Done at ~80 ms: reveal still ${sd0.reveal}; after wait: reveal ${sd1.reveal}, sheet open ${sd1.open}, rolls left ${g2.left}, confirm "${sd1.go}"`);
    // 17: tier chips
    await reset({ cr: 700, cond: { hp: 2 } }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(400); await tap('[data-open="upgrade"]'); await sleep(600);
    const r0 = await sheetState(); const hpRow = r0.rows.find(r => r.id === 'hp'); await tap('.us-row[data-id="hp"]'); await sleep(150);
    const p0 = (await sheetState()).go; await tap('.us-tier[data-tier="std"]'); await sleep(150); const sS = await sheetState(); const pS = sS.go;
    const qs = await quote('hp', 'std'), qp = await quote('hp', 'prem'); const c17a = (await st()).cr;
    await tap('.us-tier[data-tier="prem"]'); await sleep(200); const sP = await sheetState(); const c17b = (await st()).cr;
    const digits = s => +String(s).replace(/\D/g, '');
    ok(sS.tiers.find(t => t.id === 'std').sel && digits(pS) === qs.price && qp.price > 700 && !sP.tiers.find(t => t.id === 'prem').sel && sP.tiers.find(t => t.id === 'prem').no && c17a === c17b, names[16], `credits 700: basic "${p0}"; std "${pS}" (quote ${qs.price}); prem costs ${qp.price} > 700: selected ${sP.tiers.find(t => t.id === 'prem').sel}, dim ${sP.tiers.find(t => t.id === 'prem').no}; credits ${c17a}->${c17b}`);
    // 18: Catalyst switch
    await g.page.evaluate(() => { V.UpSheet.close(); }); await sleep(150); await reset({ cr: 20000, sch: 99, cond: { hp: 2 } }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(400); await tap('[data-open="upgrade"]'); await sleep(600);
    await tap('.us-row[data-id="hp"]'); await sleep(100);
    await tap('.us-cat'); await sleep(150); const c99 = await sheetState();
    await g.page.evaluate(() => { V.Meta.state.schematics = 250; V.Meta.save(); }); await sleep(250);
    await tap('.us-cat'); await sleep(200); const c250 = await sheetState(); await shot(g, 'shop', 'sheet-catalyst');
    const cb0 = await st(); await tap('.us-go'); await sleep(300); const cb1 = await st(); const cr1 = await g.page.evaluate(() => { const p = V.Meta.state.purchases; return p[p.length - 1]; });
    ok(c99.cat && c99.cat.off && !c99.cat.on && c250.cat && c250.cat.on && !c250.cat.off && c250.tiers.every(t => /^\s*Basic|Standard|Premium/.test(t.txt)) && (cb1.sch === cb0.sch - 100 || cb1.sch === cb0.sch) && cb0.sch - cb1.sch === 100 * (cb1.cu - cb0.cu), names[17], `99 Schem: switch off=${c99.cat.off}, on=${c99.cat.on}; 250 Schem: on=${c250.cat.on}; tier text with Catalyst: ${c250.tiers[0].txt.slice(0, 50)}; after confirm Schem ${cb0.sch}->${cb1.sch} (100 only if the plain roll was Common), catUsed ${cb0.cu}->${cb1.cu}`);
    // 19: tab bar tap closes with no spend
    await g.page.evaluate(() => { V.UpSheet.close(); }); await sleep(150); await reset({ cr: 5000, cond: { hp: 2 } }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(400); await tap('[data-open="upgrade"]'); await sleep(600);
    const t0 = await st(); const tabOk = await tap('.pv-tab[data-tab="armory"]'); await sleep(450); const t1 = await st(); const ts = await sheetState();
    ok(tabOk && !ts.open && !ts.sheet && t1.cr === t0.cr && t1.rolls === t0.rolls, names[18], `tab tap ok=${tabOk}; sheet open after ${ts.open}; credits ${t0.cr}->${t1.cr}; rolls ${t0.rolls}->${t1.rolls}`);
    // 20: no rolls left; everything maxed
    await reset({ cr: 5000, cond: { hp: 2 }, vb: 2 }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(400);
    const nr = await rect('[data-open="upgrade"]'); await tap('[data-open="upgrade"]'); await sleep(600); const n0 = await st(); const sn = await sheetState();
    await tap('.us-go'); await sleep(300); const n1 = await st();
    await g.page.evaluate(() => { V.UpSheet.close(); }); await sleep(150);
    await reset({ cr: 99999, cond: { hp: 10, atk: 20, rate: 20 }, rifle: 10 }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(400);
    const mb = await rect('[data-open="upgrade"]'); await shot(g, 'shop', 'upgrades-maxed');
    ok(/no rolls/i.test(sn.go) && n1.cr === n0.cr && n1.rolls === n0.rolls && (!mb || mb.dis) && !!mb && /max/i.test(mb.txt), names[19], `visit used: confirm "${sn.go}", credits ${n0.cr}->${n1.cr}; all maxed: button "${mb && mb.txt}" disabled ${mb && mb.dis}`);
    // 21: fit and targets with a full item list (rifle, 3 stats, 6 gear), one capped
    await reset({ cr: 3000, cond: { hp: 10, atk: 4 }, rifle: 3, gear: { exo: 2, modA: 1, modB: 1, droneA: 5, droneB: 1, perk2: 1 } }); await g.page.evaluate(() => { V.Home.go('upgrades'); }); await sleep(400);
    await tap('[data-open="upgrade"]'); await sleep(700); await shot(g, 'shop', 'sheet-full');
    const fit = await g.page.evaluate(() => { const sh = document.querySelector('.us-sheet'), r = sh.getBoundingClientRect(), tb = document.querySelector('.pv-tabbar'), tr = tb ? tb.getBoundingClientRect() : null; const small = window.__targets().filter(x => Math.min(x.w, x.h) < 55.5).map(x => x.d + ' ' + x.w + 'x' + x.h); const rows = [...document.querySelectorAll('.us-row')].map(r => r.dataset.id + (r.classList.contains('max') ? '*' : '')); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, tabTop: tr ? tr.top : null, tabH: tr ? tr.height : 0, vw: innerWidth, vh: innerHeight, small, rows, over: document.getElementById('home').scrollWidth - innerWidth }; });
    ok(fit.left >= -0.5 && fit.right <= fit.vw + 0.5 && fit.top >= -0.5 && fit.tabH > 0 && fit.bottom <= fit.tabTop + 1 && fit.small.length === 0 && fit.over <= 1 && fit.rows[fit.rows.length - 1].endsWith('*'), names[20], `sheet ${Math.round(fit.left)}..${Math.round(fit.right)} x ${Math.round(fit.top)}..${Math.round(fit.bottom)} in ${fit.vw}x${fit.vh}; tab bar top ${Math.round(fit.tabTop)}; small targets ${fit.small.join(', ') || 'none'}; list order ${fit.rows.join(',')} (* = capped, last)`);
    await g.page.evaluate(() => { V.UpSheet.close(); });
  } finally { await g.ctx.close(); }
}

// =====================================================================
// levelup (agent G): level-up pause with 1 of 3 cards (pick 19); xp bar; frozen sim while paused
// =====================================================================
async function levelupGroup(browser, file, size) {
  const g = await open(browser, file, size, 'home=0');
  try {
    const present = await has(g, () => !!(window.V.Mods && window.V.Mods.reroll));
    const names = ['XP bar fills with XP', 'reaching the XP edge pauses the sim mid-fight', 'level-up offers exactly 3 cards (S.cards and DOM)', 'sim stays frozen while the level-up is open', 'level-up cards: targets >= 56 px, no HUD text through them', 'tapping a card resumes the sim and raises the level', 'no sim damage taken during the level-up pause', 'early tap guard: a tap inside 350 ms of the offer does not pick', 'a held card shows its next level with 3 pips (Lv 2 to 3)', 'Reroll (n) button: >= 56 px, fresh 3 cards with no repeats, spends one', 'RR chip on the HUD: hidden at 0, "RR n" when banked'];
    if (!present) { names.forEach(n => skip(n)); return; }
    await calm(g);
    await sleep(300);
    // XP bar
    const bar = () => g.page.evaluate(() => { const f = document.getElementById('xpFill'), w = document.getElementById('xpWrap'); if (!f || !w || !window.__vis(w)) return null; const fr = f.getBoundingClientRect(), wr = w.getBoundingClientRect(); return { ratio: wr.width ? fr.width / wr.width : 0, h: wr.height, xp: window.__pv.S.hero.xp, next: window.__pv.S.hero.xpNext }; });
    await g.page.evaluate(() => { const h = window.__pv.S.hero; h.xp = 0; window.__pv.step(2, { mx: 0, my: 0 }); }); const b0 = await bar();
    await g.page.evaluate(() => { const h = window.__pv.S.hero; h.xp = Math.floor(h.xpNext * 0.6); window.__pv.step(2, { mx: 0, my: 0 }); }); await sleep(250); const b1 = await bar();
    ok(!!b0 && !!b1 && b1.ratio > b0.ratio + 0.3 && b1.ratio < 0.95, names[0], b0 && b1 ? `ratio ${b0.ratio.toFixed(2)} -> ${b1.ratio.toFixed(2)} at xp ${b1.xp}/${b1.next}; bar height ${Math.round(b1.h)} px` : '#xpFill/#xpWrap not visible');
    await shot(g, 'levelup', 'xpbar');
    // edge -> pause. Must happen during play with an enemy alive (not after the room clears).
    await g.page.evaluate(() => { const S = window.__pv.S; S.enemies.forEach(e => { e.hp = 1e6; if (e.maxHp) e.maxHp = 1e6; }); });
    const pre = await g.page.evaluate(() => { const S = window.__pv.S; return { phase: S.phase, enemies: S.enemies.length, lvl: S.hero.level, hp: S.hero.hp }; });
    const post = await g.page.evaluate(() => { const S = window.__f1.edge(); return { phase: S.phase, enemies: S.enemies.length, cards: S.cards ? S.cards.length : 0, frame: S.frame, lvl: S.hero.level, keys: window.__f1.cardKeys(S) }; });
    ok(pre.phase === 'play' && pre.enemies > 0 && post.phase !== 'play' && post.lvl === pre.lvl + 1, names[1], `before: phase ${pre.phase}, ${pre.enemies} enemies; after XP edge: phase ${post.phase}, level ${pre.lvl} -> ${post.lvl}`);
    await sleep(500);
    const ui = await g.page.evaluate(() => ({ btns: window.__f1.cardBtns(), n: window.__pv.S.cards ? window.__pv.S.cards.length : 0, tg: window.__targets(), f: window.__pv.S.frame, hp: window.__pv.S.hero.hp }));
    ok(post.cards === 3 && ui.btns.length >= 3, names[2], `S.cards ${post.cards} [${post.keys.join(', ')}]; visible card buttons ${ui.btns.length}: ${ui.btns.map(b => b.txt.replace(/\s+/g, ' ').slice(0, 24)).join(' | ')}`);
    await sleep(600);
    const fz = await g.page.evaluate(() => window.__pv.S.frame);
    ok(fz === post.frame || fz === ui.f, names[3], `frame ${post.frame} -> ${ui.f} -> ${fz} over ~1.1 s real`);
    await shot(g, 'levelup', 'cards');
    const small = ui.tg.filter(t => Math.min(t.w, t.h) < 55.5);
    await g.page.evaluate(() => window.__captureHud && 0);
    ok(small.length === 0 && ui.btns.every(b => b.h >= 55.5), names[4], small.length ? 'SMALL: ' + small.map(t => `${t.d} ${t.w}x${t.h}`).join(', ') : `${ui.tg.length} targets, min ${Math.min(...ui.tg.map(t => Math.min(t.w, t.h)))} px`);
    // tap a row: one tap applies it, no "Touch to continue" confirm (M 2026-11-11)
    const lv0 = await g.page.evaluate(() => window.__pv.S.hero.level), hp0 = ui.hp;
    if (ui.btns[0]) await tapAt(g, ui.btns[0].cx, ui.btns[0].cy); await sleep(450);
    const mid = await g.page.evaluate(() => { const c = document.getElementById('cardCont'); const r = c && c.getBoundingClientRect(); return { cont: !!c && window.__vis(c), phase: window.__pv.S.phase, rows: window.__f1.cardBtns().length, x: r ? r.left + r.width / 2 : 0, y: r ? r.top + r.height / 2 : 0, h: r ? r.height : 0 }; });
    await sleep(50);
    const af = await g.page.evaluate(() => { const S = window.__pv.S; return { phase: S.phase, frame: S.frame, lvl: S.hero.level, hp: S.hero.hp, mods: JSON.stringify(S.hero.mods) }; });
    await sleep(400);
    const af2 = await g.page.evaluate(() => window.__pv.S.frame);
    ok(!mid.cont && mid.phase !== 'pick' && af.phase === 'play' && af2 > af.frame && af.mods !== '{}', names[5], `after one tap: confirm overlay ${mid.cont}, phase ${mid.phase} then ${af.phase}; frame ${af.frame} -> ${af2}; level ${lv0} -> ${af.lvl}; mods ${af.mods}`);
    ok(af.hp >= hp0, names[6], `hp ${hp0} -> ${af.hp}`);
    // early-tap guard: a tap inside 350 ms of the offer opening must not choose a row. Fresh offer, tap at once.
    await g.page.evaluate(() => window.__pv.pick(0)); await g.page.evaluate(() => { const S = window.__pv; if (S.S.phase === 'pick') S.pick(0); });
    await g.page.evaluate(() => { window.__pv.S.enemies.forEach(e => { e.hp = 1e6; if (e.maxHp) e.maxHp = 1e6; }); window.__f1.edge(); });
    const rowsNow = await g.page.evaluate(() => window.__f1.cardBtns()); const tEarly = Date.now();
    if (rowsNow[0]) await tapAt(g, rowsNow[0].cx, rowsNow[0].cy); await sleep(80);
    const eg = await g.page.evaluate(() => ({ cont: !!document.getElementById('cardCont'), phase: window.__pv.S.phase, rows: window.__f1.cardBtns().length }));
    ok(rowsNow.length >= 3 && !eg.cont && eg.rows >= 3, names[7], `tap ${Date.now() - tEarly} ms after the offer opened: "Touch to continue" shown ${eg.cont}, rows still ${eg.rows}`);
    // pips on a held card: level 2 held, offered again -> three pips, 2 to 3
    await g.page.evaluate(() => { window.__pv.pick(0); window.__pv.step(2, { mx: 0, my: 0 }); });   // close the guard-test offer so the next one renders fresh
    const pp = await g.page.evaluate(() => { const V = window.V, S = window.__pv.S; const ix = V.CARDS.findIndex(c => c.max === 3 && c.key); const key = V.CARDS[ix].key; S.hero.mods[key] = 2; const others = V.CARDS.map((c, i) => i).filter(i => i !== ix && V.CARDS[i].max === 3 && !(S.hero.mods[V.CARDS[i].key] >= 3)).slice(0, 2); S.rerolls = 2; S.cards = [ix].concat(others); S.phase = 'pick'; window.__pv.step(1, { mx: 0, my: 0 }); const rows = [...document.querySelectorAll('#cardList > *')]; const r0 = rows[0]; return { key, rows: rows.length, on: r0 ? r0.querySelectorAll('.pips i.on').length : -1, all: r0 ? r0.querySelectorAll('.pips i').length : -1, aria: r0 ? r0.getAttribute('aria-label') : '' }; });
    ok(pp.on === 3 && pp.all === 3 && /level 3 of 3/i.test(pp.aria), names[8], `held ${pp.key} at 2: pips ${pp.on}/${pp.all} lit; aria "${pp.aria}"`);
    await shot(g, 'levelup', 'pips');
    // RR chip
    const chip = n => g.page.evaluate(n => { window.__pv.S.rerolls = n; window.__pv.step(1, { mx: 0, my: 0 }); const c = document.getElementById('rrChip'); const r = c && c.getBoundingClientRect(); return { vis: !!c && window.__vis(c), txt: c ? c.textContent : null, r: r ? r.right : 0, h: r ? r.height : 0 }; }, n);
    // reroll button: 56 px, fresh 3 cards, no repeats; use the open offer
    await sleep(450);
    const rb = await g.page.evaluate(() => { const b = document.getElementById('cardRr'); const r = b && b.getBoundingClientRect(); return { txt: b && b.textContent, h: r ? r.height : 0, w: r ? r.width : 0, cx: r ? r.left + r.width / 2 : 0, cy: r ? r.top + r.height / 2 : 0, vis: !!b && window.__vis(b), k: window.__f1.cardKeys(window.__pv.S) }; });
    await tapAt(g, rb.cx, rb.cy); await sleep(300);
    const ra = await g.page.evaluate(() => ({ k: window.__f1.cardKeys(window.__pv.S), n: (window.__pv.S.cards || []).length, bank: window.__pv.S.rerolls, txt: (document.getElementById('cardRr') || {}).textContent }));
    ok(rb.vis && rb.h >= 55.5 && rb.txt === 'Reroll (2)' && ra.n === 3 && ra.bank === 1 && ra.k.every(k => !rb.k.includes(k)) && ra.txt === 'Reroll (1)', names[9], `button "${rb.txt}" ${Math.round(rb.w)}x${Math.round(rb.h)}; cards ${rb.k.join('/')} -> ${ra.k.join('/')}; bank 2 -> ${ra.bank}; label now "${ra.txt}"`);
    // RR chip on the HUD (play phase): hidden at 0, shows "RR n"
    await g.page.evaluate(() => { const S = window.__pv.S; S.cards && window.__pv.pick(0); });
    await sleep(500); await g.page.evaluate(() => { const S = window.__pv; if (S.S.phase === 'pick') { S.pick(0); } });
    await g.page.evaluate(() => { document.getElementById('cardCont') && document.getElementById('cardCont').remove(); });
    const c0 = await chip(0), c2 = await chip(2); await sleep(200); const c2b = await g.page.evaluate(() => { const c = document.getElementById('rrChip'); return { vis: !!c && window.__vis(c), txt: c && c.textContent }; });
    ok(!c0.vis && /RR\s*2/.test(c2.txt || '') && c2b.vis, names[10], `chip at 0 banked: visible ${c0.vis}; at 2: "${c2b.txt}" visible ${c2b.vis}`);
    await shot(g, 'levelup', 'rrchip');
    ok(g.errors.length === 0, 'levelup: 0 console errors', g.errors.join(' | ') || 'none');
  } finally { await g.ctx.close(); }
}

// =====================================================================
// stack + reroll (agent G): stacking to level 3 (pick 20), banked reroll per boss kill (pick 21)
// Pure rules run on a private V.Sim state (no wiring needed); the Reroll control and the boss-kill bank are live checks.
// =====================================================================
async function stackGroup(browser, file, size) {
  const g = await open(browser, file, size, 'home=0');
  try {
    const present = await has(g, () => !!(window.V.Mods && window.V.Mods.reroll));
    const pn = ['stacking: taking the same card 3 times gives level 3', 'a card at level 3 is never offered again', 'no mod ever passes its cap (3, or 4 for supply minors)', 'reroll: needs a banked reroll and changes all 3 cards, none repeated', 'reroll: spends exactly one bank; a second reroll is refused at 0'];
    const ln = ['live: with 1 banked reroll the level-up shows a Reroll control (>= 56 px)', 'live: tapping Reroll swaps the cards and spends the bank', 'live: killing the stage 10 boss banks exactly one reroll', 'live: with 0 banked rerolls the Reroll control is hidden or disabled'];
    if (!present) { pn.concat(ln).forEach(n => skip(n)); return; }
    const R = await g.page.evaluate(() => {
      const V = window.V, mk = () => V.Sim.create(777, JSON.parse(JSON.stringify(V.TUNE)), { cols: 9 });
      const keysOf = S => (S.cards || []).map(i => { const c = V.CARDS[i]; return c ? (c.key || c.id) : 'x' + i; });
      const S = mk(); let fav = null, offeredAfter = 0, maxed = false; const log = []; let over = 0;
      for (let i = 0; i < 80; i++) {
        S.phase = 'pick'; S.cards = V.Mods.offer(S, 'F', 3, S.rng); const ks = keysOf(S);
        if (fav == null) fav = ks[0];
        if (maxed && ks.includes(fav)) offeredAfter++;
        const ix = ks.indexOf(fav); V.Sim.pick(S, ix >= 0 ? ix : 0);
        const n = S.hero.mods[fav] || 0; if (log[log.length - 1] !== n) log.push(n); if (n >= 3) maxed = true;
        for (const m of V.CARDS) { const c = (S.hero.mods[m.key] || 0); if (m.max && c > m.max) over++; }
      }
      const rr = mk(); rr.phase = 'pick'; rr.cards = V.Mods.offer(rr, 'F', 3, rr.rng); const k0 = keysOf(rr).slice();
      const noBank = V.Mods.reroll(rr); rr.rerolls = 0; const can0 = V.Mods.canReroll(rr);
      V.Mods.bankReroll(rr); const b1 = rr.rerolls; const did = V.Mods.reroll(rr); const k1 = keysOf(rr).slice(); const b2 = rr.rerolls; const again = V.Mods.reroll(rr);
      return { fav, log, offeredAfter, over, max: S.hero.mods[fav], k0, k1, noBank, can0, b1, b2, did, again, n1: rr.cards.length, repeat: k1.filter(k => k0.includes(k)) };
    });
    ok(R.max === 3 && R.log.join() === '1,2,3', pn[0], `favourite ${R.fav}; level changes over 80 level-ups ${R.log.join(',')}; final ${R.max}`);
    ok(R.offeredAfter === 0 && R.log.every(n => n <= 3), pn[1], `offers of ${R.fav} after level 3: ${R.offeredAfter}; level log ${R.log.join(',')}`);
    ok(R.over === 0, pn[2], `mods over their max: ${R.over}`);
    ok(!R.noBank && !R.can0 && R.b1 === 1 && R.did === true && R.n1 === 3 && R.repeat.length === 0 && R.k0.join() !== R.k1.join(), pn[3], `no bank: reroll ${R.noBank}/can ${R.can0}; with 1 bank: ${R.k0.join('/')} -> ${R.k1.join('/')}; repeats ${R.repeat.join(',') || 'none'}`);
    ok(R.b2 === 0 && R.again === false, pn[4], `bank ${R.b1} -> ${R.b2}; second reroll ${R.again}`);
    // live
    await calm(g);
    const pre = await g.page.evaluate(() => { const S = window.__pv.S; S.rerolls = 1; S.enemies.forEach(e => { e.hp = 1e6; if (e.maxHp) e.maxHp = 1e6; }); window.__f1.edge(); return { phase: window.__pv.S.phase, k: window.__f1.cardKeys(window.__pv.S) }; });
    await sleep(500);
    const rb = await g.page.evaluate(() => window.__f1.rerollBtn());
    await shot(g, 'reroll', 'with-bank');
    if (pre.phase === 'play') { ln.slice(0, 2).concat(ln[3]).forEach(n => skip(n, 'level-up pause not wired in the live game yet (see the levelup group)')); }
    else {
      ok(!!rb && rb.w >= 55 && rb.h >= 55 && !rb.disabled, ln[0], rb ? `"${rb.txt}" ${Math.round(rb.w)}x${Math.round(rb.h)} disabled=${rb.disabled}` : 'no visible Reroll control');
      if (rb) { await tapAt(g, rb.cx, rb.cy); await sleep(400); }
      const after = await g.page.evaluate(() => ({ k: window.__f1.cardKeys(window.__pv.S), bank: window.__pv.S.rerolls, n: (window.__pv.S.cards || []).length }));
      ok(!!rb && after.n === 3 && after.k.join() !== pre.k.join() && after.bank === 0, ln[1], `cards ${pre.k.join('/')} -> ${after.k.join('/')}; bank 1 -> ${after.bank}`);
      const rb0 = await g.page.evaluate(() => window.__f1.rerollBtn());
      ok(!rb0 || rb0.disabled, ln[3], rb0 ? `visible, disabled=${rb0.disabled}` : 'hidden');
    }
    // boss kill banks one (sim hook, integrator or G snippet)
    await g.page.evaluate(() => { window.__pv.restart(); window.__setTune({ AUTO_WALK: false, ENEMY_DMG_MULT: 0, FIRE_INTERVAL: 0.25 }); window.__pv.restart(); });
    const bk = await g.page.evaluate(() => { const r = window.__f1.driveTo(S => S.stageKind === 'boss' && !!S.boss && S.phase === 'play', 60 * 60 * 8); if (!r.ok) return { reach: r }; const p = window.__pv, S = p.S; const before = S.rerolls | 0; S.boss.hp = 1; let n = 0; while (n++ < 900 && S.phase !== 'results' && S.phase !== 'dead' && S.boss && S.boss.hp > 0) window.__clearRoom(30); for (let i = 0; i < 90; i++) p.step(1, { mx: 0, my: 0 }); return { reach: r, before, after: S.rerolls | 0, phase: S.phase, win: S.result && S.result.win }; });
    ok(bk.reach.ok && bk.after - bk.before === 1, ln[2], bk.reach.ok ? `rerolls ${bk.before} -> ${bk.after}; phase ${bk.phase}, win ${bk.win}` : `could not reach the boss: ${JSON.stringify(bk.reach)}`);
    ok(g.errors.length === 0, 'stack/reroll: 0 console errors', g.errors.join(' | ') || 'none');
  } finally { await g.ctx.close(); }
}

// =====================================================================
// feel strip (agent P): results screen, first 2 runs of a build, 56 px chips, Skip on every question
// =====================================================================
async function feelGroup(browser, file, size) {
  const g = await open(browser, file, size, 'home=0');
  try {
    const present = await has(g, () => !!(window.V.Report && window.V.Report.feelPlan));
    const names = ['run 1 results: feel strip shown above New run / Home', 'feel chips >= 56 px high, a Skip chip on the question, strip fits the width', 'tapping Skip stores a skipped answer and moves on or closes', 'run 2 asks again, run 3 of the same build is not asked'];
    if (!present) { names.forEach(n => skip(n)); return; }
    const die = async () => { await g.page.evaluate(() => { window.__setTune({ HERO_ATK: 0, ENEMY_DMG_MULT: 1000, AUTO_WALK: false }); window.__pv.S.enemies.forEach(e => { e.hp = 1e6; if (e.maxHp) e.maxHp = 1e6; }); window.__pv.S.hero.hp = 1; window.__pv.S.hero.invulnT = 0; }); for (let k = 0; k < 120; k++) { await g.page.evaluate(() => window.__pv.step(30, { mx: 0, my: 0 })); if ((await g.page.evaluate(() => window.__pv.S.phase)) === 'results') break; } await sleep(1300); };
    const strip = () => g.page.evaluate(() => { const f = document.getElementById('rpFeel'); const on = !!f && f.classList.contains('on') && window.__vis(f); const chips = on ? [...f.querySelectorAll('[data-feel]')].filter(window.__vis).map(c => { const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, skip: c.dataset.feel === 'skip', cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.right, l: r.left }; }) : []; const nb = document.getElementById('btnRestart'); const fr = f ? f.getBoundingClientRect() : null; return { on, q: f && f.getAttribute('data-q'), chips, above: !!(fr && nb && fr.bottom <= nb.getBoundingClientRect().top + 1) }; });
    await calm(g); await die();
    const a = await strip(); await shot(g, 'feel', 'run1');
    ok(a.on && a.above, names[0], `shown ${a.on}, question ${a.q}, above New run ${a.above}`);
    ok(a.chips.length >= 2 && a.chips.every(c => c.h >= 55.5 && c.l >= -1 && c.r <= g.w + 1) && a.chips.some(c => c.skip), names[1], `${a.chips.length} chips, heights ${a.chips.map(c => Math.round(c.h)).join(',')}, skip chip ${a.chips.some(c => c.skip)}`);
    const sk = a.chips.find(c => c.skip); const qa = a.q;
    if (sk) { await tapAt(g, sk.cx, sk.cy); await sleep(400); }
    const b = await strip(); const saved = await g.page.evaluate(() => { const r = V.Meta.state.runs[V.Meta.state.runs.length - 1]; return r && r.feel ? JSON.stringify(r.feel) : null; });
    ok(!!sk && !!saved && /skip/.test(saved) && (!b.on || b.q !== qa), names[2], `saved feel ${saved}; strip now ${b.on ? 'question ' + b.q : 'closed'}`);
    await g.page.evaluate(() => { window.__pv.restart(); window.__setTune({ AUTO_WALK: false }); }); await die(); const r2 = await strip();
    await g.page.evaluate(() => { window.__pv.restart(); window.__setTune({ AUTO_WALK: false }); }); await die(); const r3 = await strip();
    ok(r2.on && !r3.on, names[3], `run 2 strip ${r2.on}, run 3 strip ${r3.on}`);
  } finally { await g.ctx.close(); }
}

// =====================================================================
// deploy (agent G): Deploy roll with ONE paid reroll (picks 25-27), on the Home Deploy tab
// =====================================================================
async function deployGroup(browser, file, size) {
  const g = await open(browser, file, size, '');
  try {
    const D = await has(g, () => !!(window.V.Mods && window.V.Mods.Deploy));
    const pn = ['Deploy roll is the same for a seed', 'one reroll only: the second returns null', 'reroll cost is 20 / 25 / 30 credits by chapter', 'rolled boost is one of the open boosts'];
    const un = ['Deploy roll: the block shows on the Deploy tab', 'Deploy roll: settles on a boost with tier pips and a >= 56 px Reroll button', 'Deploy roll: reroll costs 20 Credits and starts a new reveal', 'Deploy roll: tapping the card skips the reveal; DEPLOY waits 350 ms more', 'Deploy roll: after the one reroll the button reads Reroll used', 'Deploy roll: a second reroll tap charges nothing', 'Deploy roll: DEPLOY after the guard starts the run', 'Deploy roll: an Elite roll asks Tap again before charging', 'Deploy tab: fits width, targets >= 56 px, no text under 12 px'];
    if (!D) { pn.concat(un).forEach(n => skip(n)); return; }
    const r = await g.page.evaluate(() => { const Dp = window.V.Mods.Deploy; const a = Dp.roll(777, 0), b = Dp.roll(777, 0); const st = Dp.make(777); const first = Dp.reroll(st), second = Dp.reroll(st); const open = Dp.open().map(x => x.id); return { a, b, first, second, costs: [1, 2, 3].map(c => Dp.rerollCost(c)), openIds: open, id: a.id }; });
    ok(JSON.stringify(r.a) === JSON.stringify(r.b), pn[0], JSON.stringify(r.a));
    ok(!!r.first && r.second === null, pn[1], `first ${JSON.stringify(r.first)} second ${JSON.stringify(r.second)}`);
    ok(r.costs.join() === '20,25,30', pn[2], r.costs.join(','));
    ok(r.openIds.includes(r.id), pn[3], `${r.id} in [${r.openIds.join(',')}]`);
    // UI (G-REPORT: scanner reveal ~1.5 s, tap the card to skip, DEPLOY armed 350 ms after the reveal, 20-credit reroll, Elite asks "Tap again")
    const hasUi = await g.page.evaluate(() => !!(window.V.Tabs && window.V.Tabs.deploy) && window.__f1.src(/hm-roll/));
    if (!hasUi) { un.forEach(n => skip(n, 'feature not present (home.js Deploy roll UI not in this build)')); return; }
    const rollSt = () => g.page.evaluate(() => { const b = document.querySelector('#pane-deploy .hm-roll'); const rr = b && b.querySelector('.hr-rr'); const go = document.getElementById('btnDeploy'); const r = rr && rr.getBoundingClientRect(), gr = go && go.getBoundingClientRect(); return { on: !!b && window.__vis(b), rolling: !!b && b.classList.contains('rolling'), name: b && b.querySelector('.hr-name').textContent, pips: b && b.querySelector('.hr-pips').textContent, rr: rr ? rr.textContent.replace(/\s+/g, ' ') : '', rrBox: r && { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }, goBox: gr && { x: gr.left + gr.width / 2, y: gr.top + gr.height / 2 }, cr: V.Meta.state.credits, home: V.Home.visible(), frame: window.__pv.S.frame, started: window.__pv.S.t }; });
    await g.page.evaluate(() => { V.Meta.state.credits = 9000; V.Meta.save(); V.Home.go('deploy'); });
    const s0 = await rollSt(); await shot(g, 'deploy', 'reveal');
    ok(s0.on && !!s0.name, un[0], `roll block visible on the Deploy tab: ${s0.name} ${s0.pips}; rolling at this instant ${s0.rolling}`);
    await sleep(2200);
    const s2 = await rollSt(); await shot(g, 'deploy', 'roll');
    ok(!s2.rolling && !!s2.name && /[\u25CF\u25CB]/.test(s2.pips) && s2.rrBox && s2.rrBox.h >= 55.5 && s2.rrBox.w >= 55.5, un[1], `settled: ${s2.name} ${s2.pips}; reroll button ${s2.rrBox ? Math.round(s2.rrBox.w) + 'x' + Math.round(s2.rrBox.h) : 'none'} "${s2.rr}"`);
    await sleep(450);
    await tapAt(g, s2.rrBox.x, s2.rrBox.y); await sleep(250);
    let s3 = await rollSt(); let confirm = /tap again/i.test(s3.rr);
    if (confirm) { await tapAt(g, s3.rrBox.x, s3.rrBox.y); await sleep(150); s3 = await rollSt(); }
    ok(s3.rolling && s3.cr === s2.cr - 20, un[2], `${confirm ? 'Elite asked "Tap again" first; ' : ''}credits ${s2.cr} -> ${s3.cr} (want -20); rolling ${s3.rolling}`);
    // DEPLOY tapped during the reveal does nothing
    if (s3.goBox) await tapAt(g, s3.goBox.x, s3.goBox.y); await sleep(100); const s3b = await rollSt();
    ok(s3b.home, 'Deploy roll: DEPLOY ignores a tap during the reveal', `Home still open ${s3b.home}`);
    // skip the reveal by tapping the card, then DEPLOY must still wait 350 ms
    await g.page.evaluate(() => { const row = document.querySelector('#pane-deploy .hm-roll .hr-row'); const r = row.getBoundingClientRect(); window.__f1.rowPt = { x: r.left + 40, y: r.top + r.height / 2 }; });
    const rp = await g.page.evaluate(() => window.__f1.rowPt); await tapAt(g, rp.x, rp.y); await sleep(60);
    const s4 = await rollSt(); if (s4.goBox) await tapAt(g, s4.goBox.x, s4.goBox.y); await sleep(100);
    const s5 = await rollSt();
    ok(!s4.rolling && s5.home, un[3], `after a card tap: rolling ${s4.rolling}; DEPLOY tapped 60-160 ms after the reveal ended: Home still open ${s5.home}`);
    await sleep(700); const s6 = await rollSt();
    ok(/used/i.test(s6.rr), un[4], `after the one paid reroll the button reads "${s6.rr}"`);
    await tapAt(g, s6.rrBox.x, s6.rrBox.y); await sleep(300); const s7 = await rollSt();
    ok(s7.cr === s6.cr, un[5], `second reroll tap: credits ${s6.cr} -> ${s7.cr}`);
    // armed DEPLOY starts the run
    if (s7.goBox) await tapAt(g, s7.goBox.x, s7.goBox.y); await sleep(700);
    const s8 = await rollSt(); ok(!s8.home, un[6], `DEPLOY after the guard: Home open ${s8.home}`);
    // Elite confirm: plant an Elite roll, reload
    const seed = await g.page.evaluate(() => { const D = V.Mods.Deploy; for (let i = 1; i < 5000; i++) if (D.roll(i, 0).tier === 2) return i; return null; });
    if (seed == null) skip(un[7], 'no Elite seed found in 5000');
    else {
      await g.page.evaluate(sd => { localStorage.setItem('volley.deploy.v1', V.Mods.Deploy.encode(V.Mods.Deploy.make(sd))); V.Meta.state.credits = 9000; V.Meta.save(); }, seed);
      await g.page.reload(); await g.page.waitForFunction(() => window.V && window.V.Home && window.__pv && window.__pv.S, null, { timeout: 20000 });
      await g.page.evaluate(HELPERS); await g.page.evaluate(F1H); await g.page.evaluate(() => { V.Home.go('deploy'); }); await sleep(2300);
      const e0 = await rollSt(); await tapAt(g, e0.rrBox.x, e0.rrBox.y); await sleep(250); const e1 = await rollSt();
      await tapAt(g, e1.rrBox.x, e1.rrBox.y); await sleep(250); const e2 = await rollSt();
      ok(/elite/i.test(e0.pips) && /tap again/i.test(e1.rr) && e1.cr === e0.cr && e2.cr === e0.cr - 20, un[7], `Elite ${e0.pips}; first tap label "${e1.rr}", credits ${e0.cr} -> ${e1.cr}; second tap credits ${e2.cr}`);
    }
    await g.page.evaluate(() => { V.Home.go('deploy'); }); await sleep(300);
    const lay = await g.page.evaluate(() => ({ over: document.getElementById('home').scrollWidth - innerWidth, small: window.__targets().filter(t => Math.min(t.w, t.h) < 55.5).map(t => t.d + ' ' + t.w + 'x' + t.h), tiny: window.__textEls().filter(e => !!e.closest('#pane-deploy')).filter(e => parseFloat(getComputedStyle(e).fontSize) < 11.5).map(e => e.textContent.trim().slice(0, 20)) }));
    ok(lay.over <= 1 && lay.small.length === 0 && lay.tiny.length === 0, un[8], `overflow ${lay.over}px; small targets ${lay.small.join(', ') || 'none'}; text under 12 px ${lay.tiny.join(', ') || 'none'}`);
  } finally { await g.ctx.close(); }
}

// =====================================================================
// prompts (agent A): stage-1 prompts that vanish once done (pick 14); API V.Prompts.show/done/isDone/state/current, DOM #pvPrompt
// =====================================================================
async function promptsGroup(browser, file, size) {
  const g = await open(browser, file, size, 'home=0');
  try {
    const present = await has(g, () => !!(window.V.Prompts && window.V.Prompts.show && window.V.Prompts.frame));
    const names = ['P-1 "Drag to move" shows on stage 1 after ~1.5 s with no touch', 'prompt line: >= 12 px, inside the screen, under the HUD, never a tap target', 'a drag completes P-1 and the line vanishes', 'P-2 and P-3 show one at a time and vanish when done (API)', 'done prompts are saved and stay gone after a reload', 'prompts are not shown on Home or while paused'];
    if (!present) { names.forEach(n => skip(n)); return; }
    const wired = await has(g, () => window.__f1.src(/V\.Prompts\.frame/));
    if (!wired) { names.forEach(n => skip(n, 'feature not present (main.js does not call V.Prompts.frame yet: waits on the integrator wiring)')); return; }
    await calm(g);
    for (let i = 0; i < 30; i++) { if ((await g.page.evaluate(() => V.Prompts.current)) === 'P-1') break; await sleep(150); }
    const line = () => g.page.evaluate(() => { const e = document.getElementById('pvPrompt'); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e), hud = document.getElementById('hud'); return { txt: e.textContent, on: e.classList.contains('on') && window.__vis(e), fs: parseFloat(cs.fontSize), l: r.left, r: r.right, t: r.top, b: r.bottom, pe: cs.pointerEvents, hudB: hud ? hud.getBoundingClientRect().bottom : 0, cur: V.Prompts.current }; });
    // the line turns on in the next drawn frame after current is set, so give a slow frame up to 1.5 s
    let a = await line(); for (let i = 0; i < 10 && a && !a.on; i++) { await sleep(150); a = await line(); }
    await shot(g, 'prompts', 'p1');
    ok(!!a && a.on && /drag/i.test(a.txt) && a.cur === 'P-1', names[0], a ? `"${a.txt}" on=${a.on} current ${a.cur}` : 'no #pvPrompt');
    ok(!!a && a.fs >= 12 && a.l >= -1 && a.r <= g.w + 1 && a.t >= a.hudB - 1 && a.pe === 'none', names[1], a ? `${a.fs}px; x ${Math.round(a.l)}..${Math.round(a.r)} of ${g.w}; top ${Math.round(a.t)} vs HUD bottom ${Math.round(a.hudB)}; pointer-events ${a.pe}` : 'none');
    const v = await g.page.evaluate(() => window.__gameCanvas());
    const x = v.left + v.w / 2, y = v.top + v.h - 45;
    await E.T(g.cdp, 'touchStart', x, y); await E.moveTo(g.cdp, x, y, x, y - 90, 8, 400); await sleep(500); await E.T(g.cdp, 'touchEnd'); await sleep(900);
    const d = await g.page.evaluate(() => ({ done: V.Prompts.isDone('P-1'), cur: V.Prompts.current })); const a2 = await line();
    ok(d.done && d.cur !== 'P-1' && (!a2 || !a2.on || !/drag/i.test(a2.txt)), names[2], `P-1 done ${d.done}; current ${d.cur}; line ${a2 ? '"' + a2.txt + '" on=' + a2.on : 'none'}`);
    const seq = await g.page.evaluate(async () => { const out = []; const pr = V.Prompts; pr.reset(); pr.show('P-2'); await new Promise(r => setTimeout(r, 400)); out.push([pr.current, (document.getElementById('pvPrompt') || {}).textContent]); pr.done('P-2'); await new Promise(r => setTimeout(r, 700)); out.push([pr.current, pr.isDone('P-2')]); pr.show('P-3'); await new Promise(r => setTimeout(r, 400)); out.push([pr.current, (document.getElementById('pvPrompt') || {}).textContent]); pr.done('P-3'); await new Promise(r => setTimeout(r, 700)); out.push([pr.current, pr.isDone('P-3'), (document.getElementById('pvPrompt') || {}).classList.contains('on')]); return out; });
    ok(seq[0][0] === 'P-2' && /stand still/i.test(seq[0][1]) && seq[1][0] !== 'P-2' && seq[1][1] && seq[2][0] === 'P-3' && /cover/i.test(seq[2][1]) && seq[3][0] !== 'P-3' && seq[3][2] === false, names[3], JSON.stringify(seq));
    await g.page.reload(); await g.page.waitForFunction(() => window.__pv && window.__pv.S && window.__pv.S.hero, null, { timeout: 20000 }); await g.page.evaluate(HELPERS); await g.page.evaluate(F1H); await calm(g); await sleep(2500);
    const st = await g.page.evaluate(() => ({ s: V.Prompts.state(), cur: V.Prompts.current }));
    ok(st.s.done['P-1'] && st.s.done['P-2'] && st.s.done['P-3'] && st.cur == null, names[4], `after reload done ${JSON.stringify(st.s.done)}, current ${st.cur}`);
    // Home / pause hide the line
    await g.page.evaluate(() => { V.Prompts.reset(); V.Prompts.show('P-1'); }); await sleep(500);
    const shownBefore = await g.page.evaluate(() => V.Prompts.current);
    await g.page.evaluate(() => window.__pv.pause()); await sleep(500); const pz = await line();
    await g.page.evaluate(() => window.__pv.resume()); await g.page.evaluate(() => { V.Home.show('deploy'); }); await sleep(500); const hm = await line();
    ok(shownBefore === 'P-1' && (!pz || !pz.on) && (!hm || !hm.on), names[5], `shown ${shownBefore}; paused line ${pz ? 'on=' + pz.on : 'none'}; on Home ${hm ? 'on=' + hm.on : 'none'}`);
    ok(g.errors.length === 0, 'prompts: 0 console errors', g.errors.join(' | ') || 'none');
  } finally { await g.ctx.close(); }
}

// =====================================================================
// title (agent A): title screen, name once, one line, whole view taps after 350 ms, tap unlocks sound; ?title=0 skips; ?sounds=1 opens clean
// =====================================================================
async function titleGroup(browser, file, size) {
  const names = ['title screen shows first and carries the game name on one line', 'title: name inside the screen, build label >= 12 px, no HUD text through it, no overflow', 'a tap inside 350 ms does nothing; a tap after it hides the title', 'the tap unlocks audio (AudioContext running)', 'first launch: the tap goes straight into stage 1', '?title=0 skips the title', '?sounds=1 opens the soundboard with 0 console errors'];
  const g0 = await open(browser, file, size, '', { title: true });
  let present = false;
  try { present = await has(g0, () => !!(window.V.Title && window.V.Title.show)); } catch (e) { /* fall through */ }
  if (!present) { await g0.ctx.close(); names.forEach(n => skip(n)); return; }
  try {
    await g0.page.evaluate(() => { if (!window.V.Title.visible) window.V.Title.show(); }); await sleep(900);
    const t = await g0.page.evaluate(() => { const e = document.getElementById('pvTitle'); const nm = e && e.querySelector('.pvt-name'); const r = nm && nm.getBoundingClientRect(); const lines = nm ? nm.querySelectorAll('span').length || 1 : 0; const fs = nm ? parseFloat(getComputedStyle(nm).fontSize) : 0; const ver = e && e.querySelector('.pvt-ver'); const hudHit = (() => { const h = document.getElementById('hud'); if (!h || !e) return 'n/a'; const q = h.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!(hit && (hit === e || e.contains(hit))); })(); return { vis: !!e && window.__vis(e), name: nm ? nm.textContent.trim() : null, lines, fs, h: r ? r.height : 0, l: r ? r.left : 0, r: r ? r.right : 0, verFs: ver ? parseFloat(getComputedStyle(ver).fontSize) : null, over: document.documentElement.scrollWidth - innerWidth, hudHit, GN: window.V.GAME_NAME || window.V.Title.NAME, home: window.V.Home.visible() }; });
    await shot(g0, 'title', 'screen');
    ok(t.vis && !!t.name && t.name.toLowerCase() === String(t.GN).toLowerCase() && t.lines === 1 && t.h < t.fs * 1.6, names[0], `name "${t.name}" (constant ${t.GN}), ${t.lines} line(s), ${t.fs}px, block height ${Math.round(t.h)}`);
    ok(t.l >= -1 && t.r <= g0.w + 1 && (t.verFs == null || t.verFs >= 11.5) && t.over <= 1 && t.hudHit === true, names[1], `name x ${Math.round(t.l)}..${Math.round(t.r)} of ${g0.w}; build label ${t.verFs}px; overflow ${t.over}px; title covers the HUD ${t.hudHit}`);
    // early tap: in-page press fired at ~100 ms after show, then a real tap after the guard
    await g0.page.evaluate(() => { window.V.Title.hide && window.V.Title.hide(); window.V.Title.show(); window.__f1.tShow = performance.now(); });
    const early = await g0.page.evaluate(() => new Promise(res => setTimeout(() => { const e = document.getElementById('pvTitle'); const age = performance.now() - window.__f1.tShow; if (age < 300 && e) { const o = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 5, isPrimary: true }; e.dispatchEvent(new PointerEvent('pointerdown', o)); e.dispatchEvent(new PointerEvent('pointerup', o)); e.click(); } res({ age, vis: window.V.Title.visible }); }, 80)));
    await sleep(600);
    const audioP = g0.page.evaluate(() => new Promise(res => { let done = false; try { window.V.Audio.whenRunning(() => { done = true; res(true); }); } catch (e) { res(null); } setTimeout(() => { if (!done) res(false); }, 3000); }));
    await tapAt(g0, g0.w / 2, g0.h / 2); await sleep(900);
    const aft = await g0.page.evaluate(() => ({ vis: window.V.Title.visible, home: window.V.Home.visible(), stage: window.__pv.S.stage, phase: window.__pv.S.phase, runHome: window.V.Run.home }));
    ok(early.vis === true && aft.vis === false, names[2], `early press at ${Math.round(early.age)} ms: title still up ${early.vis}; after a real tap: title up ${aft.vis}`);
    const au = await audioP; ok(au === true, names[3], `whenRunning fired: ${au}`);
    ok(!aft.home && !aft.runHome && aft.phase === 'play' && aft.stage === 1, names[4], `Home visible ${aft.home}, run home ${aft.runHome}, phase ${aft.phase}, stage ${aft.stage}`);
    ok(g0.errors.length === 0, 'title: 0 console errors', g0.errors.join(' | ') || 'none');
  } finally { await g0.ctx.close(); }
  const g1 = await open(browser, file, size, 'home=0&title=0');
  const sk = await g1.page.evaluate(() => ({ vis: window.V.Title.visible })); await g1.ctx.close();
  ok(sk.vis === false, names[5], `title visible with ?title=0: ${sk.vis}`);
  const g2 = await open(browser, file, size, 'home=0&title=0&sounds=1');
  try {
    await sleep(800);
    const bd = await g2.page.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(window.__vis); return { n: bs.length, txt: bs.slice(0, 4).map(b => b.textContent.trim().slice(0, 14)) }; });
    const btns = await g2.page.evaluate(() => [...document.querySelectorAll('button')].filter(window.__vis).slice(0, 5).map(b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
    for (const b of btns) { await tapAt(g2, b.x, b.y); await sleep(200); }
    await shot(g2, 'sounds', 'board');
    ok(bd.n >= 5 && g2.errors.length === 0, names[6], `${bd.n} visible buttons (${bd.txt.join(' | ')}); 5 tapped; errors: ${g2.errors.join(' | ') || 'none'}`);
  } finally { await g2.ctx.close(); }
}

// =====================================================================
// catch room (agent K): count-in, catching, dud, tier, payout, Take once, R51 lanes, R53 clock
// Contract: V.Catch.start(S, rng) / step(S, inp, dt) / tierOf(net) / payout(tier, ch) / take(S, sel) / skip(S) / feed(acc, dtMs); S.mini; events sd:*
// Layer 1 (pure V.Catch on a private V.Sim state, widths 9/11/13/15) runs as soon as parts/catch.js is in the build.
// Layer 2 (live room at this viewport) needs sim.js + main.js wiring (stage 5 kind 'collect'); it skips with a reason until then.
// =====================================================================
const CP = {
  tier: 'tierOf edges 5|6, 12|13, 17|18 give 0,1,2,3', pay: 'payout(): picks 1/2/3/3, Credits 20/24/28, Perfect Repair 50% + Schematics 3, same table at stage 5 and 45',
  flow: 'room flow: count-in, 10 s play (600 steps), end beat, sheet', countin: 'count-in: clock 0, no crates, 0.9 s on the first visit (3 x 0.3 s)',
  crates: '20 crates in the room (2 gold), 2 duds at Supply Drop 1', lanes: 'R51: crate x = V.Catch lane map (lane 4 centre, anchors by GAP_FACTOR; factor 1 = outer lanes on outer columns), same fall time at every width',
  rows: 'crates stay in rows 1-10; Operator clamped to rows 3.5-10.5 (rows 11-14 are the thumb band)', speed: 'Operator speed 4.5 tiles/s at every width, rifle off (no shots)',
  catch: 'an Operator on a crate catches it (sd:catch, net +1)', dud: 'a dud: net -1 (floor 0), half speed for 0.7 s, sd:dud', idle: 'idle Operator: net <= 8 (Basic or Good), room still ends',
  bot: 'a chasing bot catches at least 9 of 20 at this width, and its net is within 2 crates of the 9-column net (SPEC: tier shares agree across widths within 10 points)', hpsafe: 'the room cannot hurt HP (no enemies, no damage)', reach: 'reach validator passes at 9/11/13/15 for 40 seeds x 5 ramp steps',
  det: 'same seed gives the same script and the same room hash', take: 'Take grants once (second call returns the first grant), one sd:payout', pads: 'pads: Repair heals only what is missing, "HP full" pad is not live and takes no pick, preselect order',
  skip: 'Skip only from the 4th play', feed: 'R53 feed(): 1 s of real time = 60 steps, 5 s = 300 (no frame cap)', pending: 'sd.pending is saved when the sheet opens and cleared on Take; plays count once',
  room: 'live: stage 5 is a collect room with S.mini at the layout column count', liveclock: 'live: the room clock runs on real time (R53): a 1 s stall adds ~1 s', livepause: 'live: pause freezes the room clock',
  livesheet: 'live: the room ends on the payout sheet; Take once; the run goes on to stage 6'
};
async function catchPure(g, widths) {
  const R = await g.page.evaluate(() => {
    const V = window.V, C = V.Catch, out = {};
    out.edges = [0, 5, 6, 12, 13, 17, 18, 20].map(n => C.tierOf(n));
    out.pay = [0, 1, 2, 3].map(t => C.payout(t, 1)); out.pay2 = [1, 2, 3].map(ch => C.payout(0, ch).credits);
    out.pay5 = JSON.stringify(C.payout(2, 1)) === JSON.stringify(C.payout(2, 1));
    out.feed = [C.feed(0, 1000).n, C.feed(0, 5000).n, C.feed(0, 16.7).n];
    const mk = cols => { const S = V.Sim.create(777, JSON.parse(JSON.stringify(V.TUNE)), { cols }); S.stage = 5; S.hero.hp = S.hero.maxHp; C.start(S, new V.Rng(11)); return S; };
    const run = (S, inpFn, maxSteps) => { const log = { phases: [], events: {}, n: 0 }; let last = null; for (let i = 0; i < (maxSteps || 4000); i++) { const m = S.mini; if (m.phase !== last) { log.phases.push(m.phase + '@' + i); last = m.phase; } if (m.phase === 'sheet') break; C.step(S, inpFn ? inpFn(S, i) : { mx: 0, my: 0 }, 1 / 60); for (const e of S.events) log.events[e.k] = (log.events[e.k] || 0) + 1; S.events.length = 0; log.n = i + 1; } return log; };
    out.byCols = {};
    for (const cols of (window.__f1w || [9, 11, 13, 15])) {
      const o = {}, S = mk(cols), m0 = S.mini;
      o.startPhase = m0.phase; o.sPhase = S.phase; o.cols = m0.cols; o.crates0 = m0.crates.length;
      // idle run
      const hp0 = S.hero.hp, sh0 = S.stats.shots; const lg = run(S); const m = S.mini;
      o.phases = lg.phases; o.steps = lg.n; o.net = m.net; o.tier = m.tier; o.crates = m.crates.length; o.duds = m.duds.length; o.gold = m.crates.filter(c => c.gold).length; o.hpd = S.hero.hp - hp0; o.shots = S.stats.shots - sh0;
      o.xs = m.crates.map(c => c.x); o.lanes = m.crates.map(c => c.lane); o.f = (V.Catch.GAP_FACTOR && V.Catch.GAP_FACTOR[cols] != null) ? V.Catch.GAP_FACTOR[cols] : 1; o.exp = m.crates.map(c => cols / 2 + (c.lane - 4) * (cols - 1) / 8 * o.f); o.a0 = V.Catch.laneX(0, cols); o.a8 = V.Catch.laneX(8, cols); o.a4 = V.Catch.laneX(4, cols); o.falls = [...new Set(m.crates.filter(c => !c.gold).map(c => c.fall))]; o.maxY = Math.max(...m.crates.map(c => c.y), ...m.duds.map(d => d.y)); o.minY = Math.min(...m.crates.map(c => c.y)); o.sheetPhase = S.phase; o.ev = lg.events;
      // hero clamp and speed
      const T = mk(cols); const h = T.hero; C.step(T, { mx: 0, my: 0 }, 1 / 60); const x0 = h.x; for (let i = 0; i < 30; i++) C.step(T, { mx: 1, my: 0 }, 1 / 60); o.dx30 = h.x - x0; for (let i = 0; i < 400; i++) C.step(T, { mx: 0, my: -1 }, 1 / 60); o.yMin = h.y; for (let i = 0; i < 400; i++) C.step(T, { mx: 0, my: 1 }, 1 / 60); o.yMax = h.y; for (let i = 0; i < 400; i++) C.step(T, { mx: -1, my: 0 }, 1 / 60); o.xMin = h.x; for (let i = 0; i < 400; i++) C.step(T, { mx: 1, my: 0 }, 1 / 60); o.xMax = h.x;
      // chasing bot: head for the crate that lands first, avoid duds by a side step
      const B = mk(cols); const bl = run(B, (S, i) => { const m = S.mini, h = S.hero; if (m.phase !== 'play') return { mx: 0, my: 0 }; const air = m.crates.filter(c => c.st === 'air').sort((a, b) => (a.t0 + a.fall) - (b.t0 + b.fall)); let tx = air[0] ? air[0].x : h.x, ty = air[0] ? Math.min(air[0].y + 0.5, 10.5) : h.y; for (const d of m.duds) if (d.st === 'air' && Math.hypot(d.x - h.x, d.y - h.y) < 2.2) { tx += (h.x >= d.x ? 1 : -1) * 1.2; } return { mx: tx - h.x, my: ty - h.y }; });
      o.botNet = B.mini.net; o.botCaught = B.mini.caught; o.botTier = B.mini.tier; o.botDuds = B.mini.dudHits;
      out.byCols[cols] = o;
    }
    // catch + dud on one fresh room each (9 columns)
    { const S = mk(9), m = S.mini; for (let i = 0; i < 300 && m.phase !== 'play'; i++) C.step(S, { mx: 0, my: 0 }, 1 / 60); for (let i = 0; i < 3; i++) C.step(S, { mx: 0, my: 0 }, 1 / 60); const c = m.crates[0]; let ev = 0; for (let i = 0; i < 200 && m.caught === 0; i++) { S.hero.x = c.x; S.hero.y = Math.max(3.5, Math.min(10.5, c.y)); C.step(S, { mx: 0, my: 0 }, 1 / 60); } for (const e of S.events) if (e.k === 'sd:catch') ev++; out.catch = { caught: m.caught, net: m.net, ev }; }
    { const S = mk(9), m = S.mini; for (let i = 0; i < 300 && m.phase !== 'play'; i++) C.step(S, { mx: 0, my: 0 }, 1 / 60); let d = null, ev = 0; for (let i = 0; i < 1200 && m.dudHits === 0; i++) { C.step(S, { mx: 0, my: 0 }, 1 / 60); d = m.duds.find(u => u.st === 'air'); if (d) { S.hero.x = d.x; S.hero.y = Math.max(3.5, Math.min(10.5, d.y)); } } out.dud0 = { dudHits: m.dudHits, caught: m.caught, net: m.net, slow: m.slowUntil - m.t }; const x0 = S.hero.x; for (let i = 0; i < 6; i++) C.step(S, { mx: 1, my: 0 }, 1 / 60); out.dud0.dx6 = S.hero.x - x0; for (const e of S.events) if (e.k === 'sd:dud') ev++; out.dud0.ev = ev;
      // 1 catch then a dud: net 1 -> 0
      const S2 = mk(9), m2 = S2.mini; for (let i = 0; i < 300 && m2.phase !== 'play'; i++) C.step(S2, { mx: 0, my: 0 }, 1 / 60); C.step(S2, { mx: 0, my: 0 }, 1 / 60); const c2 = m2.crates[0]; for (let i = 0; i < 200 && m2.caught === 0; i++) { S2.hero.x = c2.x; S2.hero.y = Math.max(3.5, Math.min(10.5, c2.y)); C.step(S2, { mx: 0, my: 0 }, 1 / 60); } m2.dudHits = 2; m2.caught = 1; m2.net = 0; out.floor = Math.max(0, m2.caught - m2.dudHits); }
    // reach validator
    { let bad = 0, n = 0; for (let seed = 1; seed <= 40; seed++) for (let step = 1; step <= 5; step++) { const sc = C.script(seed * 7919, step); for (const cols of [9, 11, 13, 15]) { n++; if (!C.reach(sc, cols).ok) bad++; } } let rf = 0; for (let seed = 1; seed <= 40; seed++) for (let step = 1; step <= 5; step++) if (C.script(seed * 7919, step).reachFail) rf++; out.reach = { bad, n, rf }; }
    // determinism
    { const a = mk(9), b = mk(9); run(a); run(b); out.det = { h1: C.hash(a), h2: C.hash(b), s: JSON.stringify(C.script(5, 1)) === JSON.stringify(C.script(5, 1)) }; }
    // take once / pads / pending / skip
    { const S = mk(9); S.hero.hp = Math.floor(S.hero.maxHp * 0.5); const cr0 = S.credits | 0; S.mini.net = 8; S.mini.caught = 8; S.mini.phase = 'end'; S.mini.et = 1; C.step(S, { mx: 0, my: 0 }, 1 / 60); const m = S.mini; const hp0 = S.hero.hp; const mp = V.Meta && V.Meta.sdState ? JSON.stringify((V.Meta.sdState() || {}).pending || null) : 'no-meta-snippet'; const g1 = C.take(S, null), g2 = C.take(S, null); let ev = 0; for (const e of S.events) if (e.k === 'sd:payout') ev++; const mp2 = V.Meta && V.Meta.sdState ? JSON.stringify((V.Meta.sdState() || {}).pending || null) : 'no-meta-snippet'; out.take = { phase: m.phase, tier: m.tier, picks: g1 && g1.picks, same: g1 === g2, credits: (S.credits | 0) - cr0, heal: S.hero.hp - hp0, ev, defaults: m.defaults, repairPad: m.pads[0], pending0: mp, pending1: mp2, missing: S.hero.maxHp - hp0 }; }
    { const S = mk(9); S.hero.hp = S.hero.maxHp; S.mini.net = 2; S.mini.caught = 2; S.mini.phase = 'end'; S.mini.et = 1; C.step(S, { mx: 0, my: 0 }, 1 / 60); const m = S.mini; out.full = { repair: m.pads[0], defaults: m.defaults, picks: m.pay.picks }; }
    { const S = mk(9); S.hero.hp = Math.floor(S.hero.maxHp * 0.9); S.mini.net = 2; S.mini.caught = 2; S.mini.phase = 'end'; S.mini.et = 1; C.step(S, { mx: 0, my: 0 }, 1 / 60); out.lowMiss = { defaults: S.mini.defaults, repairLive: S.mini.pads[0].live }; }
    { const S = mk(9); out.skip0 = { can: C.canSkip(S), r: C.skip(S) }; }
    return out;
  });
  const j = JSON.stringify;
  ok(R.edges.join() === '0,0,1,1,2,2,3,3', CP.tier, `tierOf(0,5,6,12,13,17,18,20) = ${R.edges.join(',')}`);
  const pk = R.pay.map(p => p.picks), cr = R.pay2, p3 = R.pay[3];
  ok(pk.join() === '1,2,3,3' && cr.join() === '20,24,28' && Math.abs(p3.repairPct - 0.5) < 1e-9 && p3.schematics === 3 && R.pay[0].schematics === 2 && R.pay[2].schematics === 2 && R.pay[0].repairPct === 0.4 && R.pay5, CP.pay, `picks ${pk}; credits ch1-3 ${cr}; perfect ${j(p3)}`);
  ok(R.feed.join() === '60,300,1', CP.feed, `feed(0,1000).n=${R.feed[0]} feed(0,5000).n=${R.feed[1]} feed(0,16.7).n=${R.feed[2]}`);
  for (const cols of widths) {
    const o = R.byCols[cols], tag = `${cols} columns: `;
    const px = o.phases.map(x => x.split('@')[0]).join('>'), at = Object.fromEntries(o.phases.map(x => x.split('@')));
    const playSteps = (+at.end) - (+at.play), counts = (+at.play) - (+at.countin);
    ok(o.startPhase === 'countin' && o.sPhase === 'collect' && px === 'countin>play>end>sheet' && Math.abs(playSteps - 600) <= 3 && o.sheetPhase === 'supply', tag + CP.flow, `${px}; countin ${counts} steps, play ${playSteps} steps; S.phase at sheet ${o.sheetPhase}; cols ${o.cols}`);
    ok(o.crates0 === 0 && Math.abs(counts - 54) <= 2, tag + CP.countin, `crates at start ${o.crates0}; count-in ${counts} steps (want 54 = 0.9 s)`);
    ok(o.crates === 20 && o.gold === 2 && o.duds === 2, tag + CP.crates, `${o.crates} crates, ${o.gold} gold, ${o.duds} duds`);
    const spread = Math.max(...o.lanes) - Math.min(...o.lanes);
    ok(o.xs.every((x, i) => Math.abs(x - o.exp[i]) < 1e-6 && x >= 0.5 - 1e-6 && x <= cols - 0.5 + 1e-6) && Math.abs(o.a4 - cols / 2) < 1e-6 && Math.abs(o.a0 - (cols / 2 - 4 * (cols - 1) / 8 * o.f)) < 1e-6 && Math.abs(o.a8 - (cols / 2 + 4 * (cols - 1) / 8 * o.f)) < 1e-6 && o.falls.length === 1 && spread >= 4, tag + CP.lanes, `x ${Math.min(...o.xs).toFixed(2)}..${Math.max(...o.xs).toFixed(2)}; lane anchors 0/4/8 at ${o.a0.toFixed(2)}/${o.a4.toFixed(2)}/${o.a8.toFixed(2)} (GAP_FACTOR ${o.f}; R51 literal = 0.5/${cols / 2}/${cols - 0.5}); lanes used spread ${spread}; non-gold fall times ${o.falls.join(',')}`);
    ok(o.maxY <= 10.5 + 1e-6 && o.minY >= 1.5 - 1e-6 && Math.abs(o.yMin - 3.5) < 1e-6 && Math.abs(o.yMax - 10.5) < 1e-6 && o.xMin >= 0.5 - 1e-6 && o.xMax <= cols - 0.5 + 1e-6, tag + CP.rows, `crate rows ${o.minY.toFixed(2)}..${o.maxY.toFixed(2)}; hero rows ${o.yMin.toFixed(2)}..${o.yMax.toFixed(2)}; hero x ${o.xMin.toFixed(2)}..${o.xMax.toFixed(2)}`);
    ok(Math.abs(o.dx30 - 2.25) < 0.05 && o.shots === 0, tag + CP.speed, `30 steps moved ${o.dx30.toFixed(3)} tiles (want 2.25); shots ${o.shots}`);
    ok(o.hpd === 0, tag + CP.hpsafe, `hp change ${o.hpd}`);
    ok(o.net <= 8 && o.phases.length === 4, tag + CP.idle, `idle net ${o.net}, tier ${o.tier}; events ${j(o.ev)}`);
    ok(o.botNet >= 9 && Math.abs(o.botNet - R.byCols[widths[0]].botNet) <= 2, tag + CP.bot, `chasing bot net ${o.botNet} (caught ${o.botCaught}, duds ${o.botDuds}), tier ${o.botTier}; ${widths[0]}-column bot net ${R.byCols[widths[0]].botNet} (a rough bot, same rule at every width; K's four-width bot rows are the real band check)`);
  }
  ok(R.catch.caught === 1 && R.catch.net === 1 && R.catch.ev >= 1, CP.catch, j(R.catch));
  ok(R.dud0.dudHits === 1 && R.dud0.net === Math.max(0, R.dud0.caught - R.dud0.dudHits) && R.dud0.slow > 0.6 && R.dud0.slow <= 0.7 + 1e-6 && R.dud0.dx6 < 0.3 * 1 && R.dud0.dx6 > 0.2 && R.dud0.ev >= 1 && R.floor === 0, CP.dud, `${j(R.dud0)}; floor test ${R.floor} (6 slowed steps should move ${(4.5 * 0.5 * 0.1).toFixed(3)})`);
  ok(R.reach.bad === 0, CP.reach, `${R.reach.bad} failures in ${R.reach.n} (script, width) checks; scripts that fell back to reachFail: ${R.reach.rf} of 200`);
  ok(R.det.h1 === R.det.h2 && R.det.s, CP.det, `hash ${R.det.h1} vs ${R.det.h2}; script equal ${R.det.s}`);
  const t = R.take;
  ok(t.phase === 'done' && t.same && t.ev === 1 && t.credits === 20 && t.heal >= 0 && t.heal <= t.missing, CP.take, `phase ${t.phase}; tier ${t.tier}; picks ${t.picks}; same grant object ${t.same}; sd:payout x${t.ev}; credits +${t.credits}; repair +${t.heal} of ${t.missing} missing; defaults ${t.defaults}`);
  ok(R.full.repair.live === false && R.full.repair.full === true && !R.full.defaults.includes('repair') && R.full.defaults.length === 1 && R.lowMiss.defaults[0] === 'credits' && t.heal <= t.missing && t.defaults[0] === 'repair', CP.pads, `full HP: repair ${j(R.full.repair)} defaults ${R.full.defaults}; 10% missing defaults ${R.lowMiss.defaults}; 50% missing at Good defaults ${t.defaults}, healed ${t.heal} of ${t.missing}`);
  ok(R.skip0.can === false && R.skip0.r === null, CP.skip, `fresh save: canSkip ${R.skip0.can}, skip() ${j(R.skip0.r)} (the 4th-play positive case needs V.Meta.sdState plays = 3, checked once P wires the snippet)`);
  if (t.pending0 === 'no-meta-snippet') skip(CP.pending, 'feature not present (V.Meta.sdState / sdOpen / sdTake snippet not wired in meta.js)');
  else ok(t.pending0 !== 'null' && t.pending1 === 'null', CP.pending, `pending at open ${t.pending0}; after Take ${t.pending1}`);
}
function window_laneX(lane, cols) { return cols / 2 + (lane - 4) * (cols - 1) / 8; }   // SPEC 4 / R51, checked against V.Catch.laneX above

async function catchGroup(browser, file, size) {
  const g = await open(browser, file, size, 'home=0');
  try {
    const present = await has(g, () => !!(window.V.Catch && window.V.Catch.start && window.V.Sim));
    if (!present) { Object.values(CP).forEach(n => skip(n)); return; }
    const first = size === SIZES[0] || (arg('size') && true);
    await catchPure(g, first ? [9, 11, 13, 15] : [await g.page.evaluate(() => window.V.Layout.cols())]);
    await catchLive(g);
    ok(g.errors.length === 0, 'catch: 0 console errors', g.errors.join(' | ') || 'none');
  } finally { await g.ctx.close(); }
}

// Layer 2: the real room at this viewport.
async function catchLive(g) {
  await calm(g);
  const reach = await g.page.evaluate(() => window.__f1.driveTo(S => !!S.mini, 60 * 60 * 6));
  const room = await g.page.evaluate(() => { const S = window.__pv.S; return { kind: S.stageKind, stage: S.stage, mini: !!S.mini, phase: S.phase, mp: S.mini && S.mini.phase, cols: S.mini && S.mini.cols, roomW: S.room && S.room.w, lay: V.Layout.cols() }; });
  ok(reach.ok && room.stage === 5 && room.mini && room.cols === room.lay && room.roomW === room.lay, CP.room, `reach ${j2(reach)}; stage ${room.stage} kind ${room.kind} S.phase ${room.phase}; mini cols ${room.cols}, room w ${room.roomW}, Layout.cols ${room.lay}`);
  if (!room.mini) { [CP.liveclock, CP.livepause, CP.livesheet].forEach(n => skip(n, 'catch room not reachable in the live game yet (sim.js stage-kind switch / main.js feed not wired)')); return; }
  await shot(g, 'catch', 'countin');
  // wait for play (real time), then R53 stall and pause
  for (let i = 0; i < 200; i++) { if ((await g.page.evaluate(() => window.__pv.S.mini.phase)) === 'play') break; await sleep(25); }
  const t0 = await g.page.evaluate(() => window.__pv.S.mini.t);
  await g.page.evaluate(() => { window.__gapOff += 1000; }); await sleep(200);
  const t1 = await g.page.evaluate(() => window.__pv.S.mini.t);
  const fr = await g.page.evaluate(() => ({ f: window.__pv.S.frame, ph: window.__pv.S.mini.phase }));
  if (t0 > 7) info(CP.liveclock, `started too late to measure on this host (clock already ${t0.toFixed(2)})`); else ok(t1 - t0 >= 1.0 && t1 - t0 <= 1.8, CP.liveclock, `clock ${t0.toFixed(2)} -> ${t1.toFixed(2)} across a faked 1 s stall plus 0.2 s real (want about 1.2); m.phase ${fr.ph}, S.frame ${fr.f}${fr.ph === 'countin' ? ' (the real loop never left the count-in: main.js does not step phase collect yet, integrator R53 change)' : ''}`);
  await shot(g, 'catch', 'play');
  await g.page.evaluate(() => window.__pv.pause()); await sleep(200);
  const p0 = await g.page.evaluate(() => window.__pv.S.mini.t); await sleep(700); const p1 = await g.page.evaluate(() => window.__pv.S.mini.t);
  ok(p1 === p0, CP.livepause, `clock ${p0.toFixed(3)} -> ${p1.toFixed(3)} over 0.7 s paused`);
  await g.page.evaluate(() => window.__pv.resume());
  // run to the sheet
  for (let i = 0; i < 200; i++) { const m = await g.page.evaluate(() => window.__pv.S.mini.phase); if (m === 'sheet' || m === 'done') break; await sleep(100); }
  await sleep(600); await shot(g, 'catch', 'sheet');
  const sh = await g.page.evaluate(() => { const S = window.__pv.S, m = S.mini; const take = [...document.querySelectorAll('button,[role=button]')].filter(window.__vis).find(e => /^\s*take\b/i.test(e.textContent)); const r = take && take.getBoundingClientRect(); return { phase: m.phase, sPhase: S.phase, take: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height } : null, credits: S.credits | 0, stage: S.stage }; });
  if (!sh.take) { ok(false, CP.livesheet, `no Take button on screen at m.phase ${sh.phase}, S.phase ${sh.sPhase} (CatchUI not wired in main.js?)`); return; }
  await tapAt(g, sh.take.x, sh.take.y); await sleep(250);   // may land inside the 350 ms guard: nothing must happen
  await sleep(500); await tapAt(g, sh.take.x, sh.take.y); await tapAt(g, sh.take.x, sh.take.y); await sleep(700);
  const af = await g.page.evaluate(() => { const S = window.__pv.S; return { phase: S.phase, mp: S.mini && S.mini.phase, credits: S.credits | 0, door: S.room && S.room.door && S.room.door.open, n: (S.stats.sd || []).length }; });
  let st6 = null; for (let i = 0; i < 40 && !st6; i++) { await g.page.evaluate(() => window.__toTarget(240)); const s = await g.page.evaluate(() => window.__pv.S.stage); if (s >= 6) st6 = s; }
  const gone = await g.page.evaluate(() => !document.getElementById('cuSheet'));
  ok(af.n === 1 && af.mp === 'done' && st6 === 6 && gone, CP.livesheet, `after Take x3: m.phase ${af.mp}, S.stats.sd entries ${af.n}, credits ${sh.credits} -> ${af.credits}, door ${af.door}; walked on to stage ${st6}; #cuSheet removed ${gone}`);
}
const j2 = o => JSON.stringify(o);

// =====================================================================
// payout sheet DOM + Take + 350 ms guard (agent K): V.CatchUI.open(S, onTake)
// =====================================================================
async function sheetGroup(browser, file, size) {
  const g = await open(browser, file, size, 'home=0');
  try {
    const present = await has(g, () => !!(window.V.CatchUI && window.V.CatchUI.open && window.V.Catch));
    const names = ['payout sheet: tier word and 3 pad rows', 'sheet: Take >= 56 px, pad rows >= 56 px, sheet <= 480 wide, no text under 12 px, inside the screen', 'a tap on Take inside the 350 ms guard does nothing', 'Take after the guard calls onTake; a double Take calls it once', 'no timer or auto-close: the sheet is still open after 4 s'];
    if (!present) { names.forEach(n => skip(n)); return; }
    await calm(g);
    const mkSheet = net => g.page.evaluate(net => { const S = V.Sim.create(777, JSON.parse(JSON.stringify(V.TUNE)), { cols: V.Layout.cols() }); S.stage = 5; S.hero.hp = Math.floor(S.hero.maxHp * 0.6); V.Catch.start(S, new V.Rng(3)); const m = S.mini; m.net = net; m.caught = net; m.phase = 'end'; m.et = 1; V.Catch.step(S, { mx: 0, my: 0 }, 1 / 60); window.__f1.S2 = S; window.__f1.takes = 0; window.__f1.openedAt = performance.now(); V.CatchUI.open(S, sel => { window.__f1.takes++; return V.Catch.take(S, sel); }); return { phase: m.phase }; }, net);
    const read = () => g.page.evaluate(() => { const els = [...document.querySelectorAll('button,[role=button]')].filter(window.__vis); const takeEl = els.find(e => /^\s*take\b/i.test(e.textContent)); const txt = window.__textEls().map(e => ({ t: e.textContent.trim().slice(0, 30), fs: parseFloat(getComputedStyle(e).fontSize), r: e.getBoundingClientRect() })); const padEls = els.filter(e => e !== takeEl && /repair|credit|schematic/i.test(e.textContent)); const dlg = padEls[0] && padEls[0].parentElement; const sr = dlg ? dlg.getBoundingClientRect() : null; const r = takeEl ? takeEl.getBoundingClientRect() : null; const all = window.__textEls().map(e => e.textContent.trim()).join(' | ').slice(0, 260); return { take: r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, b: r.bottom } : null, pads: padEls.map(e => { const q = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 24), h: q.height }; }), sheetW: sr ? sr.width : null, small: txt.filter(x => x.fs < 11.5).map(x => x.t + ' ' + x.fs), off: txt.filter(x => x.r.left < -1 || x.r.right > innerWidth + 1).map(x => x.t), tier: /basic|good|great|perfect/i.test(all), all }; });
    await mkSheet(8); await sleep(700);   // the sheet slides up in 0.3 s: measure when it has settled
    const rows = await read(); await shot(g, 'sheet', 'good');
    ok(rows.take && rows.pads.length >= 3 && rows.tier, names[0], `tier word ${rows.tier}; pad rows ${rows.pads.map(p => p.t).join(' | ')}; text: ${rows.all.slice(0, 150)}`);
    ok(!!rows.take && rows.take.h >= 55.5 && rows.take.b <= g.h + 1 && rows.pads.every(p => p.h >= 55.5) && (rows.sheetW == null || rows.sheetW <= 481) && rows.small.length === 0 && rows.off.length === 0, names[1], `Take ${rows.take ? Math.round(rows.take.w) + 'x' + Math.round(rows.take.h) : 'none'}; pads ${rows.pads.map(p => Math.round(p.h)).join(',')}; sheet width ${rows.sheetW && Math.round(rows.sheetW)}; under 12 px: ${rows.small.join(', ') || 'none'}; off-screen: ${rows.off.join(', ') || 'none'}`);
    if (!rows.take) { names.slice(2).forEach(n => skip(n, 'no Take button found')); return; }
    // guard: a fresh sheet; a real touch on Take's settled spot ~100 ms after it opened must do nothing; a touch after the guard works
    const pt = { x: rows.take.cx, y: rows.take.cy };
    let early = null;
    for (let tryN = 0; tryN < 8; tryN++) {   // a loaded host can delay the timer past 350 ms: age is read from the sheet's own clock and the try is repeated
      await mkSheet(8);
      early = await g.page.evaluate(() => new Promise(res => setTimeout(() => {
        const t = [...document.querySelectorAll('button,[role=button]')].find(e => /^\s*take\b/i.test(e.textContent)); const stt = window.V.CatchUI._state(); const age = performance.now() - (stt ? stt.t0 : 0);
        if (t && age < 150) { const o = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true }; t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new PointerEvent('pointerup', o)); t.click(); }
        res({ takes: window.__f1.takes, age, found: !!t, fired: !!t && age < 150 });
      }, 60)));
      if (early.fired) break;
    }
    ok(early.found && early.fired && early.takes === 0, names[2], `press + click on Take ${Math.round(early.age)} ms after the sheet opened (fired ${early.fired}): onTake calls ${early.takes}`);
    await sleep(700);
    await tapAt(g, pt.x, pt.y); await tapAt(g, pt.x, pt.y); await sleep(500);
    const after = await g.page.evaluate(() => ({ takes: window.__f1.takes, m: window.__f1.S2.mini.phase, ev: window.__f1.S2.events.filter(e => e.k === 'sd:payout').length }));
    ok(after.takes === 1 && after.ev === 1, names[3], `touch Take after the guard, twice: onTake calls ${after.takes}; sd:payout events ${after.ev}; m.phase ${after.m}`);
    await mkSheet(8); await sleep(4000);
    const still = await g.page.evaluate(() => !!window.__textEls().find(e => /^\s*take\b/i.test(e.textContent)));
    ok(still, names[4], `Take still on screen after 4 s: ${still}`);
    await shot(g, 'sheet', 'after4s');
    ok(g.errors.length === 0, 'sheet: 0 console errors', g.errors.join(' | ') || 'none');
  } finally { await g.ctx.close(); }
}

// =====================================================================
// stress (agents S and V): ?debug=1&room=stress, 11 machines, frame-time log, logged scaler steps
// =====================================================================
async function stressGroup(browser, file, size) {
  const names = ['?debug=1&room=stress opens the 11-machine room', 'stress room: 11 machines alive after 3 s of fire, Operator unhurt', 'room=stress without debug=1 does nothing', 'frame times are logged (frame p50 / p95 / max / n in __pv.metrics())', 'effect scaler steps are logged in the report'];
  const g0 = await open(browser, file, size, 'home=0');
  const present = await has(g0, () => !!(window.V.Data && window.V.Data.stages && window.V.Data.stages.stress));
  if (!present) { await g0.ctx.close(); names.forEach(n => skip(n)); return; }
  // without debug: nothing happens
  const nd = await g0.page.evaluate(() => ({ n: window.__pv.S.enemies.length, kind: window.__pv.S.stageKind })); await g0.ctx.close();
  const g1 = await open(browser, file, size, 'home=0&room=stress');
  const nd2 = await g1.page.evaluate(() => ({ n: window.__pv.S.enemies.length })); await g1.ctx.close();
  const g = await open(browser, file, size, 'home=0&debug=1&room=stress');
  try {
    await sleep(500);
    const a = await g.page.evaluate(() => { const S = window.__pv.S; return { n: S.enemies.length, phase: S.phase, stage: S.stage, hp: S.hero.hp }; });
    ok(a.n === 11, names[0], `${a.n} enemies at load (phase ${a.phase}); ADAPT: main.js must pass opts.room = 'stress' when ?debug=1&room=stress (integrator snippet in S's report)`);
    await g.page.evaluate(() => { window.__setTune({ AUTO_WALK: false }); });
    await sleep(3500); await shot(g, 'stress', 'room');
    const b = await g.page.evaluate(() => { const S = window.__pv.S; return { n: S.enemies.length, hp: S.hero.hp, maxHp: S.hero.maxHp, phase: S.phase, shots: S.stats.shots }; });
    ok(b.n === 11 && b.hp === b.maxHp && b.phase === 'play', names[1], `${b.n} alive, hp ${b.hp}/${b.maxHp}, phase ${b.phase}, shots ${b.shots}`);
    ok(nd2.n !== 11 && nd.n !== 11, names[2], `without debug: ${nd2.n} enemies (room=stress alone), plain ${nd.n}`);
    const m = await g.page.evaluate(() => { const x = window.__pv.metrics(); return { f: x.frame, gaps: x.gaps && x.gaps.length != null ? x.gaps.length : x.gaps }; });
    ok(m.f && m.f.n > 30 && m.f.p95 > 0 && m.f.p50 > 0 && m.f.max >= m.f.p95, names[3], `frame ${j2(m.f)}; gaps ${j2(m.gaps)}`);
    const rep = await g.page.evaluate(() => { try { return window.__pv.report() || ''; } catch (e) { return ''; } });
    const line = (rep.match(/[^\n]*(scaler|effect tier|tier step|fxTier)[^\n]*/i) || [])[0];
    if (!line && !(await has(g, () => !!(window.V.Scene && (window.V.Scene.scaler || window.V.Scene.Scaler || window.V.Scaler))))) skip(names[4], 'feature not present (effect scaler not in this build)');
    else ok(!!line, names[4], line ? line.slice(0, 200) : 'scaler exists but the report has no scaler line');
    ok(g.errors.length === 0, 'stress: 0 console errors', g.errors.join(' | ') || 'none');
  } finally { await g.ctx.close(); }
}

// ---------- runner ----------
const RUN = { shop: shopGroup, feel: feelGroup, levelup: levelupGroup, stack: stackGroup, deploy: deployGroup, prompts: promptsGroup, title: titleGroup, catch: catchGroup, sheet: sheetGroup, stress: stressGroup };
async function run({ browser, file, groups, sizes } = {}) {
  groups = groups || (arg('only') ? arg('only').split(',') : GROUPS);
  sizes = sizes || (arg('size') ? arg('size').split(',').map(s => s.split('x').map(Number)) : SIZES);
  file = file || (argv.includes('--game') ? path.join(SRC, 'game.html') : buildPrivate());
  const label = /game\.html$/.test(file) ? 'game.html' : 'private build';
  for (const size of sizes) for (const gr of groups) {
    E.setTag(`f1 ${label} ${size[0]}x${size[1]} ${gr}`);
    try { await RUN[gr](browser, file, size); }
    catch (e) { E.row(`${gr} group crashed`, 'FAIL', (e.stack || e.message).split('\n').slice(0, 2).join(' | ')); }
  }
}
module.exports = { run, GROUPS, SIZES, buildPrivate };

if (require.main === module) (async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  await run({ browser });
  await browser.close();
  const rows = E.rows.filter(r => /^f1 /.test(r.tag));
  const cnt = s => rows.filter(r => r.status === s).length;
  const out = arg('out') || path.join(SCRATCH, 'E2E-F1-RESULTS.txt');
  const lines = [`Project Volley F1 e2e (src/e2e-f1.js) ${new Date().toISOString()} ${((Date.now() - t0) / 1000).toFixed(0)} s`, `Totals: PASS ${cnt('PASS')} FAIL ${cnt('FAIL')} SKIP ${cnt('SKIP')} INFO ${cnt('INFO')}`, '', ...rows.map(r => `${r.status.padEnd(4)} | ${r.tag} | ${r.test} | ${r.detail}`)];
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`\nF1: PASS ${cnt('PASS')} FAIL ${cnt('FAIL')} SKIP ${cnt('SKIP')} -> ${out}`);
  process.exit(cnt('FAIL') ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
