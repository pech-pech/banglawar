/* wm-spins: the call sites' glue for the wheel meta dials and reels (w2) -- now a barrel; each wheel lives in wheels/<name>.js, shared helpers in wheels/shared.js.
   Nothing here rolls anything: onSpin only dispatches; the result is read back from the fresh view model (get()) and the view animates to it. */
export { dialLook, revealT, tokProps, TOKVAL } from './wheels/shared.js';
export { spinHype } from './wheels/hype.js';
export { spinToss } from './wheels/toss.js';
export { spinPep, pepSlices } from './wheels/pep.js';
export { spinFind, findLine } from './wheels/find.js';
export { spinScout, scoutWords } from './wheels/scout.js';
export { spinFinals, finalsWords, finalsPairLine, finalsTokLine } from './wheels/finals.js';
