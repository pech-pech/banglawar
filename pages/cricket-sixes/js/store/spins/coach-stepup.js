// T5: StepUpSeen {coachId}. Consumes one pending step-up card. Immutable; unknown coach or nothing pending returns the same state.
import { registerSpin } from '../spin-registry.js';
import { consumeStepUp } from '../../ui/stepup-card.js';

export function stepUpSeenSpin(s, p) {
  if (!p || typeof p !== 'object' || !p.coachId || !s || !Array.isArray(s.coaches)) return s;
  const i = s.coaches.findIndex((c) => c && c.id === p.coachId);
  if (i < 0 || !(s.coaches[i].stepUpPending > 0)) return s;
  const coaches = s.coaches.map((c) => ({ ...c }));
  consumeStepUp({ coaches }, p.coachId);
  return { ...s, coaches };
}
registerSpin('StepUpSeen', stepUpSeenSpin);
