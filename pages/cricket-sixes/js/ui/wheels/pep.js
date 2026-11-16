// @ts-check
/* wheels/pep: aimed spin through openWheel (CONTRACT-A sec 4, SPEC sec 8 and 2f). */
import { openWheel } from '../wheel-view.js';
import { dialLook, tokProps, TOKVAL } from './shared.js';
import { pepName } from '../../data/wheels/pep.js';

/** Pep ring labels = the six's names. Ring row i carries slot (1..6); label = 'name +x%' (SPEC 8), name cut to the surname over 10 chars. No slot or name: keep the row's label. Pure. */
export const pepSlices = (/** @type {any[]} */ ring, /** @type {string[]} */ names) =>
  (ring || []).map((c) => { const n = names && c && c.slot ? names[c.slot - 1] : ''; const v = c && c.value != null ? c.value : parseFloat(String(c && c.label).replace('%', '')); return { ...c, label: n ? pepName(n) + ' +' + v + '%' : c.label }; });

/** Pep result copy: names from the six (slot or slots), chip = per-slice boost, gold on the 10. Pure. */
const pepLabel = (p, names) => { const d = describePep(p, names); return d.say.split('. ')[0].replace(/^Landed on /, ''); };
export function describePep(p, names) {
  const sl = p && (p.slots || (p.slot ? [p.slot] : [(p && p.index != null ? p.index : 0) + 1]));
  const w = sl.map((x) => pepName((names && names[x - 1]) || 'Player ' + x)).join(' and ');
  const b = +(p && (p.boostPct != null ? p.boostPct : p.value)) || 0; // the store's pending carries boostPct (md.js selectors)
  const lb = (w || 'Player') + ' +' + b + '%';
  return { big: '', line: w + ' gets +' + b + '% for the match.', chip: '', say: 'Landed on ' + lb + '. ' + w + ' gets plus ' + b + ' percent for the match.', gold: b === 10 };
}

/** Pep: an aimed spin. get() -> vm.wm.pep; names = the six's names in batting order. onSpin(stop) dispatches PepSpin. */
export function spinPep({ get, look, dispatch, onCollect, names }) {
  const p0 = get();
  return openWheel({
    wheelId: 'pep', ring: pepSlices(get().ring, names), spinKey: get().spinKey, J: 1.2, stored: get().stored, wobKey: get().wobKey,
    title: 'Pep talk', cardHtml: '<p class="dr-hint">You win: a pep talk, +2.5% to +10% on one player. Aim at gold. The tick shows the slice under the pointer now.</p>',
    look: dialLook(look), pending: p0.pending,
    ...tokProps(get, dispatch, 'pep', 'Pep'), tokVal: TOKVAL.pep, tokText: (p) => 'Landed on ' + pepLabel(p, names),
    onSpin: (stop) => dispatch('PepSpin', { stop: { sliceId: stop.sliceId, stopT: stop.stopT, cycle: stop.cycle, tInCycle: stop.tInCycle, respin: stop.respin, t: stop.t, phi: stop.phi, e: stop.e } }),
    getPending: () => get().pending,
    describe: (p) => describePep(p, names),
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
