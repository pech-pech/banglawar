// Z2: PepSpin (owner T3). Old commands.js case body; ctx.withSix = the commands.js saved-six helper.
import { canMdSpin, mdSpin } from '../wmstore.js';

const normStop = (a) => { const o = a && a.stop && typeof a.stop === 'object' ? a.stop : a; if (!o || typeof o.sliceId !== 'number') return null; const r = {}; for (const k of ['sliceId', 'stopT', 'cycle', 'tInCycle', 'respin', 'e', 't', 'phi']) if (o[k] !== undefined) r[k] = o[k]; return r; };

export const pepSpin = (s, a, ctx) => (canMdSpin(s, 'pep') ? mdSpin(ctx.withSix(s), 'pep', normStop(a) || false) : s);
