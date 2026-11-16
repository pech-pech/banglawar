// Z2: FinalsSpin (owner T4). Old commands.js case body.
import { canFinalsSpin, finalsSpin as wmFinalsSpin } from '../wmstore.js';

export const finalsSpin = (s) => (canFinalsSpin(s) ? wmFinalsSpin(s) : s);
