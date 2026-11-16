// T6 Clinic store (CONTRACT-B s5, SPEC s6): ClinicPick, ClinicLater, ClinicSpin. Registered from js/install.js (INSTALL:T6 fence).
// STOP = ONE synchronous write: recordStop('clinic', spinKey, rec) + clinic.spins entry + Spoke + boost + stats. Reload after STOP = same slice, no second Spoke.
import { registerSpin } from '../spin-registry.js';
import { FLAGS } from '../../data/flags.js';
import { CLINIC_SLICE_ORDER, CLINIC_SLICES, CLINIC_PCT, CLINIC_SPOKES_PER_SPIN, CLINIC_WHEEL_ID } from '../../data/clinic.js';
import { emptyWheelMeta, weekKey } from '../../core/save-migrate.js';
import { coachList } from '../../core/training.js';
import { recordStop } from '../../core/wheel-stops.js';
import * as CORE from '../../core/clinic.js'; // namespace: canClinic / clinicSpinKey are being written by another helper

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const int = (x, d = 0) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Math.trunc(Number(x)) : d);
const MEDIAN = 10; // median of the ten rim values (5 5 5 5 10 10 20 20 20 30)

// T1's recordStop (js/core/wheel-stops.js): recordStop(n, 'clinic', spinKey, rec, {median}). Tests may inject a fake with setClinicDeps.
let deps = { recordStop, canClinic: null, clinicSpinKey: null, pickable: null };
/** Test seam: inject {recordStop, canClinic, clinicSpinKey, pickable}; a null member goes back to the real one. */
export function setClinicDeps(d) { deps = { ...deps, ...d }; if (!deps.recordStop) deps.recordStop = recordStop; }
const pickableFn = () => deps.pickable || CORE.pickable;
/** Spins happen in a training-week stage only (L3): between EndWeek and newSeason the stage is 'week'/'end'. States without a stage (unit fixtures) pass. */
const stageOk = (s) => typeof s.stage !== 'string' || s.stage === 'train';
const canClinicFn = () => deps.canClinic || CORE.canClinic;
const keyFn = () => deps.clinicSpinKey || CORE.clinicSpinKey || ((s, coachId) => `${weekKey(s)}:${coachId}`);

/** The clinic block for this week (reset when stale). Mutates draft n. */
function block(n) {
  const wk = weekKey(n);
  if (!isObj(n.clinic) || n.clinic.week !== wk) n.clinic = { ...(isObj(n.clinic) ? n.clinic : {}), week: wk, netsDone: !!(isObj(n.clinic) && n.clinic.week === wk && n.clinic.netsDone), pending: null, spins: [], boost: {} };
  const c = n.clinic;
  if (!Array.isArray(c.spins)) c.spins = [];
  if (!isObj(c.boost)) c.boost = {};
  if (!isObj(c.stats)) c.stats = {};
  const t = c.stats;
  if (!isObj(t.slices)) t.slices = {};
  for (const k of ['S', 'M', 'L', 'JP']) t.slices[k] = int(t.slices[k]);
  for (const k of ['boostedGain', 'jackpotRuns', 'pointsGross', 'netGain']) t[k] = Number.isFinite(t[k]) ? t[k] : 0;
  return c;
}

/** ClinicPick {slot, coachId, playerId}: the pick is kept in clinic.pending (survives reload). Refused when canClinic says no. */
export function clinicPick(s, a) {
  if (!s || !isObj(a) || a.coachId == null || a.playerId == null) return s;
  if (!stageOk(s)) return s;
  const slot = (Array.isArray(s.coaches) ? coachList(s) : []).findIndex((c) => c && c.id === a.coachId); // never trust the client's slot (C1)
  if (slot < 0) return s;
  const cc = canClinicFn();
  if (typeof cc === 'function') { const r = cc(s, a.coachId); if (!r || !r.ok) return s; }
  const pk = pickableFn()(s);
  if (!Array.isArray(pk) || !pk.some((p) => p.playerId === a.playerId && p.ok)) return s; // only a playerId the pick list offers as ok (M2)
  const n = structuredClone(s);
  const c = block(n);
  if (c.spins.some((x) => x && x.coachId === a.coachId)) return s; // one spin a coach a week
  c.pending = { slot, coachId: a.coachId, playerId: a.playerId };
  return n;
}

/** ClinicLater: leave the spin ready, clear the pick. */
export function clinicLater(s, a) {
  if (!s || !isObj(s.clinic) || !s.clinic.pending) return s;
  if (isObj(a) && a.coachId != null && s.clinic.pending.coachId !== a.coachId) return s; // only that coach's pick (L6)
  const n = structuredClone(s);
  n.clinic.pending = null;
  return n;
}

/** ClinicSpin {stop:{stopT, cycle, tInCycle, sliceId, value, auto?}}: STOP. One synchronous write, paid once. */
export function clinicSpin(s, a) {
  if (!s || !isObj(a) || !isObj(a.stop)) return s;
  if (!stageOk(s)) return s;
  const p = isObj(s.clinic) ? s.clinic.pending : null;
  if (!isObj(p) || p.coachId == null || p.playerId == null) return s;
  const slot = int(p.slot, -1); // stored by clinicPick, derived there
  const key = keyFn()(s, p.coachId);
  if (isObj(s.clinic) && Array.isArray(s.clinic.spins) && s.clinic.spins.some((x) => x && x.spinKey === key)) return s; // reload after STOP: no second Spoke
  const cc = canClinicFn();
  if (typeof cc === 'function') { const r = cc(s, p.coachId); if (!r || !r.ok) return s; }
  const sliceId = int(a.stop.sliceId, -1);
  const kind = CLINIC_SLICE_ORDER[sliceId];
  if (!kind) return s;
  const st = a.stop;
  const rec = { stopT: int(st.stopT), cycle: int(st.cycle, 1), tInCycle: Number.isFinite(st.tInCycle) ? st.tInCycle : 0, sliceId, value: CLINIC_SLICES[kind].value }; // value from the slice, not the client (M6)
  const n = structuredClone(s);
  const c = block(n);
  if (!key) return s;
  deps.recordStop(n, CLINIC_WHEEL_ID, key, rec, { median: MEDIAN });
  let spokePaid = false;
  if (FLAGS.wheelMeta && n.season) { const m = (n.wheelMeta ||= emptyWheelMeta()); m.spokes = int(m.spokes) + CLINIC_SPOKES_PER_SPIN; spokePaid = true; }
  c.spins.push({ slot, coachId: p.coachId, playerId: p.playerId, spinKey: key, spokePaid });
  const b = (c.boost[p.playerId] = isObj(c.boost[p.playerId]) ? c.boost[p.playerId] : { pcts: [], extraRun: false });
  if (!Array.isArray(b.pcts)) b.pcts = [];
  if (kind === 'JP') b.extraRun = true; else b.pcts.push(CLINIC_PCT[kind]);
  c.stats.slices[kind] += 1;
  c.pending = null;
  return n;
}

registerSpin('ClinicPick', clinicPick);
registerSpin('ClinicLater', clinicLater);
registerSpin('ClinicSpin', clinicSpin);
