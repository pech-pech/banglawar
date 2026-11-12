import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { closeSeason, runScore } from '../js/core/run.js';
import { RUN } from '../js/data/run.js';
import { SEASON } from '../js/data/season.js';
import { newGame, playSeason } from './_season-bot.mjs';

// Pins the run score, chapters and AI growth to the NUMBERS tuning (2026-11-12/tuning.json sha d4fc8393: ladder.score, ladder.milestones, ladder.ai_growth).
const clone = (x) => JSON.parse(JSON.stringify(x));
const toEnd = (seed) => clone(playSeason(newGame(seed)));

test('ladder.score: weights and full marks match the tuning, cash and Medals are not inputs', () => {
  const want = { titles: [1900, 5], league: [1800, 5], sgrads: [1400, 4], fans: [1600, 10], best_player: [1000, 180], club_build: [1400, 43], finals: [900, 10] };
  assert.deepEqual(Object.fromEntries(RUN.score.inputs.map((d) => [d.key, [d.weight, d.full]])), want);
  assert.equal(RUN.score.inputs.find((d) => d.key === 'best_player').floor, 60);
  assert.equal(RUN.score.max, 9999); assert.equal(RUN.score.roundTo, 10);
  assert.ok(!RUN.score.inputs.some((d) => /coin|cash|medal/i.test(d.key)));
});

test('ladder.score: league uses (league-1)/4, best player (ability-60)/120, rounded to 10, never above 9,999', () => {
  const s = toEnd('lt-sc');
  const set = (o) => { Object.assign(s.run, { titles: 0, best: 1, finals: 0, bestAbility: 0, ...o }); return runScore(s); };
  const by = (r) => Object.fromEntries(r.rows.map((x) => [x.key, x.points]));
  assert.equal(by(set({ best: 1 })).league, 0); assert.equal(by(set({ best: 3 })).league, 900); assert.equal(by(set({ best: 5 })).league, 1800);
  assert.equal(by(set({ bestAbility: 60 })).best_player >= 0, true);
  assert.equal(by(set({ bestAbility: 120 })).best_player >= 500, true, 'a club-grown 120 is at least half marks (the club star can be higher)');
  const r = set({ titles: 1, best: 2, finals: 3, bestAbility: 200 }); // 380 + 450 + 270 + 1000 = 2100
  assert.equal(r.score, 2100);
  assert.equal(r.score % 10, 0);
  const max = set({ titles: 99, best: 99, finals: 99, bestAbility: 999 });
  assert.equal(max.score, 1900 + 1800 + 900 + 1000, 'sgrads, fans and club build are pending and count 0 for now');
  assert.ok(max.score <= 9999);
});

test('ladder.milestones: chapters at seasons 3/6/9/12 with the tuning Coins and TP, feat = 1 Medal', () => {
  assert.deepEqual(RUN.chapters.map((c) => [c.season, c.name, c.coins, c.tp, c.medals]),
    [[3, 'Kickoff Crest', 120, 100, 1], [6, 'Name a Stand', 200, 150, 1], [9, 'Trophy Shelf', 300, 200, 1], [12, 'Legends Banner Day', 400, 250, 1]]);
  assert.deepEqual(RUN.chapters.map((c) => [c.feat.kind, c.feat.target]), [['wins', 15], ['finals', 4], ['titles', 2], ['league', 5]]);
  const sum = (k) => RUN.chapters.reduce((a, c) => a + c[k], 0);
  assert.deepEqual([sum('coins'), sum('tp'), sum('medals')], [1020, 700, 4]);
});

test('ladder.milestones: every chapter season always pays its TP; the feat only adds the Medal', () => {
  for (const c of RUN.chapters) {
    const base = toEnd('lt-ch');
    base.season.n = c.season; base.run.last = null; base.run.history = []; base.run.chapters = {};
    Object.assign(base.run, { wins: 0, finals: 0, titles: 0, best: 1 });
    base.season.table.find((r) => r.id === 'c0').w = 0;
    const miss = closeSeason(clone(base));
    assert.equal(miss.training.tp - base.training.tp, c.tp, `${c.name} TP without the feat`);
    assert.equal(miss.run.chapters[c.season].coins, c.coins);
    assert.equal(miss.run.chapters[c.season].featDone, false); assert.equal(miss.run.chapters[c.season].medals, 0);
    const hit = clone(base); const fk = { wins: 'wins', finals: 'finals', titles: 'titles', league: 'best' }[c.feat.kind];
    hit.run[fk] = c.feat.target;
    const won = closeSeason(hit);
    assert.equal(won.training.tp - base.training.tp, c.tp, `${c.name} TP with the feat is the same`);
    assert.equal(won.run.chapters[c.season].featDone, true); assert.equal(won.run.chapters[c.season].medals, 1);
  }
  const off = toEnd('lt-off'); off.season.n = 4; off.run.last = null; off.run.chapters = {};
  const tp = off.training.tp; assert.equal(closeSeason(off).training.tp, tp, 'no chapter in an ordinary season');
});

test('ladder.ai_growth: +4 on every AI rating at a rollover without promotion; promotion re-makes the clubs instead', () => {
  assert.equal(SEASON.aiGrowth, 4);
  const s = toEnd('lt-gr'); s.run.last = null;
  s.season.table.forEach((r) => { r.pts = r.id === 'c0' ? 0 : 20; }); // M last: stays
  const n = C(s, 'NewSeason');
  assert.equal(n.season.league, s.season.league);
  s.clubs.slice(1).forEach((c, i) => c.squad.forEach((p, j) => {
    const q = n.clubs[i + 1].squad[j];
    for (const k of ['bp', 'bs', 'spd', 'bsk']) assert.equal(q[k], Math.min(99, p[k] + 4), `${c.id} ${k}`);
  }));
  assert.deepEqual(n.clubs[0], s.clubs[0], 'M is not grown');
});
