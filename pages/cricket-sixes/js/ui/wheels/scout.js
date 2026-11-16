// @ts-check
/* wheels/scout: split from wm-spins.js (w2 wheel glue). */
import { openWheel } from '../wheel-view.js';
import { dialLook, tokProps } from './shared.js';
import { scoutWheelOpts } from './scout-opts.js';

/** wa1: the words for a Scout result. A Lucky Lift can add a step to an Extra name, so both can show. */
export function scoutWords(p) {
  const st = p.steps | 0, stw = '+' + st + (st === 1 ? ' step' : ' steps');
  if (p.extra && st > 0) return { big: 'One more name, top name ' + stw, say: 'The scouts found one more name, and the best name goes up ' + stw.slice(1) + '.', short: 'one more name, ' + stw };
  if (p.extra) return { big: 'One more name on the list', say: 'The scouts found one more name.', short: 'one more name' };
  return { big: 'Top name ' + stw, say: 'The best name on the list goes up ' + stw.slice(1) + '.', short: stw };
}
/** Scout: the 10-card wheel (openWheel via scoutWheelOpts). get() -> vm.spin (scoutSpinVM); STOP dispatches ScoutSpin {stop} (onSpin in scoutWheelOpts).
    vm.stored opens on its result and never re-spins. No auto-stop, skip or reduced-motion path. wobKey: vm.wobKey (host) else a key from the spin key (same key, same wobble after a reload). */
export function spinScout({ get, look, dispatch, onCollect, onClose }) {
  const s = get();
  const wobKey = s.wobKey != null ? s.wobKey : 'wob|scout|' + s.spinKey + '|0';
  return openWheel(scoutWheelOpts(s, { get, dispatch, onCollect, look, dialLook, tokProps, wobKey, onClose }));
}
