// Job sheet view model + opener (coach weekly). vm for jobSheetHtml: { coachName, rows:[{job, ok, why, xp, effect}], focusJob, note2slot }.
import { legalJobs, jobOf } from '../core/coach-jobs.js';
import { coachList } from '../core/training.js';
import { XP_NETS, XP_MATCH, XP_STUDY, XP_SCOUT, SCOUT_NAMES_PER_JOB } from '../data/coach-weekly.js';
import { jobSheetHtml } from './job-sheet.js';

const XP = { nets: XP_NETS, match: XP_MATCH, study: XP_STUDY, scout: XP_SCOUT };
const EFFECT = {
  nets: 'Run the nets: +' + XP_NETS + ' XP',
  match: 'Match coach: +' + XP_MATCH + ' XP',
  study: 'Study tape: +' + XP_STUDY + ' XP at EndWeek',
  scout: 'Scout: +' + XP_SCOUT + ' XP and ' + SCOUT_NAMES_PER_JOB + ' scout name',
};

export function jobSheetVM(s, coachId) {
  const c = coachList(s).find((x) => x.id === coachId);
  if (!c) return null;
  const rows = legalJobs(s, coachId).map((r) => ({ job: r.job, ok: r.ok, why: r.why, xp: XP[r.job], effect: EFFECT[r.job] }));
  const free = rows.filter((r) => r.job === 'study' || r.job === 'scout').every((r) => r.ok);
  const matchRow = rows.find((r) => r.job === 'match');
  return { coachName: c.name || c.id, coachId, rows, focusJob: jobOf(s, coachId), note2slot: !!(free && matchRow && matchRow.ok) };
}

/** Sheet opener for app.js SHEETS (state:true: vm is the whole state, arg names the coach). */
export function openJob(s, dispatch, open, arg) {
  const coachId = arg && typeof arg === 'object' ? (arg.coachId != null ? arg.coachId : arg.coach != null ? arg.coach : arg.id) : arg;
  const vm = jobSheetVM(s, coachId); if (!vm) return null;
  return import('./sheet.js').then(({ openSheet }) => {
    const close = openSheet('Coach job', jobSheetHtml(vm), { returnFocus: '[data-cw="job"]' });
    const body = document.querySelector('.c-sheet__body');
    if (body) body.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-cw]'); if (!b) return;
      if (b.dataset.cw === 'setjob') { dispatch('SetJob', { coachId, job: b.dataset.job }); close(); }
      else if (b.dataset.cw === 'close') close();
    });
    return close;
  });
}
