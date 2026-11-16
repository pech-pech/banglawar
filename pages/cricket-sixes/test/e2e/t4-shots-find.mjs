// T4 Find wheel shots + log + agreement loop at 344x882, dsf 2.
// Usage (from the app root):  node test/e2e/t4-shots-find.mjs <outDir> [spins=20]
// Env: E2E_FAST=1 (shorter settle waits for the 20-spin loop), E2E_SEED=x.
// For Find 8% (Street Game) and 26% (Banner Night): <out>/t4-find{8,26}-{ready,spinning,glow,result}.png (spinning at 1.5 s, glow at ~3.57 s after SPIN)
// plus t4-find{8,26}-result.json (stop.sliceId, ring[sliceId] label/gold, pending.find, card text, log line, computed-style dump: min font px of visible wheel text/legend, button heights).
// Then N spins at 26% (new page each) and a table sliceId / gold / card agree Y/N (agree = ring gold, pending.find and card "Found" all equal).
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = (process.argv[2] || '/tmp/t4shots-find').replace(/\/?$/, '/'), N = +(process.argv[3] || 20), FAST = process.env.E2E_FAST === '1';
const ROOT = fileURLToPath(new URL('../../', import.meta.url)), SEED = process.env.E2E_SEED || 't4-e2e', VP = { width: 344, height: 882 };
const { chromium } = createRequire(import.meta.url)('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const errs = [];
const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

async function open(tag) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => errs.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED + tag)}`);
  await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600);
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await wait(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await wait(400); } }
  const r = await page.evaluate(() => {
    const S = window.__store; if (S.get().stage === 'freepick') S.dispatch('TakeFreePick', { what: 'stands' }); if (S.get().matchMode !== 'classic') S.dispatch('SetMatchMode', { mode: 'classic' });
    let g = 0; while (S.get().stage !== 'hub' && g++ < 800) {
      const s = S.get(), d = (c, p) => S.dispatch(c, p), before = s;
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break; case 'coach': d('PassScout'); break;
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch', { mode: 'classic' }); if (S.get().stage === 'plan') d('StartMatch'); break;
        case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
        case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break;
        case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break; default: return 'stuck:' + s.stage;
      }
      if (S.get() === before) return 'stuck-no-change:' + S.get().stage;
    }
    return S.get().stage;
  });
  if (r !== 'hub') throw new Error('cannot reach hub: ' + r);
  return { ctx, page };
}
const ovState = (page) => page.evaluate(() => {
  const ov = document.querySelector('.wh-ov'); if (!ov) return null; const go = ov.querySelector('[data-go]'), r = ov.querySelector('[data-res]');
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
  return { go: go ? go.textContent.trim() : '', res: vis(r) ? r.innerText.trim() : '' };
});
async function tapGo(page, want) {
  const t0 = Date.now(); while (Date.now() - t0 < 8000) { const st = await ovState(page); if (st && new RegExp('^' + want, 'i').test(st.go)) { await page.click('.wh-ov [data-go]'); return true; } await wait(60); }
  return false;
}
async function openFind(page, id) {
  const a = await page.$('[data-act="sheet:activities"]'); if (!a) throw new Error('no activities sheet'); await a.click(); await wait(300);
  const p = await page.$(`[data-cl-pick="${id}"]`); if (!p) throw new Error('no pick ' + id); await p.click(); await wait(200);
  const y = await page.$('[data-cl-act="PickActivity"]:not([disabled])'); if (!y) throw new Error('Yes disabled ' + id); await y.click(); await wait(500);
  if (!(await page.$('.wh-ov'))) throw new Error('no wheel');
}
/** Everything the result log needs, read from the store + DOM. */
const logOf = (page, id) => page.evaluate(async (id) => {
  const s = window.__store.get(), m = await import('/cricket-sixes/js/store/wmstore.js'), vm = m.findSpinVM(s, id);
  const ent = vm && vm.stored, stop = ent && ent.stops ? ent.stops[ent.stops.length - 1] : null, ring = vm ? vm.rows : [], row = stop ? ring[stop.sliceId] : null;
  const ov = document.querySelector('.wh-ov'), res = ov && ov.querySelector('[data-res]'), msg = ov && ov.querySelector('[data-msg]');
  const card = res ? res.innerText.trim().replace(/\s+/g, ' ') : '', led = s.econ && s.econ.ledger && s.econ.ledger[s.econ.ledger.length - 1], hist = s.econ && s.econ.act && s.econ.act.hist && s.econ.act.hist[0];
  // computed styles: visible text under the wheel overlay (own text nodes), legend rows, buttons
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0; };
  const texts = [], btns = [];
  if (ov) {
    for (const e of ov.querySelectorAll('*')) {
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (own && vis(e)) texts.push({ t: own.slice(0, 24), cls: String(e.className || '').slice(0, 30), px: parseFloat(getComputedStyle(e).fontSize), legend: /leg/i.test(String(e.className) + ' ' + (e.parentElement ? e.parentElement.className : '')) });
      if (e.matches('button, [role="button"], [data-go], a[href]') && vis(e)) { const r = e.getBoundingClientRect(); btns.push({ t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }); }
    }
  }
  const min = (a) => a.length ? a.reduce((b, x) => (x.px < b.px ? x : b)) : null;
  return { activity: id, rate: vm && vm.rate, stop, ringLen: ring.length, ringRow: row ? { label: row.label, gold: !!row.gold, w: row.w } : null, pendingFind: vm && vm.pending ? vm.pending.find : null, pending: vm && vm.pending,
    card, msg: msg ? msg.innerText.trim() : '', logLine: led || null, actHist: hist || null,
    styles: { minFontPx: min(texts) && min(texts).px, minFontEl: min(texts), minLegendFontPx: min(texts.filter((x) => x.legend)) ? min(texts.filter((x) => x.legend)).px : null, buttons: btns, minButtonH: btns.length ? Math.min(...btns.map((b) => b.h)) : null } };
}, id);
const agree = (L) => !!(L.ringRow && L.pendingFind != null && L.ringRow.gold === !!L.pendingFind && /^Found/i.test(L.card) === !!L.pendingFind && (L.pendingFind || /CHEER/i.test(L.card)));

for (const [tag, id] of [['find8', 'street'], ['find26', 'banner']]) {
  let h; try {
    h = await open(tag); await openFind(h.page, id); await wait(800); const n = (s) => `${OUT}t4-${tag}-${s}.png`;
    await h.page.screenshot({ path: n('ready') });
    await tapGo(h.page, 'SPIN'); const t0 = Date.now();
    await wait(1500 - (Date.now() - t0)); await h.page.screenshot({ path: n('spinning') });
    await wait(3570 - (Date.now() - t0)); await h.page.screenshot({ path: n('glow') });
    console.log(tag, 'is-glow:', await h.page.evaluate(() => !!document.querySelector('.wh-ov .is-glow')), 'ms', Date.now() - t0);
    await tapGo(h.page, 'STOP'); await wait(3500); await h.page.screenshot({ path: n('result') });
    const L = await logOf(h.page, id); await writeFile(`${OUT}t4-${tag}-result.json`, JSON.stringify(L, null, 2));
    console.log(tag, 'slice', L.stop && L.stop.sliceId, JSON.stringify(L.ringRow), 'pending.find', L.pendingFind, 'card:', L.card, '| minFont', L.styles.minFontPx, 'legend', L.styles.minLegendFontPx, 'minBtnH', L.styles.minButtonH, 'agree', agree(L) ? 'Y' : 'N');
  } catch (e) { console.log(tag, 'ERR', String(e.message).slice(0, 200)); }
  if (h) await h.ctx.close();
}

console.log(`\n${N} spins at 26% (Banner Night)\n #  sliceId  gold  pending.find  card                         agree`);
let bad = 0;
for (let i = 1; i <= N; i++) {
  let h; try {
    h = await open('loop' + i); await openFind(h.page, 'banner'); await wait(FAST ? 300 : 800);
    await tapGo(h.page, 'SPIN'); await wait((FAST ? 600 : 500) + Math.floor(Math.random() * 3000)); await tapGo(h.page, 'STOP'); for (let k = 0; k < 40; k++) { const st = await ovState(h.page); if (st && st.res) break; await wait(250); } await wait(300);
    const L = await logOf(h.page, 'banner'), ok = agree(L); if (!ok) bad++;
    console.log(`${String(i).padStart(2)}  ${String(L.stop ? L.stop.sliceId : '-').padStart(7)}  ${String(L.ringRow ? L.ringRow.gold : '-').padEnd(5)} ${String(L.pendingFind).padEnd(13)} ${L.card.slice(0, 28).padEnd(28)} ${ok ? 'Y' : 'N'}`);
  } catch (e) { bad++; console.log(`${String(i).padStart(2)}  ERR ${String(e.message).slice(0, 80)}`); }
  if (h) await h.ctx.close();
}
console.log(`\n${N - bad}/${N} agree; errors: ${[...new Set(errs)].slice(0, 5).join(' | ') || 'none'}`);
await browser.close(); server.close();
