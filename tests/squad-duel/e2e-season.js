// Squad Duel e2e for build sq-season-1. Run: node tests/squad-duel/e2e-season.js
// Serves pages/ on a random port 8100-8999, drives a full season by DOM ids (CONTRACT-SEASON.md),
// writes docs/squad-duel/sq-season-1/E2E.md + shots. Missing selector = FAIL with the selector named.
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const ROOT = path.resolve(__dirname, '../..');
const PAGES = path.join(ROOT, 'pages');
const OUT = path.join(ROOT, 'docs/squad-duel/sq-season-1');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const results = [];
function rec(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); }

function serve() {
  return new Promise((res, rej) => {
    const s = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(PAGES, p);
      if (!f.startsWith(PAGES) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('nf'); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    let tries = 0;
    (function tryListen() {
      const port = 8100 + Math.floor(Math.random() * 900);
      s.once('error', e => { if (++tries < 30) tryListen(); else rej(e); });
      s.listen(port, '127.0.0.1', () => res(s));
    })();
  });
}

const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); let x = e; while (x) { if (x.hidden || getComputedStyle(x).display === 'none') return false; x = x.parentElement; } return r.width > 0 && r.height > 0 && c.visibility !== 'hidden'; }, sel);
const enabled = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.disabled; }, sel);
async function waitVis(page, sel, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await vis(page, sel)) return true; await page.waitForTimeout(60); } return false; }
// click first visible of comma list; throws with a clear FAIL if none
async function click(page, sels, label) {
  const list = sels.split(',').map(s => s.trim());
  const t = Date.now();
  while (Date.now() - t < 8000) {
    for (const s of list) if (await vis(page, s)) { await page.click(s, { timeout: 5000 }); return s; }
    await page.waitForTimeout(60);
  }
  rec(label || ('click ' + sels), false, 'MISSING selector ' + sels + ' (not visible)');
  throw new Error('missing ' + sels);
}
async function need(page, sel, label, ms) { const ok = await waitVis(page, sel, ms || 6000); rec(label, ok, ok ? '' : 'MISSING selector ' + sel); if (!ok) throw new Error('missing ' + sel); }
let SHOT = true;
async function shot(page, w, name) { if (!SHOT) return; await page.waitForTimeout(150); await page.screenshot({ path: path.join(SHOTS, 'e2e-' + w + '-' + name + '.png') }); }

// layout: no page scroll, buttons >= 56 tall, text >= 12px
let QUIET = false;
async function layout(page, label) {
  if (QUIET) return;
  const r = await page.evaluate(() => {
    const se = document.scrollingElement;
    const shown = el => { let x = el; while (x && x.nodeType === 1) { const c = getComputedStyle(x); if (x.hidden || c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') return false; x = x.parentElement; } return true; };
    const bad = [], fonts = [], seen = new Set();
    document.querySelectorAll('button').forEach(b => {
      const rc = b.getBoundingClientRect();
      if (!shown(b) || rc.width === 0 || rc.height === 0) return;
      if (rc.height < 55.5) bad.push((b.id ? '#' + b.id : '.' + String(b.className).split(' ')[0]) + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height));
    });
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement; if (!el || seen.has(el) || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
      seen.add(el); if (!shown(el)) continue;
      const rc = el.getBoundingClientRect(); if (rc.width === 0 || rc.height === 0) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11.95) fonts.push((el.id ? '#' + el.id : el.getAttribute('class') ? '.' + el.getAttribute('class').split(' ')[0] : el.tagName.toLowerCase()) + ' ' + fs + 'px');
    }
    return { sh: se.scrollHeight, ih: innerHeight, sw: se.scrollWidth, iw: innerWidth, bad, fonts: [...new Set(fonts)] };
  });
  rec(label + ' no page scroll', r.sh <= r.ih + 1 && r.sw <= r.iw + 1, 'scrollH ' + r.sh + '/' + r.ih + ', scrollW ' + r.sw + '/' + r.iw);
  rec(label + ' buttons >=56px tall', r.bad.length === 0, r.bad.slice(0, 8).join('; '));
  rec(label + ' text >=12px', r.fonts.length === 0, r.fonts.slice(0, 6).join('; '));
}

function mkPage(browser, w, h) {
  return browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }).then(async ctx => {
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', r => { if (!/favicon/.test(r.url())) errs.push('reqfail: ' + r.url()); });
    page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push('http ' + r.status() + ': ' + r.url()); });
    return { ctx, page, errs };
  });
}

// plays the match on screen by DOM. stopAfterTurns: leave mid-match (returns turns done)
async function playMatch(page, L, tag, stopAfterTurns) {
  await need(page, '#hand', L(tag + ' match screen #hand'), 8000);
  let turns = 0, guard = 0, defN = 0, ht = false, ft = false;
  while (guard++ < 500) {
    if (stopAfterTurns && turns >= stopAfterTurns) return turns;
    if (await vis(page, '#fulltime')) { ft = true; await page.click('#btn-ft'); break; }
    if (await vis(page, '#halftime')) { ht = true; await page.click('#btn-half'); await page.waitForTimeout(100); continue; }
    if (await vis(page, '#btn-next') && await enabled(page, '#btn-next')) { await page.click('#btn-next'); await page.waitForTimeout(50); continue; }
    const cards = await page.$$('#hand .card');
    if (cards.length && await vis(page, '#btn-confirm')) {
      const defending = await page.evaluate(() => !!document.querySelector('#st-press,#st-drop'));
      await cards[0].click(); await page.waitForTimeout(40);
      let act = null;
      if (defending) act = await page.$('#st-' + (defN++ % 2 ? 'drop' : 'press') + ':not([disabled])');
      if (!act) act = await page.$('#acts button:not([disabled])');
      if (!act) { rec(L(tag + ' turn ' + (turns + 1) + ' action'), false, 'no enabled #acts button'); break; }
      await act.click(); await page.waitForTimeout(60);
      if (!(await enabled(page, '#btn-confirm'))) { rec(L(tag + ' turn ' + (turns + 1) + ' confirm'), false, '#btn-confirm disabled after card+action'); break; }
      await page.click('#btn-confirm'); turns++; await page.waitForTimeout(100);
      continue;
    }
    // match end may jump straight to shootout/result
    if (await vis(page, '#shootout') || await vis(page, '#result')) break;
    await page.waitForTimeout(70);
  }
  rec(L(tag + ' played to full time'), (ft || await vis(page, '#result') || await vis(page, '#shootout')) && turns >= 12, 'turns ' + turns + ' ht ' + ht + ' ft ' + ft);
  return turns;
}

async function shootoutPlay(page, L) {
  await need(page, '#shootout', L('shootout screen #shootout'), 8000);
  for (const s of ['#sh-label', '#sh-score', '#sh-kick']) rec(L('shootout has ' + s), await vis(page, s), 'MISSING selector ' + s);
  const cards = await page.$$('#shootout .sh-card[data-pid]');
  rec(L('shootout .sh-card count'), cards.length >= 3, cards.length + ' cards (expect 6)');
  await layout(page, L('shootout'));
  await shot(page, page.viewportSize().width, 'shootout');
  let g = 0, kicks = 0;
  while (g++ < 300) {
    if (await vis(page, '#btn-sh-done')) break;
    if (await vis(page, '#sh-kick') && await enabled(page, '#sh-kick')) {
      await page.click('#sh-kick'); kicks++; await page.waitForTimeout(120); continue;
    }
    const c = await page.$('#shootout .sh-card[data-pid]:not([disabled]):not(.used)');
    if (c) { await c.click(); await page.waitForTimeout(60); continue; }
    await page.waitForTimeout(100);
  }
  const done = await vis(page, '#btn-sh-done');
  const score = (await page.textContent('#sh-score').catch(() => '')) || '';
  const nums = (score.match(/\d+/g) || []).map(Number);
  rec(L('shootout plays to a winner'), done && nums.length >= 2 && nums[0] !== nums[1], 'kicks ' + kicks + ' score "' + score.trim() + '" Done ' + done);
  await click(page, '#btn-sh-done', L('shootout #btn-sh-done'));
  await page.waitForTimeout(300);
  rec(L('shootout left after Done'), !(await vis(page, '#shootout')), '');
}

// the whole season path. quiet = second run, only to compare report
async function season(browser, base, tag, w, h, quiet) {
  const { ctx, page, errs } = await mkPage(browser, w, h);
  const L = s => tag + ' ' + s;
  QUIET = !!quiet; SHOT = !quiet;
  let report = null;
  try {
    await page.goto(base + '/squad-duel/?seed=12345&fast=1&reset=1', { waitUntil: 'load' });
    await need(page, '#start', L('start screen #start'));
    const bid = await page.textContent('#build-id').catch(() => null);
    rec(L('start build id sq-season-1'), bid && /sq-season-1/.test(bid), bid === null ? 'MISSING selector #build-id' : '"' + bid.trim() + '"');
    await layout(page, L('start')); await shot(page, w, 'start');
    await click(page, '#btn-new', L('start #btn-new'));
    await need(page, '#hub', L('New game -> #hub'));
    for (const s of ['#hub-play', '#hub-lineup', '#hub-tree', '#hub-pull', '#hub-table', '#hub-track', '#hub-opp']) if (!(await vis(page, s))) rec(L('hub has ' + s), false, 'MISSING selector ' + s);
    await layout(page, L('hub')); await shot(page, w, 'hub');
    // 2 taps: Play, Kick off
    await click(page, '#hub-play', L('hub #hub-play'));
    await click(page, '#btn-kick, #btn-kickoff', L('manager kick-off #btn-kick'));
    rec(L('hub to match in 2 taps'), await waitVis(page, '#hand', 8000), 'after #hub-play + kick-off');
    await playMatch(page, L, 'MD1');
    await shot(page, w, 'md1-result');
    await need(page, '#result', L('MD1 result screen'));
    await layout(page, L('result'));
    await click(page, '#btn-result-next, #btn-result-continue, #btn-continue', L('result continue'));
    await need(page, '#mdres', L('MD1 -> #mdres'));
    {
      const n = await page.evaluate(() => { const r = document.querySelector('#mdres'); const t = r.innerText; return { rows: r.querySelectorAll('[data-id],.mr-row,.mdres-row,.res-row,tr').length, scores: (t.match(/\b\d+\s*[-:–]\s*\d+\b/g) || []).length }; });
      rec(L('mdres shows 3 other scores (+ mine = 4)'), n.scores >= 4, 'score patterns ' + n.scores + ', rows ' + n.rows);
    }
    await layout(page, L('mdres')); await shot(page, w, 'mdres');
    await click(page, '#btn-hub', L('mdres #btn-hub'));
    await need(page, '#hub', L('mdres -> hub'));
    // MDs 2-6 via debug sim
    const sim = await page.evaluate(() => { try { if (!SD.app.debug || !SD.app.debug.simLeague) return 'nosim'; SD.app.debug.simLeague(5); return JSON.stringify({ md: SD.app.S.season.md }); } catch (e) { return 'err ' + e.message; } });
    rec(L('simLeague(5) MDs 2-6'), /"md":6/.test(sim), sim);
    // re-render hub (state changed under it)
    await page.evaluate(() => { try { SD.app.toHub(); } catch (e) { } });
    await need(page, '#hub', L('hub after sim'));
    // table
    await click(page, '#hub-table', L('hub #hub-table'));
    await need(page, '#table', L('table screen #table'));
    {
      const t = await page.evaluate(() => { const rows = document.querySelectorAll('#tbl-rows .tbl-row'); const el = document.querySelector('#tbl-rows') || document.querySelector('#table'); let x = el, sideways = false; while (x && x !== document.documentElement) { if (x.scrollWidth > x.clientWidth + 1) sideways = true; x = x.parentElement; } const se = document.scrollingElement; return { n: rows.length, sideways, pageW: se.scrollWidth - innerWidth, ids: [...rows].map(r => r.getAttribute('data-id')) }; });
      rec(L('table has 8 rows'), t.n === 8, t.n + ' .tbl-row (' + t.ids.join(',') + ')');
      rec(L('table no sideways scroll'), !t.sideways && t.pageW <= 1, 'sideways ' + t.sideways + ' pageOverflow ' + t.pageW);
    }
    await rec_tab(page, L);
    await layout(page, L('table')); await shot(page, w, 'table');
    await click(page, '#btn-hub', L('table #btn-hub'));
    await need(page, '#hub', L('table -> hub'));
    // MD7 by DOM
    await click(page, '#hub-play', L('hub #hub-play (MD7)'));
    await click(page, '#btn-kick, #btn-kickoff', L('MD7 kick-off'));
    await playMatch(page, L, 'MD7');
    await need(page, '#result', L('MD7 result screen'));
    await click(page, '#btn-result-next, #btn-result-continue, #btn-continue', L('MD7 result continue'));
    await need(page, '#mdres', L('MD7 -> #mdres'));
    await click(page, '#btn-hub', L('MD7 mdres #btn-hub'));
    await need(page, '#hub', L('MD7 -> hub'));
    const md = await page.evaluate(() => SD.app.S.season.md);
    rec(L('league season complete (md 7)'), md === 7, 'md ' + md);
    // after league: Play -> cupintro (top 2) or end
    await click(page, '#hub-play', L('hub #hub-play (after MD7)'));
    await page.waitForTimeout(300);
    const where = (await vis(page, '#cupintro')) ? 'cupintro' : (await vis(page, '#season-end')) ? 'end' : 'other';
    rec(L('after MD7 Play -> cupintro or season end'), where !== 'other', where);
    report = await page.evaluate(() => SD.tweak && SD.tweak.report ? SD.tweak.report() : null);
  } catch (e) {
    rec(L('run aborted'), false, e.message.split('\n')[0]);
    try { await shot(page, w, 'abort-' + tag.replace(/\W/g, '')); } catch (_) { }
  }
  rec(L('no console/page errors'), errs.length === 0, errs.slice(0, 5).join(' | '));
  await ctx.close();
  return report;
}
async function rec_tab(page, L) {
  for (const s of ['#tab-table', '#tab-fix']) if (!(await vis(page, s))) rec(L('table has ' + s), false, 'MISSING selector ' + s);
  if (await vis(page, '#tab-fix')) { await page.click('#tab-fix'); await page.waitForTimeout(150); await page.click('#tab-table'); await page.waitForTimeout(100); }
}

// short scenario pages through ?jump=
async function jumpPage(browser, base, w, h, jump, fn) {
  const { ctx, page, errs } = await mkPage(browser, w, h);
  const L = s => '[' + w + ' ' + jump + '] ' + s;
  QUIET = false; SHOT = true;
  try {
    await page.goto(base + '/squad-duel/?seed=12345&fast=1&reset=1&jump=' + jump, { waitUntil: 'load' });
    await fn(page, L);
  } catch (e) { rec(L('run aborted'), false, e.message.split('\n')[0]); try { await shot(page, w, 'abort-' + jump); } catch (_) { } }
  rec(L('no console/page errors'), errs.length === 0, errs.slice(0, 5).join(' | '));
  await ctx.close();
}

async function scenarios(browser, base, w, h) {
  await jumpPage(browser, base, w, h, 'cupintro', async (page, L) => {
    await need(page, '#cupintro', L('cup intro #cupintro'));
    rec(L('cup intro #btn-cup-kick'), await vis(page, '#btn-cup-kick'), 'MISSING selector #btn-cup-kick');
    const t = await page.evaluate(() => document.querySelector('#cupintro').innerText);
    rec(L('cup intro mentions neutral / no crowd'), /neutral|no crowd/i.test(t), t.slice(0, 80).replace(/\n/g, ' '));
    await layout(page, L('cupintro')); await shot(page, w, 'cupintro');
  });
  await jumpPage(browser, base, w, h, 'shootout', async (page, L) => { await shootoutPlay(page, L); });
  await jumpPage(browser, base, w, h, 'end', async (page, L) => {
    await need(page, '#season-end', L('season end #season-end'));
    await layout(page, L('season end')); await shot(page, w, 'season-end');
    await click(page, '#btn-next-season', L('#btn-next-season'));
    await need(page, '#hub', L('next season -> hub'));
    const no = await page.evaluate(() => SD.app.S.season.no + '/md' + SD.app.S.season.md);
    rec(L('hub is season 2'), no === '2/md0', no);
    await layout(page, L('hub season 2'));
  });
  await jumpPage(browser, base, w, h, 'pull', async (page, L) => {
    await need(page, '#pull', L('pull screen #pull'));
    const n = await page.evaluate(() => ({ cells: document.querySelectorAll('#pull .grid-cell[data-pid]').length, e: !!document.querySelector('#pity-epic'), l: !!document.querySelector('#pity-legend'), b: !!document.querySelector('#btn-pull'), back: !!document.querySelector('#btn-pull-back') }));
    rec(L('pull grid 20 cells'), n.cells === 20, n.cells + ' .grid-cell[data-pid]');
    rec(L('pull pity bars #pity-epic + #pity-legend'), n.e && n.l, 'epic ' + n.e + ' legend ' + n.l);
    rec(L('pull #btn-pull + #btn-pull-back'), n.b && n.back, 'pull ' + n.b + ' back ' + n.back);
    await layout(page, L('pull')); await shot(page, w, 'pull');
  });
  await jumpPage(browser, base, w, h, 'tree', async (page, L) => {
    await need(page, '#btn-tree-back', L('tree screen #btn-tree-back'));
    const miss = await page.evaluate(() => ['A3', 'D3', 'S3'].filter(i => !document.querySelector('[data-node="' + i + '"]')));
    rec(L('tree tier-3 nodes A3 D3 S3'), miss.length === 0, miss.length ? 'MISSING [data-node=' + miss.join(',') + ']' : '');
    await layout(page, L('tree')); await shot(page, w, 'tree');
  });
  await jumpPage(browser, base, w, h, 'card', async (page, L) => {
    let ok = await waitVis(page, '#card-detail', 4000);
    if (!ok) { // lead note: manager picker rows have a "Card" button opening #card-detail
      try { if (!(await vis(page, '#btn-kickoff'))) { await page.evaluate(() => { try { SD.app.go('manager'); } catch (e) { } }); await page.waitForTimeout(300); }
        const b = await page.$('button:has-text("Card")'); if (b) { await b.click(); ok = await waitVis(page, '#card-detail', 3000); } } catch (e) { }
    }
    rec(L('manager card detail opens #card-detail'), ok, ok ? '' : 'MISSING selector #card-detail (jump=card)');
    if (ok) { await layout(page, L('card detail')); await shot(page, w, 'card-detail'); }
  });
}

// reload mid-match -> Continue resumes same state
async function resume(browser, base, w, h) {
  const { ctx, page, errs } = await mkPage(browser, w, h);
  const L = s => '[' + w + ' resume] ' + s;
  QUIET = false; SHOT = false;
  const snap = () => page.evaluate(() => { const m = SD.app && SD.app.m; if (!m) return null; const txt = id => { const e = document.querySelector(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }; return JSON.stringify({ score: m.score || m.sc || (m.summary ? null : null) || null, log: (m.log || []).length, half: m.half, turn: m.turn, info: txt('#info') }); });
  try {
    await page.goto(base + '/squad-duel/?seed=12345&fast=1&reset=1', { waitUntil: 'load' });
    await click(page, '#btn-new', L('#btn-new'));
    await click(page, '#hub-play', L('#hub-play'));
    await click(page, '#btn-kick, #btn-kickoff', L('kick-off'));
    const t = await playMatch(page, L, 'resume-pre', 4);
    await page.waitForTimeout(300);
    const before = await snap();
    await page.goto(base + '/squad-duel/?seed=12345&fast=1', { waitUntil: 'load' });
    const hasC = await vis(page, '#btn-continue');
    rec(L('start shows #btn-continue after reload'), hasC, 'MISSING selector #btn-continue');
    if (hasC) {
      await page.click('#btn-continue'); await waitVis(page, '#hand', 6000); await page.waitForTimeout(400);
      const after = await snap();
      rec(L('Continue resumes same score/turn'), !!before && before === after, 'turns before ' + t + '; before ' + before + ' / after ' + after);
    }
  } catch (e) { rec(L('run aborted'), false, e.message.split('\n')[0]); }
  rec(L('no console/page errors'), errs.length === 0, errs.slice(0, 5).join(' | '));
  await ctx.close();
}

function firstDiff(a, b) { const x = a.split('\n'), y = b.split('\n'); for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return 'line ' + (i + 1) + ': "' + (x[i] || '') + '" vs "' + (y[i] || '') + '"'; return 'differs'; }

(async () => {
  if (!fs.existsSync(path.join(PAGES, 'squad-duel/index.html'))) { console.log('no index.html'); process.exit(2); }
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await pw.chromium.launch();
  const r1 = await season(browser, base, '[344 run1]', 344, 882, false);
  const r2 = await season(browser, base, '[344 run2]', 344, 882, true);
  rec('report non-empty', !!r1 && r1.length > 100, 'len ' + (r1 || '').length);
  rec('same seed replay -> identical Copy report', !!r1 && r1 === r2, r1 === r2 ? '' : firstDiff(r1 || '', r2 || ''));
  await scenarios(browser, base, 344, 882);
  await resume(browser, base, 344, 882);
  await season(browser, base, '[475 run]', 475, 638, false);
  await scenarios(browser, base, 475, 638);
  await resume(browser, base, 475, 638);
  await browser.close(); srv.close();
  writeMd();
  process.exit(results.some(r => !r.ok) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function writeMd() {
  const f = results.filter(r => !r.ok);
  let t = '# Squad Duel sq-season-1 E2E\n\nGenerated by tests/squad-duel/e2e-season.js, ' + new Date().toISOString() + '\n\nTotal ' + results.length + ', pass ' + (results.length - f.length) + ', fail ' + f.length + '\n\n';
  t += '## Failures\n\n' + (f.length ? f.map(r => '- ' + r.name + ' :: ' + r.detail).join('\n') : 'none') + '\n\n## All checks\n\n';
  t += results.map(r => '- ' + (r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.detail ? ' :: ' + r.detail : '')).join('\n') + '\n\nShots: docs/squad-duel/sq-season-1/shots/e2e-*.png\n';
  fs.writeFileSync(path.join(OUT, 'E2E.md'), t);
}
