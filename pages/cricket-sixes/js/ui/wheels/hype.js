// @ts-check
/* wheels/hype: T3 full wheel (SPEC s2, CONTRACT-A s4). Replaces the old aimable half dial. */
import { openWheel } from '../wheel-view.js';
import { tokProps, TOKVAL } from './shared.js';
const HYPE_WORD = { low: 'Quiet crowd', med: 'Good crowd', high: 'Big crowd', nuts: 'Wild crowd' };

/** Hype: full wheel. get() -> vm.wm.hype (ring, spinKey, pending, spokeGain); dispatch('HypeSpin', {stop}). Every slice is >= 10% wide, so no legend. */
export function spinHype({ get, look, dispatch, onCollect, oppName }) {
  const h = get();
  return openWheel({
    wheelId: 'hype', ring: h.ring, spinKey: h.spinKey, J: 1.2, look,
    title: 'Crowd today', sub: oppName || '',
    cardHtml: '<p class="dr-hint">Tap SPIN, then STOP. The tick shows where it will land.</p>',
    ...(h.legend ? { legend: h.legend } : {}),
    ...tokProps(get, dispatch, 'hype', 'Hype'), tokVal: TOKVAL.hype, tokText: (p) => HYPE_WORD[p.level || 'low'] + ' +' + p.pts + '%',
    pending: h.pending, getPending: () => get().pending,
    onSpin: (stop) => dispatch('HypeSpin', { stop: { sliceId: stop.sliceId, stopT: stop.stopT, cycle: stop.cycle, tInCycle: stop.tInCycle, respin: stop.respin, t: stop.t, phi: stop.phi, e: stop.e } }),
    describe: (p) => { const lv = p.level || 'low'; return { big: HYPE_WORD[lv], chip: '+' + p.pts + '%', say: HYPE_WORD[lv] + ', plus ' + p.pts + ' percent for your team.', gold: lv === 'nuts' }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
