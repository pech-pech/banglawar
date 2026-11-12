import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { newGame, step, playSeason } from './_season-bot.mjs';

const untilStage = (store, stage, max = 3000) => { let g = 0; while (store.get().stage !== stage && g++ < max && step(store)); return store.get(); };

test('whole season: ends at stage end within 11 matches, table sums, TP never negative', () => {
  const store = newGame('flow-1'); const stages = new Set(); let g = 0; let minTp = 1e9;
  while (g++ < 5000) { stages.add(store.get().stage); minTp = Math.min(minTp, store.get().training.tp); if (!step(store)) break; }
  const s = store.get();
  assert.equal(s.stage, 'end'); assert.equal(s.season.phase, 'over'); assert.ok(s.season.champion);
  for (const k of ['hub', 'squad', 'plan', 'bowl', 'break', 'chase', 'done', 'train', 'week', 'end']) assert.ok(stages.has(k), k);
  const t = s.season.table;
  assert.equal(t.reduce((a, r) => a + r.p, 0), 90); assert.equal(t.reduce((a, r) => a + r.pts, 0), 90 + t.reduce((a, r) => a + r.t, 0));
  assert.equal(s.season.results.filter((r) => r.kind === 'league').length, 45);
  assert.ok(minTp >= 0);
  const ownMatches = s.season.results.filter((r) => r.a === 'c0' || r.b === 'c0').length;
  assert.ok(ownMatches >= 9 && ownMatches <= 11, 'own matches ' + ownMatches);
});

test('league order, then semi, final only for qualifiers; eliminated M goes straight to end', () => {
  let semis = 0, finals = 0, outs = 0;
  for (let i = 0; i < 12; i++) {
    const store = newGame('ko-' + i); const seen = [];
    let g = 0; while (g++ < 5000 && step(store)) { const st = store.get().stage; if (st === 'semi' || st === 'final') seen.push(st); }
    const s = store.get(); assert.equal(s.stage, 'end');
    const top4 = s.season.table.slice(0, 4).some((r) => r.id === 'c0');
    assert.ok(s.season.finals && s.season.finals.final.winner === s.season.champion);
    if (top4) { assert.ok(seen.includes('semi')); semis++; if (seen.includes('final')) finals++; } else { assert.equal(seen.length, 0); outs++; }
  }
  assert.ok(semis + outs === 12);
});

test('deterministic: same seed, same commands -> same JSON; different seed differs', () => {
  const a = JSON.stringify(playSeason(newGame('d1')).season), b = JSON.stringify(playSeason(newGame('d1')).season);
  assert.equal(a, b); assert.notEqual(a, JSON.stringify(playSeason(newGame('d2')).season));
});

test('FinishMatch pays TP, fills the table, plays the 4 AI matches', () => {
  const store = newGame('fm'); const s = untilStage(store, 'done'); const tp0 = s.training.tp;
  const f = C(s, 'FinishMatch');
  assert.equal(f.stage, 'train'); assert.ok(f.training.tp >= tp0 + 60);
  assert.equal(f.season.results.length, 5); assert.equal(f.season.table.reduce((a, r) => a + r.p, 0), 10);
  assert.equal(C(f, 'FinishMatch'), f);
});

test('drills: one per player per week, 15 TP, week advances once on EndWeek, drillCount counts', () => {
  const store = newGame('dr'); let s = untilStage(store, 'train');
  const id = s.clubs[0].squad[0].id, tp = s.training.tp;
  const a = C(s, 'Drill', { playerId: id, drillId: 'bp' });
  assert.equal(a.training.tp, tp - 15); assert.equal(a.training.drillCount, 1);
  assert.equal(C(a, 'Drill', { playerId: id, drillId: 'bs' }), a);
  const w0 = a.training.week; const e = C(a, 'EndWeek');
  assert.equal(e.stage, 'week'); assert.equal(e.training.week, w0 + 1);
  const n = C(e, 'NextWeek'); assert.equal(n.stage, 'hub'); assert.equal(n.season.round, 2); assert.equal(n.training.week, w0 + 1);
  assert.equal(n.fixture.round, 2);
});

test('drill roll depends on the salt (re-roll without ?seed) but not on call order', () => {
  const store = newGame('salt'); const s = untilStage(store, 'train'); const id = s.clubs[0].squad[1].id;
  const same = (x, y) => JSON.stringify(C(x, 'Drill', { playerId: id, drillId: 'spd' }).training.last) === JSON.stringify(C(y, 'Drill', { playerId: id, drillId: 'spd' }).training.last);
  assert.ok(same(s, s));
});

test('UnlockNode spends TP and sets nodes (stage train)', () => {
  const store = newGame('nd'); const s = untilStage(store, 'train'); const id = s.clubs[0].squad[0].id;
  const a = C(s, 'UnlockNode', { playerId: id, side: 'bat', node: 1 });
  assert.equal(a.clubs[0].squad[0].nodes.bat, 1); assert.equal(a.training.tp, s.training.tp - 30);
  assert.equal(C(s, 'UnlockNode', { playerId: id, side: 'bat', node: 2 }), s);
});

test('weekVM / trainingVM / playerVM / treeVM / coachesVM / drillResultVM shapes', () => {
  const store = newGame('vm'); let s = untilStage(store, 'train'); const id = s.clubs[0].squad[0].id;
  const tv = sel.trainingVM(s);
  assert.equal(tv.rows.length, 10); assert.equal(tv.total, 10); assert.equal(tv.done, 0); assert.ok(tv.coachLine);
  assert.equal(tv.rows.filter((r) => r.bench).length, 4);
  // row layout: each row carries the four raw 1-99 ratings, in the order the row draws them
  for (const r of tv.rows) { assert.deepEqual(Object.keys(r.rates), ['batPower', 'batSkill', 'bowlSpeed', 'bowlSkill']); for (const v of Object.values(r.rates)) assert.ok(Number.isInteger(v) && v >= 1 && v <= 99); }
  const p0 = s.clubs[0].squad.find((p) => p.id === tv.rows[0].id); assert.deepEqual(tv.rows[0].rates, { batPower: p0.bp, batSkill: p0.bs, bowlSpeed: p0.spd, bowlSkill: p0.bsk });
  const pv = sel.playerVM(s, id); assert.equal(pv.drills.length, 4); assert.equal(pv.ratings.length, 4); assert.ok(pv.ability.overall);
  const tr = sel.treeVM(s, id); assert.equal(tr.trees.length, 2); assert.equal(tr.trees[0].nodes.length, 5);
  assert.ok(sel.coachesVM(s).coaches.length >= 1);
  s = C(s, 'Drill', { playerId: id, drillId: 'bp' });
  const dr = sel.drillResultVM(s); assert.ok(['Okay', 'Good', 'Great'].includes(dr.word)); assert.equal(dr.id, id);
  s = C(s, 'EndWeek'); const wv = sel.weekVM(s);
  assert.equal(wv.gains.length, 10); assert.ok(wv.roundResults.length >= 5); assert.ok(wv.pos >= 1);
});

test('NewSeason: fresh fixtures and table, AI clubs grew, M keeps squad, TP kept', () => {
  const s = playSeason(newGame('ns')); const n = C(s, 'NewSeason');
  assert.equal(n.stage, 'hub'); assert.equal(n.season.n, 2); assert.equal(n.season.round, 1); assert.equal(n.season.results.length, 0);
  assert.deepEqual(n.clubs[0].squad, s.clubs[0].squad);
  assert.ok(n.clubs[1].squad[0].bp >= s.clubs[1].squad[0].bp);
  assert.equal(n.training.tp, s.training.tp);
  assert.notEqual(n.season.seed, s.season.seed);
  const e = sel.endVM(s); assert.equal(e.rows.length, 10); assert.ok(e.myPlace >= 1); assert.ok(e.tpWon > 0);
  assert.equal(C(n, 'NewSeason'), n);
});

test('saved state is plain JSON: round trip equals', () => {
  const s = playSeason(newGame('json'));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});
