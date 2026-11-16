// Z2: PepSpin (owner T3). Old commands.js case body; ctx.withSix = the commands.js saved-six helper.
import { canMdSpin, mdSpin } from '../wmstore.js';

export const pepSpin = (s, a, ctx) => (canMdSpin(s, 'pep') ? mdSpin(ctx.withSix(s), 'pep', false) : s);
