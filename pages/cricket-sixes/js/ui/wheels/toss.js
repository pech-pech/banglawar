// @ts-check
/* wheels/toss: aimed spin through openWheel (CONTRACT-A sec 4, SPEC sec 7). */
import { openWheel } from '../wheel-view.js';
import { dialLook, tokProps, TOKVAL } from './shared.js';

/** The pending outcome VM -> result copy. value > 0 = won the toss; 0 = rival won, Good sport +1 Spoke. Pure. */
export function describeToss(p) {
  const v = +(p && (p.boostPct != null ? p.boostPct : p.value)) || 0;
  return v > 0
    ? { big: 'You won the toss', chip: '+' + v + '%', say: 'You won the toss, plus ' + v + ' percent for your team.', gold: v >= 5 }
    : { big: 'Rival won the toss', line: 'Good sport: +1 Spoke', chip: '', say: 'Rival won the toss. Good sport, plus 1 Spoke.' };
}

/** Toss: an aimed spin. get() -> vm.wm.toss; onSpin(stop) dispatches TossSpin with the stop record. */
export function spinToss({ get, look, dispatch, onCollect }) {
  const t = get();
  return openWheel({
    wheelId: 'toss', ring: get().ring, spinKey: get().spinKey, J: 1.2,
    title: 'The toss', cardHtml: '<p class="dr-hint">Toss the coin.</p><p class="dr-hint">The tick shows where it will land.</p>',
    look: dialLook(look), pending: t.pending,
    ...tokProps(get, dispatch, 'toss', 'Toss'), tokVal: TOKVAL.toss, tokText: (p) => describeToss(p).big + (describeToss(p).chip ? ' ' + describeToss(p).chip : ''),
    onSpin: (stop) => dispatch('TossSpin', { stop: { sliceId: stop.sliceId, stopT: stop.stopT, cycle: stop.cycle, tInCycle: stop.tInCycle, respin: stop.respin, t: stop.t, phi: stop.phi, e: stop.e } }),
    getPending: () => get().pending,
    describe: describeToss,
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
