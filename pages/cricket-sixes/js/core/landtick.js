// Landing tick (2026-11-15 report p13 s1): pure choice of what the aim wheels draw. No rolls, no physics, no state.
// Every aim spin (Spotlight, Course, Find, Hype) shows a plain tick at the predicted no-wobble landing; Aim Guide makes it a gold wedge.
// Reveal wheels (Toss, Pep, Scout, Finals) keep their old feel-only behaviour (gold guide mark late in the reveal, nothing otherwise).
export const TICK = Object.freeze({
  PLAIN_PX: 2, // plain tick core width (css px), plus a 1 px outline each side
  WEDGE_TIP_PX: 0.8, // Aim Guide wedge half-width at the inner tip (css px); rim end is wider
});

/** What a spin draws for the landing tick: 'none' | 'plain' | 'wedge' | 'feel' (reveal wheel with Aim Guide: the old late gold mark).
 * @param {{reveal?:boolean, guide?:boolean, reduced?:boolean}} p */
export function tickKind(p) {
  if (p.reduced) return 'none'; // reduced motion: no spin, so no tick
  if (p.reveal) return p.guide ? 'feel' : 'none'; // reveal wheels are feel only
  return p.guide ? 'wedge' : 'plain';
}

/** Report JSON stamp: the free landing tick is in this build. */
export const REPORT_TICK = 1;
