import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClubs, aiPickSix, growClubs } from '../js/core/clubs.js';
import { makeSchedule, makeTable, applyResult, simRound, simMatch, simFinals, tableOrder } from '../js/core/season.js';
import { makeRng } from '../js/core/rng.js';
import { capSum } from '../js/core/ability.js';
import { SEASON } from '../js/data/season.js';
import { CLUB_NAMES, SURNAMES } from '../js/data/names.js';

const clubs = (seed) => makeClubs(makeRng(`${seed}|clubs`), SEASON);
const ratings = (p) => [p.bp, p.bs, p.spd, p.bsk];
const IDS = Array.from({ length: 10 }, (_, i) => `c${i}`);

function mkState(seed, salt = '') {
  const cs = clubs(seed);
  return { salt, clubs: cs, season: { seed, fixtures: makeSchedule(IDS, makeRng(`${seed}|sched`)), table: makeTable(IDS), phase: 'league' } };
}

test('10 clubs c0..c9, c0 is first; each has 10 players and a six of 6 distinct squad ids', () => {
  const cs = clubs('k1');
  assert.deepEqual(cs.map((c) => c.id), IDS);
  for (const c of cs) {
    assert.equal(c.squad.length, 10);
    assert.equal(new Set(c.squad.map((p) => p.id)).size, 10);
    assert.equal(c.six.length, 6);
    assert.equal(new Set(c.six).size, 6);
    assert.ok(c.six.every((id) => c.squad.some((p) => p.id === id)));
    assert.equal(typeof c.name, 'string');
    assert.equal(typeof c.mean, 'number');
  }
});

test('ratings are whole numbers 1..99; player fields match the app shape', () => {
  for (const seed of ['r1', 'r2', 'r3']) for (const c of clubs(seed)) for (const p of c.squad) {
    assert.ok(ratings(p).every((v) => Number.isInteger(v) && v >= 1 && v <= 99), `${p.id} ${ratings(p)}`);
    assert.ok(['Opener', 'Middle', 'Lower'].includes(p.bat));
    assert.ok(['Fast', 'Medium', 'Spin'].includes(p.bowl));
    assert.deepEqual(p.nodes, { bat: 0, bowl: 0 });
    assert.ok(Number.isInteger(p.potential) && p.potential >= 20 && p.potential <= 200);
  }
});

test('roles and bowling types: 3 Opener, 4 Middle, 3 Lower; 4 Fast, 3 Medium, 3 Spin per club', () => {
  for (const c of clubs('roles')) {
    const n = (k, v) => c.squad.filter((p) => p[k] === v).length;
    assert.deepEqual([n('bat', 'Opener'), n('bat', 'Middle'), n('bat', 'Lower')], [3, 4, 3]);
    assert.deepEqual([n('bowl', 'Fast'), n('bowl', 'Medium'), n('bowl', 'Spin')], [4, 3, 3]);
  }
});

test('League 1 strength: overall rating mean about 30; club means spread by the offsets', () => {
  let sum = 0, cnt = 0;
  for (let k = 0; k < 20; k++) for (const c of clubs(`m${k}`)) for (const p of c.squad) { for (const v of ratings(p)) { sum += v; cnt++; } }
  const mean = sum / cnt;
  assert.ok(Math.abs(mean - 30) < 1.5, `mean ${mean}`);
  const cs = clubs('offs');
  assert.equal(cs[0].mean, 30, 'M club has no offset');
  const offs = cs.slice(1).map((c) => c.mean - 30).sort((a, b) => a - b);
  assert.deepEqual(offs, SEASON.clubOffsets.slice().sort((a, b) => a - b));
});

test('potential: cap sum is at least the rating sum + 12 for every player; M squad +20 potentials higher on average', () => {
  let mine = 0, theirs = 0, nm = 0, nt = 0;
  for (let k = 0; k < 10; k++) for (const c of clubs(`p${k}`)) for (const p of c.squad) {
    assert.ok(capSum(p.potential) >= ratings(p).reduce((a, b) => a + b, 0) + 12, `${p.id}`);
    if (c.id === 'c0') { mine += p.potential; nm++; } else { theirs += p.potential; nt++; }
  }
  assert.ok(mine / nm > theirs / nt + 10, `${mine / nm} vs ${theirs / nt}`);
});

test("M's squad: 8 players have 5 drills here, 2 bench players have 2; AI have 0; the two are not in the six", () => {
  const c0 = clubs('d1')[0];
  const d = c0.squad.map((p) => p.drillsHere);
  assert.equal(d.filter((x) => x === 5).length, 8);
  assert.equal(d.filter((x) => x === 2).length, 2);
  for (const p of c0.squad.filter((x) => x.drillsHere === 2)) assert.ok(!c0.six.includes(p.id));
  for (const c of clubs('d1').slice(1)) assert.ok(c.squad.every((p) => p.drillsHere === 0));
});

test('names: original, short, unique across all 100 players and 10 clubs', () => {
  for (const seed of ['n1', 'n2', 'n3']) {
    const cs = clubs(seed);
    const pn = cs.flatMap((c) => c.squad.map((p) => p.name));
    assert.equal(new Set(pn).size, 100);
    assert.equal(new Set(cs.map((c) => c.name)).size, 10);
    assert.equal(cs[0].name, 'Fernhill');
  }
  assert.ok(SURNAMES.length >= 100 && new Set(SURNAMES).size === SURNAMES.length);
  assert.ok(CLUB_NAMES.length >= 9 && new Set(CLUB_NAMES).size === CLUB_NAMES.length);
  assert.ok(SURNAMES.every((n) => /^[A-Z][A-Za-z]{2,9}$/.test(n)), 'letters only, 3-10 chars');
  assert.ok(CLUB_NAMES.every((n) => /^[A-Z][A-Za-z ]{2,13}$/.test(n)));
});

test('aiPickSix: best six by overall, ordered Opener, Middle, Lower then bat ability', () => {
  const rank = { Opener: 0, Middle: 1, Lower: 2 };
  for (const c of clubs('six')) {
    const six = aiPickSix(c);
    assert.equal(six.length, 6);
    assert.equal(new Set(six).size, 6);
    const byId = new Map(c.squad.map((p) => [p.id, p]));
    for (let i = 1; i < 6; i++) assert.ok(rank[byId.get(six[i - 1]).bat] <= rank[byId.get(six[i]).bat]);
    const overall = (p) => p.bp + p.bs + p.spd + p.bsk;
    const chosen = new Set(six);
    const worstIn = Math.min(...six.map((id) => overall(byId.get(id))));
    // not an exact equality (weights differ per role) but no bench player may be far better
    for (const p of c.squad) if (!chosen.has(p.id)) assert.ok(overall(p) <= worstIn + 40);
  }
});

test('deterministic: same rng gives equal clubs; different seed differs; no input needed from outside', () => {
  assert.deepEqual(clubs('same'), clubs('same'));
  assert.notDeepEqual(clubs('same'), clubs('other'));
});

test('growClubs: AI clubs gain +4 on each rating (cap 99), keep potential above the cap-sum floor; c0 and input untouched', () => {
  const cs = clubs('grow');
  const before = JSON.stringify(cs);
  const g = growClubs(cs, 4);
  assert.equal(JSON.stringify(cs), before);
  assert.deepEqual(g[0], cs[0]);
  for (let i = 1; i < 10; i++) g[i].squad.forEach((p, j) => {
    const o = cs[i].squad[j];
    ratings(p).forEach((v, k) => assert.equal(v, Math.min(99, ratings(o)[k] + 4)));
    assert.ok(capSum(p.potential) >= ratings(p).reduce((a, b) => a + b, 0) + 12);
  });
});

test('simRound: 4 AI-v-AI league matches (never c0), result shape, totals plausible', () => {
  const s = mkState('sim1');
  for (let round = 1; round <= 9; round++) {
    const rs = simRound(s, round);
    assert.equal(rs.length, 4);
    for (const r of rs) {
      assert.equal(r.round, round);
      assert.equal(r.kind, 'league');
      assert.notEqual(r.a, 'c0'); assert.notEqual(r.b, 'c0');
      assert.ok(Number.isInteger(r.ra) && Number.isInteger(r.rb) && r.ra >= 0 && r.rb >= 0);
      assert.ok(r.wa >= 0 && r.wa <= 5 && r.wb >= 0 && r.wb <= 5);
      assert.equal(r.winner, r.ra > r.rb ? r.a : r.ra < r.rb ? r.b : null);
    }
  }
});

test('simRound is deterministic and independent: same state same results, other draws do not change them, salt does', () => {
  const s = mkState('sim2');
  const a = simRound(s, 3);
  makeRng('some other draw').random(); // unrelated draw elsewhere
  assert.deepEqual(simRound(mkState('sim2'), 3), a);
  const before = JSON.stringify(s);
  simRound(s, 3);
  assert.equal(JSON.stringify(s), before, 'state not mutated');
  assert.notDeepEqual(simRound(mkState('sim2', 'salt-x'), 3), a);
  assert.notDeepEqual(simRound(s, 4), a);
});

test('a season of simulated rounds fills a consistent table (36 AI matches + c0 left out)', () => {
  const s = mkState('sim3');
  let t = s.season.table;
  let n = 0;
  for (let r = 1; r <= 9; r++) for (const x of simRound(s, r)) { t = applyResult(t, x); n++; }
  assert.equal(n, 36);
  assert.equal(t.find((x) => x.id === 'c0').p, 0);
  assert.ok(t.slice(1).length === 9);
});

test('simMatch: stronger side wins more often (sanity of the real match core)', () => {
  const cs = clubs('str');
  const strong = JSON.parse(JSON.stringify(cs[1])), weak = JSON.parse(JSON.stringify(cs[2]));
  for (const p of strong.squad) for (const k of ['bp', 'bs', 'spd', 'bsk']) p[k] = Math.min(99, p[k] + 15);
  const s = { salt: '', clubs: [cs[0], strong, weak], season: { seed: 'sanity' } };
  let w = 0, l = 0;
  for (let i = 0; i < 80; i++) {
    const r = simMatch({ ...s, season: { seed: `sanity${i}` } }, 'c1', 'c2', 'league', i + 1);
    if (r.winner === 'c1') w++; else if (r.winner === 'c2') l++;
  }
  assert.ok(w > l + 15, `${w} v ${l}`);
});

test('simFinals: M outside the top 4 gets AI semis and a final with a champion from the top 4', () => {
  const s = mkState('fin1');
  let t = s.season.table;
  const rows = tableOrder(['c1', 'c2', 'c3', 'c4', 'c5', 'c0', 'c6', 'c7', 'c8', 'c9'].map((id, i) => ({ id, p: 9, w: 9 - i, l: i, t: 0, pts: 2 * (9 - i), rf: 100, ra: 50 })));
  s.season.table = rows;
  const f = simFinals(s);
  assert.equal(f.finals.semis.length, 2);
  assert.ok(f.finals.semis.every((x) => x.winner === x.a || x.winner === x.b));
  assert.deepEqual(f.finals.semis.map((x) => [x.a, x.b]), [['c1', 'c4'], ['c2', 'c3']]);
  assert.ok([f.finals.final.a, f.finals.final.b].every((id) => ['c1', 'c4', 'c2', 'c3'].includes(id)));
  assert.equal(f.champion, f.finals.final.winner);
  assert.equal(f.results.length, 3);
  assert.deepEqual(f.results.map((r) => r.kind), ['semi', 'semi', 'final']);
  assert.deepEqual(simFinals(s), f, 'deterministic');
});
