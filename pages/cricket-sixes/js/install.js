// Feature install point (S0 lead call 3a). Imported once by js/main.js, after the store modules load.
// T5 and T6 add their listener and command modules here, one import line each, inside their own fence only:
//   T5: js/store/spins/coach-job.js (registers SetJob) and its hook listeners.
//   T6: js/store/spins/clinic.js (registers ClinicSpin, ClinicPick, ClinicLater) and its hook listeners (netsOrder ...).
// Spin types registered here are dispatched by the default case of js/store/commands.js. Empty today: nothing changes.
/* INSTALL:T5 start */
import './store/spins/coach-job.js';
import { installCoachHooks } from './core/coach-hooks.js';
import { installCoachReport } from './report/coach.js';
installCoachHooks();
installCoachReport();
/* INSTALL:T5 end */
/* INSTALL:T6 start */
/* INSTALL:T6 end */
