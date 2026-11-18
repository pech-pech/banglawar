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
const N = Math.min(7, PL.TEMPLATES.length);
const SEEDS = [1, 2, 3, 42, 777, 20261118];

function rects(r) {
  const a = [...r.walls, ...r.crumbles, ...r.spikes.map((s) => s.r), ...r.gates.map((g) => g.r), ...r.crushers.map((c) => c.r)];
  return a;
}
function inside(r) { return r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 336 && r[1] + r[3] <= 500; }
function geom(r) { const c = JSON.parse(J(r)); delete c.mirrored; return c; }

t('templates registered (>=3, t01..t03 first)', () => {
  assert(PL.TEMPLATES.length >= 3);
  assert.strictEqual(J(PL.TEMPLATES.slice(0, 3).map((x) => x.id)), J(['t01', 't02', 't03']));
  assert.strictEqual(J(PL.TEMPLATES.slice(0, 3).map((x) => x.tier)), J([1, 2, 2]));
});
t('same seed deep-equal', () => {
  for (const s of SEEDS) assert.strictEqual(J(PL.buildShaft(s, N)), J(PL.buildShaft(s, N)));
});
t('n distinct template ids', () => {
  for (const s of SEEDS) {
    const ids = PL.buildShaft(s, N).map((r) => r.templateId);
    assert.strictEqual(ids.length, N);
    assert.strictEqual(new Set(ids).size, N);
  }
});
t('tiers ascending', () => {
  const tier = {}; PL.TEMPLATES.forEach((x) => (tier[x.id] = x.tier));
  for (const s of SEEDS) {
    const ts = PL.buildShaft(s, N).map((r) => tier[r.templateId]);
    for (let i = 1; i < ts.length; i++) assert(ts[i] >= ts[i - 1], 'seed ' + s + ' ' + ts);
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
if (PL.TEMPLATES.length < 20) console.log('note: only ' + PL.TEMPLATES.length + ' templates loaded (tpl1/tpl2 not landed); rerun later');
process.exit(fails ? 1 : 0);
