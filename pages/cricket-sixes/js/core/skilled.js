// @ts-check
// The "skilled" call rules, shared by tools/sweep.mjs and the playtest report (fit with the skilled bot). Pure.
// Moved here verbatim from tools/sweep.mjs so the game and the sim cannot drift apart.

/** Best bowler: preview grades + in-phase bonus, tie-break on spd+bsk. s = bowl-stage state, vm = bowlVM(s). */
export function skilledBowler(s, vm) {
  let best = null, bs = -Infinity;
  for (const b of vm.bowlers.filter((x) => x.eligible)) {
    const p = s.me.players[b.i];
    const sc = b.previews.reduce((a, c) => a + c.g + (c.inPhase ? 1 : 0), 0) + (p.spd + p.bsk) / 1000;
    if (sc > bs) { bs = sc; best = b.i; }
  }
  return best;
}

/** Attacking field against a weak striker (bp+bs < 95), else defensive. s = bowl-stage state. */
export function skilledField(s) {
  const inn = s.inn1, st = s.rival.players[inn.crease[inn.strike]];
  return st.bp + st.bs < 95 ? 'A' : 'P';
}

/** Chase intent from the asking rate. s = chase-stage state, vm = chaseVM(s). */
export function skilledIntent(s, vm) {
  const inn = s.inn2;
  const rr = vm.need / Math.max(vm.ballsLeft, 1);
  if (rr > 1.65 || (inn.over >= 8 && inn.wk <= 2)) return 'A';
  return inn.wk >= 4 && rr < 1.2 ? 'D' : 'R';
}
