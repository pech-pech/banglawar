// @ts-check
// Dial (Hype) and Reel (Find) aim numbers, reveal-only timings and reveal wheel slices (wheel meta w2).
// Source: 2026-11-13-wheel-meta/team-numbers/03-DIAL-REEL-AIM.md section 2 + sim/dial_reel_aim_sim.py;
// slices: team-addexp/data/uses.json (toss, pep, scout_list, finals) + WHEEL-META.md. Plain data, no logic.

export const DR = {
  source: '03-DIAL-REEL-AIM.md s2 + dial_reel_aim_sim.py; uses.json',
  STOP_FROM: 0.8, COAST: 3.0, WIN_MID: 2.0, // STOP live from, auto STOP, centre of the careful window (s)
  SD_GOOD: 0.07, SD_AVG: 0.11,              // human timing models (s); SD_AVG is the careful synthetic tap
  DIAL: { L: 10, V: 16, G: 0.5, J_PER_NUTS: 1.2, ORDER: ['med', 'low', 'nuts', 'high'], C0: 9.5 }, // C0 = old hype wheel width total (tree widths are in those units)
  REEL: { C: 12, V: 7, G: 0.5, J: 0.8, CELLS: 4, ORDER: ['coach', 'coins', 'player'], RARE_K: 1.8, GOLD_K: 1.2, EXTRA_W: 0.75, FIND_UNIT: 10 },
  EXTRA_W: 0.75, // Extra Gold slice width vs the main gold
  UNIT: { hype: 1, toss: 1, pep: 0.5, find: 10, scout: 1, finals: 10 }, // Booster / Floor unit per wheel
  HYPE_PTS: { low: 2, med: 4, high: 6, nuts: 10 },
  // Reveal-only spins. Seconds of spin (contract) then a hold with the result highlighted (read once).
  REVEAL: {
    toss: { widget: 'reel', seconds: 2.5, flips: 3 },
    pep: { widget: 'reel', seconds: 2.5 },
    scout: { widget: 'dial', seconds: 3, turns: 2 },
    finals: { widget: 'dial', seconds: 3, turns: 2 },
    HOLD: 0.3, UP: 0.2 / 1.5, CRUISE: 0.6 / 1.5, EASE: 0.7 / 1.5, // phase shares of the spin time (03 section 5)
    PEP_STEP0: 0.06, PEP_STEP_GROW: 0.2, PEP_STEP_REF: 10,         // d_i = 0.06 + 0.20 (i/10)^2, rescaled to the spin time
  },
  /** Reveal wheels in pointer order. fx keys: tossb/pep/steps/coins/tp/fans/medal/spoke/extraName. low = lowest slice (Kind Floor / floors), rare = widened by Voice-type nodes, gold = Widener / Extra Gold. */
  WHEELS: {
    toss: [
      { id: 'won', label: 'Won toss +5%', w: 1, rare: true, fx: { tossb: 5 } },
      { id: 'sport', label: 'Good sport +1 Spoke', w: 1, low: true, fx: { spoke: 1 } },
      { id: 'won', label: 'Won toss +5%', w: 1, rare: true, fx: { tossb: 5 } },
      { id: 'sport', label: 'Good sport +1 Spoke', w: 1, low: true, fx: { spoke: 1 } },
      { id: 'won', label: 'Won toss +5%', w: 1, rare: true, fx: { tossb: 5 } },
      { id: 'sport', label: 'Good sport +1 Spoke', w: 1, low: true, fx: { spoke: 1 } },
    ],
    pep: [
      { id: 'double', label: 'Double pep (2 players)', w: 0.35, gold: true, rare: true, fx: { pep: 2 } },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: 'slot' + n, label: 'Slot ' + n + ' +5%', w: 1, slot: n, fx: { pep: 1 } })),
    ],
    scout: [
      { id: 'top2', label: 'Top name +2 steps', w: 0.35, gold: true, rare: true, fx: { steps: 2 } },
      { id: 'top1', label: 'Top name +1 step', w: 0.9, fx: { steps: 1 } },
      { id: 'extra', label: 'Extra name', w: 1, low: true, fx: { steps: 0, extraName: 1 } },
      { id: 'top1', label: 'Top name +1 step', w: 1, fx: { steps: 1 } },
      { id: 'extra', label: 'Extra name', w: 1, low: true, fx: { steps: 0, extraName: 1 } },
      { id: 'top1', label: 'Top name +1 step', w: 1, fx: { steps: 1 } },
      { id: 'extra', label: 'Extra name', w: 1, low: true, fx: { steps: 0, extraName: 1 } },
      { id: 'top1', label: 'Top name +1 step', w: 1, fx: { steps: 1 } },
      { id: 'extra', label: 'Extra name', w: 1, low: true, fx: { steps: 0, extraName: 1 } },
      { id: 'top1', label: 'Top name +1 step', w: 0.9, fx: { steps: 1 } },
    ],
    finals: [
      { id: 'medal', label: '+1 Medal', w: 0.35, gold: true, rare: true, fx: { medal: 1 } },
      { id: 'coins30', label: '30 Coins', w: 1, fx: { coins: 30 } },
      { id: 'tp20', label: '20 TP', w: 1, fx: { tp: 20 } },
      { id: 'fans20', label: '20 Fans', w: 1, fx: { fans: 20 } },
      { id: 'coins20', label: '20 Coins', w: 1.1, fx: { coins: 20 } },
      { id: 'tp15', label: '15 TP', w: 1.1, fx: { tp: 15 } },
      { id: 'fans15', label: '15 Fans', w: 1.1, fx: { fans: 15 } },
      { id: 'coins20', label: '20 Coins', w: 1.1, fx: { coins: 20 } },
      { id: 'tp20', label: '20 TP', w: 1, fx: { tp: 20 } },
    ],
  },
  // Second Gold on Finals pays 40 Coins and never a Medal (WHEEL-META capstone rule); on Scout / Pep it copies the gold slice.
  FINALS_SECOND: { id: 'coins40', label: '40 Coins', fx: { coins: 40 } },
};
