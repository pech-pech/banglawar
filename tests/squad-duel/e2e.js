// Squad Duel e2e (checker 2). Run: node tests/squad-duel/e2e.js
// Serves pages/ on a free port, plays the slice by DOM ids, writes docs/squad-duel/E2E.md + shots.
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const ROOT = path.resolve(__dirname, '../..');
const PAGES = path.join(ROOT, 'pages');
const SHOTS = path.join(ROOT, 'docs/squad-duel/shots');
const MD = path.join(ROOT, 'docs/squad-duel/E2E.md');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const results = []; // {name, ok, detail}
function rec(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); }

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(PAGES, p);
      if (!f.startsWith(PAGES) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('nf'); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(s));
  });
}

// per-screen layout assertions
let QUIET = false;
async function layout(page, label) {
  if (QUIET) return;
  const r = await page.evaluate(() => {
    const se = document.scrollingElement;
    const bad = [];
    document.querySelectorAll('button').forEach(b => {
      const cs = getComputedStyle(b), rc = b.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || b.hidden || rc.width === 0 || rc.height === 0) return;
      let el = b, hid = false; while (el) { const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden' || el.hidden || c.opacity === '0') { hid = true; break; } el = el.parentElement; }
      if (hid) return;
      if (rc.width < 55.5 || rc.height < 55.5) bad.push((b.id ? '#' + b.id : b.className ? '.' + String(b.className).split(' ')[0] : 'button') + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height) + ' "' + (b.textContent || '').trim().slice(0, 20) + '"');
    });
    return { sh: se.scrollHeight, ih: innerHeight, sw: se.scrollWidth, iw: innerWidth, bad };
  });
  rec(label + ' no page scroll', r.sh <= r.ih + 1 && r.sw <= r.iw + 1, 'scrollH ' + r.sh + ' vs ' + r.ih + ', scrollW ' + r.sw + ' vs ' + r.iw);
  rec(label + ' buttons >=56x56', r.bad.length === 0, r.bad.slice(0, 8).join('; '));
}

const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); let x = e; while (x) { if (x.hidden || getComputedStyle(x).display === 'none') return false; x = x.parentElement; } return r.width > 0 && r.height > 0 && c.visibility !== 'hidden'; }, sel);
const enabled = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.disabled; }, sel);
async function waitVis(page, sel, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await vis(page, sel)) return true; await page.waitForTimeout(60); } return false; }
async function click(page, sel, label) {
  if (!(await waitVis(page, sel))) { rec(label || ('click ' + sel), false, sel + ' not visible'); throw new Error('missing ' + sel); }
  await page.click(sel, { timeout: 5000 });
}
async function shot(page, w, name) { await page.waitForTimeout(150); await page.screenshot({ path: path.join(SHOTS, w + '-' + name + '.png') }); }

async function play(browser, base, tag, w, h, full, quiet) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => { if (!/favicon/.test(r.url())) errs.push('reqfail: ' + r.url()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push('http ' + r.status() + ': ' + r.url()); });
  const L = (s) => tag + ' ' + s;
  QUIET = !!quiet;
  const doShot = quiet ? async () => { } : (n) => shot(page, w, n);
  let report = null;
  try {
    await page.goto(base + '/squad-duel/?seed=12345&fast=1&reset=1', { waitUntil: 'load' });
    await click(page, '#btn-new', L('start #btn-new'));
    await page.waitForTimeout(200);
    await layout(page, L('start'));
    // start screenshot taken before click? take after reload below
    // manager 1
    await waitVis(page, '#mgr');
    rec(L('manager1 shown'), await vis(page, '#mgr') && await vis(page, '#mgr-pitch') && await vis(page, '#btn-kickoff'), '#mgr/#mgr-pitch/#btn-kickoff');
    await layout(page, L('manager1'));
    await doShot('manager1');
    if (!full) {
      // smoke: match + end only; still need to play through
    }
    // change formation
    const before = await page.getAttribute('#form-wall', 'aria-pressed');
    await click(page, '#form-spear');
    await page.waitForTimeout(100);
    const afterP = await page.getAttribute('#form-spear', 'aria-pressed');
    rec(L('formation change aria-pressed'), afterP === 'true', 'form-spear aria-pressed=' + afterP + ' (wall was ' + before + ')');
    await doShot('manager1-spear');
    await click(page, '#btn-kickoff');
    // match 1
    await playMatch(page, L, w, 1, full, doShot);
    // result 1
    await click(page, '#btn-result-next', L('result1 #btn-result-next'));
    // (result screen asserted inside playMatch end)
    // tree
    await waitVis(page, '#tree');
    await layout(page, L('tree'));
    await doShot('tree');
    {
      const sp0 = await page.textContent('#sp');
      for (const id of ['A1', 'A2']) {
        const sel = '.node[data-id="' + id + '"]';
        if (!(await vis(page, sel))) { rec(L('tree node ' + id), false, sel + ' not visible on default tab'); continue; }
        await page.click(sel);
        const ok = await waitVis(page, '#btn-buy', 2000);
        if (!ok) { rec(L('tree buy ' + id), false, '#btn-buy not visible after tap'); continue; }
        if (!(await enabled(page, '#btn-buy'))) { rec(L('tree buy ' + id), false, '#btn-buy disabled (sp ' + await page.textContent('#sp') + ')'); continue; }
        await page.click('#btn-buy'); await page.waitForTimeout(150);
        const st = await page.evaluate(i => { const n = document.querySelector('.node[data-id="' + i + '"]'); return n ? n.className + '|' + (n.getAttribute('data-state') || '') + '|' + (n.getAttribute('aria-pressed') || '') : null; }, id);
        const owned = await page.evaluate(i => { try { const n = SD.app.S.nodes || SD.app.S.tree || SD.app.S.owned; return JSON.stringify(n).includes(i); } catch (e) { return null; } }, id);
        rec(L('tree buy ' + id), /owned/i.test(st || '') || owned === true, 'sp ' + sp0 + ' -> ' + await page.textContent('#sp') + '; node ' + st + '; inState ' + owned);
      }
      await doShot('tree-bought');
    }
    await click(page, '#btn-tree-next', L('tree #btn-tree-next'));
    // pull
    await waitVis(page, '#pull');
    await layout(page, L('pull'));
    await doShot('pull');
    let pulledPid = null;
    {
      const before = await page.evaluate(() => JSON.stringify(SD.app.S.owned || SD.app.S.roster || SD.app.S.players || null));
      await click(page, '#btn-pull');
      rec(L('pull reveal'), await waitVis(page, '#pull-reveal', 4000), '#pull-reveal');
      await page.waitForTimeout(500);
      await layout(page, L('pull-reveal'));
      await doShot('pull-reveal');
    }
    rec(L('pull grid'), await vis(page, '#grid') && (await page.$$('#grid .slot12')).length === 12, 'slot12 count ' + (await page.$$('#grid .slot12')).length);
    await doShot('pull-grid');
    await click(page, '#btn-pull-next', L('pull #btn-pull-next'));
    // manager 2
    await waitVis(page, '#mgr');
    await layout(page, L('manager2'));
    await doShot('manager2');
    // field newest/pulled player via slot swap: pick bench slot b0, choose a squad card that is not currently fielded (prefer .badge-new)
    const sw = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const slot = document.querySelector('#mgr-bench .slot[data-slot="b0"]') || document.querySelector('.slot[data-slot="o3"]');
      if (!slot) return 'noslot';
      slot.click(); await wait(150);
      const cards = [...document.querySelectorAll('#mgr-squad .sq-card')];
      if (!cards.length) return 'nocards';
      const pick = cards.find(c => c.querySelector('.badge-new') || /new/i.test(c.className)) || cards[cards.length - 1];
      const pid = pick.getAttribute('data-pid'); pick.click(); await wait(150);
      const now = [...document.querySelectorAll('#mgr .slot')].map(s => s.getAttribute('data-slot') + ':' + (s.textContent || '').slice(0, 30));
      return 'swapped ' + pid + ' into ' + slot.getAttribute('data-slot') + ' / cards ' + cards.length;
    });
    rec(L('manager2 slot swap'), /^swapped/.test(sw), sw);
    await doShot('manager2-swapped');
    await layout(page, L('manager2 after swap'));
    await click(page, '#btn-kickoff');
    await playMatch(page, L, w, 2, full, doShot);
    await click(page, '#btn-result-next', L('result2 #btn-result-next'));
    await waitVis(page, '#end');
    rec(L('end shown'), await vis(page, '#end') && await vis(page, '#grid') && await vis(page, '#track') && await vis(page, '#btn-restart'), '#end/#grid/#track/#btn-restart');
    await layout(page, L('end'));
    await doShot('end');
    report = await page.evaluate(() => SD.tweak.report());
    if (full && !quiet && w === 344) {
      // gear / dev
      await click(page, '#gear', L('#gear'));
      rec(L('tweak overlay'), await waitVis(page, '#tweak', 2000), '#tweak');
      await layout(page, L('tweak'));
      await doShot('tweak');
      const key = await page.evaluate(() => {
        const el = document.querySelector('#tweak [data-key]'); if (!el) return null;
        const k = el.getAttribute('data-key');
        if (el.type === 'checkbox') { el.checked = !el.checked; }
        else if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; }
        else { const n = parseFloat(el.value); el.value = isNaN(n) ? el.value + '1' : String(n + 1); }
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return k;
      });
      await page.waitForTimeout(200);
      rec(L('tweak change -> #dev visible'), key && await vis(page, '#dev'), 'changed key ' + key);
      await doShot('tweak-changed');
      if (await vis(page, '#tw-close')) await page.click('#tw-close');
    }
  } catch (e) {
    rec(L('run aborted'), false, e.message.split('\n')[0]);
    try { await shot(page, w, 'abort-' + tag.replace(/\W/g, '')); } catch (_) { }
  }
  rec(L('no console/page errors'), errs.length === 0, errs.slice(0, 5).join(' | '));
  await ctx.close();
  return report;
}


// ---- sq-ui-1 contract checks (CONTRACT-UI.md "Tests") ----
const sceneRect = (page) => page.evaluate(() => { const e = document.querySelector('#scene'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const rectDiff = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
const fontScan = (page) => page.evaluate(() => {
  const roots = ['#screen', '#top'].map(s => document.querySelector(s)).filter(Boolean);
  if (!roots.length) return { missing: true, bad: [] };
  const bad = [], seen = new Set();
  const visible = (el) => { let x = el; while (x && x.nodeType === 1) { const c = getComputedStyle(x); if (x.hidden || c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') return false; x = x.parentElement; } return true; };
  roots.forEach(root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement; if (!el || seen.has(el) || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
      seen.add(el);
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11.95) bad.push((el.id ? '#' + el.id : (el.getAttribute('class') ? '.' + el.getAttribute('class').split(' ')[0] : el.tagName.toLowerCase())) + ' ' + fs + 'px "' + n.nodeValue.trim().slice(0, 14) + '"');
    }
  });
  return { missing: false, bad };
});
// per-match accumulator for the contract checks
function newAcc() { return { oddsBad: [], oddsTurns: 0, oddsMissingSel: 0, tot: [], totChecked: 0, totSel: 0, scene: [], sceneChecked: 0, font: [], fontMissing: false, press: 0, drop: 0, pressRes: 0, dropRes: 0, lastRect: null, pending: null, defN: 0 }; }
async function preTurnChecks(page, acc, no, turn) {
  const o = await page.evaluate(() => { const cs = [...document.querySelectorAll('#hand .card')]; return { n: cs.length, noOddsEl: cs.filter(c => !c.querySelector('.odds')).length, empty: cs.filter(c => { const e = c.querySelector('.odds'); return e && !(e.textContent || '').trim(); }).length, def: !!document.querySelector('#st-press,#st-drop') }; });
  acc.oddsTurns++;
  if (o.noOddsEl) acc.oddsMissingSel++;
  if (o.noOddsEl || o.empty) acc.oddsBad.push('T' + turn + (o.def ? 'def' : 'att') + ' ' + o.noOddsEl + '/' + o.n + ' cards lack .odds, ' + o.empty + ' empty');
  const r = await sceneRect(page); acc.lastRect = r;
  const f = await fontScan(page); if (f.missing) acc.fontMissing = true; f.bad.forEach(b => acc.font.push('T' + turn + ' pick ' + b));
}
async function resultChecks(page, acc, turn) {
  const d = await page.evaluate(() => {
    const t = s => { const e = document.querySelector(s); return e ? (e.textContent || '').trim() : null; };
    const log = (window.SD && SD.app && SD.app.m && SD.app.m.log) || [];
    const ev = log[log.length - 1];
    return { my: t('#band-my-tot'), op: t('#band-op-tot'), cause: ev ? ev.cause : null, side: ev ? ev.side : null };
  });
  acc.totChecked++;
  if (d.my === null || d.op === null) { acc.totSel++; }
  else {
    const nums = d.cause ? [...d.cause.matchAll(/= (\d+)/g)].map(x => x[1]) : [];
    if (nums.length < 2) acc.tot.push('T' + turn + ' cannot parse cause "' + (d.cause || '') + '"');
    else {
      const exp = d.side === 'me' ? { my: nums[0], op: nums[1] } : { my: nums[1], op: nums[0] };
      if (d.my !== exp.my || d.op !== exp.op) acc.tot.push('T' + turn + ' ' + d.side + ' band ' + d.my + ' v ' + d.op + ' but cause ' + exp.my + ' v ' + exp.op);
    }
  }
  const r = await sceneRect(page);
  if (acc.lastRect && r) { acc.sceneChecked++; const df = rectDiff(acc.lastRect, r); if (df > 1) acc.scene.push('T' + turn + ' scene moved ' + df.toFixed(1) + 'px (' + Math.round(acc.lastRect.h) + ' -> ' + Math.round(r.h) + ' tall)'); }
  const f = await fontScan(page); if (f.missing) acc.fontMissing = true; f.bad.forEach(b => acc.font.push('T' + turn + ' result ' + b));
}
function reportAcc(L, m, acc) {
  const sum = a => a.slice(0, 4).join('; ') + (a.length > 4 ? ' (+' + (a.length - 4) + ' more)' : '');
  rec(L(m + ' C1 band total == cause total'), acc.totChecked >= 8 && acc.totSel === 0 && acc.tot.length === 0,
    acc.totSel ? 'MISSING selector #band-my-tot / #band-op-tot (result.drawBand) on ' + acc.totSel + ' turns' : acc.totChecked < 8 ? 'only ' + acc.totChecked + ' result states reached' : sum(acc.tot) || (acc.totChecked + ' turns ok'));
  rec(L(m + ' C1 Press and Drop each picked + resolved'), acc.pressRes > 0 && acc.dropRes > 0, 'press picked ' + acc.press + ' resolved ' + acc.pressRes + ', drop picked ' + acc.drop + ' resolved ' + acc.dropRes);
  rec(L(m + ' C2 every .card shows non-empty .odds'), acc.oddsBad.length === 0 && acc.oddsTurns > 0, acc.oddsMissingSel ? 'MISSING .card .odds element (m-cards) ' + sum(acc.oddsBad) : sum(acc.oddsBad) || (acc.oddsTurns + ' hands ok'));
  const fk = [...new Set(acc.font.map(x => x.replace(/^T\d+ (pick|result) /, '').replace(/ "[^"]*"$/, '')))];
  rec(L(m + ' C3 no text under 12px'), acc.font.length === 0 && !acc.fontMissing, acc.fontMissing ? 'MISSING #screen/#top root' : fk.length + ' distinct selectors <12px: ' + sum(fk));
  rec(L(m + ' C4 #scene rect stable pick->result'), acc.sceneChecked > 0 && acc.scene.length === 0, acc.sceneChecked ? sum(acc.scene) || (acc.sceneChecked + ' turns +-1px') : 'MISSING #scene or no result state seen (m-frame row 14)');
}

async function playMatch(page, L, w, no, full, doShot) {
  const m = 'match' + no;
  await waitVis(page, '#hand', 8000);
  rec(L(m + ' shown'), await vis(page, '#info') && await vis(page, '#scene') && await vis(page, '#band'), '#info/#scene/#band');
  let turns = 0, guard = 0, firstShot = false, defShot = false, ht = false, ft = false;
  const acc = newAcc();
  // result state is momentary when autoNext fires in fast mode; hold it so the contract checks can read it (UI-only, no RNG effect)
  if (!QUIET) await page.evaluate(() => { try { SD.app.m.T.autoNext = false; } catch (e) { } });
  while (guard++ < 400) {
    if (!QUIET && acc.pending && await vis(page, '#btn-next')) {
      await resultChecks(page, acc, acc.pending.turn);
      if (acc.pending.stance === 'press') acc.pressRes++; else if (acc.pending.stance === 'drop') acc.dropRes++;
      acc.pending = null;
    }
    if (await vis(page, '#fulltime')) {
      if (!ft) { ft = true; await layout(page, L(m + ' fulltime')); await doShot(m + '-fulltime'); }
      await page.click('#btn-ft'); break;
    }
    if (await vis(page, '#halftime')) {
      if (!ht) { ht = true; await layout(page, L(m + ' halftime')); await doShot(m + '-halftime'); }
      await page.click('#btn-half'); await page.waitForTimeout(100); continue;
    }
    if (await vis(page, '#btn-next') && await enabled(page, '#btn-next')) {
      if (full && turns === 1 && no === 1) { await layout(page, L(m + ' after-resolve')); await doShot(m + '-resolved'); }
      await page.click('#btn-next'); await page.waitForTimeout(60); continue;
    }
    const cards = await page.$$('#hand .card');
    if (cards.length && await vis(page, '#btn-confirm')) {
      const defending = await page.evaluate(() => !!document.querySelector('#st-press,#st-drop'));
      if (!QUIET) await preTurnChecks(page, acc, no, turns + 1);
      await cards[0].click(); await page.waitForTimeout(50);
      let act = null, stance = null;
      if (defending) { stance = (acc.defN++ % 2 === 0) ? 'press' : 'drop'; act = await page.$('#st-' + stance + ':not([disabled])'); if (!act) stance = null; }
      if (!act) act = await page.$('#acts button:not([disabled])');
      if (!act) { rec(L(m + ' turn ' + (turns + 1) + ' action'), false, 'no enabled #acts button'); break; }
      await act.click(); await page.waitForTimeout(80);
      if (!(await enabled(page, '#btn-confirm'))) { rec(L(m + ' turn ' + (turns + 1) + ' confirm enabled'), false, '#btn-confirm still disabled after card+action'); break; }
      if ((full && turns < 2) || (turns === 0)) {
        if (!firstShot && !defending) { firstShot = true; await layout(page, L(m + ' attack-turn')); await doShot(m + '-attack'); }
      }
      if (defending && !defShot) { defShot = true; await layout(page, L(m + ' defend-turn')); await doShot(m + '-defend'); }
      if (stance === 'press') acc.press++; else if (stance === 'drop') acc.drop++;
      await page.click('#btn-confirm'); turns++; await page.waitForTimeout(120);
      if (!QUIET) acc.pending = { turn: turns, stance };
      continue;
    }
    await page.waitForTimeout(80);
  }
  rec(L(m + ' played 12 turns'), turns === 12, 'turns confirmed ' + turns);
  rec(L(m + ' halftime+fulltime seen'), ht && ft, 'ht ' + ht + ' ft ' + ft);
  await waitVis(page, '#result', 6000);
  rec(L(m + ' result shown'), await vis(page, '#result') && await vis(page, '#btn-result-next'), '#result/#btn-result-next');
  await layout(page, L('result' + no));
  await doShot('result' + no);
  if (!QUIET) reportAcc(L, m, acc);
}

(async () => {
  const idx = path.join(PAGES, 'squad-duel/index.html');
  if (!fs.existsSync(idx)) { console.log('no index.html'); process.exit(2); }
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await pw.chromium.launch();
  const r1 = await play(browser, base, '[344 run1]', 344, 882, true, false);
  const r2 = await play(browser, base, '[344 run2]', 344, 882, true, true);
  // report checks
  rec('report run1 non-empty', !!r1 && r1.length > 200, 'len ' + (r1 || '').length);
  rec('report identical across seed replay', !!r1 && r1 === r2, r1 === r2 ? '' : firstDiff(r1 || '', r2 || ''));
  const lines = (r1 || '').split('\n');
  const turnRe = /^M[12] H[12] T\d+ (me|opp) Z\d.*\| hand .+ \| card .+ \| .*odds \d+%.*\| dice \d+ v \d+/;
  const tl = lines.filter(l => turnRe.test(l));
  rec('report per-turn lines (expect 24)', tl.length >= 24, tl.length + ' matching; sample: ' + (tl[0] || '(none)') + '  /  non-matching M-lines: ' + lines.filter(l => /^M[12] /.test(l) && !turnRe.test(l)).slice(0, 2).join(' // '));
  fs.writeFileSync(path.join(SHOTS, 'report-run1.txt'), r1 || '');
  const r3 = await play(browser, base, '[475 smoke]', 475, 638, true, false);
  await browser.close(); srv.close();
  writeMd();
  process.exit(results.some(r => !r.ok) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

function firstDiff(a, b) { const x = a.split('\n'), y = b.split('\n'); for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return 'line ' + (i + 1) + ': run1 "' + (x[i] || '') + '" vs run2 "' + (y[i] || '') + '"'; return 'differs'; }
function writeMd() {
  const f = results.filter(r => !r.ok);
  let t = '# Squad Duel E2E (checker 2)\n\nGenerated by tests/squad-duel/e2e.js, ' + new Date().toISOString() + '\n\nTotal ' + results.length + ', pass ' + (results.length - f.length) + ', fail ' + f.length + '\n\n';
  t += '## Failures\n\n' + (f.length ? f.map(r => '- ' + r.name + ' :: ' + r.detail + ' (owner: ' + owner(r.name) + ')').join('\n') : 'none') + '\n\n## All checks\n\n';
  t += results.map(r => '- ' + (r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.detail ? ' :: ' + r.detail : '')).join('\n') + '\n\nShots: docs/squad-duel/shots/ (344-*.png, 475-*.png), report-run1.txt\n';
  fs.writeFileSync(MD, t);
}
function owner(n) {
  if (/manager/.test(n)) return 'ui/manager.js + css/manager.css';
  if (/match|turn|halftime|fulltime|attack|defend/.test(n)) return 'ui/match.js + css/match.css (scene: ui/scene.js)';
  if (/result|tree/.test(n)) return 'ui/meta-a.js';
  if (/pull|end|grid/.test(n)) return 'ui/meta-b.js';
  if (/tweak|dev|report|gear/.test(n)) return 'ui/tweak.js';
  if (/start|console|errors/.test(n)) return 'index.html/js/app.js (or see message)';
  return 'see message';
}
