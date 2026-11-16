// Z2: HypeSpin (owner T3). Old commands.js case body.
import { canMdSpin, mdSpin, stopOf } from '../wmstore.js';

const normStop = (a) => { const o = a && a.stop && typeof a.stop === 'object' ? a.stop : a; if (!o || typeof o.sliceId !== 'number') return null; const r = {}; for (const k of ['sliceId', 'stopT', 'cycle', 'tInCycle', 'respin', 'e', 't', 'phi']) if (o[k] !== undefined) r[k] = o[k]; return r; };

export const hypeSpin = (s, a) => (canMdSpin(s, 'hype') ? mdSpin(s, 'hype', normStop(a) || stopOf(a), s.clubs[0].six) : s);
