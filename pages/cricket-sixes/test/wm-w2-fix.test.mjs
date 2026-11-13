// Wheel meta w2 fix round (QA-W2 issues 1-13): store behaviour plus source guards for the view-only fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { metaOf } from '../js/core/wheelmeta.js';
import { newGame, step } from './_season-bot.mjs';
import { findLine } from '../js/ui/wm-spins.js';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const until = (st, pred, max = 6000) => { let g = 0; while (g++ < max && !pred(st.get()) && step(st)) { if (st.get().stage === 'matchday') st.dispatch('MatchdayGo'); } return st.get(); };
const open = (seed) => { const st = newGame(seed); const s = st.get(); return C({ ...s, econ: { ...s.econ, coins: 5000 } }, 'OpenMatchday'); };

test('1: Escape on a reel over a sheet: the sheet ignores Escape while a dial/reel overlay is up; close releases inert from what is still open', () => {
  assert.match(read('js/ui/sheet.js'), /Escape'\) \{ if \(document\.querySelector\('\.dr-ov'\)\) return;/);
  assert.match(read('js/ui/dial-view.js'), /releaseInert\(app\)/);
  assert.match(read('js/ui/inert.js'), /app\.inert = !!document\.querySelector\(OVERLAYS\)/);
  assert.match(read('js/ui/dial-view.js'), /ov\.className = 't2-ov wh-ov dr-ov /); // wh-ov is in OVERLAYS, so a sheet closing under the reel keeps the app inert
});

test('2: match-day reveal key carries the season, round and opponent', () => withFlags(ON, () => {
  const s = open('w2fix-key'), k1 = sel.matchdayVM(s).key;
  const s2 = { ...s, season: { ...s.season, n: (s.season.n || 1) + 1 } };
  assert.notEqual(sel.matchdayVM(s2).key, k1, 'same opponent, next season = new key');
  const s3 = { ...s, fixture: { ...s.fixture, round: s.fixture.round + 1 } };
  assert.notEqual(sel.matchdayVM(s3).key, k1, 'next round = new key');
  assert.match(read('js/ui/matchday-view.js'), /const key = vm\.key \?/);
}));

test('4: Find card text comes from the real outcome (fallback to Coins) and shows the Booster bonus', () => withFlags(ON, () => {
  let sawCoins = 0;
  for (let i = 0; i < 40; i++) {
    const s0 = newGame('w2fix-find' + i).get(), s = { ...s0, econ: { ...s0.econ, coins: 5000 }, trial: { kind: 'coach', coach: { id: 'tc9', name: 'Trial', step: 5, strong: ['bat'], away: 0, courseSeason: null }, wage: 0, from: 'banner', key: 'x' } };
    const a = C(s, 'PickActivity', { id: 'banner', stop: { t: 0.8 + (i % 22) * 0.1, phi: i * 0.7, e: 0 } }), h = a.econ.act.hist[0], fs = a.findSpin;
    assert.ok(fs, 'reel pick');
    assert.equal(fs.find, !!h.find); assert.equal(fs.type, h.find ? h.find.type : 'none');
    assert.ok(fs.type === 'coins' || fs.type === 'none', 'a trial is already waiting: never paid as a player or coach');
    if (h.find && h.find.type === 'coins') { sawCoins++; assert.equal(fs.coins, h.find.coins + fs.bonus); assert.equal(sel.activitiesVM(a).options.find((x) => x.id === 'banner').reel.pending.coins, fs.coins); }
  }
  assert.ok(sawCoins > 0, 'some coin finds seen');
  const l = findLine({ find: true, type: 'coins', coins: 1234, bonus: 100 });
  assert.equal(l.big, 'Found 1,234 Coins'); assert.match(l.line, /Booster bonus: \+100 Coins/);
  assert.equal(findLine({ find: true, type: 'player' }).big, 'Found a trial player');
}));

test('5: an unspun Finals prize is auto-spun (seeded) by FinishMatch, never forfeited; a spun one is not paid twice', () => withFlags(ON, () => {
  let s = null;
  for (let i = 0; i < 6 && !s; i++) { const g = until(newGame('w2fix-fin' + i), (x) => x.stage === 'done' && x.fixture && x.fixture.kind !== 'league'); if (g.stage === 'done' && g.fixture.kind !== 'league') s = g; }
  assert.ok(s, 'finals result screen');
  const t0 = metaOf(s).tally, fin = C(s, 'FinishMatch');
  assert.equal(metaOf(fin).tally, t0 + 1, 'the prize spun');
  assert.ok(fin.econ.ledger.some((r) => r.k === 'finalsprize'));
  assert.deepEqual(fin.finalsSpin, C(s, 'FinalsSpin').finalsSpin, 'same seeded result as a tap');
  const spun = C(s, 'FinalsSpin'), fin2 = C(spun, 'FinishMatch');
  assert.equal(metaOf(fin2).tally, t0 + 1, 'not twice'); assert.equal(fin2.econ.ledger.filter((r) => r.k === 'finalsprize').length, 1);
}));
test('5b: flag off, FinishMatch adds no prize', () => withFlags({ ...ON, wheelMeta: false }, () => {
  const g = until(newGame('w2fix-off'), (x) => x.stage === 'done'); const fin = C(g, 'FinishMatch');
  assert.equal(fin.finalsSpin, undefined);
}));

test('13: switching On mid match day keeps the rolls already shown (MdKeep), no re-spin, no Spokes', () => withFlags(ON, () => {
  const s = open('w2fix-keep'), md0 = s.fixture.md, t0 = metaOf(s).tally;
  const k = C(s, 'MdKeep', { which: ['hype', 'toss'] }), md = k.fixture.md;
  assert.equal(md.hype, md0.hype); assert.equal(md.toss, md0.toss); assert.equal(md.tossBoost, md0.tossBoost);
  assert.ok(md.wm.hype && md.wm.toss && !md.wm.pep);
  assert.equal(metaOf(k).tally, t0, 'nothing spun, no Spokes');
  assert.equal(C(k, 'HypeSpin', { careful: true }), k, 'a kept roll cannot be spun over');
  assert.equal(C(k, 'TossSpin'), k);
  const vm = sel.matchdayVM(k).wm; assert.equal(vm.hype.spun, true); assert.equal(vm.hype.spokeGain, 0); assert.equal(vm.hype.pending.level, md0.hype);
  const go = C(k, 'MatchdayGo'); assert.equal(go.fixture.md.hype, md0.hype); assert.equal(go.fixture.md.toss, md0.toss);
  assert.equal(metaOf(go).tally, t0 + 1, 'only the untouched pep settled');
  withFlags({ wheelMeta: false }, () => assert.equal(C(s, 'MdKeep', { which: ['hype'] }), s));
}));

test('Spokes chip: every dial / reel result VM carries spokeGain once spun', () => withFlags(ON, () => {
  let s = open('w2fix-sp'); assert.equal(sel.matchdayVM(s).wm.hype.spokeGain, 0);
  s = C(C(C(s, 'HypeSpin', { careful: true }), 'TossSpin'), 'PepSpin');
  const wm = sel.matchdayVM(s).wm; for (const w of ['hype', 'toss', 'pep']) assert.ok(wm[w].spokeGain >= 0, w);
  assert.ok(wm.pep.spokeGain > 0 || metaOf(s).tally < 1);
  assert.match(read('js/ui/dial-view.js'), /\+' \+ esc\(sg\) \+ ' Spokes/);
  assert.equal(typeof sel.spokeGainOf, 'function');
  const g = newGame('w2fix-sp2').get(), a = C({ ...g, econ: { ...g.econ, coins: 5000 } }, 'PickActivity', { id: 'banner' });
  assert.equal(sel.activitiesVM(a).options.find((x) => x.id === 'banner').reel.spokeGain, 2);
}));

test('3, 7-12: view source guards', () => {
  const reel = read('js/ui/reel-view.js'), dial = read('js/ui/dial-view.js'), spins = read('js/ui/wm-spins.js'), res = read('js/ui/result-view.js'), act = read('js/ui/activities-view.js');
  assert.match(reel, /if \(state !== 'result'\) \{ tctx\.fillStyle/, '3: no centre line at a result');
  for (const t of ['Toss the coin.', 'Who gets the pep talk?', 'Stop on a gold cell to find something.', 'What do the scouts bring?', 'Spin for your prize.']) assert.ok(spins.includes(t), '7: ' + t);
  assert.match(dial, /coin \|\| \(reveal && kind === 'lights'\) \? ''/, '8: no pointer in lights mode');
  assert.ok(!/Odds are shown/.test(act) && act.includes('Find chance about') && act.includes('Good timing helps'), '9');
  assert.match(dial, /sh\.state === 'result' && o\.onCollect/, '10: close at a result = Collect');
  assert.match(res, /prizeIcon\(f\.pending\)/, '11');
  assert.match(dial, /widths\[i\] > widths\[b\]/, '12: widest gold');
  assert.match(act, /\[data-cl-close\]'\); if \(ok\) ok\.focus/, '6: OK focused after Collect');
  assert.match(res, /data-act="FinishMatch"\]'\); if \(c\) c\.focus/, '6: CTA focused after Collect');
});
