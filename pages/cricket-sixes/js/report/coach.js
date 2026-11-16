// B5.2 COACHES report lines (SPEC s11 bullets 1, 2, 6). Ids/numbers only, never names. n/a when a value is absent.
// Call installCoachReport() once at boot; it returns the unregister function (no registration at import).
import { addReportLines } from './lines.js';

const na = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : 'n/a');

function jobsOf(arg) {
  const s = arg && arg.report === undefined && arg.state ? arg.state : arg; // accepts state or env.state
  const r = s && s.report;
  return r && r.jobs && typeof r.jobs === 'object' ? r.jobs : null;
}

export function coachReportLines(arg) {
  const j = jobsOf(arg) || {};
  const xp = j.xp && typeof j.xp === 'object' ? j.xp : {};
  const cut = typeof j.courseCut === 'number' ? (j.courseCut > 0 ? 'yes' : 'no') : (j.courseCut === true ? 'yes' : j.courseCut === false ? 'no' : 'n/a');
  return [
    `Jobs: nets ${na(j.nets)}, match ${na(j.match)} (wins ${na(j.wins)}), study ${na(j.study)}, scout ${na(j.scout)}, away ${na(j.away)}.`,
    `XP gained: nets ${na(xp.nets)}, match ${na(xp.match)}, study ${na(xp.study)}, scout ${na(xp.scout)}. Steps from XP ${na(j.stepsXp)}, from course ${na(j.stepsCourse)}. Course cut by cap ${cut}.`,
    `Scout names added from job: ${na(j.scoutNames)} (list / extra).`,
  ];
}

export function installCoachReport() { return addReportLines('COACHES', coachReportLines); }
