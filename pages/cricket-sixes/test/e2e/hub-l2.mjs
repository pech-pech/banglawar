// Hub L2 "Living ground" e2e. v4 save injected -> hub at 344x882, 475x638, 704x783 (+ dpr2 shot, Scorebook theme, reduced motion).
// Run from the app root:  node test/e2e/hub-l2.mjs        Env: E2E_SHOTS=dir, E2E_SOFT=1 (never exit 1), E2E_ONLY=344 (one viewport).
// Per viewport on the hub: no horizontal overflow; every visible button/[data-act] >= 56x56; no two tap rects overlap; elementFromPoint at each tap
// centre returns the intended element; all visible text >= 14px; no clipped labels; no console errors. Then every plate / coins / save / field facility is tapped
// and the sheet it opens is audited too. Closed sheets between taps.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.E2E_SHOTS || '/tmp/hub-l2-shots/';
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
function auditInPage([scopeSel, skipMore]) {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const nm = (e) => (e.getAttribute('aria-label') || e.getAttribute('data-plate') || e.innerText || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 36);
  const sel = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (e.dataset && e.dataset.act ? `[${e.dataset.act}]` : '');
  const R = (e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
  const scope = (scopeSel && document.querySelector(scopeSel)) || document;
  const out = { hScroll: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1, small: [], tiny: [], clipped: [], overlap: [], miss: [], n: 0 };
  const taps = [...scope.querySelectorAll('button, a[href], [role="button"], [data-act], input, select, textarea')].filter(vis);
  const pins = skipMore ? [...document.querySelectorAll('.hb-foot, .hb-head')].map((x) => x.getBoundingClientRect()) : [];
  const pinned = (e) => { const foot = e.closest('.hb-foot, .hb-head'); if (foot) return false; const r = e.getBoundingClientRect(); return pins.some((q) => Math.min(r.right, q.right) - Math.max(r.left, q.left) > 2 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 2); };
  const uniq = [...new Set(taps)].filter((e) => !(skipMore && (e.closest('.hb-more') || pinned(e)))); // at rest: scroll content under a pinned bar is audited after scrolling
  out.n = uniq.length;
  for (const e of uniq) { const r = e.getBoundingClientRect(); if (r.height < 55.5 || r.width < 55.5) out.small.push(`${sel(e)} "${nm(e)}" ${R(e)}`); }
  // overlap: any two tap rects (not nested) that intersect by more than 2 px each way, only inside the viewport; fixed footer counts
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) {
    const a = uniq[i], b = uniq[j]; if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 2 && oy > 2) out.overlap.push(`${sel(a)} [${R(a)}] x ${sel(b)} [${R(b)}]`);
  }
  // hit test: the element at each tap centre must be the tap element or inside it (skip aria-hidden building buttons: tabindex -1 duplicates)
  for (const e of uniq) {
    const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
    if (scopeSel && e.closest('.c-sheet') && !e.closest('.c-sheet').contains(document.elementFromPoint(cx, cy))) { /* hit outside sheet = real */ } else if (scopeSel && document.elementFromPoint(cx, cy) === e.closest('.c-sheet')) continue; // scrolled-out sheet row
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(e === hit || e.contains(hit) || (hit.closest && hit.closest('button, [data-act]') === e))) out.miss.push(`${sel(e)} [${R(e)}] gets tap on ${hit ? sel(hit) : 'null'}`);
  }
  const w = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT); const seen = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(), e = n.parentElement; if (!t || !e || seen.has(e) || !vis(e) || e.closest('script,style,.sr-only,.ss-sr,[aria-hidden="true"]')) continue; seen.add(e);
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13.5) out.tiny.push(`"${t.slice(0, 24)}" ${fs}px in ${sel(e)} ${R(e)}`);
    const cs = getComputedStyle(e);
    if (cs.display !== 'inline' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== 'ellipsis') out.clipped.push(`"${t.slice(0, 24)}" scrollWidth ${e.scrollWidth} > ${e.clientWidth} in ${sel(e)} ${R(e)}`);
    // text escaping its button/plate/cell box
    const box = e.closest('button, .hb-cell, .hb-plate, .hb-chap, .hb-bubble');
    if (box) { const rg = document.createRange(); rg.selectNodeContents(e); const tr = rg.getBoundingClientRect(), br = box.getBoundingClientRect(); if (tr.width && (tr.left < br.left - 1.5 || tr.right > br.right + 1.5 || tr.top < br.top - 1.5 || tr.bottom > br.bottom + 1.5)) out.clipped.push(`"${t.slice(0, 24)}" text ${R(e)} leaves ${sel(box)} ${R(box)}`); }
  }
  for (const k of ['small', 'tiny', 'clipped', 'overlap', 'miss']) out[k] = [...new Set(out[k])].slice(0, 10);
  return out;
}

const results = []; // { vp, n, name, ok, why }
let curVp = '';
const step = (name, ok, why) => { results.push({ vp: curVp, name, ok: !!ok, why: ok ? '' : why || '' }); };

async function newPage(browser, vp, { dpr = 1, reduced = false, errs }) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: dpr, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__hl2fx')) { localStorage.setItem('cs.save.1', fx); localStorage.setItem('__hl2fx', '1'); } } catch (e) { /* blocked */ } }, FIXTURE);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) errs.push('network outside app: ' + r.url()); });
  await page.goto(`${ORIGIN}/cricket-sixes/`); await page.waitForFunction(() => window.__store && window.__store.get().stage, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(600);
  return { ctx, page };
}

async function audit(page, label, scopeSel, skipMore) {
  const a = await page.evaluate(auditInPage, [scopeSel || null, !!skipMore]);
  step(`${label}: no horizontal overflow`, !a.hScroll, 'document is wider than the viewport');
  step(`${label}: ${a.n} tap targets all >= 56x56`, !a.small.length, a.small.join(' ; '));
  step(`${label}: no overlapping tap rects`, !a.overlap.length, a.overlap.join(' ; '));
  step(`${label}: tap centre hits the intended element`, !a.miss.length, a.miss.join(' ; '));
  step(`${label}: text >= 14px`, !a.tiny.length, a.tiny.join(' ; '));
  step(`${label}: no clipped text`, !a.clipped.length, a.clipped.join(' ; '));
}

async function closeSheets(page) { for (let i = 0; i < 4 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } }

async function runHub(browser, key, vp, opts = {}) {
  curVp = key; const errs = [];
  const { ctx, page } = await newPage(browser, vp, { dpr: opts.dpr || 1, reduced: opts.reduced, errs });
  const shot = async (n) => { try { await page.screenshot({ path: `${SHOTS}hub-l2-${key.replace(/[^\w]+/g, '-')}-${n}.png` }); } catch (e) { /* optional */ } };
  try {
    if (opts.theme) { await page.evaluate((t) => window.__store.dispatch('SetTheme', { theme: t }), opts.theme); await page.waitForTimeout(400); const cls = await page.evaluate(() => document.body.className); step(`theme ${opts.theme} applied`, cls.includes('skin-' + opts.theme), `body class ${cls}`); }
    const st = await page.evaluate(() => (window.__store ? window.__store.get().stage : null));
    step('boots to hub', st === 'hub', `stage ${st}`);
    const ground = await page.waitForSelector('.hb-ground', { timeout: 5000 }).catch(() => null);
    if (!ground) step('diag', false, 'stage ' + st + ' body ' + (await page.evaluate(() => document.body.innerText.slice(0, 120).replace(/\s+/g, ' '))) + ' errs ' + errs.join('|'));
    step('hub renders .hb-ground (L2 layout)', !!ground, 'no .hb-ground');
    if (!ground) { await shot('no-ground'); return; }
    await page.waitForTimeout(400); // canvas draw + facility buttons
    await shot('hub');
    for (const s of ['.hb-head .hb-save', '.hb-board', '.hb-field', '.hb-row--top', '.hb-row--bot', '.hb-more', '.hb-foot']) step(`has ${s}`, !!(await page.$(s)), 'missing');
    step('canvas.hb-gcv present', !!(await page.$('.hb-ground canvas.hb-gcv')), 'missing');
    const ground2 = await page.evaluate(() => { const g = document.querySelector('.hb-ground').getBoundingClientRect(); return Math.round(g.height); });
    if (vp[0] === 344 && vp[1] === 882) step('ground height >= 440 at 344x882', ground2 >= 440, `ground is ${ground2}px tall`);
    // page at rest, then scrolled to the bottom (footer pinned): audit both
    await audit(page, 'hub top (below-fold .hb-more skipped)', null, true);
    const scrollable = await page.evaluate(() => { const se = document.scrollingElement; const sc = [...document.querySelectorAll('.hb-hub, .screen, #app')].find((e) => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)); (sc || se).scrollTop = 1e6; return !!sc || se.scrollHeight > innerHeight + 4; });
    await page.waitForTimeout(250);
    if (scrollable) { await audit(page, 'hub scrolled to bottom', null); await shot('hub-bottom'); }
    await page.evaluate(() => { for (const e of [document.scrollingElement, ...document.querySelectorAll('.hb-hub, .screen, #app')]) e.scrollTop = 0; });
    // taps
    const tapAndAudit = async (label, selector) => {
      const el = await page.$(selector); if (!el) return false;
      if (!(await el.isVisible())) return false;
      try { await el.click({ timeout: 3000 }); } catch (e) { step(`${label}: tap lands`, false, e.message.split('\n')[0]); return true; }
      await page.waitForTimeout(450);
      const open = await page.$('.c-sheet');
      step(`${label}: opens a sheet`, !!open, 'no .c-sheet after the tap');
      if (open) { await audit(page, `${label} sheet`, '.c-sheet'); await shot('sheet-' + label.replace(/\W+/g, '-')); }
      await closeSheets(page); step(`${label}: sheet closes`, !(await page.$('.c-sheet')), 'sheet stayed open');
      return true;
    };
    for (const slot of ['table', 'stadium', 'extras', 'book', 'workshop', 'fans']) {
      const there = await page.$(`.hb-plate[data-plate="${slot}"]`);
      if (!there) { step(`plate ${slot} absent only when locked`, !!(await page.$(`.hb-slot[data-slot="${slot}"]`)), `no plate and no slot ${slot}`); continue; }
      if ((await there.getAttribute('aria-disabled')) === 'true') { step(`plate ${slot} is locked (aria-disabled), not tapped`, true); continue; }
      await tapAndAudit(`plate ${slot}`, `.hb-plate[data-plate="${slot}"]`);
      // the building above the plate opens the same sheet
      const bld = await page.$(`.hb-ground .hb-fac[data-slot="${slot}"]`);
      if (bld && opts.taps !== false) {
        const want = await there.getAttribute('data-act');
        const r = await bld.boundingBox(); if (r) { await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(400); const open = !!(await page.$('.c-sheet')); step(`building ${slot}: tap opens a sheet (${want})`, open, 'no sheet'); await closeSheets(page); }
      }
    }
    await tapAndAudit('coins', '.hb-cell--coins');
    await tapAndAudit('save', '.hb-head .hb-save');
    const facs = await page.$$('.hb-ground .hb-fac[data-id]');
    step('field has live facility taps (pitch, nets, gym, scout)', facs.length >= 4, `${facs.length} .hb-ground .hb-fac[data-id]`);
    if (facs.length) {
      const ids = await page.$$eval('.hb-ground .hb-fac[data-id]', (els) => els.map((e) => e.getAttribute('aria-label') || e.dataset.fac || e.className));
      for (let i = 0; i < facs.length; i++) {
        const el = (await page.$$('.hb-ground .hb-fac[data-id]'))[i]; if (!el) break;
        try { await el.click({ timeout: 3000 }); } catch (e) { step(`facility "${ids[i]}": tap lands`, false, e.message.split('\n')[0]); continue; }
        await page.waitForTimeout(450); const open = await page.$('.c-sheet');
        step(`facility "${ids[i]}": opens its Level sheet`, !!open, 'no sheet');
        if (open && i === 0) { await audit(page, 'facility sheet', '.c-sheet'); await shot('sheet-facility'); }
        await closeSheets(page);
      }
    }
    if (opts.reduced) { const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length); step('reduced motion: no running animations on the hub', anim === 0, `${anim} running`); }
    step('no console/page errors, no network', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { step('script ran without throwing', false, e.stack || String(e)); }
  finally { await ctx.close(); }
}

const browser = await chromium.launch();
const VPS = [['344x882', [344, 882]], ['475x638', [475, 638]], ['704x783', [704, 783]]];
try {
  for (const [k, vp] of VPS) { if (ONLY && !k.startsWith(ONLY)) continue; await runHub(browser, k, vp); }
  if (!ONLY || ONLY === '344') {
    await runHub(browser, '344x882 dpr2', [344, 882], { dpr: 2, taps: false });
    await runHub(browser, '344x882 reduced-motion', [344, 882], { reduced: true, taps: false });
    await runHub(browser, '344x882 scorebook', [344, 882], { theme: 'scorebook', taps: false });
  }
} finally { await browser.close(); server.close(); }

let bad = 0; let last = '';
for (const r of results) { if (r.vp !== last) { console.log(`\n== ${r.vp} ==`); last = r.vp; } if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `\nFAIL: ${bad} of ${results.length} checks` : `\nPASS: ${results.length} checks`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
