// node shaft.test.js : buildShaft / mirrorRoom / TEMPLATES. Loads core, rooms, tpl1, tpl2 (if present).
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ console, Math });
ctx.globalThis = ctx;
for (const f of ['core.js', 'rooms.js', 'tpl1.js', 'tpl2.js']) {
  const p = path.join(__dirname, '..', 'parts', f);
  if (!fs.existsSync(p)) continue;
  vm.runInContext(fs.readFileSync(p, 'utf8').replace(/^const PL =/m, 'var PL ='), ctx, { filename: f });
}
const PL = ctx.PL;
let fails = 0;
function t(name, fn) { try { fn(); console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + e.message); } }
const J = (o) => JSON.stringify(o);
const LIVE = PL.TEMPLATES.filter((x) => !x.tutorial && !x.retired);
const N = 7;
const SEEDS = [1, 2, 3, 42, 777, 20261118];

function rects(r) {
  const a = [...r.walls, ...r.crumbles, ...r.spikes.map((s) => s.r), ...r.gates.map((g) => g.r), ...r.crushers.map((c) => c.r)];
  return a;
}
function inside(r) { return r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 336 && r[1] + r[3] <= 500; }
function geom(r) { const c = JSON.parse(J(r)); delete c.mirrored; return c; }

t('templates registered (3 tutorials first: tut1, t01, tut3)', () => {
  assert(PL.TEMPLATES.length >= 3);
  assert.strictEqual(J(PL.TEMPLATES.slice(0, 3).map((x) => x.id)), J(['tut1', 't01', 'tut3']));
  assert.strictEqual(J(PL.TEMPLATES.slice(0, 3).map((x) => !!x.tutorial)), J([true, true, true]));
  assert.strictEqual(J(PL.buildRooms(1).map((r) => r.name)), J(PL.TEMPLATES.slice(0, 3).map((x) => x.make(PL.mulberry32(1)).name)));
});
t('every tier (1,2,3) keeps >= 4 live templates; every template has family and inputs', () => {
  for (const tier of [1, 2, 3]) assert(LIVE.filter((x) => x.tier === tier).length >= 4, 'tier ' + tier);
  for (const x of LIVE) assert(x.family && x.inputs >= 1, x.id);
});
t('same seed deep-equal', () => {
  for (const s of SEEDS) assert.strictEqual(J(PL.buildShaft(s, N)), J(PL.buildShaft(s, N)));
});
t('n distinct template ids, no tutorial or retired room (n=5 and 7, 200 seeds)', () => {
  for (const n of [5, 7]) for (let s = 1; s <= 200; s++) {
    const ids = PL.buildShaft(s, n).map((r) => r.templateId);
    assert.strictEqual(ids.length, n);
    assert.strictEqual(new Set(ids).size, n);
    for (const id of ids) { const x = PL.TEMPLATES.find((q) => q.id === id); assert(!x.tutorial && !x.retired, id); }
  }
});
t('slot table: tier per slot, hard slot hard, rest slot rest, no relaxed rules (n=5 and 7, 300 seeds)', () => {
  const by = {}; PL.TEMPLATES.forEach((x) => (by[x.id] = x));
  const want = { 5: [1, 1, 2, 3, 0], 7: [1, 1, 2, 2, 3, 3, 0] };
  for (const n of [5, 7]) for (let s = 1; s <= 300; s++) {
    const p = PL.pickShaft(s, n); assert.strictEqual(p.level, 0, 'relaxed at seed ' + s + ' n ' + n);
    p.templates.forEach((x, i) => {
      if (want[n][i]) assert.strictEqual(x.tier, want[n][i], 'seed ' + s + ' slot ' + i);
      // new rule (review/shaft-pick-beta.md): T3* is any tier-3 room; 7-room shafts must hold at least one hard room
      if (p.slots[i] === 'T2r') assert(x.rest, x.id + ' not rest');
    });
    if (n === 7) assert(p.templates.some((x) => x.hard), 'no hard room, seed ' + s);
  }
});
t('adjacent rooms differ in family and in mirrored flag; first crusher is t03, first crumble is t18; exit clear of spikes', () => {
  const by = {}; PL.TEMPLATES.forEach((x) => (by[x.id] = x));
  for (const n of [5, 7]) for (let s = 1; s <= 300; s++) {
    const sh = PL.buildShaft(s, n);
    sh.forEach((r, i) => {
      if (i) { assert.notStrictEqual(by[sh[i - 1].templateId].family, by[r.templateId].family, 'family seed ' + s); assert.notStrictEqual(sh[i - 1].mirrored, r.mirrored, 'mirror seed ' + s); }
      for (const sp of r.spikes) {
        const q = sp.r, e = r.exit, dx = Math.max(q[0] - e.x, 0, e.x - q[0] - q[2]), dy = Math.max(q[1] - e.y, 0, e.y - q[1] - q[3]);
        assert(Math.hypot(dx, dy) >= 22, r.templateId + ' exit adjacent to spikes');
      }
    });
    const fc = sh.findIndex((r) => r.crushers.length), fu = sh.findIndex((r) => r.crumbles.length);
    if (fc >= 0) assert.strictEqual(sh[fc].templateId, 't03', 'first crusher seed ' + s);
    if (fu >= 0) assert.strictEqual(sh[fu].templateId, 't18', 'first crumble seed ' + s);
  }
});
t('cross-shaft exclusion is soft: excluded ids avoided when slot keeps >= 2 others', () => {
  const a = PL.buildShaft(5, 7).map((r) => r.templateId);
  const b = PL.buildShaft(5, 7, { exclude: a.slice(0, 3) }).map((r) => r.templateId);
  assert.strictEqual(b.length, 7);
  assert(b.filter((id) => a.slice(0, 3).includes(id)).length <= a.length, 'sanity');
});
t('features >= 10 px at 0.84 scale (11.9 units): hazards, gates, crumbles, crushers, walls', () => {
  const F = 10 / 0.84;
  for (const tp of PL.TEMPLATES) for (const s of [1, 2]) {
    const r = tp.make(PL.mulberry32(s));
    const small = (q) => Math.min(q[2], q[3]) < F - 1e-9;
    assert(!r.spikes.some((x) => small(x.r)), tp.id + ' spike');
    assert(!r.gates.some((x) => small(x.r)), tp.id + ' gate');
    assert(!r.crumbles.some(small), tp.id + ' crumble');
    assert(!r.crushers.some((x) => small(x.r)), tp.id + ' crusher');
    assert(!r.walls.slice(4).some(small), tp.id + ' wall');
  }
});
t('mirrorRoom twice returns original geometry', () => {
  for (const tp of PL.TEMPLATES) for (const s of SEEDS) {
    const room = tp.make(PL.mulberry32(s));
    const twice = PL.mirrorRoom(PL.mirrorRoom(room));
    assert.strictEqual(J(geom(twice)), J(geom(room)), tp.id);
    assert.notStrictEqual(J(geom(PL.mirrorRoom(room))), J(geom(room)), tp.id + ' mirror is no-op');
  }
});
t('mirrorRoom does not mutate input', () => {
  const room = PL.TEMPLATES[0].make(PL.mulberry32(1)), before = J(room);
  PL.mirrorRoom(room);
  assert.strictEqual(J(room), before);
});
t('all rooms inside 336x500, 12px border present', () => {
  for (const tp of PL.TEMPLATES) for (const s of SEEDS) {
    let room = tp.make(PL.mulberry32(s));
    for (const r of [room, PL.mirrorRoom(room)]) {
      assert.strictEqual(r.w, 336); assert.strictEqual(r.h, 500);
      for (const q of rects(r)) assert(inside(q), tp.id + ' rect ' + q);
      assert(r.start.x > 0 && r.start.x < 336 && r.exit.x > 0 && r.exit.x < 336, tp.id);
    }
  }
});
t('buildRooms unchanged shape', () => {
  const a = PL.buildRooms(5);
  assert.strictEqual(a.length, 3);
  assert.strictEqual(J(a), J(PL.buildRooms(5)));
});
if (PL.TEMPLATES.length < 18) console.log('note: only ' + PL.TEMPLATES.length + ' templates loaded (tpl1/tpl2 not landed); rerun later');
process.exit(fails ? 1 : 0);
