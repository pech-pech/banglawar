// @ts-check
/* wheels/clinic: the Clinic wheel screen (coach-weekly SPEC s6, s8; CONTRACT-B s5; CONTRACT-A s3-s7). Owner T6.
   Built on T1's openWheel. T1's engine is injected (deps), so this file loads and tests without it.
   No auto-stop, no Auto, no reduced-motion path: the wheel always spins until STOP. */
import { CLINIC_SLICES, CLINIC_SLICE_ORDER, CLINIC_WHEEL_ID, clinicRing } from '../../data/clinic.js';

const KIND_WORDS = { S: 'Small, +5%', M: 'Medium, +10%', L: 'Large, +20%', JP: 'Jackpot, one extra nets roll' };

/** Median of the ring's slice values (careful = value strictly above it). Pure. */
export function clinicMedian() {
  const v = clinicRing().map((r) => r.value).sort((a, b) => a - b), n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}
/** Result text for a ring index, written once into the aria-live region and shown as the visible result. Pure. */
export function clinicResultText(sliceId) {
  const k = CLINIC_SLICE_ORDER[sliceId]; if (!k) return '';
  return 'Landed: ' + KIND_WORDS[k] + '.';
}
/** VM piece for describe(): {sliceId, kind, value} from a stop or stored record, or null. */
export function clinicPending(stopLike) {
  if (!stopLike || !Number.isInteger(stopLike.sliceId)) return null;
  const kind = CLINIC_SLICE_ORDER[stopLike.sliceId]; if (!kind) return null;
  return { sliceId: stopLike.sliceId, kind, value: CLINIC_SLICES[kind].value };
}
/** The StopRec for recordStop from an engine stop. auto is always false (no auto-stop exists). Pure. */
export function clinicStopRec(stop) {
  const p = clinicPending(stop) || { value: 0 };
  return { stopT: Math.round(stop.stopT || 0), cycle: Math.max(1, stop.cycle | 0 || 1), tInCycle: +stop.tInCycle || 0, sliceId: stop.sliceId, value: p.value, auto: false, respin: 0 };
}
/** Store-side helper: the ClinicSpin handler calls this on the draft inside the same dispatch as STOP. */
export function applyClinicStop(n, spinKey, stop, deps) {
  deps.recordStop(n, CLINIC_WHEEL_ID, spinKey, clinicStopRec(stop), { median: clinicMedian() });
  return n;
}
/** Lazy default engine. Throws until T1's modules exist. */
export async function loadClinicDeps() {
  try {
    const [v, w, st] = await Promise.all([import('../wheel-view.js'), import('../../core/wheel-wobble.js'), import('../../core/wheel-stops.js')]);
    if (!v.openWheel || !w.wheelWobble || !st.recordStop || !st.storedStop) throw new Error('missing export');
    return { openWheel: v.openWheel, wheelWobble: w.wheelWobble, wobbleKey: w.wobbleKey, recordStop: st.recordStop, storedStop: st.storedStop };
  } catch (e) { throw new Error('T1 engine missing: openWheel / wheelWobble / recordStop / storedStop (' + (e && e.message) + ')'); }
}
/**
 * Open the Clinic wheel. Returns close() (or a Promise of it when deps is omitted and loaded lazily).
 * ctx = { state (fn -> save), spinKey ('weekKey:coachId'), slot, playerId, coachId, dispatch(type, payload), onCollect, onClose?, look?, J?, steady?, wobKey?, host? (element for the live region) }
 * deps = { openWheel, wheelWobble, wobbleKey?, recordStop, storedStop }
 */
export function openClinicWheel(ctx, deps) {
  if (!deps) return loadClinicDeps().then((d) => openClinicWheel(ctx, d));
  const s0 = ctx.state ? ctx.state() : {};
  const stored = deps.storedStop ? deps.storedStop(s0, CLINIC_WHEEL_ID, ctx.spinKey) : null;
  const J = ctx.J != null ? ctx.J : 1.2, steady = ctx.steady != null ? ctx.steady : 1;
  const wobKey = ctx.wobKey || (deps.wobbleKey ? deps.wobbleKey(s0, CLINIC_WHEEL_ID, Number.isInteger(ctx.slot) ? ctx.slot : 0, 0) : `clinic|${ctx.spinKey}`);
  let landed = stored && stored.stops && stored.stops[stored.kept | 0] ? clinicPending(stored.stops[stored.kept | 0]) : null;
  let live = null;
  const say = (text) => {
    if (typeof document === 'undefined') return;
    if (live) live.textContent = text;
  };
  // The empty live region exists from open, so a later text change is announced (SPEC s6: nothing is read while the wheel turns).
  if (typeof document !== 'undefined') { live = document.createElement('div'); live.className = 'cn-live sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status'); (ctx.host || document.body).appendChild(live); }
  let accepted = !!landed;
  const announce = () => { if (accepted && landed) say(clinicResultText(landed.sliceId)); };
  const describe = (p) => { const t = clinicResultText(p.sliceId), k = p.kind; return { big: t, chip: '', say: t, gold: k === 'JP' }; };
  const close = deps.openWheel({
    wheelId: CLINIC_WHEEL_ID, spinKey: ctx.spinKey, ring: clinicRing(), J, wobKey,
    title: 'Clinic', plainResult: true, cardHtml: '<p class="cn-hint">Tap SPIN, then STOP. The tick shows roughly where it lands.</p>', look: ctx.look,
    ...(stored ? { stored } : {}),
    pending: landed, getPending: () => landed, describe,
    onSpin: (stop) => {
      // CONTRACT-A s3/s7: the engine's stop already carries the wobble (e) and the post-wobble sliceId. Applied once, by the engine.
      landed = clinicPending(stop);
      ctx.dispatch('ClinicSpin', { slot: ctx.slot, coachId: ctx.coachId, playerId: ctx.playerId, spinKey: ctx.spinKey, stop });
      accepted = !(deps.storedStop && ctx.state) || !!deps.storedStop(ctx.state(), CLINIC_WHEEL_ID, ctx.spinKey); // only a stored spin is announced
    },
    onLand: announce,
    onCollect: () => { announce(); if (ctx.onCollect) ctx.onCollect(landed); },
    onClose: () => { if (live && live.remove) live.remove(); if (ctx.onClose) ctx.onClose(); },
  });
  announce();
  return close;
}
