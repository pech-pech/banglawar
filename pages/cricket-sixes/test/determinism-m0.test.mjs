// M0 determinism: same seed gives the same season, training and standings; nothing reads the clock or Math.random.
// Seasons are played by the bots in tools/season-bot.mjs through applyCommand only.
// Skips (with a reason) until the store speaks NewGame/season; the suite stays runnable.
import test from 'node:test';
import assert from 'node:assert/strict';

let bot = null, store = null, mig = null, why = null;
try {
  bot = await import('../tools/season-bot.mjs');
  store = await import('../js/store/commands.js');
  mig = await import('../js/core/save-migrate.js');
  if (!bot.seasonReady()) { why = 'store has no NewGame/season yet (js/store/commands.js is still step-0)'; }
} catch (e) { why = `season modules not loadable yet: ${e.message}`; }
const skip = why ? `pending store part: ${why}` : false;

const skilled = () => bot.policyByName('skilled');
const idle = () => bot.policyByName('idle');
const season = (seed, pol, hooks) => bot.playSeason(seed, pol, hooks);
const J = (x) => JSON.stringify(x);

test('same seed + same policy: identical whole-season state JSON; different seed differs', { skip }, () => {
  for (const pol of [idle(), skilled(), bot.policyByName('careless')]) {
    const a = season('det-1', pol), b = season('det-1', pol), c = season('det-2', pol);
    assert.deepEqual(a.errors, [], `${pol.name} season errors`);
    assert.equal(a.state.stage, 'end');
    assert.equal(J(a.state), J(b.state), `${pol.name}: same seed must replay exactly`);
    assert.notEqual(J(a.state), J(c.state), `${pol.name}: a different seed must differ`);
  }
});

test('standings: same seed gives the same table after every round, and it stays in tableOrder', { skip }, () => {
  const run = () => { const t = []; season('det-3', skilled(), { onState: (s) => { if (s.stage === 'week') t.push(J(s.season.table)); } }); return t; };
  const a = run(), b = run();
  assert.ok(a.length >= 9, `expected a table at each of 9 league weeks, got ${a.length}`);
  assert.deepEqual(a, b);
  const end = season('det-3', skilled()).state.season.table;
  const sorted = end.slice().sort((x, y) => y.pts - x.pts || (y.rf - y.ra) - (x.rf - x.ra) || y.w - x.w || (x.id < y.id ? -1 : 1));
  assert.deepEqual(end.map((r) => r.id), sorted.map((r) => r.id), 'table kept sorted by points, run difference, wins, club id');
});

test('training: same seed + same nets run give the same ratings; a new salt re-rolls them', { skip }, () => {
  // RunNets (P11; replaces the removed per-player Drill) is legal only in stage 'train': play the first match with the idle bot,
  // stop when the training week opens, set a plan, run the nets. The roll is keyed on seed|salt|week, so the salt must matter.
  const train = (salt) => {
    let s = null;
    season('det-train', idle(), { stopAt: (x) => x.stage === 'train' && ((s = x), true) });
    assert.ok(s, 'reached the training week');
    s = store.applyCommand(s, 'Reseed', { salt });
    s = store.applyCommand(s, 'SetTrainPlan', { focus: 'bat', effort: 'push' });
    return store.applyCommand(s, 'RunNets');
  };
  const a = train(''), b = train(''), c = train('some-other-load');
  assert.equal(J(a.clubs[0].squad), J(b.clubs[0].squad));
  assert.equal(a.training.tp, b.training.tp);
  assert.equal(J(a.training.nets), J(b.training.nets));
  assert.ok(a.training.nets && a.training.nets.week === a.training.week, 'the nets must have run (RunNets accepted)');
  assert.ok(a.training.nets.lines.length > 0, 'at least one player trained');
  assert.notEqual(J(a.clubs[0].squad), J(c.clubs[0].squad), 'the nets under a different salt should not roll alike');
});

test('AI-v-AI league results do not depend on what M does (own sub-streams only)', { skip }, () => {
  const ai = (o) => o.state.season.results.filter((r) => r.kind === 'league' && r.a !== 'c0' && r.b !== 'c0')
    .map((r) => J({ round: r.round, a: r.a, b: r.b, ra: r.ra, wa: r.wa, rb: r.rb, wb: r.wb })).sort();
  const x = ai(season('det-4', idle())), y = ai(season('det-4', skilled())), z = ai(season('det-4', bot.policyByName('careless')));
  assert.equal(x.length, 36, '4 AI matches x 9 rounds');
  assert.deepEqual(x, y, 'idle vs skilled M must not change the other 36 league results');
  assert.deepEqual(x, z);
});

test('no Math.random, Date.now or new Date anywhere in a whole season', { skip }, () => {
  const R = Math.random, DN = Date.now, DT = globalThis.Date;
  const boom = (n) => () => { throw new Error(`${n} called during a season`); };
  let out;
  try {
    Math.random = boom('Math.random'); Date.now = boom('Date.now');
    globalThis.Date = new Proxy(DT, { construct() { throw new Error('new Date during a season'); } });
    out = season('det-5', skilled());
  } finally { Math.random = R; Date.now = DN; globalThis.Date = DT; }
  assert.deepEqual(out.errors, [], 'a clock or Math.random read shows up as a thrown error here');
  assert.equal(out.state.stage, 'end');
});

test('an unrelated rng draw elsewhere does not change a season', { skip }, async () => {
  const { makeRng } = await import('../js/core/rng.js');
  const base = J(season('det-6', skilled()).state);
  const noise = makeRng('det-6|unrelated'); for (let i = 0; i < 1000; i++) noise.random();
  assert.equal(J(season('det-6', skilled()).state), base);
});

test('reload from save mid-season continues identically (same seed, same salt)', { skip }, () => {
  const through = season('det-7', skilled());
  let mid = null;
  season('det-7', skilled(), { stopAt: (s) => s.stage === 'week' && s.training.week === 4 && ((mid = s), true) });
  assert.ok(mid, 'reached week 4');
  const back = mig.unwrap(J(mig.wrap(mid)));
  assert.ok(back.ok, `unwrap failed: ${back.reason}`);
  assert.equal(J(back.state), J(mid), 'round trip equal');
  const cont = season('det-7', skilled(), { from: back.state });
  assert.deepEqual(cont.errors, []);
  assert.equal(J(cont.state), J(through.state), 'finishing from the reloaded save equals the uninterrupted season');
});

test('reload with a different salt (no ?seed) may re-roll the next nets run but keeps the table and squad', { skip }, () => {
  let mid = null;
  season('det-8', skilled(), { stopAt: (s) => s.stage === 'week' && s.training.week === 3 && ((mid = s), true) });
  const re = store.applyCommand(mid, 'Reseed', { salt: 'new-load' });
  assert.equal(J(re.season.table), J(mid.season.table));
  assert.equal(J(re.clubs), J(mid.clubs));
  assert.equal(re.salt, 'new-load');
});
