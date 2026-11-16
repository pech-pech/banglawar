// Z2: the spin part of PickActivity (owner T4): the Find reel decides the find, then the activity is picked on its own stream.
// The guard and the r9 M2 match-day clean-up stay in commands.js pickAct. ctx.baseSeed = the commands.js season base seed.
import { makeRng } from '../../core/rng.js';
import { pickActivity, roundKey } from '../../core/activities.js';
import { findForce, afterFind } from '../wmstore.js';

export function findSpin(s, p, ctx) {
  const force = findForce(s, p.id, p); // wheel meta: the Find reel decides the find (null with the flag off, on a repeat week or a rest)
  let n = pickActivity(s, p.id, makeRng(`${ctx.baseSeed(s)}|act|${roundKey(s)}|${s.salt}`), force);
  if (force && n !== s) n = afterFind(n, p.id, force);
  return n;
}
