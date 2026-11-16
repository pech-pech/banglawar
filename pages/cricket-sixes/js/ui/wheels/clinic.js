// @ts-check
/* wheels/clinic: the Clinic wheel screen (coach-weekly SPEC s6, s8; CONTRACT-B s5; CONTRACT-A s3-s7). Owner T6.
   Built on T1's openWheel. T1's engine is injected (deps), so this file loads and tests without it.
   No auto-stop, no Auto, no reduced-motion path: the wheel always spins until STOP. */
import { wheelWobble, wobbleKey } from '../../core/wheel-wobble.js';
import { recordStop, storedStop } from '../../core/wheel-stops.js';
import { CLINIC_SLICES, CLINIC_SLICE_ORDER, CLINIC_WHEEL_ID, clinicRing } from '../../data/clinic.js';

const EFFECT = { S: 'Plus 5% nets boost', M: 'Plus 10% nets boost', L: 'Plus 20% nets boost', JP: 'One extra nets roll' };
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
/** Default deps: T1's wobble and stop store, plus the wheel screen (imported lazily: it touches the DOM). */
export async function loadClinicDeps() {
  const v = await import('../wheel-view.js');
  if (typeof v.openWheel !== 'function') throw new Error('openWheel missing in js/ui/wheel-view.js');
  return { openWheel: v.openWheel, wheelWobble, wobbleKey, recordStop, storedStop };
}
/**
 * Open the Clinic wheel. Returns close() (or a Promise of it when deps is omitted and loaded lazily).
 * ctx = { state (fn -> save), spinKey ('weekKey:coachId'), slot, playerId, coachId, dispatch(type, payload), onCollect, onClose?, look?, J?, steady?, wobKey? }
 * deps = { openWheel, wheelWobble, wobbleKey?, recordStop, storedStop }
 */
export function openClinicWheel(ctx, deps) {
  if (!deps) return loadClinicDeps().then((d) => openClinicWheel(ctx, d));
  const s0 = ctx.state ? ctx.state() : {};
  const stored = deps.storedStop ? deps.storedStop(s0, CLINIC_WHEEL_ID, ctx.spinKey) : null;
  const J = ctx.J != null ? ctx.J : 1.2, steady = ctx.steady != null ? ctx.steady : 1;
  const wobKey = ctx.wobKey || (deps.wobbleKey ? deps.wobbleKey(s0, CLINIC_WHEEL_ID, Number.isInteger(ctx.slot) ? ctx.slot : 0, 0) : `clinic|${ctx.spinKey}`);
  let landed = stored && stored.stops && stored.stops[stored.kept | 0] ? clinicPending(stored.stops[stored.kept | 0]) : null;
  // T1's wheel screen owns the live region (role=status, aria-live=polite, [data-live]): it reads describe().say once at the result, never while the wheel turns (SPEC s6).
  // T1's result box already says "Landed on <slice>" (chip) and its live region reads it: the host line is only the effect, so nothing is said twice.
  const describe = (p) => { const t = EFFECT[p.kind] || '', k = p.kind; return { big: t, chip: '', say: t + '.', gold: k === 'JP' }; };
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = (list, id) => { try { const a = (Array.isArray(list) ? list : []).find((x) => x && x.id === id); return a && a.name ? String(a.name) : ''; } catch (_) { return ''; } };
  const coachN = nameOf(s0.coaches, ctx.coachId), plN = nameOf(s0.squad, ctx.playerId) || nameOf(s0.players, ctx.playerId); // T8 V2 #5: the top card was an empty bar
  const cardHtml = '<p class="dr-hint">' + (coachN && plN ? esc(coachN) + ' coaches ' + esc(plN) + '. Spin for the Clinic prize.' : 'Spin for the Clinic prize.') + '</p>';
  const close = deps.openWheel({
    wheelId: CLINIC_WHEEL_ID, spinKey: ctx.spinKey, ring: clinicRing(), J, wobKey,
    title: 'Clinic', cardHtml, plainResult: true, look: ctx.look,
    ...(stored ? { stored } : {}),
    pending: landed, getPending: () => landed, describe,
    onSpin: (stop) => {
      // CONTRACT-A s3/s7: the engine's stop already carries the wobble (e) and the post-wobble sliceId. Applied once, by the engine.
      landed = clinicPending(stop);
      ctx.dispatch('ClinicSpin', { slot: ctx.slot, coachId: ctx.coachId, playerId: ctx.playerId, spinKey: ctx.spinKey, stop });
    },
    onCollect: () => { if (ctx.onCollect) ctx.onCollect(landed); },
    onClose: () => { if (ctx.onClose) ctx.onClose(); },
  });
  return close;
}
