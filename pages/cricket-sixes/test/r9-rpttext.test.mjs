// r9 RPT-TEXT: layout H/T/M/E/C/S/F, window, features kind, sizes, avoidable Poor, close band, feel rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildText, buildSummary, buildData, buildFull, cleanOf, reportParts } from '../js/report/report.js';
import { planFeel } from '../js/report/feel.js';
import { BANDS } from '../js/report/bands.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';

const B = 'sixes-r9';
const ENV = { build: B, now: Date.UTC(2026, 10, 13, 18, 0), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 4 };
let sd = 0;
const bowl = (o, mu, bm, f = 'A') => ({ o, s: 'b', mu, bm, f, r: 8, w: 0, xr: 8, xw: 0.4, fit: [1, 1, null], th: 2000, gm: 0 });
const chase = (o, i, wp) => ({ o, s: 'c', i, r: 9, w: o % 3 === 0 ? 1 : 0, xr: 9, xw: 0.4, fit: [null, null, 1], th: 1500, wp });
const ovs = () => [...Array.from({ length: 10 }, (_, k) => bowl(k + 1, k % 2 ? 'P' : 'G', k % 2 ? 1 : 0, k % 3 ? 'A' : 'P')), ...Array.from({ length: 10 }, (_, k) => chase(k + 1, k < 7 ? 'R' : 'A', 40 + k))];
const m = (o = {}) => ({ id: ++sd, build: B, res: 'won', ab: 0, seed: 's' + sd, k: 'L', r: 1, us: 61, them: 58, m: { k: 'wk', n: 2 }, close: true, t0: 1000, t1: 61000, ov: ovs(), gl: {}, why: 0, sk: 0, feel: {}, coins0: 100, coins1: 180, fans0: 10, fans1: 50, pay: { total: 90 }, dec: 9, touched: 3, eco: { gate: 120, win: 70, shop: 6, wage: 100, up: 16, net: 80, fans: 40, arr: 0 }, ...o });
const d = (ms, extra = {}) => ({ sessions: [], matches: ms, ...extra });

test('header: CR build, CLEAN, features kind, save, season/round, rid, viewport; window line', () => {
  const t = buildText(d([m(), m()]), { ...ENV, save: { v: 5, season: 2, round: 3, rounds: 9, league: 1 } });
  const [h1, h2] = t.split('\n');
  assert.equal(h1, 'CR sixes-r9 | CLEAN: YES | features off | save v5 | S2 R3/9 L1 | #4 | screen 344x780');
  assert.match(h2, /^Window: 2 matches, 0 nets runs, since start \(.*Z to 11-13 18:00Z\)\. \[W\] window \[S\] season \[G\] save$/);
});

test('features are a build kind: not flags changed; mixed on/off is CLEAN NO features switched', () => {
  const on = m({ fl: ['matchday', 'settled'] }), off = m({ fl: [] });
  assert.deepEqual(cleanOf([on], { ...ENV, flags: { ...FLAG_DEFAULTS, matchday: true, settled: true } }), { ok: true, why: [] });
  assert.match(buildText(d([on]), ENV).split('\n')[0], /CLEAN: YES \| features on/);
  assert.deepEqual(cleanOf([on, off], ENV).why, ['features switched']);
  assert.ok(cleanOf([m()], { ...ENV, flags: { luckyPad: true } }).why[0].startsWith('flags changed: luckyPad'));
  assert.equal(JSON.parse(buildData(d([on]), ENV)).feat, 1);
  assert.equal(cleanOf([m()], { ...ENV, flags: {} }).ok, true); // an undefined flag counts as its default
});

test('window from env.win (RPT-LOG) and Dropped line; marker rid in header', () => {
  const win = { matches: [m()], nets: [], spins: [], buys: [], weeks: [], feel: [], since: { rid: 3, atMs: 5000 }, dropped: { n: 5, build: 'sixes-r8' } };
  const t = buildText(d([]), { ...ENV, win });
  assert.match(t, /since #3/); assert.match(t, /Dropped 5 records from sixes-r8/); assert.match(t.split('\n')[0], /#4/);
  assert.match(t.split('\n')[0], /CLEAN: NO mixed builds/);
});

test('M1 row: avoidable Poor, close-finish band, decided over, near random, touched, luck label', () => {
  const t = buildText(d([m()]), ENV);
  assert.match(t, /M\d+ L W 61-58 by 2wk \| field A\d P\d sw\d+ \| intent D0 R7 A3 sw1 \| att early 0\/7 \| att wkts \d in 3 ov \| pick G5 O0 P5 U0 \| fit 100% \| luck 0 \[pre-P14\] | think 1\.8 s \| touched 3\/10 \| decided over 9/);
  assert.match(t, /Avoidable Poor in overs 1-7: 43% of 7 \(skilled 19%, random 39% \[sim r7\]\)/);
  assert.ok(t.includes('Close finishes 1 of 1 [sim r7: ' + BANDS.close.skilled + '% of matches]'));
  const rnd = m({ ov: ovs().map((o) => (o.s === 'b' ? { ...o, fit: [1, 1, null] } : { ...o, fit: [null, null, 0] })) });
  assert.match(buildText(d([rnd, m({ ov: ovs().map((o) => ({ ...o, fit: o.s === 'b' ? [0, 0, null] : [null, null, 0] })) })]), ENV), /near random for/);
});

test('old and new window sections: nets, spins, weeks, buys, courses feed T C E', () => {
  const nets = [{ q: 1, b: B, eff: 'normal', foc: 'bat', co: 1, r: [5, 2, 1], cant: 3, gain: 12, tp0: 200, tp1: 96 }, { q: 2, b: B, eff: 'push', foc: 'bat', co: 0, r: [2, 3, 3], cant: 3, gain: 20, tp0: 200, tp1: 56 }];
  const spins = [{ q: 3, b: B, careful: 1, bk: 'c', ms: 3400, g: 3 }, { q: 4, b: B, careful: 0, bk: 'e', ms: 2500, g: 2 }];
  const weeks = [{ q: 5, b: B, tpEnd: 160, aff: 1, nets: 1, hint: 0, coach: 1, cidle: 0 }, { q: 6, b: B, tpEnd: 60, aff: 0, nets: 1, hint: 1, coach: 1, cidle: 1 }];
  const buys = [{ q: 7, b: B, k: 'fac', item: 'nets2', price: 210, c0: 788, alt: 6, warn: 0 }, { q: 8, b: B, k: 'course', item: 'course', price: 90, c0: 400, alt: 2, warn: 1, gn: 2 }];
  const data = d([m(), m({ res: 'lost', m: { k: 'run', n: 8 }, eco: { gate: 120, win: 0, shop: 6, wage: 100, up: 16, net: 10, fans: 10, arr: 0 } })], { nets, spins, weeks, buys, seasons: [{ n: 1, lg: 1, w: 5, l: 2, open: 0, cin: { gate: 900, win: 400, shop: 50 }, m6: [29.7, 33.3], cap: 1, pool: 211, lgs: { L2: 2 } }] });
  const t = buildText(data, { ...ENV, save: { v: 5, rec: { w: 5, l: 2, pos: 2, pts: 15 }, gate: { top2: true, stad: 2, fans: 270, need: 1140, built: true }, sixMean: 33.3, tp: 56, coaches: [['B-', 8, 'bat']] } });
  for (const w of ['2 nets runs: Easy 0 / Normal 1 / Push 1', 'Rolls Okay/Good/Great: Normal 5/2/1, Push 2/3/3. 6 could not gain', 'Wheel: 2 spins', 'Pool over 100: 1 of 2', 'Push affordable 1 of 2 weeks', 'Coach B- (bat): used 1 of 2 weeks, idle 1', 'Courses bought 1 (90 Coins), wheel +2 step', 'nets2 210 at 788 Coins (6 other buys affordable)', 'TP pay 180', 'Record 5-2, table 2', 'League path: L2 s2', 'Six mean 29.7 -> 33.3']) assert.ok(t.includes(w), w + '\n' + t);
  assert.ok(t.length <= 2500, 'size ' + t.length);
  const j = JSON.parse(buildData(data, ENV)); assert.deepEqual(j.T.runs[0].slice(0, 4), ['N', 'Bt', 1, [5, 2, 1]]); assert.equal(j.C.use[0], 1); assert.equal(j.E.buy[0][0], 'nets2');
});

test('sizes: 12 matches stay under 2,500 text and 4,000 JSON; older matches fold; short under 1,000 with no JSON', () => {
  const data = d(Array.from({ length: 12 }, () => m()));
  const t = buildText(data, ENV), j = buildData(data, ENV), s = buildSummary(data, ENV);
  assert.ok(t.length <= 2500, 'text ' + t.length); assert.ok(j.length <= 4000, 'json ' + j.length); assert.ok(s.length <= 1000, 'short ' + s.length);
  assert.ok(t.includes('and 9 earlier: 9W 0L')); assert.equal(JSON.parse(j).M.length, 3); assert.equal(JSON.parse(j).Mold.n, 9);
  assert.ok(buildFull(data, ENV).startsWith(t.split('\n')[0]) && !s.includes('{'));
  assert.ok(t.split('\n')[0].includes('CLEAN')); assert.match(t, /FEEL \[W\]/);
});

test('every section title names its Q number; empty sections say none in window', () => {
  const p = reportParts(d([]), ENV);
  assert.ok(p.secs.every((s) => /\bQ\d/.test(s.title))); assert.ok(p.secs.filter((s) => s.key !== 'F').every((s) => s.h[0] === 'none in window'));
});

test('feel: priority wh ec tr, max 2, fallback pk, no blowout, answered pause', () => {
  const mm = (id, nb, feel = {}) => ({ id, nb, res: 'won', build: B, feel, m: { k: 'wk', n: 1 } });
  const ctx = { feelLog: [], nets: [{ q: 1, b: B }], spins: [{ q: 2, b: B }], buys: [{ q: 3, b: B }] };
  assert.deepEqual(planFeel(mm(1, 1), ctx), ['wh', 'ec']);
  assert.deepEqual(planFeel(mm(5, 5), { ...ctx, feelLog: [{ f: 'wh', v: 'Fair', id: 4, q: 9, b: B }] }).includes('wh'), false);
  assert.deepEqual(planFeel(mm(1, 1), { feelLog: [] }), ['pk']);
});
