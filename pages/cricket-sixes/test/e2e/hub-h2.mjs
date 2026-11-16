// Hub H2 "Home replan" e2e (C3.2). Modelled on hub-l2.mjs; same server / v4 fixture / audit helper style. Plan: PLAN-H2 section 8, docs/CONTRACT-C.md sections 4 + 6.
// Run from the app root:  node test/e2e/hub-h2.mjs [outDir]     Env: E2E_SHOTS=dir (or argv[2]), E2E_SOFT=1 (never exit 1), E2E_ONLY=344 | 475 | 704
// 344x882 at dpr 1 and 2: no body scroll, dock tiles / Coins / Save / gear / ? / Match Plan / START fully inside the viewport, no h-overflow, taps >= 56,
//   no tap overlap, elementFromPoint hits, text >= 14px, no console errors; then tap each dock tile, banner, week chip, Match Plan (each sheet audited).
// 344x882 states: START disabled (still no scroll), activity pending / picked, workshop locked, Book badge 1, Clinic 2, Scorebook, reduced motion.
// 704x783: two columns, no scroll.  475x638: only .hb-colB scrolls (tabindex 0).
// State stubs are done by rewriting served modules per context (no source edits): clinic.js (clinic count), book-badge.js (count), selectors.js (window.__h2 hooks).
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = (process.argv[2] || process.env.E2E_SHOTS || '/tmp/claude-0/-home-user/a85c89cf-6917-5a98-b80c-f0e523549250/scratchpad/qa/c').replace(/\/?$/, '/');
const ONLY = process.env.E2E_ONLY || '';
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();
const FIXTURE = (await readFile(join(ROOT, 'test/fixtures/v4-save-10.json'), 'utf8')).trim();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* optional */ }

// ---- in-page audit of the current screen (scope = whole document or a sheet) ----
function auditInPage([scopeSel]) {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const nm = (e) => (e.getAttribute('aria-label') || e.getAttribute('data-plate') || e.innerText || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 36);
  const sel = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (e.dataset && e.dataset.act ? `[${e.dataset.act}]` : '');
  const R = (e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
  // visible part of e inside every overflow-clipping ancestor (null = fully clipped away)
  const visRect = (e) => {
    const r0 = e.getBoundingClientRect(); let L = r0.left, T = r0.top, Rr = r0.right, B = r0.bottom;
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { L = Math.max(L, pr.left); Rr = Math.min(Rr, pr.right); }
      if (cs.overflowY !== 'visible') { T = Math.max(T, pr.top); B = Math.min(B, pr.bottom); }
    }
    return Rr - L > 0.5 && B - T > 0.5 ? { left: L, top: T, right: Rr, bottom: B } : null;
  };
  const scope = (scopeSel && document.querySelector(scopeSel)) || document;
  const out = { hScroll: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1, small: [], tiny: [], clipped: [], overlap: [], miss: [], n: 0 };
  const uniq = [...new Set([...scope.querySelectorAll('button, a[href], [role="button"], [data-act], input, select, textarea')].filter(vis))];
  out.n = uniq.length;
  for (const e of uniq) { const r = e.getBoundingClientRect(); if (r.height < 55.5 || r.width < 55.5) out.small.push(`${sel(e)} "${nm(e)}" ${R(e)}`); }
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) {
    const a = uniq[i], b = uniq[j]; if (a.contains(b) || b.contains(a)) continue;
    const ra = visRect(a), rb = visRect(b); if (!ra || !rb) continue;
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 2 && oy > 2) out.overlap.push(`${sel(a)} [${R(a)}] x ${sel(b)} [${R(b)}]`);
  }
  for (const e of uniq) {
    const r = visRect(e); if (!r) continue; const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
    const hit = document.elementFromPoint(cx, cy);
    if (scopeSel && hit === e.closest('.c-sheet')) continue; // scrolled-out sheet row
    if (!hit || !(e === hit || e.contains(hit) || (hit.closest && hit.closest('button, [data-act]') === e))) out.miss.push(`${sel(e)} [${R(e)}] gets tap on ${hit ? sel(hit) : 'null'}`);
  }
  const w = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT); const seen = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(), e = n.parentElement; if (!t || !e || seen.has(e) || !vis(e) || e.closest('script,style,.sr-only,.ss-sr,.hb-cap__sr,[aria-hidden="true"]')) continue; seen.add(e);
    const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize); if (fs < 13.5) out.tiny.push(`"${t.slice(0, 24)}" ${fs}px in ${sel(e)} ${R(e)}`);
    if (cs.display !== 'inline' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== 'ellipsis') out.clipped.push(`"${t.slice(0, 24)}" scrollWidth ${e.scrollWidth} > ${e.clientWidth} in ${sel(e)} ${R(e)}`);
    const box = e.closest('button, .hb-plate, .hb-chap, .hb-p, .hb-banner, .hb-week');
    if (box) { const rg = document.createRange(); rg.selectNodeContents(e); const tr = rg.getBoundingClientRect(), br = box.getBoundingClientRect(); if (tr.width && (tr.left < br.left - 1.5 || tr.right > br.right + 1.5 || tr.top < br.top - 1.5 || tr.bottom > br.bottom + 1.5)) out.clipped.push(`"${t.slice(0, 24)}" text ${R(e)} leaves ${sel(box)} ${R(box)}`); }
  }
  // sheet list scrolled to the bottom: last .ts-row must clear the sticky .ts-foot
  const sb = document.querySelector('.c-sheet__body'), lastRow = scope.querySelectorAll ? [...scope.querySelectorAll('.ts-row')].pop() : null, foot = scope.querySelector && scope.querySelector('.ts-foot');
  out.rowGap = null;
  if (lastRow && foot) { const a = lastRow.getBoundingClientRect(), f = foot.getBoundingClientRect(); out.rowGap = Math.round((f.top - a.bottom) * 10) / 10; }
  for (const k of ['small', 'tiny', 'clipped', 'overlap', 'miss']) out[k] = [...new Set(out[k])].slice(0, 10);
  return out;
}

// ---- layout facts the home must hold (no scroll, everything on screen) ----
function layoutInPage() {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const inside = (e) => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; };
  const nm = (e) => (e.getAttribute('aria-label') || e.dataset.plate || e.innerText || e.className).toString().trim().replace(/\s+/g, ' ').slice(0, 30);
  const need = { 'dock tile': [...document.querySelectorAll('.hb-dock .hb-plate')], Coins: [...document.querySelectorAll('.hb-cell--coins')], Save: [...document.querySelectorAll('.hb-head .hb-save')],
    gear: [...document.querySelectorAll('.hb-head .st-gear')], '?': [...document.querySelectorAll('.hb-head .help-btn')], 'Match Plan': [...document.querySelectorAll('.hb-foot .hb-plan, .hb-foot .hb-edit')], START: [...document.querySelectorAll('.hb-foot .hb-cta')] };
  const miss = [], out = [];
  for (const [k, els] of Object.entries(need)) { if (!els.length) { miss.push(k); continue; } for (const e of els) if (!vis(e) || !inside(e)) out.push(`${k} "${nm(e)}" ${JSON.stringify(e.getBoundingClientRect().toJSON())}`); }
  const se = document.scrollingElement; let max = 0; const t0 = se.scrollTop; se.scrollTop = 1e6; max = se.scrollTop; se.scrollTop = t0;
  return { miss, out, bodyMax: max, bodyH: document.body.scrollHeight, vh: innerHeight, dock: need['dock tile'].length };
}

const results = []; let curVp = '';
const step = (name, ok, why) => { results.push({ vp: curVp, name, ok: !!ok, why: ok ? '' : why || '' }); };

// served-module stubs per context
async function stubRoutes(ctx, o) {
  const patch = async (re, fn) => ctx.route(re, async (route) => {
    try { const r = await route.fetch(); route.fulfill({ response: r, body: fn(await r.text()), contentType: 'text/javascript' }); } catch (e) { route.continue(); }
  });
  if (o.clinic != null || o.realClinic !== true) await patch(/\/js\/core\/clinic\.js(\?.*)?$/, (t) => t.replace('export function clinicReadyCount(', 'export function __realClinicReadyCount(') + `\nexport function clinicReadyCount(s) { return ${(o.clinic || 0) | 0}; }\n`); // keep the real module's other exports (clinic-pick-sheet imports pickable)
  if (o.book) await patch(/\/js\/ui\/book-badge\.js(\?.*)?$/, (t) => t.replace('let count = 0;', `let count = ${o.book | 0};`));
  if (o.act || o.workshop || o.invalid) {
    await patch(/\/js\/store\/selectors\.js(\?.*)?$/, (t) => {
      for (const n of ['activitiesVM', 'workshopVM', 'clubVM']) t = t.replace(`export function ${n}(`, `function __o_${n}(`).concat(`\nexport function ${n}(s) { const r = __o_${n}(s); const h = globalThis.__h2 && globalThis.__h2.${n}; return h ? h(r) : r; }\n`);
      return t;
    });
  }
}
const H2_HOOKS = (o) => `globalThis.__h2 = {
  activitiesVM: ${o.act === 'pending' ? `(r) => ({ ...(r || {}), available: true, why: 'open', picked: null })` : o.act === 'picked' ? `(r) => ({ ...(r || {}), available: false, why: 'done', picked: { id: 'rest', name: 'Rest week', fans: 0, coins: 0, find: null } })` : 'null'},
  workshopVM: ${o.workshop === 'locked' ? `(r) => ({ ...(r || {}), visible: false })` : 'null'},
  clubVM: ${o.invalid ? `(r) => ({ ...r, plan: { ...r.plan, word: 'Fix it', ok: false, reason: 'Overs do not add up.' }, cta: r.cta && r.cta.act === 'StartMatch' ? { ...r.cta, disabled: true, reason: 'Fix the overs first. Overs do not add up.' } : r.cta })` : 'null'} };`;

async function newPage(browser, vp, o, errs) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: o.dpr || 1, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__hh2fx')) { localStorage.setItem('cs.save.1', fx); localStorage.setItem('__hh2fx', '1'); } } catch (e) { /* blocked */ } }, FIXTURE);
  await ctx.addInitScript(H2_HOOKS(o));
  await stubRoutes(ctx, o);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) errs.push('network outside app: ' + r.url()); });
  await page.goto(`${ORIGIN}/cricket-sixes/`); await page.waitForFunction(() => window.__store && window.__store.get().stage, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(600);
  return { ctx, page };
}

async function audit(page, label, scopeSel) {
  if (scopeSel) { await page.evaluate(() => { const b = document.querySelector('.c-sheet__body'); if (b) b.scrollTop = 1e6; }); await page.waitForTimeout(150); }
  const a = await page.evaluate(auditInPage, [scopeSel || null]);
  step(`${label}: no horizontal overflow`, !a.hScroll, 'document is wider than the viewport');
  step(`${label}: ${a.n} tap targets all >= 56x56`, !a.small.length, a.small.join(' ; '));
  step(`${label}: no overlapping tap rects`, !a.overlap.length, a.overlap.join(' ; '));
  step(`${label}: tap centre hits the intended element`, !a.miss.length, a.miss.join(' ; '));
  if (a.rowGap !== null) step(`${label}: last .ts-row clear of .ts-foot (gap ${a.rowGap}px)`, a.rowGap >= -0.5, `last row overlaps sticky foot by ${-a.rowGap}px`);
  step(`${label}: text >= 14px`, !a.tiny.length, a.tiny.join(' ; '));
  step(`${label}: no clipped text`, !a.clipped.length, a.clipped.join(' ; '));
}
async function closeSheets(page) { for (let i = 0; i < 4 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } }

async function runHub(browser, key, vp, o = {}) {
  curVp = key; const errs = [];
  const { ctx, page } = await newPage(browser, vp, o, errs);
  const shot = async (n) => { try { await page.screenshot({ path: `${SHOTS}hub-h2-${key.replace(/[^\w]+/g, '-')}-${n}.png` }); } catch (e) { /* optional */ } };
  const big = vp[0] === 344, mid = vp[0] === 704, small = vp[0] === 475;
  try {
    if (o.theme) { await page.evaluate((t) => window.__store.dispatch('SetTheme', { theme: t }), o.theme); await page.waitForTimeout(400); const cls = await page.evaluate(() => document.body.className); step(`theme ${o.theme} applied`, cls.includes('skin-' + o.theme), `body class ${cls}`); }
    const st = await page.evaluate(() => (window.__store ? window.__store.get().stage : null));
    step('boots to hub', st === 'hub', `stage ${st}`);
    { const ae = await page.$eval('.app-error', (e) => e.textContent.split('\n')[0]).catch(() => ''); step('hub renders without a render error', !ae, ae); }
    const dock = await page.waitForSelector('.hb-dock', { timeout: 5000 }).catch(() => null);
    step('hub renders .hb-dock (H2 layout)', !!dock, 'no .hb-dock');
    if (!dock) { await shot('no-dock'); return; }
    await page.waitForTimeout(400); await shot('hub');
    for (const s of ['.hb-head .hb-save', '.hb-head .st-gear', '.hb-head .help-btn', '.hb-board', '.hb-mid', '.hb-colA', '.hb-colB', '.hb-banner', '.hb-banner .hb-gb', '.hb-banner .hb-band', '.hb-banner canvas.hb-bcv', '.hb-six', '.hb-foot', '.hb-foot .hb-plan', '.hb-foot .hb-cta']) step(`has ${s}`, !!(await page.$(s)), 'missing');
    step('dock has 6 tiles (data-plate table/stadium/extras/book/workshop/fans)', (await page.$$eval('.hb-dock .hb-plate, .hb-dock .hb-slot', (e) => e.length)) === 6, 'not 6 tiles');
    step('retired hooks absent (.hb-ground .hb-more .hb-rival .hb-promo canvas.hb-head)', !(await page.$('.hb-ground, .hb-more, .hb-rival, .hb-promo, canvas.hb-head')), 'a retired hook is still rendered');
    step('squad: 6 .hb-p rows to the team sheet, no canvas', (await page.$$eval('.hb-p[data-act="sheet:team"]', (e) => e.length)) === 6 && !(await page.$('.hb-six canvas')), 'bad squad cells');
    { const fg = await page.$('.hb-banner .fg.hb-fg'); const out = await page.$('.hb-board .fg.hb-fg'); step('fans gate line is inside the banner, not the board', !out, 'fans line still on .hb-board'); void fg; }
    { const lab = await page.$eval('.hb-foot .hb-plan', (e) => (e.innerText + ' | ' + (e.getAttribute('aria-label') || '')).replace(/\s+/g, ' ')).catch(() => ''); step('Match Plan button text', /Match Plan/i.test(lab), lab); if (o.clinic) step(`Clinic badge shows ${o.clinic}`, new RegExp(`${o.clinic} Clinic spins? left`).test(lab) && (await page.$$eval('.hb-foot .hb-plan .hb-badge', (e, c) => e.some((x) => !x.hidden && x.textContent.trim() === String(c)), o.clinic)), lab); else step('Clinic badge hidden at 0', !(await page.$$eval('.hb-foot .hb-plan .hb-badge', (e) => e.some((x) => !x.hidden && x.getBoundingClientRect().width > 0))), 'badge visible'); }
    if (o.book) step('Book tile badge shows 1', (await page.$eval('.hb-plate[data-plate="book"] .hb-badge', (e) => !e.hidden && e.textContent.trim()).catch(() => '')) === '1', 'no badge "1" on Book');
    if (o.workshop === 'locked') step('workshop tile locked (aria-disabled), not tapped', (await page.$eval('.hb-plate[data-plate="workshop"]', (e) => e.getAttribute('aria-disabled')).catch(() => '')) === 'true' || !(await page.$('.hb-plate[data-plate="workshop"]')), 'workshop not locked');
    if (o.act) { const t = await page.$eval('.hb-plate[data-plate="fans"]', (e) => { const b = e.querySelector('.hb-badge'); return (e.innerText + ' ' + (b && !b.hidden && b.getBoundingClientRect().width > 0 ? '[badge]' : '')).replace(/\s+/g, ' '); }).catch(() => 'no fans tile'); step(`fans tile reflects activity ${o.act}`, o.act === 'pending' ? /\[badge\]/.test(t) : !/\[badge\]/.test(t), t); }
    if (o.invalid) { const w = await page.$eval('.hb-foot', (e) => ({ dis: !!e.querySelector('.hb-cta[disabled], .hb-cta[aria-disabled="true"]'), txt: e.innerText.replace(/\s+/g, ' ') })); step('START disabled with the reason in the footer', w.dis && /Fix the overs first|Overs/i.test(w.txt), JSON.stringify(w)); }

    // layout: no body scroll, everything in the viewport
    const L = await page.evaluate(layoutInPage);
    step('all named controls exist', !L.miss.length, 'missing: ' + L.miss.join(', '));
    if (big || mid) {
      step('no body scroll (scrollTop max 0, body <= viewport)', L.bodyMax === 0 && L.bodyH <= L.vh + 1, `scrollTop max ${L.bodyMax}, body ${L.bodyH} vs ${L.vh}`);
      step('dock tiles, Coins, Save, gear, ?, Match Plan, START fully in viewport', !L.out.length, L.out.join(' ; '));
    }
    if (mid) { const cols = await page.evaluate(() => { const a = document.querySelector('.hb-colA'), b = document.querySelector('.hb-colB'); if (!a || !b) return null; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { side: rb.left >= ra.right - 2 && Math.abs(ra.top - rb.top) < 8 }; }); step('704: two columns side by side', cols && cols.side, JSON.stringify(cols)); const foot = await page.evaluate(() => { const p = document.querySelector('.hb-foot .hb-plan, .hb-foot .hb-edit'), c = document.querySelector('.hb-foot .hb-cta'); if (!p || !c) return null; const a = p.getBoundingClientRect(), b = c.getBoundingClientRect(); return Math.abs(a.top - b.top) < 12; }); step('704: footer is one row (Match Plan | START)', foot === true, 'footer wraps'); }
    if (small) {
      step('475x638: no body scroll', L.bodyMax === 0, `scrollTop max ${L.bodyMax}`);
      const r = await page.evaluate(() => { const b = document.querySelector('.hb-colB'); if (!b) return null; const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const q = e.getBoundingClientRect(); return q.top >= -0.5 && q.bottom <= innerHeight + 0.5; };
        const scr = [...document.querySelectorAll('body *')].filter((e) => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.clientHeight > 0 && !e.closest('.c-sheet')).map((e) => e.className || e.tagName);
        return { tab: b.getAttribute('tabindex'), canScroll: b.scrollHeight > b.clientHeight + 2, scrollers: scr, head: vis('.hb-head'), dock: [...document.querySelectorAll('.hb-dock .hb-plate')].every((e) => { const q = e.getBoundingClientRect(); return q.bottom <= innerHeight + 0.5 && q.top >= 0; }), foot: vis('.hb-foot') }; });
      step('475: .hb-colB tabindex="0"', r && r.tab === '0', JSON.stringify(r));
      step('475: .hb-colB is what scrolls (strip + squad)', r && r.canScroll && r.scrollers.length === 1 && /hb-colB/.test(r.scrollers[0]), JSON.stringify(r));
      step('475: header, dock and footer fully visible', r && r.head && r.dock && r.foot, JSON.stringify(r));
      await page.focus('.hb-colB').catch(() => {}); await page.keyboard.press('Tab').catch(() => {}); await page.focus('.hb-colB').catch(() => {});
      const ring = await page.$eval('.hb-colB', (e) => { const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'; }).catch(() => false); step('475: .hb-colB shows a focus ring when focused', ring, 'no outline/box-shadow on :focus');
      await page.evaluate(() => { const b = document.querySelector('.hb-colB'); if (b) b.scrollTop = 1e6; }); await page.waitForTimeout(200); await audit(page, 'hub colB scrolled to bottom'); await shot('hub-bottom');
      await page.evaluate(() => { const b = document.querySelector('.hb-colB'); if (b) b.scrollTop = 0; });
    }
    await audit(page, 'hub');
    // contrast of START (>= 4.5)
    { const c = await page.evaluate(() => { const e = document.querySelector('.hb-foot .hb-cta'); if (!e) return null; const cs = getComputedStyle(e); const p = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const L = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const a = L(p(cs.color)), b = L(p(cs.backgroundColor)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }); if (c && !o.invalid) step('START text contrast >= 4.5', c >= 4.5, 'ratio ' + c.toFixed(2)); }

    // taps (full flow only at the primary run)
    const tapAndAudit = async (label, selector) => {
      const el = await page.$(selector); if (!el) { step(`${label}: present`, false, 'missing ' + selector); return; }
      if (!(await el.isVisible())) { step(`${label}: visible`, false, selector); return; }
      if ((await el.getAttribute('aria-disabled')) === 'true') { step(`${label} is locked (aria-disabled), not tapped`, true); return; }
      try { await el.click({ timeout: 3000 }); } catch (e) { step(`${label}: tap lands`, false, e.message.split('\n')[0]); return; }
      await page.waitForTimeout(450);
      const open = await page.$('.c-sheet'); step(`${label}: opens a sheet`, !!open, 'no .c-sheet after the tap');
      if (open) { await audit(page, `${label} sheet`, '.c-sheet'); await shot('sheet-' + label.replace(/\W+/g, '-')); }
      await closeSheets(page); step(`${label}: sheet closes`, !(await page.$('.c-sheet')), 'sheet stayed open');
    };
    if (o.taps) {
      for (const slot of ['table', 'stadium', 'extras', 'book', 'workshop', 'fans']) {
        if (!(await page.$(`.hb-plate[data-plate="${slot}"]`))) { step(`tile ${slot} absent only when its flag is off`, !!(await page.$(`.hb-slot[data-slot="${slot}"]`)), `no tile and no slot ${slot}`); continue; }
        await tapAndAudit(`tile ${slot}`, `.hb-dock .hb-plate[data-plate="${slot}"]`);
      }
      await tapAndAudit('banner', '.hb-banner .hb-gb');
      if (await page.$('.hb-week')) await tapAndAudit('this week chip', '.hb-week'); else step('this week chip hidden when nothing is waiting', true);
      await tapAndAudit('coins', '.hb-cell--coins');
      await tapAndAudit('save', '.hb-head .hb-save');
      await tapAndAudit('Match Plan', '.hb-foot .hb-plan');
      await shot('after-taps');
    }
    if (o.reduced) { const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length); step('reduced motion: no running animations on the hub', anim === 0, `${anim} running`); }
    step('no console/page errors, no network', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { step('script ran without throwing', false, e.stack || String(e)); }
  finally { await ctx.close(); }
}

const browser = await chromium.launch();
try {
  const want = (k) => !ONLY || k.startsWith(ONLY);
  if (want('344')) {
    await runHub(browser, '344x882', [344, 882], { taps: true });
    await runHub(browser, '344x882 dpr2', [344, 882], { dpr: 2, taps: true });
    await runHub(browser, '344x882 start-disabled', [344, 882], { invalid: true });
    await runHub(browser, '344x882 activity-pending', [344, 882], { act: 'pending' });
    await runHub(browser, '344x882 activity-picked', [344, 882], { act: 'picked' });
    await runHub(browser, '344x882 workshop-locked', [344, 882], { workshop: 'locked' });
    await runHub(browser, '344x882 book-badge-1', [344, 882], { book: 1 });
    await runHub(browser, '344x882 clinic-2', [344, 882], { clinic: 2 });
    await runHub(browser, '344x882 scorebook', [344, 882], { theme: 'scorebook' });
    await runHub(browser, '344x882 reduced-motion', [344, 882], { reduced: true });
  }
  if (want('704')) await runHub(browser, '704x783', [704, 783], { taps: true });
  if (want('475')) await runHub(browser, '475x638', [475, 638], { taps: true });
  if (want('475')) await runHub(browser, '475x638 scorebook', [475, 638], { theme: 'scorebook' });
} finally { await browser.close(); server.close(); }

let bad = 0; let last = '';
for (const r of results) { if (r.vp !== last) { console.log(`\n== ${r.vp} ==`); last = r.vp; } if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `\nFAIL: ${bad} of ${results.length} checks` : `\nPASS: ${results.length} checks`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
