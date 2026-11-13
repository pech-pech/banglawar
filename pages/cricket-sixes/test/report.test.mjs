import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../js/store/commands.js';
import { bowlVM, chaseVM } from '../js/store/selectors.js';
import { skilledBowler, skilledField, skilledIntent } from '../js/core/skilled.js';
import { createLog, KEY } from '../js/report/log.js';
import { wordsLine, aggregate, buildSummary, buildText, buildData, buildFull, cleanOf, wrap } from '../js/report/report.js';
import { nextQuestion, planFeel } from '../js/report/feel.js';
import { matchupOf, expected } from '../js/report/metrics.js';
import { BANDS, inRange } from '../js/report/bands.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const ENV = { build: 'sixes-r4', now: Date.UTC(2026, 10, 12, 14, 32), vp: 'screen 344x780 at 2x pixels, upright', errors: 0, flags: { luckyPad: false, burst: false, rivalGoodShare: 0.7 } };

/** Play n matches through the real commands, logging like app.js does. policy 'skilled' or 'rote'. */
function play(log, n, policy, build) {
  for (let k = 0; k < n; k++) {
    let s = applyCommand(null, 'NewMatch', { seed: `rep-${policy}-${k}` });
    log.matchStart(s);
    const step = (cmd, p) => { const b = s; s = applyCommand(s, cmd, p); if (cmd === 'BowlOver') log.over(b, s, { th: 2500 }); };
    while (s.stage === 'bowl') {
      const vm = bowlVM(s);
      s = applyCommand(s, 'MakeCall', policy === 'skilled' ? { bowler: skilledBowler(s, vm), field: skilledField(s) } : { bowler: vm.bowlers.find((b) => b.eligible).i, field: 'A' });
      step('BowlOver', {});
    }
    s = applyCommand(s, 'StartChase', {});
    while (s.stage === 'chase') step('BowlOver', { intent: policy === 'skilled' ? skilledIntent(s, chaseVM(s)) : 'R' });
  }
}

test('skilled policy fits the skilled bot 100% and a rote does not', () => {
  const a = createLog({ storage: null, build: 'sixes-r4' }); play(a, 3, 'skilled');
  const b = createLog({ storage: null, build: 'sixes-r4' }); play(b, 3, 'rote');
  const sa = aggregate(a.data().matches), sb = aggregate(b.data().matches);
  assert.equal(sa.fitF, 100); assert.equal(sa.fitI, 100); assert.equal(sa.fitB, 100);
  assert.ok(sb.fitI < 100 || sb.fitF < 100);
  assert.equal(sb.fP, 0); assert.ok(sb.fA > 0); assert.equal(sb.iD + sb.iA, 0); assert.ok(sb.iR > 0); assert.equal(sb.iSw, 0); assert.equal(sb.roteF.rote, sb.roteF.n); assert.equal(sb.roteI.rote, sb.roteI.n);
});

test('report v2 layout: header, sections with machine lines, Q tags, plain words, short has no JSON', () => {
  let clk = 1000; const log = createLog({ storage: null, build: 'sixes-r4', now: () => clk }); play(log, 3, 'skilled');
  log.gloss('economy'); clk += 2000; log.gloss('economy'); log.feel('q1', 'A bit');
  const t = buildText(log.data(), ENV), lines = t.split('\n');
  assert.match(lines[0], /^CR sixes-r4 \| CLEAN: YES \| features off \| save v\? .* \| #1 \| screen 344x780/);
  assert.match(lines[1], /^Window: 3 matches, 0 nets runs, since start/);
  for (const w of ['TRAINING [W] Q1 Q5', 'MATCH CALLS [W] Q2', 'ECONOMY [W] Q3', 'COACHES [W] Q4', 'SEASON [S] Q3 Q6 Q7', 'FEEL [W]', 'none in window', ' m:', 'M3 ', 'Luck [pre-P14]', 'fit 100%', '[sim r7']) assert.ok(t.includes(w), w);
  assert.ok(t.length <= 2500, 'text size ' + t.length);
  const sh = buildSummary(log.data(), ENV); assert.ok(sh.length <= 1000 && !sh.includes('{') && sh.endsWith('short: no per-over data, use Full for Q2'));
  assert.ok(buildFull(log.data(), ENV).includes('\nJSON:\n'));
});

test('wrap keeps lines near 70 characters and indents the rest', () => {
  const w = wrap('word '.repeat(40).trim()).split('\n'); assert.ok(w.length > 2); assert.ok(w.every((l) => l.length <= 70)); assert.ok(w.slice(1).every((l) => l.startsWith('  ')));
});

test('data block parses, per-over strings for the last 3 matches, under 4,000 chars', () => {
  const log = createLog({ storage: null, build: 'sixes-r4' }); play(log, 5, 'skilled');
  const j = buildData(log.data(), ENV); const o = JSON.parse(j);
  assert.equal(o.M.length, 3); assert.equal(o.Mold.n, 2); assert.ok(o.M[0].f.length >= 1 && o.M[0].f.length <= 10 && o.M[0].i.length >= 1); assert.equal(o.b, 'sixes-r4'); assert.equal(o.rid, 1);
  assert.ok(j.length <= 4000, 'size ' + j.length);
  assert.ok(buildFull(log.data(), ENV).endsWith(j));
});

test('CLEAN goes NO for mixed builds, changed flags, a live match', () => {
  let sd = 0; const m = (build, res) => ({ build, res, ab: 0, ov: [], seed: 's' + sd++ });
  assert.deepEqual(cleanOf([m('sixes-r4', 'won'), m('sixes-r4', 'lost')], ENV), { ok: true, why: [] });
  assert.ok(cleanOf([m('sixes-r4', 'won'), m('b', 'won')], ENV).why.includes('mixed builds'));
  assert.match(cleanOf([m('sixes-r4', 'won')], { flags: { luckyPad: true, burst: false, rivalGoodShare: 0.7 } }).why[0], /flags changed: luckyPad/);
  assert.ok(cleanOf([m('sixes-r4', null)], ENV).why.includes('match in progress'));
});

test('empty log still gives a report; a throwing line is skipped', () => {
  const d = createLog({ storage: null }).data();
  assert.match(buildSummary(d, ENV), /^CR sixes-r4 \| CLEAN: NO no match played/);
});

test('log persists under sixes.report.v1, caps, survives bad storage and clears', () => {
  const st = mem(); const log = createLog({ storage: st, build: 'sixes-r4', caps: { matches: 3, events: 10 } }); play(log, 5, 'skilled');
  const saved = JSON.parse(st.getItem(KEY)); assert.equal(saved.v, 1); assert.equal(saved.matches.length, 3);
  assert.equal(createLog({ storage: st }).data().matches.length, 3); // reload
  st.setItem(KEY, '{not json'); assert.equal(createLog({ storage: st }).data().matches.length, 0);
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('no'); } };
  const l2 = createLog({ storage: bad }); assert.doesNotThrow(() => { play(l2, 1, 'skilled'); l2.clear(); });
  log.clear(); assert.equal(st.getItem(KEY), null); assert.equal(log.data().matches.length, 0);
});

test('quit match, panel skips, think time and retry are recorded', () => {
  const log = createLog({ storage: null, build: 'sixes-r4' });
  let s = applyCommand(null, 'NewMatch', { seed: 'q1' }); log.matchStart(s);
  const b = s; s = applyCommand(s, 'BowlOver', {}); log.over(b, s, { th: 900 }); log.panel(120, true);
  log.matchStart(applyCommand(null, 'NewMatch', { seed: 'q2' }));
  const ms = log.data().matches; assert.equal(ms[0].ab, 1); assert.equal(ms[0].sk, 1); assert.equal(ms[0].ov[0].th, 900); assert.equal(ms[0].ov[0].sk, 1);
  const a = aggregate(ms); assert.equal(a.quit, 1); assert.equal(a.skips, 1); assert.equal(a.thinkFast, 100);
  assert.match(buildText(log.data(), ENV), /M1 \? quit/);
});

test('feel strip v2: first 2 matches of a build up to 2, then 1, pk fallback, result only', () => {
  const m = (nb, id, feel = {}) => ({ id, res: 'won', nb, feel, build: 'b', m: { k: 'wk', n: 2 } });
  assert.deepEqual(planFeel(m(1, 1), {}), ['pk']);
  const ctx = { feelLog: [], nets: [{ q: 1, b: 'b' }], spins: [{ q: 2, b: 'b' }], buys: [{ q: 3, b: 'b', item: 'nets2' }] };
  assert.deepEqual(planFeel(m(1, 1), ctx), ['wh', 'ec']); assert.deepEqual(planFeel(m(3, 3), ctx), ['wh']);
  assert.deepEqual(planFeel(m(1, 1, { wh: 'Fair' }), ctx), ['ec']);
  assert.deepEqual(planFeel({ ...m(1, 1), res: 'lost', m: { k: 'run', n: 41 } }, ctx), []);
  assert.deepEqual(planFeel({ ...m(1, 1), res: null }, ctx), []);
  const skipped = { ...ctx, feelLog: [{ f: 'wh', v: 'sk', id: 1, q: 5, b: 'b' }, { f: 'wh', v: 'sk', id: 2, q: 6, b: 'b' }] };
  assert.ok(!planFeel(m(4, 4), { ...skipped, spins: [{ q: 9, b: 'b' }] }).includes('wh')); // skipped twice: paused 5 matches
  assert.ok(planFeel(m(4, 8), { ...skipped, spins: [{ q: 9, b: 'b' }] }).includes('wh'));
  assert.equal(nextQuestion(m(1, 1), {}), 'pk');
  const log = createLog({ storage: null, build: 'sixes-r4' }); play(log, 3, 'skilled');
  assert.deepEqual(log.data().matches.map((x) => x.nb), [1, 2, 3]);
});

test('small pure helpers', () => {
  assert.equal(matchupOf([]), '?'); assert.equal(matchupOf([{ g: 1 }, { g: 0 }]), 'G'); assert.equal(matchupOf([{ g: -1 }]), 'P'); assert.equal(matchupOf([{ g: 0 }]), 'O');
  assert.deepEqual(expected([{ pr: { p: { six: 0.1, four: 0.1, two: 0.1, single: 0.2, wicket: 0.05 } } }]), { xr: 1.4, xw: 0.1 });
  assert.equal(inRange(50, BANDS.runs.us), 'ok'); assert.equal(inRange(20, BANDS.runs.us), 'below'); assert.equal(inRange(999, BANDS.runs.us), 'above'); assert.deepEqual(BANDS.win, { idle: 35, rote: 49, skilled: 59 });
});

test('report: reopening mid-match is not a new match or a first Start (Z1), and a quiet session still has an end screen (Z2)', () => {
  let t = 1000; const now = () => t;
  const log = createLog({ storage: null, now, build: 'sixes-r4', env: () => 'vp' });
  t = 6000; log.matchStart({ seed: 's1', stage: 'bowl' });
  const log2 = createLog({ storage: { getItem: () => JSON.stringify(log.data()), setItem() {}, removeItem() {} }, now, build: 'x', env: () => 'vp' });
  log2.stage('bowl'); t = 9000; log2.matchStart({ seed: 's1', stage: 'bowl' }, true);
  assert.equal(log2.data().matches.length, 1); assert.equal(log2.data().matches[0].ab, 0);
  assert.equal(log2.data().sessions.at(-1).end, 'bowl');
});

test('word opens: letter-words line only above 3, pure wordsLine, JSON count', () => {
  let clk = 1000; const log = createLog({ storage: null, build: 'sixes-r4', now: () => clk }); play(log, 1, 'skilled');
  for (const [w, n] of [['burst', 3], ['line', 2], ['pairing', 1]]) for (let i = 0; i < n; i++) { clk += 2000; log.gloss(w); }
  assert.ok(buildText(log.data(), ENV).includes('Letter words tapped 6.'));
  assert.equal(JSON.parse(buildData(log.data(), ENV)).F.words, 6);
  const g = {}; for (let i = 0; i < 10; i++) g['w' + i] = 10 - i;
  assert.match(wordsLine(g), /^Words opened: W0 10, .*W7 3, \+3 more\.$/);
  assert.equal(wordsLine({}), null);
});

test('CLEAN fails on a fixed seed or a repeated seed', () => {
  const m = (seed) => ({ build: 'sixes-r4', res: 'won', ab: 0, ov: [], seed });
  assert.ok(cleanOf([m('x'), m('y')], { ...ENV, fixedSeed: true }).why.includes('fixed seed'));
  assert.ok(cleanOf([m('x'), m('x')], ENV).why.includes('repeated seed'));
  assert.equal(cleanOf([m('x'), m('y')], ENV).ok, true);
});

test('luck line: bands by result, too few matches, quit adds nothing', () => {
  const log = createLog({ storage: null, build: 'sixes-r4', now: () => 1000 }); play(log, 2, 'skilled');
  const t = buildText(log.data(), ENV).replace(/\s+/g, ' ');
  assert.ok(t.includes('win -9..+16, loss -18..+6'), t);
  assert.ok(t.includes('n small'));
  const d = log.data(), base = aggregate(d.matches);
  const quit = { ...d.matches[0], res: null, ab: 1, ov: d.matches[0].ov.map((o) => ({ ...o, r: o.r + 50, xr: o.xr })) };
  const a2 = aggregate([...d.matches, quit]);
  assert.equal(a2.scored, base.scored); assert.equal(a2.xScored, base.xScored); assert.equal(a2.wkTook, base.wkTook);
});

test('engine luck: 200 seeded matches stay within 3 sd of expected', () => {
  const log = createLog({ storage: null, build: 'sixes-r4', now: () => 1000 }); play(log, 200, 'skilled');
  const ovs = log.data().matches.flatMap((m) => m.ov);
  const diff = ovs.reduce((n, o) => n + o.r - o.xr, 0);
  assert.ok(Math.abs(diff) < 3 * 11 * Math.sqrt(200), 'run luck drifted: ' + diff);
});
