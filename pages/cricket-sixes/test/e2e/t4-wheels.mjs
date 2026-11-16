// T4 wheels e2e at 344x882: Find (activities), Scout (coach pick) and Finals (semi/final result screen), each on the pulse wheel.
// Run from the app root:  node test/e2e/t4-wheels.mjs
// Env: E2E_FAST=1 (idle 6 s real wait instead of a 60 s page-clock jump), E2E_SOFT=1 (never exit 1), E2E_TRACE=1, E2E_SEED=x, E2E_SHOTS=dir.
// Per wheel (A = open, still, STOP, reload after; B = reload before STOP):
//  1 opens unspun (SPIN, no result)      2 60 s after SPIN still spinning, no auto-stop (page clock; real wait with E2E_FAST)
//  3 STOP shows a result                 4 reload after STOP: same slice, no re-spin (stored stops unchanged, result shown, no SPIN)
//  5 reload before STOP: unspun, no token spent, no stop stored
//  6 wheel DOM has no skip / reduced / auto (text, aria-label, title, id, class, data-*)   7 every tap target >= 56 px   8 console / page errors
// A step whose screen cannot be reached prints "SETUP" (selector missing = the view is not wired yet); a real check that fails prints FAIL.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SEED = process.env.E2E_SEED || 't4-e2e';
const FAST = process.env.E2E_FAST === '1';
const SHOTS = process.env.E2E_SHOTS ? process.env.E2E_SHOTS.replace(/\/?$/, '/') : '';
const VP = { width: 344, height: 882 };
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
const V7 = await readFile(new URL('../fixtures/v7-save.json', import.meta.url), 'utf8').catch(() => null);

const results = []; const errs = [];
const step = (w, name, ok, why, kind) => { results.push({ w, name, ok: !!ok, kind: ok ? 'PASS' : kind || 'FAIL', why: ok ? '' : why || '' }); if (process.env.E2E_TRACE) console.error(`${ok ? 'pass' : kind || 'FAIL'} ${w} ${name}${ok ? '' : ' -- ' + why}`); return !!ok; };
class Setup extends Error {}
const need = (c, msg) => { if (!c) throw new Setup(msg); };

async function open(tag, useClock) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  let clock = false; if (useClock && page.clock) { try { await page.clock.install({ time: Date.now() }); clock = true; } catch (e) { clock = false; } }
  page.on('pageerror', (e) => errs.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`[${tag}] console: ${m.text()}`); });
  const H = { ctx, page, tag, clock,
    wait: (ms) => page.waitForTimeout(ms),
    async ready() { await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await H.wait(600); },
    async boot() {
      await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED + tag)}`); await H.ready();
      const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await H.wait(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await H.wait(400); } }
      await page.evaluate(() => { const S = window.__store; if (S.get().stage === 'freepick') S.dispatch('TakeFreePick', { what: 'stands' }); if (S.get().matchMode !== 'classic') S.dispatch('SetMatchMode', { mode: 'classic' }); });
    },
    async reload() { await page.reload(); await H.ready(); },
    async advance(stop) { // classic play by commands, as wa1-flow does
      return page.evaluate((want) => {
        const S = window.__store; let g = 0;
        while (S.get().stage !== want && g++ < 800) {
          const s = S.get(), d = (c, p) => S.dispatch(c, p), before = s;
          switch (s.stage) {
            case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
            case 'coach': d('PassScout'); break;
            case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
            case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
            case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch', { mode: 'classic' }); if (S.get().stage === 'plan') d('StartMatch'); break;
            case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
            case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break;
            case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break;
            default: return 'stuck:' + s.stage;
          }
          if (S.get() === before) return 'stuck-no-change:' + S.get().stage;
        }
        return S.get().stage;
      }, stop);
    },
    ov: () => page.$('.wh-ov'),
    snap: () => page.evaluate(() => { const s = window.__store.get(); return JSON.stringify({ stops: (s.wheels && s.wheels.stops) || null, tokens: s.wheelMeta && s.wheelMeta.tokens, tokUsed: s.wheelMeta && s.wheelMeta.tokUsed, spent: s.wheelMeta && s.wheelMeta.spent }); }),
    ovState: () => page.evaluate(() => {
      const ov = document.querySelector('.wh-ov'); if (!ov) return null; const go = ov.querySelector('[data-go]'), r = ov.querySelector('[data-res]');
      const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
      return { go: go ? go.textContent.trim() : '', res: vis(r) ? r.innerText.trim() : '', key: ov.getAttribute('data-spin-key'), id: ov.getAttribute('data-wheel') };
    }),
    async shot(n) { if (SHOTS) try { await page.screenshot({ path: `${SHOTS}t4-${n}.png` }); } catch (e) { /* optional */ } },
  };
  return H;
}

/** Wheel DOM scans: forbidden words, tap targets. */
const scanDom = (H) => H.page.evaluate(() => {
  const ov = document.querySelector('.wh-ov'); if (!ov) return null; const bad = [], small = [];
  const nodes = [ov, ...ov.querySelectorAll('*')];
  for (const e of nodes) {
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    const attrs = [...e.attributes].filter((a) => /^(aria-label|title|id|class|data-.*|alt|placeholder)$/.test(a.name)).map((a) => a.value);
    for (const t of [own, ...attrs]) if (/skip|reduced|auto/i.test(t)) bad.push(`${e.tagName.toLowerCase()}.${String(e.className || '').slice(0, 30)}: ${t.trim().slice(0, 50)}`);
  }
  for (const e of ov.querySelectorAll('button, [role="button"], a[href], [data-go], input, [tabindex="0"]')) {
    const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0 || getComputedStyle(e).visibility === 'hidden') continue;
    if (r.width < 56 || r.height < 56) small.push(`${(e.getAttribute('aria-label') || e.textContent || e.className).toString().trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return { bad, small };
});

async function tapGo(H, want) {
  const t0 = Date.now(); while (Date.now() - t0 < 8000) { const st = await H.ovState(); if (st && new RegExp('^' + want, 'i').test(st.go)) { await H.page.click('.wh-ov [data-go]'); return true; } await H.wait(120); }
  return false;
}

/** wheels: { find, scout, finals }. Each: prep(H) reaches the screen (throws Setup if not wired), trigger(H) opens the wheel from it (called again after a reload). */
const WHEELS = {
  find: {
    async prep(H) { await H.boot(); const r = await H.advance('hub'); need(r === 'hub', 'cannot reach hub: ' + r); },
    async trigger(H) {
      if (await H.ov()) return;
      const a = await H.page.$('[data-act="sheet:activities"]'); need(a, 'no [data-act="sheet:activities"] on the hub'); await a.click(); await H.wait(300);
      const p = await H.page.$('[data-cl-pick]:not([disabled])'); need(p, 'no [data-cl-pick] option in the activities sheet'); await p.click(); await H.wait(200);
      const y = await H.page.$('[data-cl-act="PickActivity"]:not([disabled])'); need(y, 'no enabled [data-cl-act="PickActivity"]'); await y.click(); await H.wait(500);
      need(await H.ov(), 'Find wheel (.wh-ov) did not open after Yes, do it');
    },
  },
  scout: {
    async prep(H) { await H.boot(); const r = await H.advance('train'); need(r === 'train', 'cannot reach train: ' + r); },
    async trigger(H) {
      if (await H.ov()) return;
      if (!(await H.page.$('[data-scoutspin]'))) { need(await H.page.$('[data-ct="scout"]'), 'no [data-ct="scout"] on the training screen'); await H.page.click('[data-ct="scout"]'); await H.wait(600); if (await H.ov()) return; }
      need(await H.page.$('[data-scoutspin]'), 'no [data-scoutspin] (Ask the scouts) in the scout list'); await H.page.click('[data-scoutspin]'); await H.wait(600);
      need(await H.ov(), 'Scout wheel (.wh-ov) did not open');
    },
  },
  finals: {
    async prep(H) {
      need(V7, 'test/fixtures/v7-save.json missing');
      await H.page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`); await H.ready();
      await H.page.evaluate(async (txt) => { // the fixture (stage bowl, classic, flags on) is saved, then played to its result screen by commands
        const m = await import('/cricket-sixes/js/core/save-migrate.js'), env = JSON.parse(txt), s = structuredClone(env.data || env);
        s.matchMode = 'classic'; if (s.wheelMeta) s.wheelMeta.tierUpQueue = []; localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(s)));
      }, V7);
      await H.reload(); const r = await H.advance('done'); need(r === 'done', 'fixture did not play to the result screen: ' + r);
      await H.page.evaluate(async () => { // then it becomes a semi that has not spun its prize
        const m = await import('/cricket-sixes/js/core/save-migrate.js'), s = structuredClone(window.__store.get());
        s.finalsSpin = null; if (s.wheelMeta) s.wheelMeta.tierUpQueue = []; if (s.wheels && s.wheels.stops) delete s.wheels.stops.finals; if (s.fixture) s.fixture.kind = 'semi';
        localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(s)));
      });
      await H.reload(); need((await H.page.evaluate(() => window.__store.get().stage)) === 'done', 'seeded save did not boot into stage done');
    },
    async trigger(H) {
      if (await H.ov()) return;
      const b = await H.page.$('[data-finals-spin]'); need(b, 'no [data-finals-spin] on the result screen (finals.due false or card not rendered)'); await b.click({ timeout: 3000 }).catch((e) => { throw new Setup('Finals spin button not clickable: ' + String(e.message).replace(/\s+/g, ' ').slice(-220)); }); await H.wait(500);
      need(await H.ov(), 'Finals wheel (.wh-ov) did not open');
    },
  },
};

async function runWheel(w) {
  const W = WHEELS[w], idleMs = 60000;
  // ---- A: open, scan, SPIN, 60 s, STOP, reload after
  let A; try {
    A = await open(w + 'A', !FAST);
    await W.prep(A); await W.trigger(A);
    let st = await A.ovState();
    step(w, 'opens unspun (SPIN shown, no result)', st && /^SPIN/i.test(st.go) && !st.res, JSON.stringify(st));
    await A.shot(w + '-open');
    const sc = await scanDom(A);
    step(w, 'no skip / reduced / auto text in the wheel DOM', sc && !sc.bad.length, sc && sc.bad.slice(0, 4).join(' | '));
    step(w, 'every tap target >= 56 px', sc && !sc.small.length, sc && sc.small.slice(0, 6).join(' | '));
    const before = await A.snap();
    step(w, 'tap SPIN starts the wheel (STOP shown)', await tapGo(A, 'SPIN') && (await (async () => { await A.wait(500); const s = await A.ovState(); return s && /^STOP/i.test(s.go); })()), JSON.stringify(await A.ovState()));
    if (A.clock) await A.page.clock.runFor(idleMs); else await A.wait(FAST ? 6000 : idleMs);
    st = await A.ovState();
    step(w, `${FAST ? '6' : '60'} s ${A.clock ? '(page clock) ' : ''}after SPIN: still spinning, STOP shown, no result, nothing stored`, st && /^STOP/i.test(st.go) && !st.res && (await A.snap()) === before, JSON.stringify(st));
    const sc2 = await scanDom(A);
    step(w, 'spinning DOM: no skip / reduced / auto, taps >= 56 px', sc2 && !sc2.bad.length && !sc2.small.length, sc2 && [...sc2.bad, ...sc2.small].slice(0, 4).join(' | '));
    const stopped = await tapGo(A, 'STOP'); await A.wait(2500);
    st = await A.ovState(); const after = await A.snap();
    step(w, 'STOP shows a result and stores the stop', stopped && st && st.res && after !== before, JSON.stringify(st) + (after === before ? ' (store unchanged)' : ''));
    await A.shot(w + '-result');
    const sliceA = st && st.res;
    await A.reload(); let reopened = true; try { await W.trigger(A); } catch (e) { if (!(e instanceof Setup)) throw e; reopened = false; }
    await A.wait(800);
    if (!reopened) { step(w, 'reload after STOP: no wheel offered again, stored stops unchanged', (await A.snap()) === after, 'store changed after reload'); return await partB(); }
    const st2 = await A.ovState(), after2 = await A.snap();
    step(w, 'reload after STOP: same result, no re-spin (no SPIN / STOP, stored stops unchanged)', st2 && st2.res && st2.res === sliceA && !/^(SPIN|STOP)/i.test(st2.go) && after2 === after, JSON.stringify(st2) + ' vs ' + JSON.stringify(sliceA) + (after2 === after ? '' : ' (store changed)'));
  } catch (e) { fail(w, 'A', e); } finally { if (A) await A.ctx.close(); }
  return partB();
  async function partB() {
  let B; try {
    B = await open(w + 'B', false);
    await W.prep(B); await W.trigger(B);
    const before = await B.snap();
    need(await tapGo(B, 'SPIN'), 'SPIN not tappable'); await B.wait(1200);
    await B.reload(); await W.trigger(B); await B.wait(600);
    const st = await B.ovState(), after = await B.snap();
    step(w, 'reload before STOP: opens unspun (SPIN, no result), no token spent, nothing stored', st && /^SPIN/i.test(st.go) && !st.res && after === before, JSON.stringify(st) + (after === before ? '' : ' store: ' + before + ' -> ' + after));
  } catch (e) { fail(w, 'B', e); } finally { if (B) await B.ctx.close(); }
  }
}
function fail(w, part, e) { if (e instanceof Setup) step(w, `part ${part} reachable`, false, e.message, 'SETUP'); else step(w, `part ${part} ran without throwing`, false, (e && e.stack || String(e)).split('\n').slice(0, 3).join(' | ')); }

for (const w of Object.keys(WHEELS)) await runWheel(w);
step('all', 'no console or page errors', !errs.length, [...new Set(errs)].slice(0, 6).join(' | '));

let bad = 0;
for (const r of results) { if (!r.ok) bad++; console.log(`${r.kind.padEnd(5)} ${r.w.padEnd(6)} ${r.name}${r.ok ? '' : ' -- ' + r.why}`); }
console.log(`\n${results.length - bad}/${results.length} passed` + (bad ? `, ${bad} not passing (SETUP = screen/selector not reachable yet; FAIL = check ran and failed)` : ''));
await browser.close(); server.close();
process.exit(bad && process.env.E2E_SOFT !== '1' ? 1 : 0);
