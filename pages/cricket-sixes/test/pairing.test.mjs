import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ballProbs, outcomeFromX } from '../js/core/match.js';
import { PAIRING } from '../js/data/pairing.js';
import { CELLS, COMBOS, SEEN_BALLS, cellIndex, pairPoints, comboOf, newBook, recordOver, seasonTip, cellName, winOf, sizeOf, nearestCell } from '../js/core/pairing.js';
import { defaultOvers, BOOK_W } from '../js/core/plan.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { unwrap, wrap, migrate, VERSION } from '../js/core/save-migrate.js';
import { makeRng } from '../js/core/rng.js';
import { createStore } from '../js/store/store.js';
import { closeSeason } from '../js/core/run.js';
import { newGame, step, playSeason } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const V = JSON.parse(readFileSync(new URL('./ball-vectors-pair.json', import.meta.url), 'utf8')).vectors;
// UI modules load lazily, so the core tests still run while a view is mid-rewrite.
const ui = async () => ({ BS: await import('../js/ui/book-sheet.js'), OP: await import('../js/ui/over-panel.js') });
const gradeOfCell = (i) => PAIRING.gradeWords[String(PAIRING.cells[i][3])]; // data check only: the old word never reaches the UI
// P6 rule: no points number and none of the old grade / grid words in Book, found panel or notebook HTML. Overs ranges and n/18 are allowed.
const OLD_WORDS = /\b(Hostile|Tough|Awkward|Easy|Good|Perfect|Strong|Even|Weak)\b/;
const noPoints = (h) => !/[+\u2212-]\d/.test(String(h).replace(/\d+[-\u2011]\d+/g, '').replace(/\d+\/\d+/g, '')) && !/points/i.test(h);
const visible = (h) => String(h).replace(/<[^>]*>/g, ' ');
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
  // P6 F8-B: who wins + size come from grade + combo
  assert.deepEqual(winOf(cellIndex('Opener', 'Medium', 0)), { side: 'bowler', size: 4 }); // Swing Time
  assert.deepEqual(winOf(cellIndex('Middle', 'Fast', 1)), { side: 'bowler', size: 3 });
  assert.deepEqual(winOf(cellIndex('Lower', 'Medium', 0)), { side: 'batter', size: 3 });
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
    assert.equal(gradeOfCell(cellIndex(rb, rw, rp)), v.pair.grade, `#${v.id} grade`);
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

test('found: a cell at 17 balls is found by the next ball of its pairing, listed in last.found, and shown as who-wins words', () => {
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
  assert.ok(f.every((x) => x.found && (x.side === 'bowler' || x.side === 'batter') && x.size >= 1 && x.size <= 6 && x.band && x.title && !('points' in x) && !('grade' in x)));
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

test('bookVM (P6): counts, 27 cells in r*9+c*3+ph order, who-wins words for found cells, n/18 for unfound, no points', () => {
  const s = clone(newGame('pb-7').get());
  s.book.balls[cellIndex('Opener', 'Spin', 0)] = 9;
  s.book.balls[cellIndex('Middle', 'Fast', 1)] = 18; s.book.found[cellIndex('Middle', 'Fast', 1)] = 1;
  s.book.balls[cellIndex('Opener', 'Spin', 2)] = 30; s.book.found[cellIndex('Opener', 'Spin', 2)] = 1; // Worn Pitch
  const vm = sel.bookVM(s);
  assert.deepEqual([vm.found, vm.total, vm.comboFound, vm.comboTotal], [2, 27, 1, 8]);
  assert.equal(vm.rule, 'Watch a pairing 18 balls. It goes in.');
  assert.equal(vm.cells.length, 27); assert.deepEqual(vm.phases.map((p) => p.label), ['Overs 1-3', 'Overs 4-7', 'Overs 8-10']);
  assert.deepEqual(vm.rows.map((r) => r.word), ['Openers', 'Middle', 'Lower']); assert.deepEqual(vm.cols.map((c) => c.word), ['Fast', 'Medium', 'Spin']);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let ph = 0; ph < 3; ph++) {
    const i = vm.at(r, c, ph); assert.equal(i, cellIndex(['Opener', 'Middle', 'Lower'][r], ['Fast', 'Medium', 'Spin'][c], ph)); assert.equal(vm.cells[i].i, i);
  }
  const q = vm.cells[cellIndex('Opener', 'Spin', 0)];
  assert.equal(q.found, false); assert.equal(q.balls, 9); assert.equal(q.of, 18); assert.equal('side' in q, false); assert.equal('combo' in q, false);
  assert.equal(q.toGo, '9 balls to go.'); assert.equal(q.aria, 'Openers v Spin, overs 1-3: not found, 9 of 18 balls.');
  const f = vm.cells[cellIndex('Middle', 'Fast', 1)];
  assert.equal(f.found, true); assert.equal(f.side, 'bowler'); assert.equal(f.band, 'Fast wins big'); assert.equal(f.cellWord, 'Fast'); assert.equal(f.combo, null);
  const wp = vm.cells[cellIndex('Opener', 'Spin', 2)];
  assert.equal(wp.combo, 'Worn Pitch'); assert.equal(wp.band, 'Spin wins huge'); assert.equal(wp.comboLine, 'A bonus on top.'); assert.equal(wp.balls, 18, 'balls shown cap at 18');
  assert.equal(wp.aria, 'Openers v Spin, overs 8-10: Spin wins huge, combo Worn Pitch.');
  assert.equal(vm.nearest, cellIndex('Opener', 'Spin', 0)); assert.equal(vm.firstFound, cellIndex('Opener', 'Spin', 2)); assert.equal(vm.goal, null);
  const json = JSON.stringify(vm);
  assert.ok(!/points|"p":/.test(json), 'no points number in the view model'); assert.doesNotMatch(json, OLD_WORDS);
  const e = sel.bookVM({ ...s, book: undefined });
  assert.equal(e.found, 0, 'a state without a Book reads as empty'); assert.equal(e.empty, true);
  assert.equal(e.goal.tag, 'Your first goal'); assert.equal(e.goal.line1, 'Watch Openers face Fast in overs 1-3.');
});

test('T2/T3 cards in words: why (seen v gift by balls), use (leans to / keeps off, never bowls), unfound balls to go; unfound combos stay hidden', () => {
  const b = newBook();
  const set = (i, n, f) => { b.balls[i] = n; b.found[i] = f; };
  set(0, 18, 1); set(6, 12, 1); set(1, 0, 0); set(2, 1, 0); set(4, 17, 0);
  const c0 = sel.bookCell(0, b), c6 = sel.bookCell(6, b);
  assert.equal(c0.why, 'Why: you saw 18 balls of it.'); assert.equal(c6.why, "Why: Coach's notebook, season end.");
  assert.equal(c0.use, 'Use: the bowler pick shows it. Your plan leans to Fast at their openers.');
  assert.equal(c6.use, 'Use: the bowler pick shows it. Your plan keeps Spin off their openers.');
  for (let i = 0; i < 27; i++) { const c = sel.bookCell(i, null); assert.ok(/leans to|keeps .* off/.test(c.use) && !/\bbowls\b/.test(c.use), c.use); }
  assert.equal(sel.bookCell(1, b).toGo, '18 balls to go.'); assert.equal(sel.bookCell(2, b).toGo, '17 balls to go.'); assert.equal(sel.bookCell(4, b).toGo, '1 ball to go.');
  assert.equal(sel.bookCell(4, b).fills, 'Fills when Openers face Medium in overs 4-7, any season match, bat or bowl.');
  assert.ok(!('combo' in sel.bookCell(4, b)), 'Anchor unfound: no combo name');
});

test('T1/T11 winOf for all 27 cells: winner = sign of pairPoints, size = |grade + combo| (1-6), the F8-B size table', () => {
  const WORD = { 1: ['wins a bit', 'win a bit'], 2: ['wins', 'win'], 3: ['wins big', 'win big'], 4: ['wins huge', 'win huge'], 5: ['crushes', 'crush'], 6: ['crushes it', 'crush it'] };
  const BAT = { Opener: 'Openers', Middle: 'Middle order', Lower: 'Lower order' };
  const bySize = {};
  for (let i = 0; i < CELLS; i++) {
    const [bat, bowl, ph, g, cb, name] = PAIRING.cells[i];
    const p = pairPoints(bat, bowl, ph), w = winOf(i);
    assert.notEqual(p, 0, `cell ${i} has a winner`);
    assert.equal(w.side, p < 0 ? 'bowler' : 'batter', `cell ${i} side`);
    assert.equal(w.size, Math.min(6, Math.abs(p)), `cell ${i} size`); assert.equal(sizeOf(i), w.size);
    assert.ok(w.size >= 1 && w.size <= 6);
    if (!name) assert.equal(w.size, Math.abs(g), `cell ${i}: no combo, size is the grade`);
    else assert.ok(Math.sign(cb) === Math.sign(g) && w.size > Math.abs(g), `cell ${i}: a combo only makes it bigger`);
    assert.equal(sel.bandText(bat, bowl, w), w.side === 'bowler' ? bowl + ' ' + WORD[w.size][0] : BAT[bat] + ' ' + WORD[w.size][1]);
    (bySize[w.size] = bySize[w.size] || []).push(name || '-');
  }
  assert.deepEqual(bySize[4].sort(), ['Anchor', 'Swing Time', 'Worn Pitch']);
  assert.deepEqual(bySize[5].sort(), ['Cracker', 'Spin Web', 'Tail Wag', 'Yorker']);
  assert.deepEqual(bySize[6], ['Rescue Act']);
  assert.ok([1, 2, 3].every((k) => bySize[k].every((n) => n === '-')), 'sizes 1-3 are cells without a combo');
  // spec examples (PLAN 3.1)
  assert.equal(sel.bookCell(0, null).band, 'Fast wins a bit'); assert.equal(sel.bookCell(5, null).band, 'Openers win');
  assert.equal(sel.bookCell(10, null).band, 'Fast wins big'); assert.equal(sel.bookCell(9, null).band, 'Middle order crush it');
});

test('T12 winOf caps the size at 6 (guards future data)', () => {
  const c = PAIRING.cells[9], keep = c[4];
  try {
    c[4] = 10; assert.deepEqual(winOf(9), { side: 'batter', size: 6 });
    c[4] = -20; assert.deepEqual(winOf(9), { side: 'bowler', size: 6 });
  } finally { c[4] = keep; }
  assert.deepEqual(winOf(9), { side: 'batter', size: 6 });
});

test('T4 nearestCell equals the Coach\'s notebook pick for 100 seeded random Books (ties to the lowest cell); by phase it stays in that phase', () => {
  const rng = makeRng('p6-nearest');
  for (let k = 0; k < 100; k++) {
    const b = newBook();
    for (let i = 0; i < CELLS; i++) { b.balls[i] = rng.int(k % 3 === 0 ? 4 : 19); b.found[i] = rng.random() < 0.3 ? 1 : 0; }
    if (k === 7) b.found.fill(1);
    const tip = seasonTip(b, 2).cell;
    assert.equal(nearestCell(b), tip == null ? -1 : tip, `book #${k}`);
    for (let ph = 0; ph < 3; ph++) {
      const n = nearestCell(b, ph);
      if (n < 0) { assert.ok(b.found.every((f, i) => f || i % 3 !== ph)); continue; }
      assert.equal(n % 3, ph); assert.equal(b.found[n], 0);
      for (let i = ph; i < CELLS; i += 3) if (!b.found[i]) assert.ok(b.balls[i] < b.balls[n] || (b.balls[i] === b.balls[n] && i >= n), `book #${k} ph ${ph}`);
    }
  }
});

// T5: the bowler pick Book line
const pickState = (seed) => {
  const st = firstOver(seed); st.dispatch('BowlOver'); // now over 2 (overs 1-3)
  const s = clone(st.get());
  const inn = s.inn1, bats = s.rival.players;
  bats[inn.crease[inn.strike]].bat = 'Opener'; bats[inn.crease[1 - inn.strike]].bat = 'Middle';
  const el = sel.bowlVM(s).bowlers.filter((b) => b.eligible).map((b) => b.i);
  s.me.players[el[0]].bowl = 'Spin'; s.me.players[el[1]].bowl = 'Fast';
  s.book = newBook(); s.book.found[cellIndex('Opener', 'Spin', 0)] = 1; s.book.balls[cellIndex('Opener', 'Spin', 0)] = 18;
  return { s, spin: el[0], fast: el[1] };
};

test('T5 bowlVM: only Opener v Spin overs 1-3 found, over 2, striker an Opener: the Spin row has a Book line, the Fast row does not', () => {
  const { s, spin, fast } = pickState('p6-pick');
  assert.equal(s.inn1.over, 2);
  const vm = sel.bowlVM(s), row = (i) => vm.bowlers.find((b) => b.i === i);
  assert.deepEqual(row(spin).book, { i: 6, side: 'batter', size: 5, bat: 'Opener', text: 'Book: Openers crush v Spin', aria: 'Book: Openers crush versus Spin' });
  assert.equal(row(fast).book, null);
  assert.equal(vm.bookNote, 'Book lines come from what you found. They can differ from the grid. Your call.');
  assert.ok(vm.bowlers.filter((b) => !b.eligible).every((b) => b.book == null), 'rows that cannot bowl show no line');
  assert.doesNotMatch(JSON.stringify(vm.bowlers.map((b) => b.book)), OLD_WORDS);
  // over 5 (overs 4-7): nothing fits
  const s5 = clone(s); s5.inn1.over = 5;
  const v5 = sel.bowlVM(s5); assert.ok(v5.bowlers.every((b) => b.book == null)); assert.equal(v5.bookNote, null);
  // not a Book (old save): none
  for (const bad of [undefined, null, { balls: [], found: [] }]) {
    const v = sel.bowlVM({ ...s, book: bad }); assert.ok(v.bowlers.every((b) => b.book == null)); assert.equal(v.bookNote, null);
  }
  // bowler wins: Opener v Fast overs 1-3 is "Fast wins a bit"
  const sf = clone(s); sf.book.found[cellIndex('Opener', 'Fast', 0)] = 1;
  assert.equal(sel.bowlVM(sf).bowlers.find((b) => b.i === fast).book.text, 'Book: Fast wins a bit v Openers');
});

test('T5 bowlVM: one line per row, the striker\'s cell first, then the non-striker\'s', () => {
  const { s, spin } = pickState('p6-pick2');
  s.book.found[cellIndex('Middle', 'Spin', 0)] = 1; // Middle v Spin overs 1-3: Spin wins
  const r = sel.bowlVM(s).bowlers.find((b) => b.i === spin);
  assert.equal(r.book.i, cellIndex('Opener', 'Spin', 0), 'striker first');
  const s2 = clone(s); s2.book.found[cellIndex('Opener', 'Spin', 0)] = 0;
  const r2 = sel.bowlVM(s2).bowlers.find((b) => b.i === spin);
  assert.equal(r2.book.i, cellIndex('Middle', 'Spin', 0)); assert.equal(r2.book.text, 'Book: Spin wins v Middle order');
});

test('T5 bowl view: the row button holds one dashed .bv-book line, its aria label ends with the Book words, the footnote shows once', async () => {
  const { render } = await import('../js/ui/bowl-view.js');
  const g = /** @type {any} */ (globalThis); const hadWin = 'window' in g; if (!hadWin) g.window = { innerHeight: 800 };
  try {
    const { s, spin, fast } = pickState('p6-pick3');
    const el = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    render(/** @type {any} */ (el), sel.bowlVM(s), () => {});
    const h = el.innerHTML;
    const btn = (i) => (h.match(new RegExp(`<button[^>]*data-bowler="${i}"[\\s\\S]*?</button>`)) || [''])[0];
    const sp = btn(spin), fa = btn(fast);
    assert.equal((sp.match(/class="bv-book /g) || []).length, 1); assert.match(sp, /class="bv-book is-batter"/);
    assert.match(sp, /Book: Openers crush v Spin/); assert.match(sp, /aria-label="[^"]*, Book: Openers crush versus Spin"/);
    assert.ok(sp.indexOf('class="pbox"') < sp.indexOf('bv-book'), 'the line sits under the bowler box');
    assert.doesNotMatch(fa, /bv-book/);
    assert.equal((h.match(/class="bv-booknote"/g) || []).length, 1); assert.match(h, /<div class="hints bv-hints">[\s\S]*bv-booknote[\s\S]*?<\/div>/);
    assert.ok(noPoints(visible(sp.match(/<div class="bv-book[\s\S]*?<\/div>/)[0])));
    // no Book: no line, no footnote
    render(/** @type {any} */ (el), sel.bowlVM({ ...s, book: newBook() }), () => {});
    assert.doesNotMatch(el.innerHTML, /bv-book/);
  } finally { if (!hadWin) delete g.window; }
});

test('bowl CSS: .bv-book is dashed, text >= 14 px, green for the bowler and pink for the batters; rows keep 56 px', () => {
  const css = readFileSync(new URL('../css/bowl.css', import.meta.url), 'utf8') + readFileSync(new URL('../css/scoreboard.css', import.meta.url), 'utf8');
  const rule = (sel) => (css.match(new RegExp(sel.replace(/[.*]/g, '\\$&') + '\\s*\\{([^}]*)\\}')) || [])[1] || '';
  const base = rule('.sb-row .bv-book');
  assert.match(base, /dashed/); const fs = +(base.match(/font:\s*(\d+)px/) || [])[1]; assert.ok(fs >= 14, 'font ' + fs);
  assert.match(rule('.sb-row .bv-book.is-bowler'), /grass1/); assert.match(rule('.sb-row .bv-book.is-batter'), /danger/);
  assert.match(rule('.sb-row'), /min-height:\s*56px/);
  assert.ok(+(rule('.bv-hints .bv-booknote').match(/font-size:\s*(\d+)px/) || [])[1] >= 14);
});

test('views (P6): card, grid, Book and found panel show who-wins words, n/18, overs ranges; never points or the old grade words', async () => {
  const { BS, OP } = await ui();
  const s = clone(newGame('pb-8').get());
  s.book.found[cellIndex('Opener', 'Spin', 0)] = 1; s.book.balls[cellIndex('Opener', 'Spin', 0)] = 18; // Cracker: Openers crush
  s.book.found[cellIndex('Middle', 'Fast', 1)] = 1; s.book.balls[cellIndex('Middle', 'Fast', 1)] = 18; // Fast wins big
  s.book.balls[cellIndex('Opener', 'Fast', 0)] = 4;
  s.book.balls[cellIndex('Middle', 'Fast', 0)] = 7; // Rescue Act, unfound
  const vm = sel.bookVM(s);
  const card = BS.cardHtml(vm.cells[6]);
  assert.match(card, /class="bk-card2[^"]*"[^>]*data-cell="6"/); assert.match(card, /Openers v Spin/); assert.match(card, /Overs 1-3/);
  assert.match(card, /bk-band[^"]*is-batter/); assert.match(card, /Openers crush/); assert.match(card, /Combo: Cracker/);
  assert.match(card, /Why: you saw 18 balls of it\./); assert.match(card, /keeps Spin off their openers/);
  const bw = BS.cardHtml(vm.cells[10]); assert.match(bw, /is-bowler/); assert.match(bw, /Fast wins big/);
  const q = BS.cardHtml(vm.cells[0]); assert.match(q, /is-q/); assert.match(q, /Not found yet/); assert.match(q, /14 balls to go\./); assert.doesNotMatch(q, /Combo|Why:|Use:/);
  const rq = BS.cardHtml(vm.cells[9]); assert.doesNotMatch(rq, /Rescue Act|bk-medal/, 'unfound combo stays hidden');
  const grid = BS.gridHtml(vm, 0, 6, {});
  assert.equal((grid.match(/<button[^>]*class="bk-cell/g) || []).length, 9);
  assert.match(grid, /class="bk-cell[^"]*is-sel[^"]*"[^>]*data-cell="6"/); assert.equal((grid.match(/is-sel/g) || []).length, 1);
  assert.match(grid, /4\/18/); assert.match(grid, /bk-medal/);
  assert.doesNotMatch(grid.replace(/<[^>]*data-cell="9"[\s\S]*?<\/button>/, ''), /Rescue Act/);
  const mini = BS.gridHtml(vm, 0, -1, { mini: true, newCells: [6] });
  assert.match(mini, /bk-grid--mini/); assert.doesNotMatch(mini, /<button/); assert.match(mini, /is-new/);
  const html = BS.bookHtml(vm, { ph: 0, sel: 6 });
  assert.match(html, /Found 2 of 27/); assert.match(html, /Combos 1 of 8/); assert.match(html, /Watch a pairing 18 balls\. It goes in\./);
  assert.match(html, /class="bk-phs"[^>]*role="radiogroup"|role="radiogroup"[^>]*class="bk-phs"/); assert.match(html, /Overs 1-3[\s\S]*Overs 4-7[\s\S]*Overs 8-10/);
  assert.match(html, /Fast[\s\S]*Medium[\s\S]*Spin/);
  assert.doesNotMatch(html, /batter's view|Pairings|Combos list|role="tab"|Early overs|Middle overs|Last overs|Pick your bowler over by over/);
  const empty = BS.bookHtml(sel.bookVM(clone(newGame('pb-8b').get())), { ph: 0, sel: 0 });
  assert.match(empty, /Your first goal/); assert.match(empty, /Found 0 of 27/);
  const found = OP.foundHtml(sel.foundVM({ book: s.book, last: { found: [6] } }));
  assert.match(found, /New in your Book!/); assert.match(found, /Openers v Spin/); assert.match(found, /Openers crush/); assert.match(found, /Combo: Cracker/);
  for (const h of [card, bw, q, rq, grid, mini, html, empty, found]) {
    assert.doesNotMatch(visible(h), OLD_WORDS); assert.doesNotMatch(h.replace(/class="[^"]*"/g, ''), OLD_WORDS);
    assert.ok(noPoints(visible(h)), visible(h).replace(/\s+/g, ' ').slice(0, 200));
  }
});

test("season end: Coach's notebook finds one cell free from season 2, none at the end of season 1", () => {
  const s1 = playSeason(newGame('pb-9'));
  assert.equal(s1.run.last.notebook, null); assert.equal(sel.endVM(s1).notebook, null);
  // season 2: close it from a state with a known Book
  const s = clone(s1); s.season.n = 2; s.run.last = null; s.book = newBook(); s.book.balls[7] = 12; s.book.balls[19] = 15; s.book.balls[2] = 18; s.book.found[2] = 1;
  const c = closeSeason(s);
  assert.equal(c.run.last.notebook, 19); assert.equal(c.book.found[19], 1); assert.equal(c.book.found[7], 0);
  assert.equal(closeSeason(c), c, 'closing twice does nothing');
  const e = sel.endVM(c); assert.equal(e.notebook.i, 19); assert.equal(e.notebook.name, cellName(19)); assert.equal(e.notebook.found, true);
  assert.equal(e.notebook.seen, false); assert.equal(e.notebook.why, "Why: Coach's notebook, season end."); assert.equal(e.notebook.band, sel.bandText('Lower', 'Fast', winOf(19)));
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

test('found panel (P6 2.4): 1, 2 and 3 finds give one heading, up to 2 cards, then "and N more in the Book"', async () => {
  const { OP } = await ui();
  const f = (...cells) => sel.foundVM({ last: { found: cells } });
  const one = OP.foundHtml(f(0)), two = OP.foundHtml(f(0, 6)), three = OP.foundHtml(f(0, 6, 20));
  for (const h of [one, two, three]) {
    assert.equal((h.match(/class="bk-found"/g) || []).length, 1); assert.equal((h.match(/New in your Book!/g) || []).length, 1);
    assert.doesNotMatch(visible(h), OLD_WORDS); assert.ok(noPoints(visible(h)));
  }
  const cards = (h) => (h.match(/<section class="bk-card2/g) || []).length;
  assert.equal(cards(one), 1); assert.equal(cards(two), 2); assert.equal(cards(three), 2);
  assert.doesNotMatch(two, /more in the Book/); assert.match(three, /and 1 more in the Book/);
  assert.match(two, /Combo: Cracker/); assert.match(one, /Fast wins a bit/);
});

test('ball why lines say matchup, never pairing or Tough', async () => {
  const { whyLine } = await import('../js/ui/why.js');
  const base = { eff: { bp: 50, bs: 50, spd: 50, bsk: 50 }, batHome: false, bowlHome: false };
  const out = [];
  for (const step of [-1, 1]) for (const o of ['W', 0, 1, 2, 4, 6]) for (let n = 1; n <= 12; n++) out.push(whyLine({ n: `3.${n}`, o, intent: 'R', field: 'P', ph: 0, bowlType: 'Fast', pr: { ...base, step, p: { wicket: 0.2 } } }, 'Ravi', 'Okoro'));
  assert.ok(out.some((l) => /matchup/i.test(l)));
  assert.ok(out.every((l) => !/pairing|tough/i.test(l)), out.filter((l) => /pairing|tough/i.test(l)).join('|'));
});

test('r2 copy: grid words are Strong / Even / Weak (the Book uses who-wins words instead); no "match-up" or "Safe pairs" left', () => {
  const rd = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  assert.match(rd('ui/bowl-view.js'), /'Strong'.*'Even'.*'Weak'/); assert.match(rd('ui/chase-view.js'), /'Strong'[\s\S]*'Even'[\s\S]*'Weak'/);
  assert.match(rd('ui/bowl-view.js'), /For your bowler/); assert.match(rd('ui/chase-view.js'), /For your batter/);
  assert.match(rd('data/glossary.js'), /▲ Strong, ● Even, ▼ Weak/); assert.doesNotMatch(rd('data/glossary.js'), /▼ Poor|other pairing is even/);
  assert.doesNotMatch(rd('store/selectors.js'), /match-up|Safe pairs/);
  // glossary (PLAN 7, last line): the Book entry is renamed and has no old grade words
  const gl = rd('data/glossary.js'), entry = (gl.match(/\{ id: 'pairing-book'[\s\S]*?\},/) || [''])[0];
  assert.match(entry, /term: 'Book'/); assert.doesNotMatch(entry, /Pairing Book|Hostile|Perfect|batter\\'s view|grade/);
});

test('QA D8: the Book line belongs to its row: tucked under the boxes (negative top margin), a bigger gap below, the selected outline wraps it in both skins', () => {
  const css = readFileSync(new URL('../css/bowl.css', import.meta.url), 'utf8');
  const top = /\.sb-row \.bv-book \{ margin-top: -(\d+)px; \}/.exec(css), below = /\.sb-row:has\(> \.bv-book\) \{ margin-bottom: (\d+)px; \}/.exec(css);
  assert.ok(top && below && Number(below[1]) > 4 - Number(top[1]), 'gap below the line is bigger than the gap above it');
  assert.match(css, /\.skin-scorebook \.sb-row\.is-selected:has\(> \.bv-book\) \{ outline: 2px solid/);
});

test('QA-V5 N1 bowl view: picked row is scrolled into view (instant under reduced motion) and named on the CTA', async () => {
  const { render } = await import('../js/ui/bowl-view.js');
  const g = /** @type {any} */ (globalThis); const hadWin = 'window' in g;
  const run = (rm) => {
    g.window = { innerHeight: 800, matchMedia: () => ({ matches: rm }) };
    const calls = []; const { s } = pickState('p6-pick3');
    const row = { scrollIntoView: (o) => calls.push(o) };
    const el = { innerHTML: '', querySelector: (q) => (q.includes('is-selected') ? row : null), querySelectorAll: () => [], addEventListener() {} };
    const vm = sel.bowlVM(s); render(/** @type {any} */ (el), vm, () => {});
    return { calls, h: el.innerHTML, vm };
  };
  try {
    const a = run(false), b = run(true);
    assert.equal(a.calls.length, 1); assert.equal(a.calls[0].behavior, 'smooth'); assert.equal(a.calls[0].block, 'nearest');
    assert.equal(b.calls[0].behavior, 'auto');
    const picked = a.vm.bowlers.find((x) => x.i === a.vm.call.bowler && x.eligible);
    if (picked) assert.match(a.h, new RegExp('<small class="name">' + picked.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { if (!hadWin) delete g.window; }
});
