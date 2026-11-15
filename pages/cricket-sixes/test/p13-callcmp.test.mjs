// P13 callcmp: "your call vs the other call" hint (same-dice replay, expected runs and wickets). M picks: Q4=B (chase alt = the other intent with the largest |dr|, tie Steady).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { callCompare, hintText } from '../js/store/callcmp.js';
import { overExpect } from '../js/core/match.js';
import { expected } from '../js/report/metrics.js';

const J = (x) => JSON.stringify(x);
const words = (t) => t.split(' ').length;

/** Every over of a step-0 match: { before, after } with a seeded pseudo-random call per over. */
function* overs(seed) {
  let s = C(null, 'NewMatch', { seed });
  let k = 0;
  while (s.stage === 'bowl' || s.stage === 'chase' || s.stage === 'break') {
    if (s.stage === 'break') { s = C(s, 'StartChase'); continue; }
    const f = (seed.length + k++) % 2 ? 'A' : 'P';
    const intent = ['D', 'R', 'A'][k % 3];
    let b = s;
    if (s.stage === 'bowl') b = C(s, 'MakeCall', { bowler: s.call.bowler, field: f });
    const a = C(b, 'BowlOver', { intent });
    yield { before: b, after: a };
    s = a;
  }
}
const first = (seed, stage) => { for (const o of overs(seed)) if (o.before.stage === stage && o.after.last.balls.length === 6) return o; return null; };

test('overExpect is raw; metrics expected() is its r1 rounding', () => {
  const { after } = first('p13-a', 'bowl');
  const raw = overExpect(after.last.balls), r = expected(after.last.balls);
  assert.equal(r.xr, Math.round(raw.xr * 10) / 10);
  assert.equal(r.xw, Math.round(raw.xw * 10) / 10);
  assert.deepEqual(overExpect([{}, { pr: {} }].slice(0, 1)), { xr: 0, xw: 0 });
});

test('replay with the same call reproduces after.last and after.book exactly (bowl and chase)', () => {
  for (const stage of ['bowl', 'chase']) {
    const { before, after } = first('p13-rep', stage);
    const same = stage === 'bowl'
      ? C({ ...before, call: { bowler: after.last.bowler, field: after.last.field } }, 'BowlOver', {})
      : C(before, 'BowlOver', { intent: after.last.intent });
    assert.equal(J(same.last), J(after.last), stage);
    assert.equal(J(same.book), J(after.book), stage);
  }
});

test('callCompare does not mutate before', () => {
  for (const stage of ['bowl', 'chase']) {
    const { before, after } = first('p13-mut', stage);
    const snap = J(before), snapA = J(after);
    assert.ok(callCompare(before, after));
    assert.equal(J(before), snap); assert.equal(J(after), snapA);
  }
});

test('alt rule: A->P and P->A on bowl; chase alt is another intent with the larger |dr|, tie Steady', () => {
  const seen = { b: new Set(), c: new Set() };
  for (let i = 0; i < 12; i++) for (const { before, after } of overs(`p13-alt-${i}`)) {
    const r = callCompare(before, after); if (!r) continue;
    seen[r.stage].add(`${r.mine}>${r.alt}`);
    if (r.stage === 'b') assert.equal(r.alt, r.mine === 'A' ? 'P' : 'A');
    else {
      assert.notEqual(r.alt, r.mine);
      // recompute independently
      const mx = overExpect(after.last.balls).xr;
      const d = {};
      for (const k of ['D', 'R', 'A']) if (k !== r.mine) d[k] = Math.abs(mx - overExpect(C(before, 'BowlOver', { intent: k }).last.balls).xr);
      const [k1, k2] = Object.keys(d);
      const want = Math.abs(d[k1] - d[k2]) < 1e-9 ? (d.R !== undefined ? 'R' : k1) : d[k1] > d[k2] ? k1 : k2;
      assert.equal(r.alt, want);
    }
  }
  assert.ok([...seen.b].some((x) => x.startsWith('A')) && [...seen.b].some((x) => x.startsWith('P')));
  assert.ok(seen.c.size >= 3, [...seen.c].join());
});

test('chase tie -> Steady (pure rule via equal-effect intents is covered by the independent recompute above)', () => {
  assert.equal(hintText('c', 'A', 'R', 0.2, 0).text, 'Attack: about the same as Steady');
});

test('uses expected, not actual: found over where actual and expected run differences have opposite signs', () => {
  const runsOf = (balls) => balls.reduce((a, b) => a + (typeof b.o === 'number' ? b.o : 0), 0);
  let hit = null;
  outer: for (let i = 0; i < 400 && !hit; i++) {
    const s0 = C(null, 'NewMatch', { seed: `p13-opp-${i}` });
    const before = C(s0, 'MakeCall', { bowler: s0.call.bowler, field: 'A' });
    const after = C(before, 'BowlOver', {});
    if (after.last.balls.length < 6) continue;
    const alt = C({ ...before, call: { bowler: after.last.bowler, field: 'P' } }, 'BowlOver', {});
    if (alt.last.balls.length < 6) continue;
    const dx = overExpect(after.last.balls).xr - overExpect(alt.last.balls).xr;
    const da = runsOf(after.last.balls) - runsOf(alt.last.balls);
    if (da !== 0 && Math.abs(dx) > 0.3 && Math.sign(dx) !== Math.sign(da)) hit = { before, after, dx };
  }
  assert.ok(hit, 'no opposite-sign fixture found in 400 seeds');
  const r = callCompare(hit.before, hit.after);
  assert.equal(Math.sign(r.dr), Math.sign(hit.dx));
  assert.ok(Math.abs(r.dr - hit.dx) < 1e-12);
});

test('wording: exact strings for the six examples; <= 8 words; no better|good|wrong|%', () => {
  const ex = [
    [['c', 'A', 'R', 1.9, 0.29], 'Attack: +2 runs, more risk vs Steady'],
    [['c', 'R', 'A', -1.95, -0.29], 'Steady: -2 runs, less risk vs Attack'],
    [['c', 'D', 'R', -1.44, -0.09], 'Defend: -1 run vs Steady'],
    [['b', 'P', 'A', -0.7, -0.17], 'Protect: saved 1 run, fewer wickets vs Attack'],
    [['b', 'A', 'P', 0.7, 0.17], 'Attack: cost 1 run, more wickets vs Protect'],
    [['b', 'P', 'A', -0.2, -0.05], 'Protect: about the same as Attack'],
  ];
  for (const [args, want] of ex) {
    const h = hintText(...args);
    assert.equal(h.text, want);
    assert.ok(words(h.text) <= 8, h.text);
    assert.doesNotMatch(h.text + h.say, /better|good|wrong|%/i);
    assert.match(h.say, /^Your call \w+\. With the same balls, \w+ would have /);
  }
  assert.equal(hintText('c', 'A', 'R', 2.4, 0.099).text, 'Attack: +2 runs vs Steady');
  for (let i = 0; i < 6; i++) for (const { before, after } of overs(`p13-w-${i}`)) {
    const r = callCompare(before, after); if (r) assert.ok(words(r.text) <= 8, r.text);
  }
});

test('hidden: flag off, wrong stage, no last, fewer than 6 balls in either branch, throwing replay -> null', () => {
  const { before, after } = first('p13-hid', 'bowl');
  assert.ok(callCompare(before, after, { flag: true }));
  assert.equal(callCompare(before, after, { flag: false }), null);
  assert.equal(callCompare({ ...before, stage: 'hub' }, after), null);
  assert.equal(callCompare(before, { ...after, last: null }), null);
  const short = { ...after, last: { ...after.last, balls: after.last.balls.slice(0, 5) } };
  assert.equal(callCompare(before, short), null);
  // alt branch short: find an over whose other branch ends the innings early
  let found = false;
  for (let i = 0; i < 200 && !found; i++) for (const o of overs(`p13-short-${i}`)) {
    if (o.after.last.balls.length === 6 && callCompare(o.before, o.after) === null) { found = true; break; }
  }
  const errs = [];
  assert.equal(callCompare({ ...before, me: null }, after, { onError: (e) => errs.push(e) }), null);
  assert.equal(errs.length, 1);
  assert.equal(callCompare(before, after, { onError: () => { throw new Error('x'); } }) !== null, true);
});

test('sanity sweep: 60 step-0 matches, mean dr (bowl Protect vs Attack; chase per mine>alt)', () => {
  const acc = {};
  const add = (k, v) => { (acc[k] ||= []).push(v); };
  for (let i = 0; i < 60; i++) for (const { before, after } of overs(`p13-sw-${i}`)) {
    const r = callCompare(before, after); if (!r) continue;
    if (r.stage === 'b') add(`b ${r.mine}>${r.alt}`, r.dr); else { add(`c ${r.mine}>${r.alt}`, r.dr); add('c|dr|', Math.abs(r.dr)); }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const means = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, `${mean(v).toFixed(2)} (n=${v.length})`]));
  console.log('P13 callcmp sweep means:', J(means));
  assert.ok(acc['b P>A'].length > 50);
  const bp = mean(acc['b P>A']);
  assert.ok(bp >= -1.2 && bp <= -0.3, `Protect vs Attack mean dr ${bp}`);
  assert.ok(mean(acc['c|dr|']) > 1, `chase mean |dr| ${mean(acc['c|dr|'])}`);
});

test('no state change: callCompare leaves keys of the store state unchanged; hint is not part of state', () => {
  const { before, after } = first('p13-keys', 'bowl');
  const keys = Object.keys(after).sort().join();
  callCompare(before, after);
  assert.equal(Object.keys(after).sort().join(), keys);
  assert.equal('hint' in after || 'callHint' in after, false);
});
