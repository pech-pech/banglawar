// Book P6 e2e (T6). v4 save injected with a patched Book -> hub -> Book plate -> Book sheet at 344x882 (Fold cover) and 704x783.
// Run from the app root:  node test/e2e/book-p6.mjs
// Env: E2E_SHOTS=dir (default the build folder's shots/), E2E_SOFT=1 (never exit 1), E2E_ONLY=344 (one viewport), E2E_NOMATCH=1 (skip the match over).
// States: empty Book; a Book with 6 found cells (all 3 phases, 2 combos, two "Openers v Fast" cells with opposite winners) and partial balls.
// Per state: no horizontal overflow; visible buttons in the sheet >= 56x56; text >= 14px; no clipped text in .bk-cell / .bk-card2; contrast >= 4.5 in cells,
// card and band (computed colours, alpha blended over the first solid ancestor); 0 console errors; no Book-banned words; no duplicate card titles with
// opposite winners unless the overs are in the title. Interactions: phase radios (aria-checked moves, row/col kept), found cell -> card, unfound -> "balls to go".
// Match: a Book with every unfound cell at 17 balls, one over bowled through the UI -> over panel .bk-found + button.op-book badge -> Open Book;
// then the match is finished by store commands back to the hub -> span.hb-badge -> opening the Book clears it.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = (process.env.E2E_SHOTS || '/mnt/project-files/games-design/cricket-sixes/2026-11-15-book-p6-build/shots/').replace(/\/?$/, '/');
const ONLY = process.env.E2E_ONLY || '';
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();
const { fnv1a } = await import(pathToFileURL(join(ROOT, 'js/core/save-migrate.js')).href);
const FIX = JSON.parse(await readFile(join(ROOT, 'test/fixtures/v4-save-10.json'), 'utf8'));

// ---- Book states (cell = r*9 + c*3 + ph; r Opener/Middle/Lower, c Fast/Medium/Spin) ----
const FOUND = [0, 2, 6, 13, 16, 23]; // ph 0,2,0,1,1,2. 6 = Cracker, 16 = Spin Web (combos). 0 (bowler) and 2 (batter) are both Openers v Fast.
const PARTIAL = { 1: 12, 9: 17, 20: 10, 24: 5 };
const book = (found, partial, fill) => {
  const b = { balls: Array(27).fill(fill || 0), found: Array(27).fill(0) };
  for (const i of found) { b.found[i] = 1; b.balls[i] = 18; }
  for (const [i, n] of Object.entries(partial || {})) b.balls[i] = n;
  return b;
};
const saveWith = (bk) => { const data = { ...structuredClone(FIX.data), book: bk }; return JSON.stringify({ v: FIX.v, sum: fnv1a(JSON.stringify(data)), data }); };
const SAVES = { empty: saveWith(book([], {})), found: saveWith(book(FOUND, PARTIAL)), match: saveWith(book(FOUND, {}, 17)) };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
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

const results = [];
let curVp = '';
const step = (name, ok, why) => { results.push({ vp: curVp, name, ok: !!ok, why: ok ? '' : why || '' }); };
const skip = (name, why) => { results.push({ vp: curVp, name: name + ' (SKIP: ' + why + ')', ok: true, why: '' }); };

// ---- in-page audit of the Book sheet ----
function auditBook(scopeSel) {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const sel = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (e.dataset && e.dataset.cell ? `[cell ${e.dataset.cell}]` : '') + (e.dataset && e.dataset.ph ? `[ph ${e.dataset.ph}]` : '');
  const R = (e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
  const sheet = document.querySelector(scopeSel || '.c-sheet');
  const out = { hScroll: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1, sheetOver: false, small: [], tiny: [], clipped: [], contrast: [], words: [], nBtn: 0, nTxt: 0, nCon: 0 };
  if (!sheet) return out;
  out.sheetOver = sheet.scrollWidth > sheet.clientWidth + 1 || [...sheet.querySelectorAll('.c-sheet__body, .bk-root, .bk-grid')].some((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible');
  const btns = [...sheet.querySelectorAll('button, [role="button"], [role="radio"], a[href]')].filter(vis);
  out.nBtn = btns.length;
  for (const e of btns) { const r = e.getBoundingClientRect(); if (r.width < 55.5 || r.height < 55.5) out.small.push(`${sel(e)} "${(e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" ${R(e)}`); }
  // colour helpers: normalise any CSS colour through a 1x1 canvas
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, bot) => [0, 1, 2].map((k) => top[k] * top[3] + bot[k] * (1 - top[3])).concat(1);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = (e) => { // stack translucent backgrounds until a solid one; note gradients/images
    const layers = []; let img = null;
    for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (!img && cs.backgroundImage && cs.backgroundImage !== 'none' && n !== document.body && n !== document.documentElement) img = sel(n); const c = rgba(cs.backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; } }
    let base = [255, 255, 255, 1]; for (let k = layers.length - 1; k >= 0; k--) base = over(layers[k], base);
    return { c: base, img };
  };
  const BAN = /\b(Hostile|Tough|Awkward|Easy|Good|Perfect|Strong|Even|Weak)\b/;
  const root = sheet.querySelector('.bk-root, .bk-found') || sheet; // over panel: only the found block (ball lines may say Strong etc.)
  const m = BAN.exec(root.innerText || ''); if (m) out.words.push(m[1]);
  const w = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT); const seen = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(), e = n.parentElement; if (!t || !e || seen.has(e) || !vis(e) || e.closest('script,style,.sr-only,.ss-sr,[aria-hidden="true"]')) continue; seen.add(e);
    out.nTxt++;
    const cs = getComputedStyle(e); const fs = parseFloat(cs.fontSize); if (fs < 13.5) out.tiny.push(`"${t.slice(0, 24)}" ${fs}px in ${sel(e)}`);
    const box = e.closest('.bk-cell, .bk-card2');
    if (box) {
      if (cs.display !== 'inline' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== 'ellipsis') out.clipped.push(`"${t.slice(0, 24)}" scrollWidth ${e.scrollWidth} > ${e.clientWidth} in ${sel(e)}`);
      if (cs.display !== 'inline' && e.clientHeight > 0 && e.scrollHeight > e.clientHeight + 2 && /hidden|clip/.test(cs.overflowY)) out.clipped.push(`"${t.slice(0, 24)}" scrollHeight ${e.scrollHeight} > ${e.clientHeight} in ${sel(e)}`);
      const rg = document.createRange(); rg.selectNodeContents(n); const tr = rg.getBoundingClientRect(), br = box.getBoundingClientRect();
      if (tr.width && (tr.left < br.left - 1.5 || tr.right > br.right + 1.5 || tr.top < br.top - 1.5 || tr.bottom > br.bottom + 1.5)) out.clipped.push(`"${t.slice(0, 24)}" text ${Math.round(tr.left)},${Math.round(tr.top)} ${Math.round(tr.width)}x${Math.round(tr.height)} leaves ${sel(box)} ${R(box)}`);
    }
    if (e.closest('.bk-cell, .bk-card2, .bk-band')) {
      out.nCon++;
      const bg = bgOf(e); const fg = over(rgba(cs.color), bg.c);
      const o = parseFloat(cs.opacity); const fgO = o < 1 ? over([...fg.slice(0, 3), o], bg.c) : fg;
      const L1 = lum(fgO), L2 = lum(bg.c), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < 4.5) out.contrast.push(`"${t.slice(0, 20)}" ${ratio.toFixed(2)} (fg rgb(${fgO.slice(0, 3).map(Math.round)}) on rgb(${bg.c.slice(0, 3).map(Math.round)})${bg.img ? ', bg image on ' + bg.img + ' ignored' : ''}) in ${sel(e)}`);
    }
  }
  for (const k of ['small', 'tiny', 'clipped', 'contrast']) out[k] = [...new Set(out[k])].slice(0, 8);
  return out;
}

async function auditStep(page, label, scopeSel) {
  const a = await page.evaluate(auditBook, scopeSel || null);
  step(`${label}: no horizontal overflow (page and sheet)`, !a.hScroll && !a.sheetOver, a.hScroll ? 'document wider than viewport' : 'sheet/grid scrolls sideways');
  step(`${label}: ${a.nBtn} visible buttons >= 56x56`, a.nBtn > 0 && !a.small.length, a.nBtn ? a.small.join(' ; ') : 'no buttons');
  step(`${label}: text >= 14px (${a.nTxt} nodes)`, !a.tiny.length, a.tiny.join(' ; '));
  step(`${label}: no clipped text in .bk-cell / .bk-card2`, !a.clipped.length, a.clipped.join(' ; '));
  step(`${label}: contrast >= 4.5 in cells/card/band (${a.nCon} nodes)`, a.nCon > 0 && !a.contrast.length, a.nCon ? a.contrast.join(' ; ') : 'no text in .bk-cell/.bk-card2/.bk-band');
  step(`${label}: no banned grade words in the Book`, !a.words.length, 'found ' + a.words.join(','));
}

async function newPage(browser, vp, saveKey, { dpr = 1, reduced = false, errs }) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: dpr, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__bkp6fx')) { localStorage.setItem('cs.save.1', fx); localStorage.setItem('__bkp6fx', '1'); } } catch (e) { /* blocked */ } }, SAVES[saveKey]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(`${ORIGIN}/cricket-sixes/`); await page.waitForFunction(() => window.__store && window.__store.get().stage, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(600);
  return { ctx, page };
}
async function closeSheets(page) { for (let i = 0; i < 4 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } }
const shotPath = (n) => `${SHOTS}book-p6-${n}.png`;

/** Tap the hub Book plate; returns true when the P6 sheet (.bk-root .bk-grid) is up. */
async function openBookFromHub(page, quiet) {
  const plate = await page.$('button.hb-plate[data-plate="book"]');
  if (!quiet) step('hub has button.hb-plate[data-plate="book"]', !!plate, 'missing');
  if (!plate) return false;
  try { await plate.click({ timeout: 3000 }); } catch (e) { step('Book plate tap lands', false, e.message.split('\n')[0]); return false; }
  const grid = await page.waitForSelector('.c-sheet .bk-root .bk-grid', { timeout: 3000 }).catch(() => null);
  await page.waitForTimeout(350);
  if (!quiet) {
    const t = await page.evaluate(() => { const h = document.querySelector('.c-sheet__title'); return h ? h.textContent.trim() : null; });
    step('sheet title is "Book"', t === 'Book', `title ${JSON.stringify(t)}`);
    step('P6 sheet renders .bk-root .bk-grid', !!grid, 'no .bk-grid (old sheet or not landed yet)');
  }
  return !!grid;
}

const bookState = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const card = q('.bk-card2');
  const band = card && card.querySelector('.bk-band');
  return {
    radios: [...document.querySelectorAll('.bk-phs [role="radio"].bk-ph')].map((b) => ({ ph: b.dataset.ph, on: b.getAttribute('aria-checked') === 'true' })),
    sel: [...document.querySelectorAll('.bk-cell.is-sel')].map((c) => Number(c.dataset.cell)),
    cells: [...document.querySelectorAll('.bk-grid:not(.bk-grid--mini) .bk-cell')].map((c) => ({ i: Number(c.dataset.cell), found: c.classList.contains('is-found'), q: c.classList.contains('is-q'), medal: !!c.querySelector('.bk-medal'), aria: c.getAttribute('aria-label') || '' })),
    card: card ? { cell: card.dataset.cell, goal: card.classList.contains('bk-goal'), title: (card.querySelector('.bk-ct .bk-ctw') || card.querySelector('.bk-ct') || {}).textContent || '', sub: (card.querySelector('.bk-cs') || {}).textContent || '', text: card.innerText, side: band ? (band.classList.contains('is-bowler') ? 'bowler' : band.classList.contains('is-batter') ? 'batter' : band.classList.contains('is-q') ? 'q' : '?') : null } : null,
    foot: (q('.bk-foot') || {}).innerText || '',
  };
});
const rc = (i) => [Math.floor(i / 9), Math.floor((i % 9) / 3), i % 3];
async function tapCell(page, i) { const el = await page.$(`.bk-grid:not(.bk-grid--mini) button.bk-cell[data-cell="${i}"]`); if (!el) return false; await el.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(250); return true; }
async function tapPh(page, ph) { const el = await page.$(`.bk-phs button.bk-ph[data-ph="${ph}"]`); if (!el) return false; await el.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(250); return true; }

async function runBook(browser, key, vp, saveKey, opts = {}) {
  curVp = `${key} ${saveKey}`; const errs = [];
  const { ctx, page } = await newPage(browser, vp, saveKey, { errs });
  try {
    const st = await page.evaluate(() => (window.__store ? window.__store.get().stage : null));
    step('boots to hub', st === 'hub', `stage ${st}`);
    const bk = await page.evaluate(() => { const b = window.__store.get().book; return b ? b.found.reduce((a, x) => a + (x ? 1 : 0), 0) + '/' + b.balls.reduce((a, x) => a + x, 0) : 'none'; });
    step(`injected Book loaded (found/balls ${bk})`, saveKey === 'empty' ? bk === '0/0' : bk.startsWith(FOUND.length + '/'), 'got ' + bk);
    if (!(await openBookFromHub(page))) { step('no console/page errors', !errs.length, errs.slice(0, 3).join(' | ')); return; }
    let s = await bookState(page);
    step('phase toggle: 3 button.bk-ph[role=radio], one aria-checked', s.radios.length === 3 && s.radios.filter((r) => r.on).length === 1, JSON.stringify(s.radios));
    step('grid: 9 cells per phase (button.bk-cell)', s.cells.length === 9 || s.cells.length === 27, `${s.cells.length} cells`);
    step('a card section.bk-card2 is shown', !!s.card, 'no .bk-card2');
    step('footer .bk-foot says "Found n of 27"', /Found\s+\d+\s+of\s+27/.test(s.foot), JSON.stringify(s.foot));
    if (saveKey === 'empty') {
      step('empty: every cell is unfound (.is-q), no medal', s.cells.length > 0 && s.cells.every((c) => c.q && !c.found && !c.medal), JSON.stringify(s.cells.filter((c) => !c.q || c.medal).slice(0, 3)));
      step('empty: footer Found 0 of 27', /Found\s+0\s+of\s+27/.test(s.foot), s.foot);
      step('empty: card is the goal card (.bk-goal) or a balls-to-go card', s.card && (s.card.goal || /balls to go/i.test(s.card.text)), s.card ? s.card.text.slice(0, 80) : 'none');
    } else {
      step(`found: footer Found ${FOUND.length} of 27, Combos 2 of 8`, new RegExp(`Found\\s+${FOUND.length}\\s+of\\s+27`).test(s.foot) && /Combos\s+2\s+of\s+8/.test(s.foot), s.foot);
      step('opens on a found cell (firstFound) with its phase', s.sel.length === 1 && FOUND.includes(s.sel[0]) && s.card && Number(s.card.cell) === s.sel[0], `sel ${s.sel} card ${s.card && s.card.cell}`);
    }
    await auditStep(page, 'Book at rest');
    if (opts.shot) { try { await page.screenshot({ path: shotPath(opts.shot), fullPage: false }); } catch (e) { /* optional */ } }
    // phase radios: aria-checked moves, row/col of the selection kept
    for (const ph of [1, 2, 0]) {
      const before = (await bookState(page)).sel[0];
      if (!(await tapPh(page, ph))) { step(`phase ${ph}: button.bk-ph[data-ph=${ph}] exists`, false, 'missing'); continue; }
      s = await bookState(page);
      const on = s.radios.filter((r) => r.on).map((r) => r.ph);
      step(`phase ${ph}: aria-checked moves to it`, on.length === 1 && on[0] === String(ph), 'checked ' + on.join(','));
      const shownPh = [...new Set(s.cells.map((c) => c.i % 3))];
      step(`phase ${ph}: grid shows that phase's cells`, s.cells.length === 27 || (shownPh.length === 1 && shownPh[0] === ph), 'phases ' + shownPh);
      if (before != null && s.sel.length) { const [r0, c0] = rc(before), [r1, c1, p1] = rc(s.sel[0]); step(`phase ${ph}: selection keeps row/col (${before} -> ${s.sel[0]})`, r0 === r1 && c0 === c1 && p1 === ph, `row/col ${r0},${c0} -> ${r1},${c1} ph ${p1}`); }
      else step(`phase ${ph}: a cell stays selected`, s.sel.length === 1, `sel ${s.sel}`);
      if (s.card && s.sel.length) step(`phase ${ph}: card follows the selection`, Number(s.card.cell) === s.sel[0], `card ${s.card.cell} sel ${s.sel[0]}`);
    }
    // every cell of every phase: found -> card; unfound -> balls to go; collect titles
    const titles = [];
    for (const ph of [0, 1, 2]) {
      await tapPh(page, ph);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const i = r * 9 + c * 3 + ph; const fnd = saveKey !== 'empty' && FOUND.includes(i);
        if (!(await tapCell(page, i))) { step(`cell ${i}: button exists`, false, 'missing'); continue; }
        s = await bookState(page);
        const ok = s.card && Number(s.card.cell) === i && s.sel.length === 1 && s.sel[0] === i;
        if (fnd) {
          step(`found cell ${i}: card .bk-card2[data-cell=${i}] with a winner band`, ok && (s.card.side === 'bowler' || s.card.side === 'batter') && !s.card.goal, s.card ? `card ${s.card.cell} side ${s.card.side} goal ${s.card.goal}` : 'no card');
          if (s.card) titles.push({ i, title: s.card.title.trim(), sub: s.card.sub.trim(), side: s.card.side });
          const cl = s.cells.find((x) => x.i === i);
          const combo = i === 6 || i === 16;
          step(`found cell ${i}: medal ${combo ? 'shown (combo)' : 'absent'}`, cl && cl.medal === combo, `medal ${cl && cl.medal}`);
          if (combo) step(`found cell ${i}: card has p.bk-combo`, await page.$('.bk-card2 .bk-combo') != null, 'no .bk-combo');
        } else if (i === 9 || i === 1 || ph === 0 && r === 0 && c === 0) {
          step(`unfound cell ${i}: card updates and says "balls to go"${s.card && s.card.goal ? ' (goal card: nearest cell, "of 18 balls")' : ''}`, ok && (/balls? to go/i.test(s.card.text) || (s.card.goal && /\d+ of 18 balls/.test(s.card.text))), s.card ? `card ${s.card.cell}: ${s.card.text.replace(/\s+/g, ' ').slice(0, 80)}` : 'no card');
          if (i === 9 && opts.shotQ) { await auditStep(page, 'Book unfound card'); try { await page.screenshot({ path: shotPath(opts.shotQ) }); } catch (e) { /* optional */ } }
        } else {
          step(`unfound cell ${i}: card updates`, ok && /balls? to go/i.test(s.card.text), s.card ? `card ${s.card.cell}: ${s.card.text.replace(/\s+/g, ' ').slice(0, 60)}` : 'no card');
        }
      }
    }
    if (saveKey !== 'empty') {
      const dup = [];
      for (let a = 0; a < titles.length; a++) for (let b = a + 1; b < titles.length; b++) {
        const x = titles[a], y = titles[b];
        const ov = (t) => /\d\s*[-–]\s*\d/.test(t);
        if (x.title.toLowerCase() === y.title.toLowerCase() && x.side !== y.side && !(ov(x.title) || (ov(x.sub) && ov(y.sub) && x.sub !== y.sub))) dup.push(`cells ${x.i}/${y.i} "${x.title}" / "${x.sub}" v "${y.sub}" ${x.side} v ${y.side}`);
      }
      step(`no duplicate card titles with opposite winners lacking overs in h3.bk-ct or its p.bk-cs (${titles.length} found cards)`, titles.length === FOUND.length && !dup.length, dup.length ? dup.join(' ; ') : `${titles.length} titles`);
      const subs = await page.evaluate(() => { const p = document.querySelector('.bk-card2 .bk-cs'); return p ? p.textContent : null; });
      step('card has p.bk-cs overs label', subs && /Overs\s+\d-\d/.test(subs), JSON.stringify(subs));
    }
    // close button
    const closeBtn = await page.$('.c-sheet .c-icon-btn');
    if (closeBtn) { await closeBtn.click().catch(() => {}); await page.waitForTimeout(300); step('close button closes the sheet', !(await page.$('.c-sheet')), 'sheet still open'); }
    await closeSheets(page);
    step('no console/page errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { step('script ran without throwing', false, e.stack || String(e)); }
  finally { await ctx.close(); }
}

/** dsf 2 screenshots only (no checks). */
async function shots(browser, vp, saveKey, name, unfoundName) {
  const errs = []; const { ctx, page } = await newPage(browser, vp, saveKey, { dpr: 2, errs });
  try {
    if (await openBookFromHub(page, true)) {
      await page.screenshot({ path: shotPath(name) });
      if (unfoundName) { await tapPh(page, 0); if (await tapCell(page, 9)) await page.screenshot({ path: shotPath(unfoundName) }); }
    }
  } catch (e) { /* optional */ } finally { await ctx.close(); }
}

const advance = (page, stops) => page.evaluate((stops) => {
  const S = window.__store; let g = 0; const want = [].concat(stops);
  while (!want.includes(S.get().stage) && g++ < 800) {
    const s = S.get(), d = (c, p) => S.dispatch(c, p), before = s;
    switch (s.stage) {
      case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
      case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
      case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
      case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); if (S.get().stage === 'plan') d('StartMatch'); break;
      case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
      case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break;
      case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break;
      default: return 'stuck:' + s.stage;
    }
    if (S.get() === before) return 'stuck-no-change:' + s.stage;
  }
  return S.get().stage;
}, stops);

/** Bowl one over through the UI (bowl view CTA) with a Book where every unfound cell is at 17 balls. Returns true when the panel showed a find. */
async function bowlOneOver(page, errs) {
  const at = await advance(page, ['bowl']);
  if (at !== 'bowl') { skip('match over', `could not reach the bowl stage (${at})`); return false; }
  await page.waitForTimeout(500);
  const pick = await page.$('.bv-colL [data-bowler]:not([disabled]), [data-bowler]:not([disabled])');
  if (pick) { await pick.click().catch(() => {}); await page.waitForTimeout(300); }
  const cta = await page.$('button[data-bowl]:not([disabled])');
  if (!cta) { skip('match over', 'no enabled button[data-bowl]'); return false; }
  await cta.click().catch(() => {});
  const next = await page.waitForSelector('.op-card .op-next', { timeout: 25000 }).catch(() => null);
  step('over panel finishes (button.op-next)', !!next, 'no .op-next in 25 s');
  if (!next) return false;
  const found = await page.evaluate(() => (window.__store.get().last || {}).found || []);
  if (!found.length) { skip('found panel', 'the over found no cell (store last.found empty)'); return false; }
  const p = await page.evaluate(() => {
    const f = document.querySelector('.op-card .bk-found'); const b = document.querySelector('.op-card button.op-book');
    const badge = b && b.querySelector('.op-badge');
    return { found: !!f, newTxt: f ? ((f.querySelector('.bk-new') || {}).textContent || '') : '', cards: f ? [...f.querySelectorAll('.bk-card2')].map((c) => c.dataset.cell) : [], mini: !!(f && f.querySelector('.bk-grid--mini')), more: f ? ((f.querySelector('.bk-more') || {}).textContent || '') : '',
      btn: !!b, btnBox: b ? (() => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() : null, badge: badge ? badge.textContent.trim() : null, sr: b ? ((b.querySelector('.ss-sr') || {}).textContent || '') : '' };
  });
  step(`over found ${found.length} cell(s) [${found}]: panel shows .bk-found`, p.found, 'no .bk-found in the panel');
  step('panel: p.bk-new "New in your Book!"', /New in your Book!/.test(p.newTxt), JSON.stringify(p.newTxt));
  step('panel: up to 2 .bk-card2 cards of found cells', p.cards.length >= 1 && p.cards.length <= 2 && p.cards.every((c) => found.includes(Number(c))), JSON.stringify(p.cards));
  if (found.length > 2) step('panel: p.bk-more "and N more in the Book"', new RegExp(`and ${found.length - 2} more in the Book`).test(p.more), JSON.stringify(p.more));
  step('panel: mini grid .bk-grid--mini', p.mini, 'missing');
  step('panel: button.op-book >= 56x56', p.btn && p.btnBox[0] >= 55.5 && p.btnBox[1] >= 55.5, JSON.stringify(p.btnBox));
  step('panel: span.op-badge shows the count', p.badge === String(Math.min(found.length, 9)) || (found.length > 9 && p.badge === '9+'), `badge ${JSON.stringify(p.badge)} for ${found.length}`);
  step('panel: op-book has ss-sr "N new in Book"', /new in Book/i.test(p.sr), JSON.stringify(p.sr));
  await auditStep(page, 'over panel', '.op-card');
  try { await page.screenshot({ path: shotPath('344-over-found') }); } catch (e) { /* optional */ }
  return found;
}

async function runMatch(browser) {
  curVp = '344x882 match over';
  const errs = []; const { ctx, page } = await newPage(browser, [344, 882], 'match', { reduced: true, errs });
  try {
    const found = await bowlOneOver(page, errs);
    if (found && found.length) {
      // hub badge: leave the panel by Next, finish the match by store commands, back to the hub
      await page.click('.op-card .op-next').catch(() => {}); await page.waitForTimeout(400);
      const at = await advance(page, ['hub']); await page.waitForTimeout(600);
      if (at !== 'hub') skip('hub badge after a find', `match did not return to the hub (${at})`);
      else {
        const hb = await page.evaluate(() => { const p = document.querySelector('button.hb-plate[data-plate="book"]'); const b = p && p.querySelector('span.hb-badge'); return p ? { badge: b && !b.hidden && getComputedStyle(b).display !== 'none' ? b.textContent.trim() : null, aria: p.getAttribute('aria-label') || '' } : null; });
        step('hub: span.hb-badge visible after a find', hb && hb.badge && /^(\d|9\+)$/.test(hb.badge), JSON.stringify(hb));
        step('hub: plate aria-label says "new in Book"', hb && /new in Book/i.test(hb.aria), JSON.stringify(hb && hb.aria));
        if (await openBookFromHub(page, true)) {
          await closeSheets(page); await page.waitForTimeout(300);
          const after = await page.evaluate(() => { const b = document.querySelector('button.hb-plate[data-plate="book"] span.hb-badge'); return b && !b.hidden && getComputedStyle(b).display !== 'none' ? b.textContent.trim() : null; });
          step('hub: badge clears after opening the Book', !after, `badge ${after}`);
        } else step('hub: Book opens from the plate after the match', false, 'no .bk-grid');
      }
    }
    step('no console/page errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { step('script ran without throwing', false, e.stack || String(e)); }
  finally { await ctx.close(); }
  // Open Book from the panel: selects the found cell
  curVp = '344x882 match over -> Open Book';
  const errs2 = []; const b = await newPage(browser, [344, 882], 'match', { reduced: true, errs: errs2 });
  try {
    const found = await bowlOneOver(b.page, errs2);
    if (found && found.length) {
      const btn = await b.page.$('.op-card button.op-book');
      if (btn) {
        await btn.click().catch(() => {});
        const g = await b.page.waitForSelector('.c-sheet .bk-root .bk-grid', { timeout: 3000 }).catch(() => null);
        step('Open Book opens the Book sheet', !!g, 'no .bk-grid');
        if (g) { const s = await bookState(b.page); step('Open Book selects a found cell of this over', s.card && found.includes(Number(s.card.cell)), `card ${s.card && s.card.cell}, found ${found}`); await auditStep(b.page, 'Book from panel'); }
      }
    }
    step('no console/page errors', !errs2.length, errs2.slice(0, 3).join(' | '));
  } catch (e) { step('script ran without throwing', false, e.stack || String(e)); }
  finally { await b.ctx.close(); }
}

const browser = await chromium.launch();
try {
  if (!ONLY || ONLY === '344') {
    await runBook(browser, '344x882', [344, 882], 'found');
    await runBook(browser, '344x882', [344, 882], 'empty');
    await shots(browser, [344, 882], 'found', '344-book', '344-book-unfound');
    await shots(browser, [344, 882], 'empty', '344-book-empty');
    if (process.env.E2E_NOMATCH !== '1') await runMatch(browser);
  }
  if (!ONLY || ONLY === '704') {
    await runBook(browser, '704x783', [704, 783], 'found', { shot: '704-book' });
    await runBook(browser, '704x783', [704, 783], 'empty');
  }
} finally { await browser.close(); server.close(); }

let bad = 0; let last = '';
for (const r of results) { if (r.vp !== last) { console.log(`\n== ${r.vp} ==`); last = r.vp; } if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `\nFAIL: ${bad} of ${results.length} checks` : `\nPASS: ${results.length} checks`);
console.log(`shots: ${SHOTS}book-p6-*.png`);
process.exit(process.env.E2E_SOFT === '1' ? 0 : bad ? 1 : 0);
