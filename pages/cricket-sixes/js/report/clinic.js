// T6 Clinic report lines (CONTRACT-B s7, SPEC s11). Section CLINIC. Ids only, n/a when not applicable.
import { addReportLines } from './lines.js';
import { CLINIC_SLICE_ORDER } from '../data/clinic.js';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (Number.isFinite(x) ? x : 0);
const NA = 'n/a';

export function clinicLines(s) {
  const c = s && isObj(s.clinic) ? s.clinic : {};
  const spins = Array.isArray(c.spins) ? c.spins.filter(isObj) : [];
  const w = s && isObj(s.wheels) ? s.wheels : {};
  const st = isObj(w.stats) && isObj(w.stats.clinic) ? w.stats.clinic : {};
  const stops = isObj(w.stops) && isObj(w.stops.clinic) ? w.stops.clinic : {};
  const taps = Array.isArray(st.taps) ? st.taps : [];
  const last = taps.length ? taps[taps.length - 1] : null;
  const n = num(st.n);
  const out = [];
  out.push(`Clinic: ${n} spun. Careful ${num(st.careful)} / early ${num(st.early)} / late ${num(st.late)}. Pulse at tap: ${last ? `cycle ${num(last.cycle)}, ${num(last.tInCycle).toFixed(1)} s` : NA}.`);
  const t = isObj(c.stats) ? c.stats : {};
  const sl = isObj(t.slices) ? t.slices : {};
  const boosted = num(t.boostedGain);
  const guide = isObj(s && s.wheelMeta) && isObj(s.wheelMeta.owned) && s.wheelMeta.owned.aim_guide ? 'on' : 'off';
  out.push(`Coach line, Clinic extras: slices S/M/L/J ${num(sl.S)}/${num(sl.M)}/${num(sl.L)}/${num(sl.JP)}, boosted gain +${boosted.toFixed(1)}, jackpot runs ${num(t.jackpotRuns)}. Aim Guide ${guide}.`);
  out.push(`Wheel points: gross ${num(t.pointsGross)}, net gain ${num(t.netGain)}.`);
  for (const sp of spins) {
    const r = isObj(stops[sp.spinKey]) ? stops[sp.spinKey] : null;
    const kind = r ? CLINIC_SLICE_ORDER[r.sliceId] || NA : NA;
    out.push(`Clinic spin: coach ${sp.coachId}, player ${sp.playerId}, slice ${kind}, stopT ${r ? num(r.stopT) : NA}, cycle ${r ? num(r.cycle) : NA}, tInCycle ${r ? num(r.tInCycle).toFixed(2) : NA}, Spokes ${sp.spokePaid ? 1 : 0}.`);
  }
  return out;
}

addReportLines('CLINIC', clinicLines);
