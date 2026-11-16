// @ts-check
/* wheels/hype: T3 full wheel (SPEC s2, CONTRACT-A s4). Replaces the old aimable half dial. */
import { openWheel } from '../wheel-view.js';
import { tokProps, TOKVAL } from './shared.js';
/** The landed slice's ring label ('HIGH +6'); falls back to level + points. Pure. */
const hypeLabel = (ring, p) => (ring && p && ring[p.index] && ring[p.index].label) || (String(p.level || 'low').toUpperCase() + ' +' + (p.pts || 0));

/** Hype: full wheel. get() -> vm.wm.hype (ring, spinKey, pending, spokeGain); dispatch('HypeSpin', {stop}). Every slice is >= 10% wide, so no legend. */
export function spinHype({ get, look, dispatch, onCollect, oppName }) {
  const h = get();
  return openWheel({
    wheelId: 'hype', ring: h.ring, spinKey: h.spinKey, J: 1.2, stored: get().stored, wobKey: get().wobKey, look,
    title: 'Crowd today', sub: oppName || '',
    cardHtml: '<p class="dr-hint">You win: 2 to 10 Hype points. Aim at gold NUTS. The tick shows where the pointer will stop.</p>',
    ...(h.legend ? { legend: h.legend } : {}),
    ...tokProps(get, dispatch, 'hype', 'Hype'), tokVal: TOKVAL.hype, tokText: (p) => 'Landed on ' + hypeLabel(get().ring, p),
    pending: h.pending, getPending: () => get().pending,
    onSpin: (stop) => dispatch('HypeSpin', { stop: { sliceId: stop.sliceId, stopT: stop.stopT, cycle: stop.cycle, tInCycle: stop.tInCycle, respin: stop.respin, t: stop.t, phi: stop.phi, e: stop.e } }),
    describe: (p) => { const lb = hypeLabel(get().ring, p), lv = p.level || 'low'; return { big: '', chip: '', line: '+' + p.pts + ' Hype points for the crowd.', say: 'Landed on ' + lb + '. Plus ' + p.pts + ' Hype points for the crowd.', gold: lv === 'nuts' }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
