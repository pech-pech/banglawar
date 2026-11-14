import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballProbs, outcomeFromX } from '../js/core/match.js';
import { PAIRING } from '../js/data/pairing.js';
import { CELLS, COMBOS, SEEN_BALLS, cellIndex, pairPoints, gradeWord, gradeRank, comboOf, newBook, recordOver, seasonTip, cellName } from '../js/core/pairing.js';
import { defaultOvers, BOOK_W } from '../js/core/plan.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { unwrap, wrap, migrate, VERSION } from '../js/core/save-migrate.js';
import { foundHtml } from '../js/ui/over-panel.js';
import { chipHtml, bookHtml } from '../js/ui/book-sheet.js';
import { createStore } from '../js/store/store.js';
import { closeSeason } from '../js/core/run.js';
import { newGame, step, playSeason } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const V = JSON.parse(readFileSync(new URL('./ball-vectors-pair.json', import.meta.url), 'utf8')).vectors;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9, `${msg}: got ${a}, want ${b}`);

test('the table: 27 cells, 8 combos (4 help the batter, 4 the bowler), sheet spot values', () => {
  assert.equal(CELLS, 27); assert.equal(COMBOS, 8); assert.equal(SEEN_BALLS, 18); assert.equal(PAIRING.SEASON_TIP, 1);
  assert.equal(PAIRING.combos.filter((c) => c[5] === 'batter').length, 4);
  assert.equal(PAIRING.combos.filter((c) => c[5] === 'bowler').length, 4);
  assert.equal(PAIRING.cells.filter((c) => c[5]).length, 8);
  assert.equal(pairPoints('Opener', 'Medium', 0), -4); // Awkward -1 + Swing Time -3
  assert.equal(pairPoints('Middle', 'Fast', 0), 6);   // Good +2 + Rescue Act +4, the largest
  assert.equal(pairPoints('Lower', 'Fast', 2), -5);   // Awkward -1 + Yorker -4
  assert.equal(pairPoints('Middle', 'Fast', 1), -3);  // Hostile
  assert.equal(pairPoints('Lower', 'Spin', 1), 5);    // Easy +1 + Tail Wag +4
  assert.ok(PAIRING.cells.every((c) => Math.abs(c[3] + c[4]) <= 6));
  // grade words follow the grade points, not the combo
  assert.equal(gradeWord(cellIndex('Opener', 'Medium', 0)), 'Awkward'); assert.equal(gradeRank(cellIndex('Opener', 'Medium', 0)), 3);
  assert.equal(gradeWord(cellIndex('Middle', 'Fast', 1)), 'Hostile'); assert.equal(gradeRank(cellIndex('Middle', 'Fast', 1)), 1);
  assert.equal(gradeWord(cellIndex('Lower', 'Medium', 0)), 'Perfect'); assert.equal(gradeRank(cellIndex('Lower', 'Medium', 0)), 6);
  assert.deepEqual(comboOf(cellIndex('Opener', 'Spin', 0)), { name: 'Cracker', helps: 'batter' });
  assert.equal(comboOf(cellIndex('Opener', 'Fast', 0)), null);
  assert.equal(pairPoints('Nobody', 'Fast', 0), 0);
});

test('500 pair vectors (tuning sha d4fc8393): ballProbs with the cell points matches pair.p and pair.outcome to 1e-9; cell and points agree with the table', () => {
  assert.equal(V.length, 500);
  let withCombo = 0;
  for (const v of V) {
    const b = { bat: v.bat.type, bp: v.bat.bp, bs: v.bat.bs }, w = { bowl: v.bowl.type, spd: v.bowl.spd, bsk: v.bowl.bsk };
    const [rb, rw, rp] = v.pair.cell;
    assert.deepEqual([rb, rw, rp], [v.bat.type, v.bowl.type, v.phase], `#${v.id} cell`);
    assert.equal(pairPoints(rb, rw, rp), v.pair.points, `#${v.id} points`);
    assert.equal(gradeWord(cellIndex(rb, rw, rp)), v.pair.grade, `#${v.id} grade`);
    if (v.pair.combo) { withCombo++; assert.equal(comboOf(cellIndex(rb, rw, rp)).name, v.pair.combo); }
    const r = ballProbs(b, w, v.phase, v.intent, v.field, undefined, v.over, v.wk_lost, v.centre, v.pair.points);
    for (const k of ['wicket', 'six', 'four', 'two', 'single']) near(r.p[k], v.pair.p[k], `#${v.id} pair p.${k}`);
    near(r.singleRaw, v.pair.p_single_raw, `#${v.id} singleRaw`); near(r.dot, v.pair.p_dot, `#${v.id} dot`);
    assert.equal(String(outcomeFromX(r.p, r.singleRaw, v.x)), String(v.pair.outcome), `#${v.id} outcome`);
    // pair 0 is the layer-off ball, the same one the a6cd87bb vectors pin
    const off = ballProbs(b, w, v.phase, v.intent, v.field, undefined, v.over, v.wk_lost, v.centre);
    for (const k of ['wicket', 'six', 'four', 'two', 'single']) near(off.p[k], v.p[k], `#${v.id} off p.${k}`);
    assert.deepEqual(ballProbs(b, w, v.phase, v.intent, v.field, undefined, v.over, v.wk_lost, v.centre, 0).p, off.p);
  }
  assert.ok(withCombo > 10, 'combo cells are in the sample');
});

test('pair goes into the visible grid slot: same as moving bp, bs up and spd, bsk down by the points', () => {
  const b = { bat: 'Middle', bp: 53, bs: 64 }, w = { bowl: 'Medium', spd: 49, bsk: 41 };
  // the field z-terms read the RAW bp and bs, so compare with field N (no z-terms)
  const a2 = ballProbs(b, w, 1, 'R', 'N', undefined, 5, 0, 50, 3), m2 = ballProbs({ ...b, bp: b.bp + 3, bs: b.bs + 3 }, { ...w, spd: w.spd - 3, bsk: w.bsk - 3 }, 1, 'R', 'N', undefined, 5, 0, 50);
  assert.deepEqual(a2.p, m2.p);
  assert.equal(a2.pair, 3);
  assert.notDeepEqual(a2.p, ballProbs(b, w, 1, 'R', 'N', undefined, 5, 0, 50).p, 'a pair of +3 changes the odds');
});

test('rival AI does not read the pairing layer', () => {
  const src = readFileSync(new URL('../js/core/ai.js', import.meta.url), 'utf8');
  assert.ok(!/pairing|pairPoints|\.book\b/.test(src));
});

// ---- the Book
const bats = [{ bat: 'Opener' }, { bat: 'Middle' }, { bat: 'Lower' }], bowls = [{ bowl: 'Fast' }, { bowl: 'Medium' }, { bowl: 'Spin' }];
const over = (n, batter, bowler, ph) => Array.from({ length: n }, () => ({ batter, bowler, ph }));

test('Book: balls count per cell, a cell is found at 18 balls in total, reveal at the end of the over that makes it 18', () => {
  let b = newBook(); const i = cellIndex('Opener', 'Spin', 0);
  assert.equal(b.balls.length, 27);
  let r = recordOver(b, over(6, 0, 2, 0), bats, bowls); b = r.book;
  assert.equal(b.balls[i], 6); assert.deepEqual(r.newly, []); assert.equal(b.found[i], 0);
  r = recordOver(b, over(6, 0, 2, 0), bats, bowls); b = r.book; assert.equal(b.balls[i], 12); assert.deepEqual(r.newly, []);
  const before = JSON.stringify(b);
  r = recordOver(b, over(5, 0, 2, 0), bats, bowls);
  assert.equal(JSON.stringify(b), before, 'the input Book is not changed');
  assert.equal(r.book.balls[i], 17); assert.deepEqual(r.newly, []);
  r = recordOver(r.book, over(6, 0, 2, 0), bats, bowls);
  assert.equal(r.book.balls[i], 23); assert.deepEqual(r.newly, [i]); assert.equal(r.book.found[i], 1);
  const again = recordOver(r.book, over(6, 0, 2, 0), bats, bowls); assert.deepEqual(again.newly, [], 'found once, toast once');
  assert.equal(again.book.found[i], 1);
});

test('Book: the batter on strike gives the role, the bowler gives the type, the over gives the phase', () => {
  const r = recordOver(newBook(), [{ batter: 1, bowler: 0, ph: 1 }, { batter: 2, bowler: 1, ph: 2 }, { batter: 9, bowler: 0, ph: 0 }], bats, bowls);
  assert.equal(r.book.balls[cellIndex('Middle', 'Fast', 1)], 1); assert.equal(r.book.balls[cellIndex('Lower', 'Medium', 2)], 1);
  assert.equal(r.book.balls.reduce((a, x) => a + x, 0), 2, 'an unknown batter index counts nothing');
  assert.equal(cellName(cellIndex('Opener', 'Spin', 0)), 'Opener v Spin, early');
});

test("Coach's notebook: none before season 2; then the unfound cell with the most balls, ties to the lowest cell", () => {
  const b = newBook(); b.balls[5] = 9; b.balls[11] = 14; b.balls[20] = 14; b.balls[3] = 18; b.found[3] = 1;
  assert.equal(seasonTip(b, 1).cell, null); assert.equal(seasonTip(b, 1).book, b);
  const t = seasonTip(b, 2);
  assert.equal(t.cell, 11); assert.equal(t.book.found[11], 1); assert.equal(b.found[11], 0, 'input not changed');
  const full = { balls: Array(27).fill(18), found: Array(27).fill(1) };
  assert.equal(seasonTip(full, 6).cell, null);
});

// ---- in the game
const firstOver = (seed) => {
  const st = newGame(seed); let g = 0;
  while (st.get().stage !== 'bowl' && g++ < 20) step(st);
  return st;
};

test('a season match counts the Book: one over adds six balls; either innings; the Book survives the match', () => {
  const st = firstOver('pb-1');
  assert.equal(st.get().book.balls.reduce((a, x) => a + x, 0), 0);
  st.dispatch('BowlOver');
  const s = st.get();
  assert.equal(s.book.balls.reduce((a, x) => a + x, 0), s.last.balls.length);
  assert.deepEqual(s.last.found, []);
  const s2 = playSeason(st); // whole season, both innings of every match
  assert.ok(s2.book.balls.reduce((a, x) => a + x, 0) > 600, 'about 600 balls faced in my 9 or more matches');
});

test('found: a cell at 17 balls is found by the next ball of its pairing, listed in last.found, and shown as a grade word', () => {
  const st = firstOver('pb-2');
  const s0 = st.get();
  const probe = C(s0, 'BowlOver'); // which cells does the first over touch?
  const touched = probe.book.balls.map((n, i) => (n ? i : -1)).filter((i) => i >= 0);
  assert.ok(touched.length >= 1);
  const pre = clone(s0); touched.forEach((i) => { pre.book.balls[i] = 17; });
  const n = C(pre, 'BowlOver');
  assert.deepEqual(n.last.found, touched); touched.forEach((i) => assert.equal(n.book.found[i], 1));
  const f = sel.foundVM(n);
  assert.equal(f.length, touched.length);
  assert.ok(f.every((x) => typeof x.grade === 'string' && x.rank >= 1 && x.rank <= 6 && x.name && !('points' in x)));
  assert.deepEqual(sel.foundVM(C(n, 'BowlOver')).map((x) => x.i).filter((i) => touched.includes(i)), [], 'not found again next over');
});

test('the same seed and calls give the same Book', () => {
  const a = playSeason(newGame('pb-3')).book, b = playSeason(newGame('pb-3')).book;
  assert.deepEqual(a, b);
});

test('a step-0 match has no Book and no pairing: its numbers are as before', () => {
  let s = C(null, 'NewMatch', { seed: 'z0' });
  assert.equal(s.book, undefined);
  s = C(s, 'BowlOver');
  assert.equal(s.book, undefined); assert.equal(s.last.found, undefined);
  assert.ok(s.last.balls.every((b) => b.pr.pair === 0));
});

test('season balls carry the cell points in the ball record (pr.pair)', () => {
  const st = firstOver('pb-4'); st.dispatch('BowlOver');
  const s = st.get();
  for (const b of s.last.balls) {
    const bat = s.rival.players[b.batter], w = s.me.players[s.last.bowler];
    assert.equal(b.pr.pair, pairPoints(bat.bat, w.bowl, b.ph));
  }
});

test('Book effect on the plan: found cells move the suggested overs, an empty Book changes nothing', () => {
  const st = newGame('pb-5'); const s = st.get();
  const mine = s.clubs[0], opp = s.clubs[1];
  const six = mine.squad.slice(0, 6), their = opp.squad.slice(0, 6);
  assert.deepEqual(defaultOvers(six, their, newBook()), defaultOvers(six, their));
  assert.equal(BOOK_W, 2);
  const full = { balls: Array(27).fill(18), found: Array(27).fill(1) };
  const withBook = defaultOvers(six, their, full);
  assert.equal(withBook.length, 10);
  // across a few seeds a full Book must change at least one suggestion (it adds a term for 27 cells)
  let changed = 0;
  for (let k = 0; k < 8; k++) {
    const g = newGame('pb-6-' + k).get();
    const six2 = g.clubs[0].squad.slice(0, 6), th = g.clubs[2].squad.slice(0, 6);
    if (JSON.stringify(defaultOvers(six2, th, full)) !== JSON.stringify(defaultOvers(six2, th))) changed++;
  }
  assert.ok(changed > 0, 'a found Book is used by the suggestion');
});

test('bookVM: counts, grade words only, unfound chips show balls n/18 and no grade', () => {
  const s = clone(newGame('pb-7').get());
  s.book.balls[cellIndex('Opener', 'Spin', 0)] = 9;
  s.book.balls[cellIndex('Middle', 'Fast', 1)] = 18; s.book.found[cellIndex('Middle', 'Fast', 1)] = 1;
  s.book.balls[cellIndex('Opener', 'Spin', 2)] = 30; s.book.found[cellIndex('Opener', 'Spin', 2)] = 1; // Worn Pitch
  const vm = sel.bookVM(s);
  assert.deepEqual([vm.found, vm.total, vm.comboFound, vm.comboTotal], [2, 27, 1, 8]);
  assert.equal(vm.groups.length, 3); assert.ok(vm.groups.every((g) => g.rows.length === 3 && g.rows.every((r) => r.chips.length === 3)));
  const q = vm.groups[0].rows[2].chips[0]; // Opener v Spin early
  assert.equal(q.found, false); assert.equal(q.balls, 9); assert.equal(q.of, 18); assert.equal('grade' in q, false);
  const f = vm.groups[1].rows[0].chips[1]; // Middle v Fast middle
  assert.equal(f.found, true); assert.equal(f.grade, 'Hostile');
  const wp = vm.groups[0].rows[2].chips[2]; assert.equal(wp.combo, 'Worn Pitch'); assert.equal(wp.grade, 'Tough');
  assert.equal(vm.combos.length, 8); assert.equal(vm.combos.find((c) => c.name === 'Worn Pitch').helps, 'bowler');
  assert.equal(vm.combos.find((c) => c.name === 'Cracker').found, false); assert.equal('bat' in vm.combos.find((c) => c.name === 'Cracker'), false);
  assert.ok(!/points|"p":/.test(JSON.stringify(vm)), 'no points number in the view model');
  assert.equal(sel.bookVM({ ...s, book: undefined }).found, 0, 'a state without a Book reads as empty');
});

test('views: chips and found card show words, n/18, and no points', () => {
  const vm = sel.bookVM(clone(newGame('pb-8').get()));
  const q = chipHtml({ found: false, balls: 4, of: 18, phase: 'Early' }, 'Opener v Spin');
  assert.match(q, /\?/); assert.match(q, /4\/18/); assert.match(q, /not found, 4 of 18 balls/);
  const g = chipHtml({ found: true, rank: 5, grade: 'Good', combo: 'Cracker', phase: 'Early' }, 'Opener v Spin');
  assert.match(g, /Good/); assert.match(g, /combo Cracker/); assert.doesNotMatch(g, /\+\d|-\d/);
  const html = bookHtml(vm, 'book'); assert.match(html, /Found 0 of 27/); assert.match(html, /Combos 0 of 8/); assert.match(html, /Early/); assert.match(html, /Overs 8-10/); assert.match(html, /Fast.*Medium.*Spin/); assert.match(html, /batter's view/); assert.match(html, /Pick your bowler over by over to use what you've found\./);
  const combos = bookHtml(vm, 'combos'); assert.match(combos, /Phases/); assert.match(combos, /Not found yet/); assert.match(combos, /Rescue Act/); assert.match(combos, /Last overs/);
  const cb = clone(newGame('pb-8').get()); cb.book.found[cellIndex('Middle', 'Fast', 0)] = 1;
  assert.match(bookHtml(sel.bookVM(cb), 'combos'), /Middle v Fast, early/);
  const card = foundHtml(sel.foundVM({ last: { found: [cellIndex('Opener', 'Spin', 0)] } })[0]);
  assert.match(card, /Pairing found/); assert.match(card, /Opener v Spin, early/); assert.match(card, /Good/); assert.match(card, /Combo: Cracker/); assert.match(card, /Saved in your Book/); assert.match(card, /batter's view/);
  assert.doesNotMatch(card, /\+\d|points/);
});

test("season end: Coach's notebook finds one cell free from season 2, none at the end of season 1", () => {
  const s1 = playSeason(newGame('pb-9'));
  assert.equal(s1.run.last.notebook, null); assert.equal(sel.endVM(s1).notebook, null);
  // season 2: close it from a state with a known Book
  const s = clone(s1); s.season.n = 2; s.run.last = null; s.book = newBook(); s.book.balls[7] = 12; s.book.balls[19] = 15; s.book.balls[2] = 18; s.book.found[2] = 1;
  const c = closeSeason(s);
  assert.equal(c.run.last.notebook, 19); assert.equal(c.book.found[19], 1); assert.equal(c.book.found[7], 0);
  assert.equal(closeSeason(c), c, 'closing twice does nothing');
  const e = sel.endVM(c); assert.equal(e.notebook.i, 19); assert.equal(e.notebook.name, cellName(19)); assert.equal(typeof e.notebook.grade, 'string');
  // a season played through the store from season 2 on
  const st = createStore(C(s1, 'NewSeason'));
  const e2 = playSeason(st);
  assert.equal(e2.season.n, 2); assert.ok(Number.isInteger(e2.run.last.notebook)); assert.equal(e2.book.found[e2.run.last.notebook], 1);
});

test('v2 save migrates to v3 with an empty Book, keeps everything else, and play continues', () => {
  const s = clone(newGame('pb-10').get()); delete s.book; s.v = 2;
  assert.equal(unwrap(JSON.stringify({ v: 2, sum: 'nope', data: s })).ok, false, 'a v2 envelope needs its checksum');
  const m = migrate(s, 2);
  assert.equal(m.ok, true); assert.equal(m.state.v, 7); assert.equal(VERSION, 7); assert.equal(m.from, 2);
  assert.deepEqual(m.state.book, newBook()); assert.equal(m.state.book.balls.length, CELLS);
  // v5 (P11) drops the old training.lastPlan (a map shape); everything else must be untouched
  const noPlan = (x) => ({ ...x, v: 2, book: undefined, econ: x.econ && { ...x.econ, freePick: undefined }, training: { ...x.training, lastPlan: undefined, sel: undefined, last_plan: undefined, coach_id: undefined, netsRuns: undefined, focusChanges: undefined } });
  assert.deepEqual(noPlan(m.state), noPlan(s), 'nothing else changed');
  assert.equal(migrate(m.state, 5).state.v, 7);
  // through the envelope
  const env = unwrap(JSON.stringify({ v: 2, sum: wrap(s).sum, data: JSON.parse(JSON.stringify(s)) }));
  assert.equal(env.ok, true); assert.equal(env.state.v, 7);
  // a v1 save goes through both steps
  const v1 = clone(s); delete v1.run; v1.v = 1;
  const m1 = migrate(v1, 1); assert.equal(m1.ok, true); assert.equal(m1.state.v, 7); assert.ok(m1.state.run); assert.deepEqual(m1.state.book, newBook());
  // and keeps playing: the Book counts on from zero
  let g = m.state, n = 0; while (g.stage !== 'bowl' && n++ < 20) { const st = { get: () => g, dispatch: (c, p) => { g = C(g, c, p); } }; step(st); }
  g = C(g, 'BowlOver'); assert.equal(g.book.balls.reduce((a, x) => a + x, 0), g.last.balls.length);
  assert.equal(wrap(g).v, 7);
});

test('migration step keeps its own 27 equal to the Book size', () => {
  const m = migrate({ stage: 'hub', v: 2 }, 2);
  assert.equal(m.state.book.balls.length, CELLS); assert.equal(m.state.book.found.length, CELLS);
});

test('NewGame has an empty Book', () => {
  const s = newGame('pb-11').get(); assert.deepEqual(s.book, newBook());
});

test('found card: 1, 2 and 3 finds give one card with one title, one row per find, one saved line', () => {
  const f = (...cells) => sel.foundVM({ last: { found: cells } });
  const one = foundHtml(f(0)), two = foundHtml(f(0, 6)), three = foundHtml(f(0, 6, 20));
  for (const h of [one, two, three]) { assert.equal((h.match(/bk-found"/g) || []).length, 1); assert.equal((h.match(/Saved in your Book/g) || []).length, 1); }
  assert.match(one, /Pairing found/); assert.doesNotMatch(one, /Pairings found/);
  assert.match(two, /Pairings found/); assert.match(three, /Pairings found/);
  assert.equal((one.match(/class="bk-fr"/g) || []).length, 1); assert.equal((two.match(/class="bk-fr"/g) || []).length, 2); assert.equal((three.match(/class="bk-fr"/g) || []).length, 3);
  assert.match(two, /Combo: Cracker/);
});

test('ball why lines say matchup, never pairing or Tough', async () => {
  const { whyLine } = await import('../js/ui/why.js');
  const base = { eff: { bp: 50, bs: 50, spd: 50, bsk: 50 }, batHome: false, bowlHome: false };
  const out = [];
  for (const step of [-1, 1]) for (const o of ['W', 0, 1, 2, 4, 6]) for (let n = 1; n <= 12; n++) out.push(whyLine({ n: `3.${n}`, o, intent: 'R', field: 'P', ph: 0, bowlType: 'Fast', pr: { ...base, step, p: { wicket: 0.2 } } }, 'Ravi', 'Okoro'));
  assert.ok(out.some((l) => /matchup/i.test(l)));
  assert.ok(out.every((l) => !/pairing|tough/i.test(l)), out.filter((l) => /pairing|tough/i.test(l)).join('|'));
});

test('r2 copy: grid words are Strong / Even / Weak (batter-view Book grades keep Good and Tough); no "match-up" or "Safe pairs" left', () => {
  const rd = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  assert.match(rd('ui/bowl-view.js'), /'Strong'.*'Even'.*'Weak'/); assert.match(rd('ui/chase-view.js'), /'Strong'[\s\S]*'Even'[\s\S]*'Weak'/);
  assert.match(rd('ui/bowl-view.js'), /For your bowler/); assert.match(rd('ui/chase-view.js'), /For your batter/);
  assert.match(rd('data/glossary.js'), /▲ Strong, ● Even, ▼ Weak/); assert.doesNotMatch(rd('data/glossary.js'), /▼ Poor|other pairing is even/);
  assert.doesNotMatch(rd('store/selectors.js'), /match-up|Safe pairs/);
});
