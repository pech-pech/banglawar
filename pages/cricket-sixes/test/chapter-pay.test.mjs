import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSeason, migrateChapterPay } from '../js/core/run.js';
import { unwrap, wrap } from '../js/core/save-migrate.js';
import { RUN } from '../js/data/run.js';
import { newGame, playSeason } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const toEnd = (seed) => clone(playSeason(newGame(seed)));
const at = (seed, season, feat) => {
  const b = toEnd(seed);
  b.season.n = season; b.run.last = null; b.run.history = []; b.run.chapters = {};
  Object.assign(b.run, { wins: 0, finals: 0, titles: 0, best: 1 });
  b.season.table.find((r) => r.id === 'c0').w = 0;
  if (feat) { const c = RUN.chapters.find((x) => x.season === season); b.run[{ wins: 'wins', finals: 'finals', titles: 'titles', league: 'best' }[c.feat.kind]] = c.feat.target; }
  return b;
};

test('chapter pays its stored Coins on reach, its Medal with the feat, once', () => {
  for (const c of RUN.chapters) {
    const b = at('cp-a', c.season, false), miss = closeSeason(clone(b));
    assert.equal(miss.econ.coins - b.econ.coins, c.coins, c.name + ' Coins');
    assert.equal(miss.econ.medals - b.econ.medals, 0);
    assert.equal(miss.run.chapters[c.season].coinsPaid, true);
    const won = closeSeason(at('cp-a', c.season, true));
    assert.equal(won.econ.coins - b.econ.coins, c.coins); assert.equal(won.econ.medals - b.econ.medals, c.medals);
    assert.equal(won.run.last.chapter.coins, c.coins);
  }
  assert.equal(RUN.chapters.reduce((a, c) => a + c.coins, 0), 1020);
});

test('old save: reached chapters pay once on load, never again', () => {
  const s = toEnd('cp-b'); const c0 = s.econ.coins, m0 = s.econ.medals;
  s.run.chapters = {
    3: { season: 3, name: 'Kickoff Crest', tp: 100, coins: 120, medals: 1, featDone: true, featSeason: 3 },
    6: { season: 6, name: 'Name a Stand', tp: 150, coins: 200, medals: 0, featDone: false, featSeason: null },
  };
  const a = migrateChapterPay(s);
  assert.equal(a.econ.coins, c0 + 320); assert.equal(a.econ.medals, m0 + 1);
  assert.equal(migrateChapterPay(a).econ.coins, a.econ.coins); assert.equal(migrateChapterPay(a).econ.medals, a.econ.medals);
  assert.equal(s.econ.coins, c0, 'input untouched');
  const old = unwrap(JSON.stringify(wrap(s))); assert.equal(old.state.econ.coins, c0 + 320);
  assert.equal(unwrap(JSON.stringify(wrap(old.state))).state.econ.coins, c0 + 320, 'reload pays nothing more');
});
