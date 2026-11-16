// @ts-check
/* wheels/finals: split from wm-spins.js (w2 wheel glue). */
import { openWheel } from '../wheel-view.js';
import { finalsWheelOpts } from './finals-opts.js';
import { TOKVAL } from './shared.js';

/** wa1: the words for a Finals prize from what it pays (a Lucky Lift adds Coins to any prize but a Medal; the slice label alone would go stale). */
export function finalsWords(p) {
  const parts = [];
  if (p.medal > 0) parts.push('+' + p.medal + ' Medal'); if (p.coins > 0) parts.push(p.coins + ' Coins'); if (p.tp > 0) parts.push(p.tp + ' TP'); if (p.fans > 0) parts.push(p.fans + ' Fans');
  return parts.length ? parts.join(' + ') : (p.label || 'Prize');
}
/** wa1 fixreel (QA V7): the reason line when the prize is not the cell's label: "Prize Pair: 20 Fans x1.5 = 30" (one part per unit Prize Pair raised). '' when none. */
export function finalsPairLine(p) {
  if (!p || !p.pair || !p.base) return '';
  const x = (v) => Math.floor(v * 1.5 + 0.5), u = [['coins', 'Coins'], ['tp', 'TP'], ['fans', 'Fans']].filter(([k]) => p.base[k] > 0);
  return u.length ? 'Prize Pair: ' + u.map(([k, w]) => p.base[k] + ' ' + w + ' x1.5 = ' + x(p.base[k])).join(', ') : '';
}
/** wa1 fixreel (QA V7): the plain Lucky Lift line ("Lucky Lift: +10 Coins"); other tokens keep the shared line (null = use it). */
export function finalsTokLine(kind, before, q) {
  if (kind !== 'lift') return null;
  const d = (TOKVAL.finals(q || {}) - TOKVAL.finals(before || q || {})) | 0;
  return d > 0 ? 'Lucky Lift: +' + d + ' Coins' : 'Lucky Lift: no bonus';
}
/** Finals prize through openWheel (A3.9): finalsWheelOpts(vm, ctx); STOP dispatches FinalsSpin {stop}; a stored result (vm.pending / vm.stored) opens on the result, never re-spins. get() -> vm.finals; ctx keys (spinKey, stored, J, wobKey) ride on vm. */
export function spinFinals({ get, look, dispatch, onCollect }) {
  const f = get() || {}, vm = f.ring ? f : { ...f, ring: (f.cells || []).map((c, i) => ({ id: i, w: c.w, value: 0, label: c.label, tier: 'mid', gold: !!c.gold })) };
  return openWheel({ ...finalsWheelOpts(vm, { get, dispatch, look, onCollect, spinKey: f.spinKey, stored: f.stored, wobKey: f.wobKey, J: f.J }), tokText: finalsWords });
}
