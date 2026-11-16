// Z2: HypeSpin (owner T3). Old commands.js case body.
import { canMdSpin, mdSpin, stopOf } from '../wmstore.js';

export const hypeSpin = (s, a) => (canMdSpin(s, 'hype') ? mdSpin(s, 'hype', stopOf(a), s.clubs[0].six) : s);
