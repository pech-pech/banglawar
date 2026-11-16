// T5: SetJob {coachId, job}. Illegal job or unknown coach leaves the state unchanged (same object).
import { registerSpin } from '../spin-registry.js';
import { setJob } from '../../core/coach-jobs.js';

export function setJobSpin(s, p) {
  if (!p || typeof p !== 'object' || !p.coachId || !p.job) return s;
  return setJob(s, p.coachId, p.job);
}
registerSpin('SetJob', setJobSpin);
