// Z2: FinalsSpin (owner T4). The payload may carry the view's STOP {sliceId, stopT, cycle, tInCycle, respin}: the result is decided at STOP; no payload = seeded random tap (Auto / leave).
import { canFinalsSpin, finalsSpin as wmFinalsSpin } from '../wmstore.js';

export const finalsSpin = (s, p) => (canFinalsSpin(s) ? wmFinalsSpin(s, p) : s);
