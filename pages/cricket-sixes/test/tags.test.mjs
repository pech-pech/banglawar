// P9 rival style tags: offsets, clamp, names per league, no rng drift, views' data, and the v3 -> v4 save migration.
// Values pinned to NUMBERS tuning.json sha ff5c0aae (ladder.calendar.tags.table, bat_heavy hint, rival kits).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClubs } from '../js/core/clubs.js';
import { applyTag, tagInfo, taggedRival } from '../js/core/tags.js';
import { TAGS, TAGGED_RIVALS } from '../js/data/tags.js';
import { makeRng } from '../js/core/rng.js';
import { SEASON } from '../js/data/season.js';
import { migrate, VERSION, unwrap, wrap } from '../js/core/save-migrate.js';
import * as sel from '../js/store/selectors.js';
import { newGame } from './_season-bot.mjs';

const league = (n) => ({ ...SEASON, league: { ...SEASON.league, number: n } });
const gen = (seed, n) => makeClubs(makeRng(`${seed}|clubs`), league(n));
const R = ['bp', 'bs', 'spd', 'bsk'];
const mkClub = (v) => ({ id: 'c1', name: 'Plain', squad: Array.from({ length: 10 }, (_, i) => ({ id: `c1p${i}`, name: `P${i}`, bat: 'Middle', bowl: 'Fast', bp: v, bs: v, spd: v, bsk: v, potential: 150 })), six: [] });

test('tag table is the tuning table (bat_heavy +6/+3/-4/-4)', () => {
  assert.deepEqual(['bp', 'bs', 'spd', 'bsk'].map((k) => TAGS.bat_heavy[k]), [6, 3, -4, -4]);
  assert.deepEqual(['bp', 'bs', 'spd', 'bsk'].map((k) => TAGS.grinders[k]), [-8, 4, 0, 0]);
  assert.deepEqual(['bp', 'bs', 'spd', 'bsk'].map((k) => TAGS.spin_town[k]), [0, 0, -4, 4]);
  assert.deepEqual(['bp', 'bs', 'spd', 'bsk'].map((k) => TAGS.pace_attack[k]), [0, 0, 4, -4]);
});

test('applyTag adds the offsets to every player, clamped to 1-99', () => {
  const c = applyTag(mkClub(50), 1, 1); // League 1 slot 1 = Pebble Lane Pups, bat_heavy
  assert.equal(c.name, 'Pebble Lane Pups'); assert.equal(c.tag, 'bat_heavy'); assert.deepEqual(c.kit, ['#8FD14F', '#2A5C8A']);
  for (const p of c.squad) assert.deepEqual(R.map((k) => p[k]), [56, 53, 46, 46]);
  assert.equal(c.six.length, 6);
  const hi = applyTag(mkClub(97), 1, 1); for (const p of hi.squad) assert.deepEqual(R.map((k) => p[k]), [99, 99, 93, 93]);
  const lo = applyTag(mkClub(3), 1, 3); // grinders -8 BP
  for (const p of lo.squad) assert.deepEqual(R.map((k) => p[k]), [1, 7, 3, 3]);
});

test('applyTag does nothing twice', () => {
  const c = applyTag(mkClub(50), 2, 1); const once = JSON.stringify(c); applyTag(c, 2, 1); assert.equal(JSON.stringify(c), once);
});

test('every league has three named, tagged rivals as clubs c1..c3; c0 and c4..c9 stay untagged', () => {
  for (let n = 1; n <= 5; n++) {
    const cs = gen('t1', n);
    assert.deepEqual(cs.slice(1, 4).map((c) => c.name), TAGGED_RIVALS[n].map((r) => r.name));
    assert.deepEqual(cs.slice(1, 4).map((c) => c.tag), TAGGED_RIVALS[n].map((r) => r.tag));
    assert.ok(cs.slice(1, 4).every((c) => tagInfo(c) && tagInfo(c).hint.length > 10 && c.kit.length === 2));
    assert.ok(cs.filter((c, i) => i === 0 || i > 3).every((c) => !c.tag && tagInfo(c) === null));
  }
  assert.equal(taggedRival(1, 4), null);
  assert.equal(new Set(Object.values(TAGGED_RIVALS).flat().map((r) => r.name)).size, 15);
});

test('tags move no rng: untagged clubs are identical across leagues; tagged ratings = untagged draw + offset', () => {
  const a = gen('t2', 1), b = gen('t2', 3);
  for (let i = 4; i < 10; i++) assert.equal(JSON.stringify(a[i]), JSON.stringify(b[i]));
  assert.equal(JSON.stringify(a[0]), JSON.stringify(b[0]));
  // same draw, different tag: the rating gap between league 1 (bat_heavy) and league 3 (spin_town) at c1 is the offset gap unless clamped
  for (let i = 0; i < 10; i++) {
    const p = a[1].squad[i], q = b[1].squad[i];
    if (p.bp > 1 && p.bp < 99 && q.bp > 1 && q.bp < 99) assert.equal(p.bp - q.bp, TAGS.bat_heavy.bp - TAGS.spin_town.bp);
  }
});

test('views: tableVM rows and hubVM next carry the tag; untagged rows carry null', () => {
  const s = newGame('t3').get();
  const rows = sel.tableVM(s).rows, tagged = rows.filter((r) => r.tag);
  assert.equal(tagged.length, 3); assert.ok(tagged.every((r) => r.tag.chip && r.tag.hint));
  assert.ok(rows.filter((r) => !r.tag).every((r) => r.tag === null));
  const nextOpp = s.clubs.find((c) => c.id === s.fixture.opp);
  assert.deepEqual(sel.hubVM(s).next.tag, tagInfo(nextOpp));
});

test('save: VERSION is 4; v3 save gets tagged rivals once, ratings offset once; v4 round-trips', () => {
  assert.equal(VERSION, 4);
  const g = newGame('t4').get();
  const v3 = structuredClone(g); v3.v = 3;
  const orig = {};
  for (const id of ['c1', 'c2', 'c3']) { const c = v3.clubs.find((x) => x.id === id); delete c.tag; delete c.kit; c.name = 'Old ' + id; for (const p of c.squad) for (const k of R) p[k] = 50; orig[id] = c; }
  const m = migrate(v3, 3);
  assert.equal(m.ok, true); assert.equal(m.state.v, 4);
  const c1 = m.state.clubs.find((x) => x.id === 'c1'), c4 = m.state.clubs.find((x) => x.id === 'c4');
  assert.equal(c1.name, 'Pebble Lane Pups'); assert.equal(c1.tag, 'bat_heavy');
  assert.ok(c1.squad.every((p) => p.bp === 56 && p.bs === 53 && p.spd === 46 && p.bsk === 46));
  assert.equal(JSON.stringify(c4), JSON.stringify(v3.clubs.find((x) => x.id === 'c4')));
  assert.equal(v3.clubs.find((x) => x.id === 'c1').name, 'Old c1'); // input untouched
  assert.equal(JSON.stringify(migrate(m.state, 3).state.clubs), JSON.stringify(m.state.clubs)); // second pass changes nothing
  const rt = unwrap(JSON.stringify(wrap(m.state)));
  assert.equal(rt.ok, true); assert.equal(JSON.stringify(rt.state), JSON.stringify(m.state));
});

test('migration uses the save\'s own league', () => {
  const g = structuredClone(newGame('t5').get()); g.v = 3; g.season.league = 4;
  for (const id of ['c1', 'c2', 'c3']) { const c = g.clubs.find((x) => x.id === id); delete c.tag; delete c.kit; }
  const m = migrate(g, 3);
  assert.deepEqual(m.state.clubs.slice(1, 4).map((c) => c.name), TAGGED_RIVALS[4].map((r) => r.name));
});

test('rivalVM and teamVM carry the next rival tag (hub chip sheet, team sheet head); untagged is null', () => {
  const s = newGame('t6').get();
  const opp = s.clubs.find((c) => c.id === s.fixture.opp);
  assert.deepEqual(sel.rivalVM(s), { name: opp.name, tag: tagInfo(opp) });
  assert.deepEqual(sel.teamVM(s).oppTag, tagInfo(opp));
  const plain = structuredClone(s); const c9 = plain.clubs.find((c) => c.id === 'c9'); plain.fixture.opp = 'c9';
  assert.equal(sel.rivalVM(plain).tag, null); assert.equal(sel.teamVM(plain).oppTag, null);
  assert.equal(c9.tag, undefined);
});
