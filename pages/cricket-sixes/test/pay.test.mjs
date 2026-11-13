import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPay, gapLetters, starsOf } from '../js/core/season.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { newGame, step } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const pl = (id, r, w, o = {}) => ({ id, name: id, bat: 'Middle', bowl: 'Medium', bp: 30, bs: 30, spd: 30, bsk: 30, inn: { r, b: 10, out: false }, figs: { r: 0, w }, ...o });
/** A done-state with my six and the rival six set to a given rating. */
function done(mineR, rivalR, figs) {
  const me = figs.map(([r, w], i) => pl(`m${i}`, r, w, { bp: mineR, bs: mineR, spd: mineR, bsk: mineR }));
  const rival = figs.map((_x, i) => pl(`r${i}`, 0, 0, { bp: rivalR, bs: rivalR, spd: rivalR, bsk: rivalR }));
  return { me: { players: me }, rival: { players: rival }, fixture: { kind: 'league', opp: 'c1' }, season: { league: 1 }, clubs: [] };
}
const none = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];

test('Stars: bat 15+ = 1, 30+ = 2; bowl 1 wicket = 1, 2+ = 2', () => {
  assert.equal(starsOf(pl('a', 14, 0)).n, 0); assert.equal(starsOf(pl('a', 15, 0)).n, 1); assert.equal(starsOf(pl('a', 29, 0)).n, 1); assert.equal(starsOf(pl('a', 30, 0)).n, 2);
  assert.equal(starsOf(pl('a', 0, 1)).n, 1); assert.equal(starsOf(pl('a', 0, 2)).n, 2); assert.equal(starsOf(pl('a', 0, 4)).n, 2);
  assert.equal(starsOf(pl('a', 30, 2)).n, 4); assert.equal(starsOf(pl('a', 30, 2)).why, '30 runs and 2 wickets');
});

test('loss with no Stars pays the 45 floor; win at an even gap pays 45 + 15', () => {
  assert.equal(matchPay(done(30, 30, none), 'lost').total, 45);
  const w = matchPay(done(30, 30, none), 'won'); assert.deepEqual([w.base, w.win, w.stars, w.starsTp, w.total], [45, 15, 0, 0, 60]);
});

test('win bonus follows the gap: 15 x clamp(1 + 0.04 x gap, 0.5, 1.5)', () => {
  assert.equal(matchPay(done(30, 40, none), 'won').win, 21); // gap +10 -> 1.4
  assert.equal(matchPay(done(30, 60, none), 'won').win, 23); // clamp 1.5 = 22.5
  assert.equal(matchPay(done(60, 30, none), 'won').win, 8); // clamp 0.5 -> 7.5 rounds to 8
  assert.match(matchPay(done(30, 40, none), 'won').winNote, /rival/);
});

test('tie pays 7 instead of the win line', () => { const t = matchPay(done(30, 30, none), 'tied'); assert.deepEqual([t.win, t.total], [7, 52]); });

test('Stars pay 4 each, capped at 8 for the team, and the list says who', () => {
  const figs = [[30, 2], [30, 2], [30, 2], [20, 1], [0, 0], [0, 0]];
  const p = matchPay(done(30, 30, figs), 'lost');
  assert.equal(p.starsRaw, 4 + 4 + 4 + 2); assert.equal(p.stars, 8); assert.equal(p.starsTp, 32); assert.equal(p.total, 77);
  assert.deepEqual(p.starList.map((x) => x.id), ['m0', 'm1', 'm2', 'm3']); assert.ok(p.starList.every((x) => x.why));
});

test('knockouts are unchanged: semi loser 75, final 200 / 400, no Stars TP', () => {
  const k = (kind, o) => matchPay({ ...done(30, 30, [[30, 2], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]), fixture: { kind, opp: 'c1' } }, o);
  assert.equal(k('semi', 'lost').total, 75); assert.equal(k('semi', 'won').total, 0); assert.equal(k('final', 'lost').total, 200); assert.equal(k('final', 'won').total, 400);
});

test('gapLetters gives a letter pair; FinishMatch pays through matchPay and keeps the pay card', () => {
  const s = newGame('pay1').get(); const g = gapLetters(s, s.clubs[1]);
  assert.match(g.ours, /^[A-FS][-+]?$/); assert.match(g.theirs, /^[A-FS][-+]?$/);
  assert.deepEqual(sel.hubVM(s).next.letters, gapLetters(s, s.fixture.opp));
  const store = newGame('pay2'); let g2 = 0; while (store.get().stage !== 'done' && g2++ < 3000) step(store);
  const d = store.get(), tp0 = d.training.tp, rv = sel.resultVM(d);
  const f = C(d, 'FinishMatch');
  assert.equal(f.pay.total, f.training.tp - tp0); assert.equal(rv.tpEarned, f.pay.total); assert.equal(f.pay.base, 45); assert.ok(f.pay.total >= 45);
  assert.equal(f.econ.ledger.at(-1).k, 'match', 'the economy is paid once per match');
});

test('pay is deterministic for the same finished match', () => {
  const store = newGame('pay3'); let g = 0; while (store.get().stage !== 'done' && g++ < 3000) step(store);
  assert.deepEqual(C(store.get(), 'FinishMatch').pay, C(clone(store.get()), 'FinishMatch').pay);
});
