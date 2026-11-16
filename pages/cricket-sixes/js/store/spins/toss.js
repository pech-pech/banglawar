// Z2: TossSpin (owner T3). Old commands.js case body.
import { canMdSpin, mdSpin } from '../wmstore.js';

export const tossSpin = (s) => (canMdSpin(s, 'toss') ? mdSpin(s, 'toss', false, s.clubs[0].six) : s);
