// @ts-check
/* wheels/hype: split from wm-spins.js (w2 wheel glue). */
import { openDial } from '../dial-view.js';
import { dialLook, tokProps, TOKVAL, stopOf } from './shared.js';
const HYPE_WORD = { low: 'Quiet crowd', med: 'Good crowd', high: 'Big crowd', nuts: 'Wild crowd' };

/** Hype: the aimable half dial. get() -> vm.wm.hype; dispatch('HypeSpin', {stop}). */
export function spinHype({ get, look, dispatch, onCollect, oppName }) {
  const h = get();
  return openDial({
    mode: 'aim', title: 'Crowd today', sub: oppName || '', cardHtml: '<p class="dr-hint">Stop the needle on gold for a wild crowd.' + ' The tick shows where it will land.' + '</p>', slices: h.slices /* fixdial V3 */, look: dialLook(look),
    ...tokProps(get, dispatch, 'hype', 'Hype'), tokVal: TOKVAL.hype, tokText: (p) => HYPE_WORD[p.level || 'low'] + ' +' + p.pts + '%',
    pending: h.pending, onSpin: (stop) => dispatch('HypeSpin', stopOf(stop)), getPending: () => get().pending,
    describe: (p) => { const lv = p.level || 'low'; return { big: HYPE_WORD[lv], chip: '+' + p.pts + '%', say: HYPE_WORD[lv] + ', plus ' + p.pts + ' percent for your team.', gold: lv === 'nuts' }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
