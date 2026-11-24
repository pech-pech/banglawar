// Chart School end-to-end check (Playwright, chromium). Usage: node test/e2e.js
// Walks the whole loop at 344x882 and 475x638, saves screenshots to qa/, exits 1 on any failure.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('./serve');

const QA = path.resolve(__dirname, '..', 'qa');
const SIZES = [{ w: 344, h: 882 }, { w: 475, h: 638 }];
const FORBIDDEN = /\b(level|score|quiz|lesson|streak|passed|rung)s?\b/i;
const fails = [];
let checks = 0;

function ok(cond, msg) { checks++; if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } }

async function screen(page) { return page.evaluate(() => document.body.dataset.screen || ''); }

async function act(page, name) {
  const loc = page.locator('[data-act="' + name + '"]:visible').first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  await loc.click();
  await page.waitForTimeout(60);
}

async function has(page, sel) { return (await page.locator(sel + ':visible').count()) > 0; }

// Common per-screen checks + screenshot.
async function look(page, tag, label) {
  const r = await page.evaluate((FORB) => {
    const re = new RegExp(FORB, 'i');
    const out = { overflow: 0, small: [], bad: [], forb: [] };
    out.overflow = document.documentElement.scrollWidth - window.innerWidth;
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null || s.position === 'fixed';
    };
    document.querySelectorAll('button, [data-act], [data-opt], [role=button]').forEach(el => {
      if (!vis(el)) return;
      if (el.closest('.modal') && !el.closest('.modal.on')) return;
      const h = el.getBoundingClientRect().height;
      if (h < 47.5) out.small.push((el.dataset.act || el.dataset.opt || el.id || el.textContent.trim()).slice(0, 30) + '=' + Math.round(h));
    });
    const txt = document.body.innerText;
    const m = txt.match(/\b(NaN|undefined|null|\[object Object\]|Infinity)\b/g);
    if (m) out.bad = m.slice(0, 5);
    const f = txt.match(new RegExp(FORB, 'gi'));
    if (f) out.forb = f.slice(0, 5);
    return out;
  }, FORBIDDEN.source);
  ok(r.overflow <= 0, `${tag} ${label}: horizontal overflow ${r.overflow}px`);
  ok(r.small.length === 0, `${tag} ${label}: buttons under 48px: ${r.small.join(', ')}`);
  ok(r.bad.length === 0, `${tag} ${label}: bad text ${r.bad.join(', ')}`);
  ok(r.forb.length === 0, `${tag} ${label}: forbidden words ${r.forb.join(', ')}`);
  await page.screenshot({ path: path.join(QA, `${tag}-${label}.png`) });
}

// Answer the current reading: first option, or one step up on the stepper. Returns reading type.
async function answer(page) {
  const type = await page.evaluate(() => (typeof curRead === 'function' && curRead()) ? curRead().type : '');
  if (await has(page, '#main [data-opt]')) {
    await page.locator('#main [data-opt]:visible').first().click();
  } else if (await has(page, '[data-act="step-up"]')) {
    const v0 = await page.locator('#stepVal').innerText().catch(() => '');
    await act(page, 'step-up');
    const v1 = await page.locator('#stepVal').innerText().catch(() => '');
    ok(v0 !== v1 && v1.trim() !== '', `stepper value did not change (${v0} -> ${v1}) on ${type}`);
  } else {
    ok(false, 'no option or stepper on reading ' + type);
  }
  await page.waitForTimeout(40);
  return type;
}

async function doSheet(page, tag, opts) {
  const seenTypes = opts.seen;
  let guard = 0;
  let first = true;
  while ((await screen(page)) === 'reading' && guard++ < 12) {
    const type = await page.evaluate(() => curRead().type);
    if (opts.skipFirst && first) {
      first = false;
      await act(page, 'skip');
      ok(['marked', 'reading', 'order', 'evidence'].includes(await screen(page)), `${tag} skip reading went to ${await screen(page)}`);
      if ((await screen(page)) === 'marked') await act(page, 'next');
      continue;
    }
    first = false;
    const dis = await page.locator('[data-act="submit"]:visible').first().isDisabled().catch(() => false)
      || await page.locator('[data-act="submit"]:visible').first().evaluate(e => e.classList.contains('disabled') || e.getAttribute('aria-disabled') === 'true').catch(() => false);
    // Option types start unanswered; stepper types start on the close box (a valid pick), so Submit is live there.
    if (!['R2', 'R2b', 'R4'].includes(type)) ok(dis, `${tag} submit enabled before answer on ${type}`);
    if (!seenTypes.has(type)) await look(page, tag, 'reading-' + type);
    await answer(page);
    if (!seenTypes.has(type)) await look(page, tag, 'reading-' + type + '-picked');
    await act(page, 'submit');
    ok((await screen(page)) === 'marked', `${tag} submit on ${type} did not show marked view (${await screen(page)})`);
    const pill = await page.locator('#main').innerText();
    ok(/Right|Marked/.test(pill), `${tag} marked view for ${type} lacks Right/Marked`);
    if (!seenTypes.has(type)) { await look(page, tag, 'marked-' + type); seenTypes.add(type); }
    await act(page, 'next');
  }
  let s = await screen(page);
  if (s === 'order') {
    await look(page, tag, 'order');
    if (opts.placeOrder) {
      await page.locator('#main [data-opt]:visible').first().click();
      await act(page, 'place-order');
    } else {
      await act(page, 'skip-order');
    }
    s = await screen(page);
  }
  ok(s === 'evidence', `${tag} expected evidence screen, got ${s}`);
  for (let k = 0; k < 10 && (await screen(page)) === 'evidence'; k++) {
    if (k === 0 || k === 9) await look(page, tag, 'evidence-w' + k);
    if (await has(page, '[data-act="finish"]')) break;
    await act(page, 'advance');
  }
  if ((await screen(page)) === 'evidence') {
    await look(page, tag, 'evidence-w10');
    await act(page, 'finish');
  }
  ok((await screen(page)) === 'summary', `${tag} expected summary, got ${await screen(page)}`);
}

async function run(browser, base, size) {
  const tag = size.w + 'x' + size.h;
  console.log('== ' + tag);
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('dialog', d => (d.type() === 'prompt' && /preset name/i.test(d.message()) ? d.accept('e2e') : d.accept()));

  await page.goto(base + 'index.html');
  await page.waitForFunction(() => document.body.dataset.screen === 'desk', null, { timeout: 15000 });
  ok((await page.locator('body').innerText()).includes('cs-proto-1'), `${tag} build id not visible on desk`);
  ok((await page.locator('body').innerText()).includes('Chart School'), `${tag} "Chart School" not visible`);
  await look(page, tag, 'desk');

  // Sheet 1: answer every reading, place a paper order.
  const seen = new Set();
  await act(page, 'open-sheet');
  ok((await screen(page)) === 'reading', `${tag} open-sheet did not show reading`);
  // Rule card once.
  await act(page, 'rule');
  ok(await has(page, '#modal.on'), `${tag} rule card did not open`);
  await look(page, tag, 'rule');
  await act(page, 'close-modal');
  ok(!(await has(page, '#modal.on')), `${tag} rule card did not close`);
  await doSheet(page, tag, { seen, placeOrder: true });
  await look(page, tag, 'summary');

  // Sheet 2: skip first reading, skip the paper order. Keep going until all 8 types seen if possible.
  let sheets = 1;
  while (sheets < 10) {
    if (!(await has(page, '[data-act="open-sheet"]')) && (await has(page, '[data-act="desk"]'))) await act(page, 'desk');
    if (!(await has(page, '[data-act="open-sheet"]'))) break;
    await act(page, 'open-sheet');
    if ((await screen(page)) !== 'reading') break;
    await doSheet(page, tag, { seen, placeOrder: false, skipFirst: sheets === 1 });
    sheets++;
    if (seen.size >= 8) break;
  }
  console.log('  types seen: ' + [...seen].join(','));
  ok(seen.size >= 8, `${tag} only saw reading types ${[...seen].join(',')}`);
  await look(page, tag, 'summary-2');

  // Desk + journal.
  if (await has(page, '[data-act="desk"]')) await act(page, 'desk');
  ok((await screen(page)) === 'desk', `${tag} desk button failed`);
  await look(page, tag, 'desk-after');
  await act(page, 'journal');
  ok((await screen(page)) === 'journal', `${tag} journal did not open`);
  const jn = await page.evaluate(() => S.journal.length);
  ok(jn >= 2, `${tag} journal has ${jn} entries`);
  await look(page, tag, 'journal');
  await act(page, 'desk');

  // Settings / tweak menu.
  await act(page, 'settings');
  ok(await has(page, '#modal.on'), `${tag} tweak menu did not open`);
  await look(page, tag, 'tweaks');
  ok(!(await page.locator('body').innerText()).includes('DEV '), `${tag} DEV badge visible before any tweak`);
  const changed = await page.evaluate(() => {
    const body = document.getElementById('modalBody');
    const el = body.querySelector('[data-key="chartCols"], [name="chartCols"], #tw_chartCols, [data-tweak="chartCols"]');
    if (!el) return 'no chartCols control';
    if (el.tagName === 'SELECT') {
      const opts = [...el.options].map(o => o.value);
      el.value = opts.find(v => v !== String(T.chartCols)) || opts[0];
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.tagName === 'INPUT') {
      el.value = String(T.chartCols === 16 ? 30 : 16);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.click();
    }
    return 'ok';
  });
  ok(changed === 'ok', `${tag} tweak: ${changed}`);
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => T.chartCols !== DEFAULTS.chartCols), `${tag} chartCols did not change`);
  ok(await page.evaluate(() => tweaked()), `${tag} tweaked() false after change`);
  ok(/DEV \d+/.test(await page.locator('body').innerText()), `${tag} DEV badge not visible after tweak`);
  await look(page, tag, 'tweaks-changed');

  // Save preset, then reset to Plain, then load the saved one.
  const cc = await page.evaluate(() => T.chartCols);
  const presetRes = await page.evaluate(async () => {
    const body = document.getElementById('modalBody');
    const inp = body.querySelector('input[type=text], input:not([type])');
    if (inp) { inp.value = 'e2e'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const btn = [...body.querySelectorAll('button, [data-act]')].find(b => /^save preset/i.test(b.textContent.trim()));
    if (!btn) return 'no Save preset button';
    btn.click();
    return 'ok';
  });
  ok(presetRes === 'ok', `${tag} preset save: ${presetRes}`);
  await page.waitForTimeout(100);
  const stored = await page.evaluate(() => { try { return localStorage.getItem('cschool.presets') || ''; } catch (e) { return ''; } });
  ok(stored.length > 2, `${tag} cschool.presets empty after save`);
  const loadRes = await page.evaluate(() => {
    const body = document.getElementById('modalBody');
    const all = [...body.querySelectorAll('button, [data-act]')];
    const plain = all.find(b => /^plain$/i.test(b.textContent.trim()) || /Plain/.test(b.textContent) && /load|preset/i.test((b.dataset.act || '') + b.className));
    if (plain) plain.click();
    const body2 = document.getElementById('modalBody');
    const all2 = [...body2.querySelectorAll('button, [data-act]')];
    const mine = all2.find(b => /e2e/.test(b.textContent) && !/delete/i.test(b.textContent + (b.dataset.act || '')))
      || all2.find(b => /^load/i.test(b.textContent.trim()) && (b.closest('[data-name="e2e"]') || /e2e/.test(b.parentElement.textContent)));
    if (!mine) return 'no load control for preset e2e (plain ' + !!plain + ')';
    mine.click();
    return 'ok';
  });
  ok(loadRes === 'ok', `${tag} preset load: ${loadRes}`);
  await page.waitForTimeout(100);
  ok(await page.evaluate((c) => T.chartCols === c, cc), `${tag} loaded preset did not restore chartCols ${cc}`);
  const rep = await page.evaluate(() => { try { return reportText(); } catch (e) { return 'ERR ' + e.message; } });
  let repOk = false;
  try { const j = JSON.parse(rep); repOk = j.build === 'cs-proto-1' && !!j.record; } catch (e) { /* not JSON */ }
  ok(repOk, `${tag} reportText not JSON with build + record: ${String(rep).slice(0, 80)}`);
  ok(await page.locator('#modalBody').evaluate(b => [...b.querySelectorAll('button, [data-act]')].some(x => /copy report/i.test(x.textContent))), `${tag} no Copy report in tweak menu`);
  await look(page, tag, 'tweaks-preset');
  await page.evaluate(() => closeModal());

  // Reload keeps the record.
  const before = await page.evaluate(() => JSON.stringify({ rec: S.rec, j: S.journal.length }));
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.screen === 'desk', null, { timeout: 15000 });
  const after = await page.evaluate(() => JSON.stringify({ rec: S.rec, j: S.journal.length }));
  ok(before === after, `${tag} record changed on reload`);
  ok(await page.evaluate((c) => T.chartCols === c, cc), `${tag} tweak not kept on reload`);
  await look(page, tag, 'desk-reload');

  ok(errs.length === 0, `${tag} console errors: ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(QA, { recursive: true });
  const srv = await start(0);
  const base = 'http://127.0.0.1:' + srv.port + '/';
  const browser = await chromium.launch();
  try {
    for (const s of SIZES) {
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
