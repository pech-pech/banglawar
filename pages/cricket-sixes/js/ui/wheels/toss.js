// @ts-check
/* wheels/toss: aimed spin through openWheel (CONTRACT-A sec 4, SPEC sec 7). */
import { openWheel } from '../wheel-view.js';
import { dialLook, tokProps, TOKVAL } from './shared.js';

/** The pending outcome VM -> result copy. value > 0 = won the toss; 0 = No boost, +1 Spoke. Pure. */
export function describeToss(p) {
  const v = +(p && (p.boostPct != null ? p.boostPct : p.value)) || 0;
  return v > 0
    ? { big: '', line: 'You won the toss +' + v + '%.', chip: '', say: 'Landed on plus ' + v + ' percent. You won the toss, plus ' + v + ' percent for your team.', gold: v >= 5 }
    : { big: '', line: 'No boost. You get +1 Spoke.', chip: '', say: 'Landed on No boost. You get plus 1 Spoke.' };
}

/** Toss: an aimed spin. get() -> vm.wm.toss; onSpin(stop) dispatches TossSpin with the stop record. */
export function spinToss({ get, look, dispatch, onCollect }) {
  const t = get();
  return openWheel({
    wheelId: 'toss', ring: get().ring, spinKey: get().spinKey, J: 1.2, stored: get().stored, wobKey: get().wobKey,
    title: 'The toss', cardHtml: '<p class="dr-hint">You win: a team boost of 0% to 5%. Aim at gold +5%. The tick shows the slice under the pointer now.</p>',
    look: dialLook(look), pending: t.pending,
    ...tokProps(get, dispatch, 'toss', 'Toss'), tokVal: TOKVAL.toss, tokText: (p) => { const v = +(p && (p.boostPct != null ? p.boostPct : p.value)) || 0; return v > 0 ? 'Landed on +' + v + '%' : 'Landed on No boost'; },
    onSpin: (stop) => dispatch('TossSpin', { stop: { sliceId: stop.sliceId, stopT: stop.stopT, cycle: stop.cycle, tInCycle: stop.tInCycle, respin: stop.respin, t: stop.t, phi: stop.phi, e: stop.e } }),
    getPending: () => get().pending,
    describe: describeToss,
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
