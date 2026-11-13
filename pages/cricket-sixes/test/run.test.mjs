import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { centreOf } from '../js/core/match.js';
import { closeSeason, runScore, newRun, tpMultiplier } from '../js/core/run.js';
import { unwrap, wrap, VERSION } from '../js/core/save-migrate.js';
import { shownAbility } from '../js/core/ability.js';
import { RUN } from '../js/data/run.js';
import { T } from '../js/data/match.js';
import { newGame, step, playSeason } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
/** Play the store to the end screen of the current season. */
const toEnd = (store) => playSeason(store);
/** Play a whole run; returns every end-of-season state (before NewSeason/RunEnd). */
function playRun(seed, onEnd) {
  const store = newGame(seed); const ends = [];
  for (let i = 0; i < RUN.seasons; i++) {
    const s = toEnd(store); ends.push(s); if (onEnd) onEnd(s, i + 1);
    store.dispatch(i === RUN.seasons - 1 ? 'RunEnd' : 'NewSeason');
  }
  return { store, ends };
}
let cache;
const full = () => (cache ||= playRun('run-a'));
/** An end-of-season state with my table place forced, run.last cleared so NewSeason closes it from the table. */
function forced(seed, place, league = 1) {
  const s = clone(toEnd(newGame(seed)));
  s.season.league = league; s.run.league = league; s.run.last = null; s.econ.stadium = Math.min(5, league + 1); // promotion needs the next stadium (P8)
  const t = s.season.table; const me = t.find((r) => r.id === 'c0');
  const others = t.filter((r) => r.id !== 'c0');
  others.forEach((r, i) => { r.pts = 50 - i; r.rf = 500; r.ra = 400; r.w = 20; });
  me.pts = place === 1 ? 99 : place === 5 ? 50 - 3.5 : 0; me.rf = 500; me.ra = 400; me.w = 20;
  if (place === 5) me.pts = 50 - 3.5; // between the 4th (47) and 5th (46) other: rank 5
  s.season.champion = place === 1 ? 'c0' : s.season.champion;
  return s;
}

test('a full 12-season run ends in runend, one season at a time', () => {
  const { store, ends } = full();
  const s = store.get();
  assert.equal(s.stage, 'runend'); assert.equal(s.run.ended, true); assert.equal(s.run.history.length, RUN.seasons);
  assert.deepEqual(ends.map((e) => e.season.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(ends[0].run.last.n, 1);
  assert.equal(C(ends[11], 'NewSeason'), ends[11], 'no NewSeason after the last season');
  assert.equal(C(ends[0], 'RunEnd'), ends[0], 'no RunEnd before the last season');
  const e1 = sel.endVM(ends[0]), e12 = sel.endVM(ends[11]);
  assert.deepEqual([e1.cta, e1.lastSeason, e12.cta, e12.lastSeason], ['NewSeason', false, 'RunEnd', true]);
  assert.equal('promotion' in e1, false);
});

test('top 2 promote, 3rd stays, league 5 is the cap', () => {
  const up = C(forced('p1', 1), 'NewSeason');
  assert.equal(up.season.league, 2); assert.equal(up.run.league, 2); assert.equal(up.run.best, 2);
  const two = C(forced('p2', 1), 'NewSeason'); assert.equal(two.season.league, 2);
  const stay = C(forced('p3', 5), 'NewSeason');
  assert.equal(stay.season.league, 1); assert.equal(stay.run.best, 1);
  const cap = C(forced('p4', 1, 5), 'NewSeason');
  assert.equal(cap.season.league, 5); assert.equal(cap.run.best, 5);
  const e = sel.endVM(forced('p5', 1)); assert.equal(e.result.promoted, true); assert.equal(e.result.toLeague, 2); assert.equal(e.result.line, 'Promoted to League 2.');
  const e5 = sel.endVM(forced('p6', 5)); assert.equal(e5.result.promoted, false); assert.equal(e5.result.stayed, true); assert.equal(e5.result.line, 'Finished 5th. Top 2 go up.');
});

test('promotion re-makes the 9 AI clubs at the new mean; my club carries on', () => {
  const s = forced('mk', 1); const n = C(s, 'NewSeason');
  assert.deepEqual(n.clubs[0], s.clubs[0]);
  const ai = n.clubs.slice(1); assert.equal(ai.length, 9);
  const ratings = ai.flatMap((c) => c.squad.flatMap((p) => [p.bp, p.bs, p.spd, p.bsk]));
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  assert.ok(Math.abs(mean - 38) < 2, `AI mean ${mean}`);
  assert.notDeepEqual(ai.map((c) => c.name), s.clubs.slice(1).map((c) => c.name));
  // staying: the same clubs grow instead
  const st = C(forced('mk', 5), 'NewSeason');
  assert.deepEqual(st.clubs.slice(1).map((c) => c.name), s.clubs.slice(1).map((c) => c.name));
  // same seed, same clubs
  assert.deepEqual(C(forced('mk', 1), 'NewSeason').clubs, n.clubs);
});

test('centreOf follows the season league', () => {
  const s = clone(newGame('ce').get());
  for (const [lg, m] of [[1, 30], [2, 38], [3, 46], [4, 54], [5, 62]]) { s.season.league = lg; assert.equal(centreOf(s), m); }
  assert.equal(centreOf({}), T.FIELD_CENTRE); assert.equal(centreOf(null), T.FIELD_CENTRE);
  assert.equal(tpMultiplier(3), 1);
});

test('score is computed from the formula; pending inputs count 0 and show', () => {
  const s = clone(newGame('sc').get());
  Object.assign(s.run, { titles: 3, best: 3, finals: 4, bestAbility: 200 });
  const r = runScore(s); const by = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  assert.equal(by.titles.points, 1140); assert.equal(by.league.points, 900); assert.equal(by.finals.points, 360); assert.equal(by.best_player.points, 1000);
  for (const k of ['sgrads', 'fans', 'club_build']) { assert.equal(by[k].pending, true); assert.equal(by[k].points, 0); }
  assert.equal(r.rows.length, 7); assert.equal(r.score, 3400);
  Object.assign(s.run, { titles: 9, best: 5, finals: 99 }); // capped inputs
  assert.equal(runScore(s).score, 1900 + 1800 + 900 + 1000);
  assert.ok(runScore(s).score <= RUN.score.max);
});

test('a milestone fires at season 3, pays its TP, shows on the hub', () => {
  const store = newGame('ms'); let before, after;
  for (let n = 1; n <= 3; n++) {
    let g = 0; while (store.get().stage !== 'end' && g++ < 5000) { before = store.get(); step(store); }
    after = store.get();
    if (n < 3) { assert.equal(sel.endVM(after).chapter, null); store.dispatch('NewSeason'); }
  }
  assert.equal(after.training.tp - before.training.tp, 100); // the week's close paid exactly the chapter TP
  const e = sel.endVM(after);
  assert.equal(e.chapter.name, 'Kickoff Crest'); assert.equal(e.chapter.reward, 'TP 100'); assert.equal(typeof e.chapter.feat.done, 'boolean');
  assert.equal(after.run.chapters[3].coins, 120); assert.equal(after.run.chapters[3].tp, 100);
  assert.equal(sel.hubVM({ ...after, fixture: null, stage: 'hub' }).run.chapter, 'Kickoff Crest');
  const hub = sel.hubVM(store.dispatch('NewSeason') && store.get());
  assert.deepEqual(hub.run, { season: 4, of: 12, league: hub.run.league, chapter: 'Kickoff Crest', nextChapter: { season: 6, name: 'Name a Stand' } });
  const h1 = sel.hubVM(newGame('ms').get()); assert.equal(h1.run.chapter, null); assert.deepEqual(h1.run.nextChapter, { season: 3, name: 'Kickoff Crest' });
  assert.equal(closeSeason(after), after, 'a season closes once');
});

test('a missed feat is claimed at a later season end, with no second TP', () => {
  const s = clone(toEnd(newGame('cl')));
  s.season.n = 4; s.run.last = null; s.run.wins = 15;
  s.run.chapters[3] = { season: 3, name: 'Kickoff Crest', tp: 100, coins: 120, medals: 0, featDone: false, featSeason: null };
  const tp = s.training.tp, c = closeSeason(s);
  assert.equal(c.run.chapters[3].featDone, true); assert.equal(c.run.chapters[3].featSeason, 4); assert.equal(c.run.chapters[3].medals, 1);
  assert.deepEqual(c.run.last.claimed, ['Kickoff Crest']); assert.equal(c.run.last.chapter, null); assert.equal(c.training.tp, tp);
  const miss = clone(s); miss.run.wins = 0; miss.season.table.find((r) => r.id === 'c0').w = 0;
  assert.equal(closeSeason(miss).run.chapters[3].featDone, false);
});

test('NewRun applies the legend and the carried coach (grade C- at most), and nothing else carries', () => {
  const { store } = full(); const old = store.get();
  const e = sel.runEndVM(old);
  assert.equal(e.cta, 'NewRun'); assert.equal(e.max, 9999); assert.equal(e.rows.length, 7); assert.equal(e.seasons, 12);
  assert.deepEqual(e.carry.map((c) => [c.key, c.available]), [['legend', true], ['coach', true], ['stadium', false]]);
  assert.ok(e.score >= 0 && e.score <= 9999 && e.score % 10 === 0);
  assert.equal(e.chapters.length, 4);
  const best = old.clubs[0].squad.filter((p) => !p.legend).sort((a, b) => shownAbility(b) - shownAbility(a) || (a.id < b.id ? -1 : 1))[0];
  const n = C(old, 'NewRun', {});
  assert.equal(n.stage, 'hub'); assert.equal(n.season.n, 1); assert.equal(n.season.league, 1); assert.equal(n.run.no, 2);
  assert.deepEqual([n.run.titles, n.run.best, n.run.history.length, n.run.ended], [0, 1, 0, false]);
  const fresh = C(null, 'NewGame', { seed: `${old.run.root}|R2` });
  const legend = n.clubs[0].squad.filter((p) => p.legend); assert.equal(legend.length, 1);
  const L = legend[0];
  for (const k of ['bp', 'bs', 'spd', 'bsk']) assert.equal(L[k], Math.max(1, Math.round(0.6 * best[k])), `legend ${k} is 60%`);
  assert.equal(L.name, best.name);
  const others = (st) => st.clubs[0].squad.filter((p) => p.id !== L.id);
  assert.deepEqual(others(n), others(fresh));
  assert.deepEqual(n.clubs.slice(1), fresh.clubs.slice(1));
  assert.equal(n.coaches.length, 1); const c = n.coaches[0];
  assert.ok(c.step >= 1 && c.step <= RUN.carry.coachStep); assert.ok(Array.isArray(c.strong) && c.strong.length >= 1); assert.equal(n.coachPicked, true);
  assert.equal(n.training.tp, fresh.training.tp); assert.equal(n.training.week, 1);
  assert.deepEqual(n.plan, fresh.plan); assert.deepEqual(n.season.table, fresh.season.table);
  assert.equal(C(n, 'NewRun', {}), n, 'only from runend');
  const sc = clone(n); sc.clubs[0].squad.forEach((p) => { if (!p.legend) { p.bp = p.bs = p.spd = p.bsk = 1; } });
  assert.ok(runScore(sc).rows.find((r) => r.key === 'best_player').value <= 25, 'the legend is ignored');
});

test('an old v1 save migrates: run is added from the season, play continues', () => {
  const s = clone(toEnd(newGame('old')));
  delete s.run; s.v = 1; s.season.n = 5;
  const r = unwrap(JSON.stringify(s));
  assert.equal(r.ok, true); assert.equal(r.state.v, 5); assert.equal(r.from, 1);
  assert.deepEqual([r.state.run.n, r.state.run.no, r.state.run.league, r.state.run.root], [5, 1, 1, 'old']);
  assert.equal(VERSION, 5);
  const n = C(r.state, 'NewSeason'); assert.equal(n.season.n, 6); assert.equal(n.stage, 'hub'); assert.equal(sel.hubVM(n).run.of, 12);
  assert.equal(sel.endVM(r.state).result.place >= 1, true);
  const back = unwrap(JSON.stringify(wrap(C(null, 'NewGame', { seed: 'z' }))));
  assert.equal(back.ok, true); assert.deepEqual(Object.keys(back.state.run), Object.keys(newRun('z')));
  assert.deepEqual(Object.keys(r.state.run), Object.keys(newRun('z')));
});
