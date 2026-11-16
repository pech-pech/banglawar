// T12.8 coach soak: 100 simulated weeks over the pure coach modules, seeded choices.
import test from 'node:test'; import assert from 'node:assert/strict';
import { installCoachHooks } from '../js/core/coach-hooks.js';
import { fireHook, clearHooks } from '../js/core/hooks.js';
import { setJob, legalJobs } from '../js/core/coach-jobs.js';
import { xpToNext } from '../js/core/coach-xp.js';
import { XP_MAX_STEP } from '../js/data/coach-weekly.js';
import { game, K } from './_tr2-fixture.mjs';

const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sumXpPaid = (n) => { const x = (n.report && n.report.jobs && n.report.jobs.xp) || {}; return Object.values(x).reduce((a, b) => a + b, 0); };
const sumTotal = (n) => n.coaches.reduce((a, c) => a + (c.xpTotal | 0), 0);
const CORRUPT = [-50, 99999, NaN, Infinity, '12', null, undefined, 1.7, -0.5, 1e9];

for (const seed of [1, 7, 42]) test(`T12.8 coach soak: 100 weeks, seed ${seed}`, () => {
  const r = mulberry(seed), pick = (a) => a[Math.floor(r() * a.length)];
  clearHooks(); installCoachHooks();
  let n = game({ coaches: [K({ id: 'k1', step: 3, xp: 0 }), K({ id: 'k2', step: 5, xp: 0 }), K({ id: 'k3', step: 1, xp: 0 })] });
  n.report = { jobs: {} }; let nextId = 4; const injected = new Map(); // id -> corrupt value no hook has touched yet
  for (let week = 1; week <= 100; week++) {
    // release / sign
    if (r() < 0.1 && n.coaches.length > 1) { const i = Math.floor(r() * n.coaches.length); n = { ...n, coaches: n.coaches.filter((_, j) => j !== i) }; }
    if (r() < 0.1 && n.coaches.length < 3) n = { ...n, coaches: [...n.coaches, K({ id: 'k' + nextId++, step: 1 + Math.floor(r() * 20), xp: 0 })] };
    // away coaches
    n = { ...n, coaches: n.coaches.map((c) => ({ ...c, away: c.away > 0 ? c.away - 1 : r() < 0.08 ? 1 + Math.floor(r() * 2) : 0 })) };
    // random legal jobs
    for (const c of n.coaches.slice()) { const ok = legalJobs(n, c.id).filter((x) => x.ok); if (ok.length) n = setJob(n, c.id, pick(ok).job); }
    n.training = { ...n.training, noMatch: r() < 0.1, week };
    // corrupt xp on some coaches
    n = { ...n, coaches: n.coaches.map((c) => { if (r() < 0.15) { const v = pick(CORRUPT); injected.set(c.id, v); return { ...c, xp: v }; } return c; }) };
    const t0 = sumTotal(n), p0 = sumXpPaid(n);
    const plan = { focus: pick(['bat', 'bowl']), effort: 'normal', coachId: pick(n.coaches).id };
    const hooksFired = [() => fireHook('netsRun', n, { week, weekKey: week, plan, jackpot: r() < 0.1 }),
      () => { if (!n.training.noMatch) fireHook('matchEnd', n, { won: r() < 0.5 }); },
      () => fireHook('endWeek', n, { week, weekKey: week })];
    for (const f of hooksFired) assert.doesNotThrow(f);
    if (week % 25 === 0) assert.doesNotThrow(() => fireHook('seasonClose', n, { season: week / 25 }));
    for (const c of n.coaches) {
      assert.ok(c.step >= 1 && c.step <= XP_MAX_STEP, `step ${c.step}`);
      assert.ok((c.stepUpPending | 0) >= 0, 'stepUpPending');
      assert.ok((c.xpTotal | 0) >= 0, 'xpTotal');
      // payXp clamps only when it pays (load-time clamp is save-migrate's job): an injected value no hook touched stays as injected
      if (injected.has(c.id) && Object.is(c.xp, injected.get(c.id))) continue;
      injected.delete(c.id);
      assert.ok(Number.isFinite(c.xp) && c.xp >= 0, `xp ${c.xp}`);
      const cost = xpToNext(c.step);
      if (cost === null) assert.equal(c.xp, 0); else assert.ok(c.xp < cost, `xp ${c.xp} >= cost ${cost} at step ${c.step}`);
    }
    assert.equal(sumTotal(n) - t0, sumXpPaid(n) - p0, `xpTotal conserved at week ${week}`);
  }
});
