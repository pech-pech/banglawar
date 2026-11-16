// @ts-check
// Pep reveal kind hooks + the Pep light chase timing (S0 Z1, owner T3). Read by the dispatcher in ./reveal.js.
import { DR } from '../../data/dialreel.js';
import { clamp, sum } from './common.js';

/** Pep light chase: the lit light index (0..5) after each step and the time (s) it lights; n = 6 + target steps, d_i = 0.06 + 0.20 (i/10)^2 rescaled to `seconds`. @param {number} slot0 @param {number} [seconds] */
export function pepSteps(slot0, seconds = DR.REVEAL.pep.seconds) {
  const R = DR.REVEAL, n = 6 + clamp(slot0 | 0, 0, 5), d = [];
  for (let i = 0; i < n; i++) d.push(R.PEP_STEP0 + R.PEP_STEP_GROW * Math.pow(i / R.PEP_STEP_REF, 2));
  const k = seconds / sum(d); let t = 0;
  return d.map((di, i) => { t += di * k; return { light: (i + 1) % 6, at: t - di * k }; }).map((s, i, a) => ({ ...s, end: i + 1 < a.length ? a[i + 1].at : seconds }));
}

/** @type {{extraKey:string, boost:(fx:any, v:number, d:number[])=>void, post:(out:any, s:any, fx:any, m:any, d:number[])=>void, plan:(plan:any, c:any, target:number, sec:number)=>any}} */
export const REVEAL_KIND = {
  extraKey: 'pep',
  /** Booster: 0.5 per value chance of one more pepped player (draw 3). */
  boost(fx, v, d) { fx.pep = (fx.pep || 0) + (d[3] < clamp(v * DR.UNIT.pep, 0, 1) ? 1 : 0); },
  /** Slots: the slice's slot or a random one (draw 4); double = a random second slot (draw 5); Pep Rally: 50% the next slot too (draw 5). */
  post(out, s, fx, m, d) {
    const a = s.slot || 1 + Math.min(5, Math.floor(d[4] * 6)); // double pep: a random pair
    out.slots = [a];
    let b = 0;
    if (s.id === 'double' || fx.pep >= 2) { b = 1 + Math.min(4, Math.floor(d[5] * 5)); if (b >= a) b++; out.slots.push(b); }
    if (m.nb) { out.neighbour = d[5] < 0.5; if (out.neighbour) { const n = (a % 6) + 1; if (!out.slots.includes(n)) out.slots.push(n); } }
    out.fx.pep = out.slots.length;
  },
  plan(plan, c, target, sec) { return { ...plan, steps: pepSteps(target, sec) }; },
};
