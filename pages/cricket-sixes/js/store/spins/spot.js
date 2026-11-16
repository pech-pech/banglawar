// Z2: Spin, the Spotlight wheel (owner T2). Old commands.js spin(). ctx: clone, TRAIN_RNG, WM_RNG (commands.js helpers).
import { FLAGS } from '../../data/flags.js';
import { planOf, netsPreview, coachStepInUse, wheelSlices, spinResult } from '../../core/training.js';
import { recordStop, spinKeyOf } from '../../core/wheel-stops.js';
import { metaWheel, recordSpin, afterResult } from '../../core/wheelmeta.js';

const medianOf = (w) => { const a = (w && w.slices ? w.slices : []).filter((x) => typeof x === 'number').sort((x, y) => x - y); return a.length ? a[a.length >> 1] : undefined; };

/** Tap the wheel (SPIN then STOP): the result waits in training.pending until Run nets. One spin a week, and only with a spotlight player. */
export function spotSpin(s, p, ctx) {
  const { clone, TRAIN_RNG, WM_RNG } = ctx;
  const T = s.training, plan = planOf(s);
  const two = !!(p && p.slot === 2), key = two ? 'pending2' : 'pending'; // slot 2 = the Twin Spotlight Pass wheel
  if (!(two ? plan.spotlight2Id : plan.spotlightId) || (T[key] && T[key].week === T.week) || (T.nets && T.nets.week === T.week)) return s;
  if (FLAGS.wheelMeta && netsPreview(s).skippedIds.includes(two ? plan.spotlight2Id : plan.spotlightId)) return s; // 02 section 7: a Spotlight player who cannot gain gets no wheel, so no tally and no Spokes
  const meta = FLAGS.wheelMeta, base = wheelSlices(plan.effort, coachStepInUse(s)), wheel = metaWheel(base, 'spot', s); // flag off: the input wheel (Dev otherMult adds phys)
  const careful = p && p.careful && typeof p.careful === 'object' ? p.careful : !!(p && p.careful);
  let result = spinResult(TRAIN_RNG(s, two ? 'spin2' : 'spin'), wheel, careful);
  let n = clone(s);
  if (meta) { // wheel meta: the tree's after-effects, then the tally. The meta wheel is stored so a reload shows the same wheel.
    const a = afterResult(n, 'spot', result, WM_RNG(s, two ? 'spot2' : 'spot'), { wheel }); n = clone(a.s); result = a.result;
    n = clone(recordSpin(n, 'spot', { count: 1 })); // each Twin spin counts 1: the pass is 2 spins in all
  }
  const sk = spinKeyOf(s, 'spot', { slot: two ? 2 : 1, playerId: two ? plan.spotlight2Id : plan.spotlightId }), st = p && p.stop && typeof p.stop === 'object' ? p.stop : {};
  recordStop(n, 'spot', sk, { stopT: st.stopT, cycle: st.cycle, tInCycle: st.tInCycle, sliceId: result.index, value: result.gain, auto: !!(st.auto || (p && p.auto)), respin: 0 }, { median: medianOf(wheel) }); // persisted at STOP only (CONTRACT-A s6)
  n.training[key] = { week: T.week, careful, wheel, result };
  return n;
}
