// Z2: TossSpin (owner T3). Old commands.js case body.
import { canMdSpin, mdSpin } from '../wmstore.js';

const normStop = (a) => { const o = a && a.stop && typeof a.stop === 'object' ? a.stop : a; if (!o || typeof o.sliceId !== 'number') return null; const r = {}; for (const k of ['sliceId', 'stopT', 'cycle', 'tInCycle', 'respin', 'e', 't', 'phi']) if (o[k] !== undefined) r[k] = o[k]; return r; };

export const tossSpin = (s, a) => (canMdSpin(s, 'toss') ? mdSpin(s, 'toss', normStop(a) || false, s.clubs[0].six) : s);
