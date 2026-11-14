// Report v2 Phase 0, REPORT part: P0-3 CLEAN reasons, P0-4 training cost from the game data, P0-10 U bucket, P0-13 removals, P0-14 flag mirror, P0-16 P4/P5 regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOf, aggregate, buildSummary, buildText, buildData } from '../js/report/report.js';
import { saveOf, zLines } from '../js/report/z.js';
import { FLAG_DEFAULTS, BUILD } from '../js/report/build.js';
import { FLAGS } from '../js/data/flags.js';
import { TRAIN2 } from '../js/data/training.js';

const B = 'sixes-w1';
const ENV = { build: B, now: Date.UTC(2026, 10, 13, 10, 0), vp: 'v', errors: 0, flags: { ...FLAG_DEFAULTS } };
let sd = 0;
const m = (o = {}) => ({ id: ++sd, build: B, res: 'won', ab: 0, ov: [], seed: 's' + sd, us: 50, them: 40, m: { k: 'wk', n: 2 }, t0: 0, t1: 60000, gl: {}, why: 0, sk: 0, feel: {}, ...o });
const sq = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, drillsHere: 1 }));
const save = (o = {}) => ({ stage: 'train', training: { tp: 150, week: 2, effort: 'normal', ...(o.training || {}) }, clubs: [{ id: 'c0', squad: sq(o.n || 8) }], ...(o.top || {}) });

test('P0-3 CLEAN: one test per reason, and an empty window is NO', () => {
  assert.deepEqual(cleanOf([m(), m()], ENV), { ok: true, why: [] });
  const w = (ms, env = ENV) => cleanOf(ms, env).why;
  assert.deepEqual(w([]), ['no match played']);
  assert.ok(cleanOf([], ENV).ok === false);
  assert.ok(w([m(), m({ build: 'sixes-r4' })]).includes('mixed builds'));
  assert.ok(w([m({ build: 'sixes-r4' })]).includes('mixed builds') && w([m({ build: 'sixes-r4' })]).includes('no match played'));
  assert.ok(w([m({ res: null })]).includes('match in progress'));
  assert.ok(w([m()], { ...ENV, errors: 2 }).includes('errors'));
  assert.ok(w([m(), m()], { ...ENV, fixedSeed: true }).includes('fixed seed'));
  assert.ok(w([m({ seed: 'x' }), m({ seed: 'x' })]).includes('repeated seed'));
  assert.ok(w([m()], { ...ENV, flags: { ...FLAG_DEFAULTS, burst: true } })[0].startsWith('flags changed'));
  assert.ok(w([m()], { ...ENV, tuningSha: 'aaaa', tuningPinned: 'bbbb' }).includes('tuning changed'));
  assert.ok(w([m()], { ...ENV, tuningSha: 'aaaa', tuningPinned: 'aaaa' }).length === 0);
  assert.ok(w([m()], { ...ENV, save: { migrated: true } }).includes('migrated save'));
  assert.ok(w([m()], { ...ENV, trimmed: true }).includes('trimmed'));
});

test('P0-3 report filters records to the running build; old-build records never reach the numbers', () => {
  const d = { sessions: [], matches: [m({ build: 'sixes-r4', us: 99 }), m({ us: 51 }), m({ us: 52 })] };
  const t = buildSummary(d, ENV);
  assert.match(t.split('\n')[0], /CLEAN: NO mixed builds/);
  assert.match(t, /Dropped 1 records from sixes-r4|MATCH 2W/);
  assert.equal(JSON.parse(buildData(d, ENV)).M.length, 2);
  assert.match(buildSummary({ sessions: [], matches: [] }, ENV).split('\n')[0], /CLEAN: NO no match played/);
  assert.match(buildSummary({ sessions: [], matches: [m()], trimmed: 1 }, ENV).split('\n')[0], /CLEAN: NO trimmed/);
});

test('P0-4 training cost comes from TRAIN2: Normal 13 per player (104 for 8); Push affordable at 144, not 143', () => {
  const z = saveOf(save());
  assert.equal(z.perPlayer, TRAIN2.efforts.normal.cost); assert.equal(z.perPlayer, 13); assert.equal(z.runCost, 104);
  assert.equal(saveOf(save({ training: { tp: 144 } })).affordPush, true);
  assert.equal(saveOf(save({ training: { tp: 143 } })).affordPush, false);
  const t = zLines({ sessions: [] }, z).join('\n');
  assert.ok(t.includes('13 per player (104 for 8)'), t);
  assert.ok(buildSummary({ sessions: [], matches: [m()] }, { ...ENV, save: z }).startsWith('CR '));
  assert.ok(!/15 each|enough for/.test(t), t);
  assert.equal(saveOf(save({ training: { effort: 'push' } })).runCost, 144);
  assert.equal(saveOf(save({ top: { migrated: 1 } })).migrated, true);
});

test('P0-10 no-preview overs are their own bucket U, not OK', () => {
  const o = (mu) => ({ o: 1, s: 'b', mu, gm: 0, f: 'A', r: 5, xr: 5, w: 0, xw: 0, fit: [1, 1, null] });
  const a = aggregate([m({ ov: [o('G'), o('O'), o('P'), o('?')] })]);
  assert.deepEqual([a.mu.G, a.mu.O, a.mu.P, a.mu.U], [25, 25, 25, 25]);
  const t = buildText({ sessions: [], matches: [m({ ov: [o('G'), o('?')] })] }, ENV);
  assert.ok(/Good 50%, OK 0%, Poor 0%, no preview 50%/.test(t.replace(/\s+/g, ' ')), t);
});

test('P0-13 removed lines: retry/result-screen time, first-session line; old and new log shapes both work', () => {
  const old = { sessions: [{ id: 1, first: 42000, end: 'hub' }], events: [[1, 'x', 0]], matches: [m({ rt: 3000, res: 'lost', m: { k: 'run', n: 4 } })] };
  const t = buildText(old, ENV);
  assert.ok(!/First session|result screen|retry/i.test(t), t);
  assert.ok(!('retryFast' in aggregate(old.matches)));
  assert.ok(!/retryMs/.test(buildData(old, ENV)));
  const neu = { sessions: [{ id: 1, end: 'hub', gl: { economy: 2 } }], matches: [m({ k: 'L', r: 3, season: 1, league: 1, pay: { total: 90 }, coins0: 10, coins1: 100, gl: { burst: 2 } })], trimmed: 0 };
  const t2 = buildText(neu, ENV);
  assert.ok(t2.includes('Letter words tapped 4.') && t2.includes('TP pay 90'), t2);
  const j = JSON.parse(buildData(neu, ENV)); assert.equal(j.M[0].k, 'L'); assert.equal(j.M[0].res, 'W'); assert.equal(j.E.c1, 100);
});

test('P0-14 FLAG_DEFAULTS mirrors data/flags.js; BUILD is the r7 label', () => {
  assert.deepEqual(FLAG_DEFAULTS, FLAGS);
  assert.equal(BUILD, 'sixes-s1');
});

test('P0-16 regression P4: fixed seed is CLEAN NO; P5: a quit match adds nothing to luck', () => {
  assert.ok(cleanOf([m(), m()], { ...ENV, fixedSeed: true }).why.includes('fixed seed'));
  assert.equal(cleanOf([m(), m()], { ...ENV, fixedSeed: true }).ok, false);
  const ov = [{ o: 1, s: 'c', mu: '?', r: 7, xr: 5, w: 1, xw: 0.5, fit: [null, null, 1] }, { o: 1, s: 'b', mu: 'O', gm: 0, r: 4, xr: 6, w: 0, xw: 0.4, fit: [1, 1, null] }];
  const done = m({ ov }), quit = m({ res: null, ab: 1, ov: ov.map((o) => ({ ...o, r: o.r + 30, w: o.w + 2 })) });
  const a = aggregate([done]), b = aggregate([done, quit]);
  for (const k of ['scored', 'xScored', 'conc', 'xConc', 'wkLost', 'wkTook', 'xWkLost', 'xWkTook']) assert.equal(b[k], a[k], k);
  assert.equal(b.quit, 1);
});
