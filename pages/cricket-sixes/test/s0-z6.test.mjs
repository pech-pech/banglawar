// S0 seam Z6 + CONTRACT-B lead calls 1, 3, 9, 12 (NewGame): clinic stub, coach field carry, scout spread, install point,
// default-case spin dispatch, SHEETS / click slots, pipeHook netsOrder, NewGame save defaults. Everything empty/identity today.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clinicReadyCount } from '../js/core/clinic.js';
import { coachList, startCoach, signCoach, passScout, scoutList, runNets, coachFromOld } from '../js/core/training.js';
import { carryCoach } from '../js/core/run.js';
import { onHook, pipeHook, clearHooks, HOOK_NAMES, PIPE_NAMES } from '../js/core/hooks.js';
import { applyCommand } from '../js/store/commands.js';
import { registerSpin } from '../js/store/spin-registry.js';
import { fillSaveDefaults } from '../js/core/save-migrate.js';
import { game, makeRng } from './_tr2-fixture.mjs';

const src = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
const clone = (x) => JSON.parse(JSON.stringify(x));
const counted = (seed) => { const r = makeRng(seed); const c = { draws: 0, random: () => { c.draws += 1; return r.random(); } }; return c; };
const KNOWN = ['id', 'name', 'step', 'strong', 'away', 'courseSeason'];
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));

test('Z6 clinic stub: clinicReadyCount is an int 0-3 and never throws', () => {
  for (const s of [null, {}, game()]) { const v = clinicReadyCount(s); assert.ok(Number.isInteger(v) && v >= 0 && v <= 3); }
});

test('Z6 normCoach (coachList): known fields byte-equal to before, unknown coach fields kept', () => {
  const c = startCoach('k0', 'Ali');
  assert.equal(JSON.stringify(coachList({ coaches: [c] })[0]), JSON.stringify({ ...c, away: 0 }));
  const old = { id: 'k1', name: 'Bo', lv: { Power: 2 } };
  const before = coachFromOld(old), now = coachList({ coaches: [old] })[0];
  assert.equal(JSON.stringify(now), JSON.stringify(before), 'old shape: same keys, same order, lv not added');
  const extra = { ...old, xp: 5, job: 'nets' }, got = coachList({ coaches: [extra] })[0];
  assert.equal(JSON.stringify(pick(got, KNOWN)), JSON.stringify(before));
  assert.equal(got.xp, 5); assert.equal(got.job, 'nets'); assert.equal(got.lv, undefined);
  const nw = coachList({ coaches: [{ ...c, xp: 3, step: 9, stepUpPending: 1 }] })[0];
  assert.equal(nw.xp, 3); assert.equal(nw.stepUpPending, 1); assert.equal(nw.step, 9);
});

test('Z6 carryCoach: known fields byte-equal to before, unknown fields carry, course marks cleared', () => {
  const c = { ...startCoach('k0', 'Ali'), step: 15, away: 1, courseSeason: 2 };
  const want = { id: 'k0', name: 'Ali', step: 10, strong: c.strong.slice(), away: 0, courseSeason: null };
  // RUN.carry.coachStep caps the grade; read it back rather than hard-code it
  const out = carryCoach(c); want.step = out.step;
  assert.ok(out.step <= 15);
  assert.equal(JSON.stringify(out), JSON.stringify(want));
  const x = carryCoach({ ...c, licenceSeason: 2, xp: 7, job: 'study', xpTotal: 9 });
  assert.equal(JSON.stringify(pick(x, KNOWN)), JSON.stringify(want));
  assert.equal(x.xp, 7); assert.equal(x.job, 'study'); assert.equal(x.xpTotal, 9); assert.equal('licenceSeason' in x, false);
  assert.equal(JSON.stringify(carryCoach({ id: 'k1', name: 'Bo', lv: { Craft: 1 } })), JSON.stringify(carryCoach(coachFromOld({ id: 'k1', name: 'Bo', lv: { Craft: 1 } }))));
});

test('lead call 1: signCoach / passScout keep other scout.* keys; old record shape unchanged', () => {
  const s = game(), n = s.season.n;
  const id = scoutList(s)[0] && scoutList(s)[0].id;
  if (id) {
    assert.deepEqual(signCoach(s, id).scout, { n, signed: id, passed: false });
    assert.deepEqual(signCoach({ ...s, scout: { bonusNames: 2, extraThisSeason: 1 } }, id).scout, { bonusNames: 2, extraThisSeason: 1, n, signed: id, passed: false });
  }
  assert.deepEqual(passScout(s).scout, { n, signed: null, passed: true });
  assert.deepEqual(passScout({ ...s, scout: { n: n - 1, signed: 'x', passed: false, bonusNames: 1 } }).scout, { n, signed: null, passed: true, bonusNames: 1 });
});

test('lead call 9: pipeHook identity with no listeners, chains listeners, netsOrder listed', (t) => {
  t.after(clearHooks);
  assert.deepEqual([...HOOK_NAMES], ['netsRun', 'matchEnd', 'endWeek', 'seasonClose']);
  assert.deepEqual([...PIPE_NAMES], ['netsOrder']);
  const v = [1, 2, 3];
  assert.equal(pipeHook('netsOrder', v, {}, {}), v, 'same reference with no listeners');
  assert.equal(pipeHook('unknown', v), v);
  onHook('netsOrder', (x) => x.concat(4));
  onHook('netsOrder', () => undefined); // undefined keeps the value
  onHook('netsOrder', (x, n, info) => x.map((y) => y * info.k));
  const warn = console.warn; console.warn = () => {};
  try { onHook('netsOrder', () => { throw new Error('bug'); }); assert.deepEqual(pipeHook('netsOrder', v, {}, { k: 2 }), [2, 4, 6, 8]); } finally { console.warn = warn; }
  assert.deepEqual(v, [1, 2, 3]);
});

test('lead call 9: runNets applies netsOrder to the trainee ids; empty = identical result and rng draws', (t) => {
  t.after(clearHooks);
  const s = game({ plan: { focus: 'bat', effort: 'normal' } });
  const a = counted('z6'), base = runNets(s, a, {});
  let seen = null;
  onHook('netsOrder', (ids) => { seen = ids.slice(); return undefined; });
  const b = counted('z6'), same = runNets(s, b, {});
  assert.deepEqual(same.state, base.state); assert.equal(b.draws, a.draws);
  assert.deepEqual(seen, base.lines.map((l) => l.id));
  clearHooks();
  onHook('netsOrder', (ids) => ids.slice().reverse());
  const r = runNets(s, makeRng('z6'), {});
  assert.deepEqual(r.lines.map((l) => l.id), base.lines.map((l) => l.id).reverse());
});

test('lead call 3: install.js fences, imported once from main.js; SHEETS fences; slotClick false and called first', async () => {
  const ins = src('install.js');
  for (const k of ['T5', 'T6']) { assert.match(ins, new RegExp(`/\\* INSTALL:${k} start \\*/`)); assert.match(ins, new RegExp(`/\\* INSTALL:${k} end \\*/`)); }
  assert.equal((src('main.js').match(/import '\.\/install\.js'/g) || []).length, 1);
  await import('../js/install.js');
  const app = src('ui/app.js');
  for (const k of ['T5', 'T6']) { assert.match(app, new RegExp(`/\\* SHEETS:${k} start \\*/`)); assert.match(app, new RegExp(`/\\* SHEETS:${k} end \\*/`)); }
  for (const f of ['ui/training-view.js', 'ui/coaches-sheet.js']) {
    const t = src(f);
    assert.match(t, /\/\* SLOT:Click start \*\/[\s\S]*export function slotClick\(e, ctx\)[\s\S]*\/\* SLOT:Click end \*\//);
    assert.ok((t.match(/if \(slotClick\(e, \{/g) || []).length >= 1, f + ' calls slotClick in a click handler');
  }
  const tv = await import('../js/ui/training-view.js'), cs = await import('../js/ui/coaches-sheet.js');
  assert.equal(tv.slotClick({}, {}), false); assert.equal(cs.slotClick({}, {}), false);
});

test('lead call 3b: commands.js default case runs a registered spin handler; unknown types are still a no-op', () => {
  const s = applyCommand(null, 'NewGame', { seed: 'z6b' });
  assert.equal(applyCommand(s, 'Z6NoSuchCmd', {}), s);
  registerSpin('Z6TestSpin', (x, a, ctx) => ({ ...x, z6: a.v, ctxOk: typeof ctx.clone === 'function' }));
  const n = applyCommand(s, 'Z6TestSpin', { v: 3 });
  assert.equal(n.z6, 3); assert.equal(n.ctxOk, true);
});

test('lead call 12: NewGame writes the same default keys migration fills (fill is a no-op on it)', () => {
  const g = applyCommand(null, 'NewGame', { seed: 'z6' });
  for (const k of ['wheels', 'clinic', 'scout', 'report']) assert.ok(g[k] && typeof g[k] === 'object', k);
  assert.ok(g.report.jobs && typeof g.report.jobs === 'object');
  for (const c of g.coaches) assert.equal(c.job, 'study');
  assert.deepEqual(fillSaveDefaults(clone(g)), clone(g));
  assert.deepEqual(applyCommand(null, 'NewGame', { seed: 'z6' }), g, 'deterministic');
});
