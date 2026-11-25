// Chart School v2 end-to-end check (Playwright, chromium). Usage: node test/e2e.js
// At 344x882 and 475x638: v1 save migrates; a FULL Buy run (3 readings of 3 distinct types per chart, the call with
// Buy + horizon slider, outcome to the exit week, ends at the 10th Buy -> runend total return); a Don't buy run that
// ends at 20 charts; tweak menu + presets; reload keeps the record. Every screen: no Hold, no sideways overflow,
// no NaN/undefined, no forbidden words, buttons >= 48px, no console errors. Screenshots (deviceScaleFactor 1) -> qa/v2/.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('./serve');

const QA = path.resolve(__dirname, '..', 'qa', 'v2');
const BUILD = 'cs-v2-1';
const SIZES = [{ w: 344, h: 882 }, { w: 475, h: 638 }];
const FORBIDDEN = /\b(level|score|quiz|lesson|streak|passed|rung|hold|sell order)s?\b/i;
const fails = [];
let checks = 0;

function ok(cond, msg) { checks++; if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } }
async function screen(page) { return page.evaluate(() => document.body.dataset.screen || ''); }
async function act(page, name) {
  const loc = page.locator('[data-act="' + name + '"]:visible').first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  await loc.click();
  await page.waitForTimeout(30);
}
async function has(page, sel) { return (await page.locator(sel + ':visible').count()) > 0; }

// Common per-screen checks; screenshot when shot is a file label.
async function look(page, tag, label, shot) {
  const r = await page.evaluate((FORB) => {
    const out = { overflow: 0, small: [], bad: [], forb: [], wide: [] };
    out.overflow = document.documentElement.scrollWidth - window.innerWidth;
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null || s.position === 'fixed';
    };
    document.querySelectorAll('button, [data-act], [data-opt], [role=button], input[type=range]').forEach(el => {
      if (!vis(el)) return;
      if (el.closest('.modal') && !el.closest('.modal.on')) return;
      const h = el.getBoundingClientRect().height;
      if (h < 47.5) out.small.push((el.dataset.act || el.dataset.opt || el.id || el.textContent.trim()).slice(0, 30) + '=' + Math.round(h));
    });
    out.tiny = [...document.querySelectorAll('#pfs svg[data-cell]')].map(s => +s.dataset.cell).filter(c => c < 3);
    document.querySelectorAll('#main svg').forEach(s => {
      const b = s.getBoundingClientRect();
      if (b.right > window.innerWidth + 0.5 || b.left < -0.5) out.wide.push(Math.round(b.left) + '..' + Math.round(b.right));
    });
    const txt = document.body.innerText + ' ' + [...document.querySelectorAll('svg text')].map(t => t.textContent).join(' ');
    const m = txt.match(/\b(NaN|undefined|null|\[object Object\]|Infinity)\b/g);
    if (m) out.bad = m.slice(0, 5);
    const f = txt.match(new RegExp(FORB, 'gi'));
    if (f) out.forb = f.slice(0, 5);
    return out;
  }, FORBIDDEN.source);
  ok(r.overflow <= 0, `${tag} ${label}: horizontal overflow ${r.overflow}px`);
  ok(r.wide.length === 0, `${tag} ${label}: svg outside viewport ${r.wide.join(', ')}`);
  ok(!r.tiny.length, `${tag} ${label}: sector chart cells under 3px: ${r.tiny.join(', ')}`);
  ok(r.small.length === 0, `${tag} ${label}: controls under 48px: ${r.small.join(', ')}`);
  ok(r.bad.length === 0, `${tag} ${label}: bad text ${r.bad.join(', ')}`);
  ok(r.forb.length === 0, `${tag} ${label}: forbidden words ${r.forb.join(', ')}`);
  if (shot) await page.screenshot({ path: path.join(QA, `${tag}-${shot}.png`), fullPage: true });
}

// Answer the current reading: first option, or one step up on the stepper.
async function answer(page, type) {
  if (await has(page, '#main [data-opt]')) {
    await page.locator('#main [data-opt]:visible').first().click();
  } else if (await has(page, '[data-act="step-up"]')) {
    const v0 = await page.locator('#stepVal').innerText().catch(() => '');
    await act(page, 'step-up');
    const v1 = await page.locator('#stepVal').innerText().catch(() => '');
    ok(v0 !== v1 && v1.trim() !== '', `stepper value did not change (${v0} -> ${v1}) on ${type}`);
  } else ok(false, 'no option or stepper on reading ' + type);
  await page.waitForTimeout(20);
}

// One chart: 3 readings -> call -> outcome to exit -> finish. opts: {call, h, skip, shots, first}
async function playChart(page, tag, n, opts, st) {
  ok((await screen(page)) === 'reading', `${tag} chart ${n}: open-sheet did not show reading (${await screen(page)})`);
  const types = await page.evaluate(() => S.cur.reads.map(r => r.type));
  ok(types.length === 3 && new Set(types).size === 3, `${tag} chart ${n}: readings not 3 distinct types: ${types}`);
  ok(types.some(t => /^R/.test(t)), `${tag} chart ${n}: no stock reading in ${types}`);
  types.forEach(t => st.seen.add(t));
  for (let i = 0; i < 3; i++) {
    ok((await screen(page)) === 'reading', `${tag} chart ${n} reading ${i + 1}: screen ${await screen(page)}`);
    const type = await page.evaluate(() => curRead().type);
    const head = await page.locator('.ttl').first().innerText();
    ok(head.includes('Reading ' + (i + 1) + ' of 3'), `${tag} chart ${n}: header "${head.split('\n')[0]}" lacks Reading ${i + 1} of 3`);
    if (opts.shots && !st.shotReading && /^S/.test(type) && await has(page, '#pfs svg')) {
      st.shotReading = true;
      await look(page, tag, 'reading-sector', 'reading-sector');
    } else if (opts.first || !st.looked.has('r' + type)) { st.looked.add('r' + type); await look(page, tag, 'reading-' + type); }
    if (opts.first && i === 0) {
      await act(page, 'rule');
      ok(await has(page, '#modal.on'), `${tag} rule card did not open`);
      await act(page, 'close-modal');
      ok(!(await has(page, '#modal.on')), `${tag} rule card did not close`);
    }
    if (opts.skip) {
      await act(page, 'skip');
      continue;
    }
    if (!['R2', 'R2b', 'R4'].includes(type)) {
      const dis = await page.locator('[data-act="submit"]:visible').first().isDisabled();
      ok(dis, `${tag} submit enabled before answer on ${type}`);
    }
    await answer(page, type);
    await act(page, 'submit');
    ok((await screen(page)) === 'marked', `${tag} submit on ${type} did not show marked (${await screen(page)})`);
    ok(/Right|Marked/.test(await page.locator('#main').innerText()), `${tag} marked view for ${type} lacks Right/Marked`);
    if (!st.looked.has('m' + type)) { st.looked.add('m' + type); await look(page, tag, 'marked-' + type, opts.shots && /^S/.test(type) && !st.shotMarked ? (st.shotMarked = true, 'marked-sector') : null); }
    await act(page, 'next');
  }
  ok((await screen(page)) === 'call', `${tag} chart ${n}: after 3 readings got ${await screen(page)}`);
  const ctext = await page.locator('#main').innerText();
  ok(/Your call/.test(ctext), `${tag} call screen lacks "Your call"`);
  ok(await has(page, '#main [data-opt="Buy"]') && await has(page, '#main [data-opt="Don\'t buy"]'), `${tag} call lacks Buy / Don't buy`);
  ok((await page.locator('#main [data-opt]').count()) === 2, `${tag} call has extra options`);
  ok(await page.locator('[data-act="confirm-call"]').first().isDisabled(), `${tag} Confirm call enabled before a pick`);
  const ti = await page.evaluate(() => S.run.trades.length);
  ok(ctext.includes('Trade ' + Math.min(ti + 1, 10) + ' of 10'), `${tag} call lacks "Trade ${ti + 1} of 10"`);
  if (opts.first) {
    // Review charts goes back to the last marked reading, then forward again
    await act(page, 'back-reading');
    ok((await screen(page)) === 'marked', `${tag} back-reading went to ${await screen(page)}`);
    await act(page, 'next');
    ok((await screen(page)) === 'call', `${tag} next from back-reading went to ${await screen(page)}`);
    // -/+ and clamping
    const h0 = await page.evaluate(() => S.cur.h);
    ok(h0 === 6, `${tag} default horizon ${h0}`);
    await act(page, 'h-down');
    ok(await page.evaluate(() => S.cur.h) === 5, `${tag} h-down did not lower horizon`);
    for (let k = 0; k < 4; k++) await act(page, 'h-down');
    ok(await page.evaluate(() => S.cur.h) === 3, `${tag} horizon not clamped at 3`);
    for (let k = 0; k < 9; k++) await act(page, 'h-up');
    ok(await page.evaluate(() => S.cur.h) === 10, `${tag} horizon not clamped at 10`);
    ok((await page.locator('#hLabel').innerText()) === '10 weeks', `${tag} label not "10 weeks"`);
  }
  // slider: set the range value like a drag
  const h = opts.h;
  await page.evaluate((v) => { const i = document.getElementById('horizon'); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); }, h);
  ok(await page.evaluate(() => S.cur.h) === h, `${tag} slider did not set horizon ${h}`);
  ok((await page.locator('#hLabel').innerText()) === h + ' weeks', `${tag} slider label not "${h} weeks"`);
  await page.locator('#main [data-opt="' + opts.call + '"]').first().click();
  await page.waitForTimeout(20);
  ok(await page.evaluate(() => S.cur.call) === opts.call, `${tag} call not set to ${opts.call}`);
  ok(await page.evaluate(() => S.cur.h) === h, `${tag} horizon lost after picking the call`);
  ok(!(await page.locator('[data-act="confirm-call"]').first().isDisabled()), `${tag} Confirm call still disabled`);
  if (opts.shots && !st.shotCall) { st.shotCall = true; await look(page, tag, 'call', 'call'); } else await look(page, tag, 'call');
  await act(page, 'confirm-call');
  ok((await screen(page)) === 'outcome', `${tag} confirm went to ${await screen(page)}`);
  const exp = await page.evaluate((hh) => curSheet().fwdRet[hh - 1], h);
  if (opts.call === 'Buy') {
    const tr = await page.evaluate(() => S.run.trades[S.run.trades.length - 1]);
    ok(tr && tr.h === h && Math.abs(tr.ret - exp) < 1e-12, `${tag} trade not recorded with fwdRet[h-1]`);
  }
  let adv = 0;
  while ((await screen(page)) === 'outcome' && !(await has(page, '[data-act="finish"]')) && adv < 12) {
    if (opts.shots && !st.shotOut && adv === 2) { st.shotOut = true; await look(page, tag, 'outcome-mid', 'outcome-mid'); }
    await act(page, 'advance'); adv++;
  }
  ok(adv === h, `${tag} chart ${n}: advanced ${adv} weeks, horizon ${h}`);
  const otext = await page.locator('#main').innerText();
  const want = await page.evaluate((x) => retTxt(x, 1), exp);
  ok(otext.includes('Week +' + h + ' of ' + h), `${tag} outcome lacks "Week +${h} of ${h}"`);
  ok(otext.includes(want), `${tag} outcome lacks final return ${want}`);
  ok(opts.call === 'Buy' ? /return so far/.test(otext) : /no trade/.test(otext), `${tag} outcome wording for ${opts.call}`);
  if (opts.shots && !st.shotOutEnd) { st.shotOutEnd = true; await look(page, tag, 'outcome-exit', 'outcome-exit'); } else await look(page, tag, 'outcome');
  await act(page, 'finish');
  const s2 = await screen(page);
  ok(s2 === 'summary' || s2 === 'runend', `${tag} finish went to ${s2}`);
  if (s2 === 'summary') {
    if (!st.looked.has('summary')) { st.looked.add('summary'); await look(page, tag, 'summary', opts.shots ? 'summary' : null); }
  }
  const j = await page.evaluate(() => S.journal[S.journal.length - 1]);
  ok(j && j.call === opts.call && j.h === h && Array.isArray(j.types) && j.types.length === 3, `${tag} journal entry wrong: ${JSON.stringify(j).slice(0, 120)}`);
  return s2;
}

async function newPage(browser, base, size, init) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('dialog', d => (d.type() === 'prompt' && /preset name/i.test(d.message()) ? d.accept('e2e') : d.accept()));
  return { ctx, page, errs };
}

// v1 saved state (cs-proto-2 shape) must migrate: new run, record + journal kept, no crash.
async function migration(browser, base, size) {
  const tag = size.w + 'x' + size.h;
  const v1 = {
    v: 1, S: {
      seed: 777, screen: 'evidence', order: [3, 1, 2], pos: 2, sessN: 3,
      cur: { sheetIdx: 1, code: 'QRT', i: 6, reads: [{ type: 'R1', answer: 'No signal', given: 'No signal', ok: true }], step: 4, order: 'Hold' },
      journal: [{ code: 'QRT', sheetIdx: 1, reads: [{ type: 'R1', ok: true, skipped: false }, { type: 'R5', ok: false, skipped: false }], order: 'Hold' }],
      rec: { R1: { k: 3, n: 5 }, R2: { k: 1, n: 2 }, R3: { k: 0, n: 1 }, R4: { k: 0, n: 0 }, R5: { k: 2, n: 4 }, R6: { k: 0, n: 0 }, R7: { k: 1, n: 1 } }
    }
  };
  const { ctx, page, errs } = await newPage(browser, base, size, {
    fn: (s) => { if (!sessionStorage.getItem('mig')) { sessionStorage.setItem('mig', '1'); localStorage.setItem('cschool.state', s); } },
    arg: JSON.stringify(v1)
  });
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => document.body.dataset.screen === 'desk', null, { timeout: 15000 });
  const m = await page.evaluate(() => ({ r1: S.rec.R1, s1: S.rec.S1, j: S.journal.length, run: S.run && S.run.trades.length, cur: S.cur }));
  ok(m.r1 && m.r1.k === 3 && m.r1.n === 5, `${tag} migration lost R1 record`);
  ok(m.s1 && m.s1.n === 0, `${tag} migration: S1 record missing`);
  ok(m.j === 1, `${tag} migration lost journal (${m.j})`);
  ok(m.run === 0 && m.cur === null, `${tag} migration did not start a new run`);
  await look(page, tag, 'migrated-desk');
  await act(page, 'journal');
  ok((await screen(page)) === 'journal', `${tag} journal with a v1 entry did not render`);
  await look(page, tag, 'migrated-journal');
  ok(errs.length === 0, `${tag} migration console errors: ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

async function run(browser, base, size) {
  const tag = size.w + 'x' + size.h;
  const shots = true; // 344x882 is the required set; 475x638 kept for comparison
  console.log('== ' + tag);
  const { ctx, page, errs } = await newPage(browser, base, size);
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => document.body.dataset.screen === 'desk', null, { timeout: 15000 });
  const body = await page.locator('body').innerText();
  ok(body.includes(BUILD), `${tag} build id not visible on desk`);
  ok(body.includes('Chart School · Trading desk'), `${tag} top line not "Chart School · Trading desk"`);
  ok(/Start run/.test(body), `${tag} desk lacks Start run`);
  await look(page, tag, 'desk', shots ? 'desk' : null);

  // Run 1: Buy every chart, horizons vary 3..10; ends at the 10th Buy.
  const st = { seen: new Set(), looked: new Set() };
  let n = 0, s = '';
  let prev = null, repeats = 0;
  while (n < 12) {
    await act(page, 'open-sheet');
    const types = await page.evaluate(() => S.cur.reads.map(r => r.type));
    if (prev && types.some(t => prev.includes(t))) repeats++;
    prev = types;
    s = await playChart(page, tag, ++n, { call: 'Buy', h: 3 + ((n * 3) % 8), shots, first: n === 1 }, st);
    if (s === 'runend') break;
  }
  ok(s === 'runend' && n === 10, `${tag} Buy run ended after ${n} charts on ${s}`);
  ok(repeats <= 2, `${tag} reading types repeated chart to chart ${repeats} times`);
  console.log('  types seen: ' + [...st.seen].sort().join(','));
  ok(st.seen.size >= 8, `${tag} only saw reading types ${[...st.seen].join(',')}`);
  const re = await page.evaluate(() => ({ txt: document.getElementById('main').innerText, want: retTxt(runReturn(), 1), n: S.run.trades.length, done: S.run.done, best: S.best }));
  ok(re.done && re.n === 10, `${tag} run not done with 10 trades`);
  ok(re.txt.includes(re.want), `${tag} runend lacks total return ${re.want}`);
  ok(/10 trades/.test(re.txt), `${tag} runend lacks "10 trades"`);
  ok(re.best && typeof re.best.trades === 'number' && re.best.trades === 10, `${tag} best run not stored`);
  await look(page, tag, 'runend', shots ? 'runend' : null);

  // Journal + desk after a finished run
  await act(page, 'journal');
  ok((await screen(page)) === 'journal', `${tag} journal did not open from runend`);
  ok(await page.evaluate(() => S.journal.length) === 10, `${tag} journal not 10 entries`);
  await look(page, tag, 'journal', shots ? 'journal' : null);
  await act(page, 'desk');
  await look(page, tag, 'desk-after-run');
  ok(/Best run [+-]\d+\.\d%/.test(await page.locator('#main').innerText()), `${tag} desk lacks best run line`);

  // Run 2: Don't buy only (readings skipped for speed); ends at chart 20 with no trades.
  await act(page, 'open-sheet');
  ok(await page.evaluate(() => S.run.id) === 2 && await page.evaluate(() => S.run.charts) === 0, `${tag} second run did not start fresh`);
  n = 0; s = '';
  while (n < 22) {
    if (n > 0) await act(page, 'open-sheet');
    s = await playChart(page, tag, ++n, { call: "Don't buy", h: 3, skip: n > 1 }, st);
    if (s === 'runend') break;
  }
  ok(s === 'runend' && n === 20, `${tag} Don't buy run ended after ${n} charts on ${s}`);
  const r2 = await page.evaluate(() => ({ txt: document.getElementById('main').innerText, t: S.run.trades.length, sk: S.run.skipped, best: S.best }));
  ok(r2.t === 0 && r2.sk === 20, `${tag} Don't buy run trades ${r2.t} skipped ${r2.sk}`);
  ok(r2.txt.includes('+0.0%') && /0 trades/.test(r2.txt), `${tag} Don't buy runend text`);
  ok(r2.best && r2.best.trades === 10, `${tag} best run overwritten by an empty run`);
  await look(page, tag, 'runend-nobuy');
  await act(page, 'new-run');
  ok((await screen(page)) === 'desk' && await page.evaluate(() => S.run.id) === 3, `${tag} New run did not start run 3`);

  // Settings / tweak menu.
  await act(page, 'settings');
  ok(await has(page, '#modal.on'), `${tag} tweak menu did not open`);
  await look(page, tag, 'tweaks');
  ok(!(await page.locator('body').innerText()).includes('DEV '), `${tag} DEV badge visible before any tweak`);
  await page.evaluate(() => { const el = document.getElementById('tw_chartCols'); el.value = '16'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(60);
  ok(await page.evaluate(() => T.chartCols === 16), `${tag} chartCols did not change`);
  ok(/DEV \d+/.test(await page.locator('body').innerText()), `${tag} DEV badge not visible after tweak`);
  await page.evaluate(() => [...document.querySelectorAll('#modalBody button')].find(b => /^save preset/i.test(b.textContent.trim())).click());
  await page.waitForTimeout(60);
  ok((await page.evaluate(() => localStorage.getItem('cschool.presets') || '')).includes('e2e'), `${tag} preset not saved`);
  await page.evaluate(() => [...document.querySelectorAll('#modalBody button')].find(b => b.textContent.trim() === 'Plain').click());
  ok(await page.evaluate(() => T.chartCols === DEFAULTS.chartCols), `${tag} Plain preset did not reset`);
  await page.evaluate(() => [...document.querySelectorAll('#modalBody .row')].find(r => /e2e/.test(r.textContent)).querySelector('button').click());
  ok(await page.evaluate(() => T.chartCols === 16), `${tag} saved preset did not load`);
  const rep = await page.evaluate(() => { try { return JSON.parse(reportText()); } catch (e) { return null; } });
  ok(rep && rep.build === BUILD && rep.record && rep.record.length === 9 && rep.run && rep.best, `${tag} reportText lacks build/record(9)/run/best`);
  await page.evaluate(() => closeModal());

  // Reload keeps record, journal, best run, tweaks.
  const before = await page.evaluate(() => JSON.stringify({ rec: S.rec, j: S.journal.length, b: S.best }));
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.screen === 'desk', null, { timeout: 15000 });
  ok(before === await page.evaluate(() => JSON.stringify({ rec: S.rec, j: S.journal.length, b: S.best })), `${tag} state changed on reload`);
  ok(await page.evaluate(() => T.chartCols === 16), `${tag} tweak not kept on reload`);
  await page.evaluate(() => { T = cleanTweaks({}); saveTweaks(); });

  ok(errs.length === 0, `${tag} console errors: ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(QA, { recursive: true });
  const srv = await start(0);
  const base = 'http://127.0.0.1:' + srv.port + '/chart-school/';
  const browser = await chromium.launch();
  try {
    for (const s of SIZES) {
      try { await migration(browser, base, s); } catch (e) { ok(false, s.w + 'x' + s.h + ' migration crashed: ' + e.message.split('\n')[0]); }
      try { await run(browser, base, s); } catch (e) { ok(false, s.w + 'x' + s.h + ' crashed: ' + e.message.split('\n')[0]); }
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log(`e2e: ${checks - fails.length}/${checks} checks ok`);
  if (fails.length) { console.log('FAILURES:\n' + fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
  console.log('e2e PASS');
})();
