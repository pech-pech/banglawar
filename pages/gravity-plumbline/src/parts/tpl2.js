// tpl2.js - Plumbline templates t13..t20 (tiers 2-3, two techniques per room). Node-loadable, no DOM.
// Same physics notes as rooms.js: G 1500, cap 700, bob box 22, flip keeps velocity, border walls 12 px.
// A ledge top T puts a grounded bob at y = T-11. Solutions are for the UNMIRRORED layout (mirror swaps L/R).
// Every template was brute-forced by src/test/tpl2-solve.js (3 seeds x mirror, <=5 inputs, <=25 s).
//
// t13 Press & Drop (crusher + Late Flip). Ledge left, press plate over a slab. R (free) when the plate is open ->
//     bob hits right wall; D (free) fall along wall; L mid-fall (1 charge) carries speed sideways; LATE D (1 charge)
//     lands on the left shelf; L (free) into exit. Solver: R, D@0.3s, L@0.9s, up@1.6s = 4 inputs, ~1.6 s.
// t14 Crumble Punch (crumble + gate punch). R, D (flip at x~130) lands on the crumble ledge (refill); at once L (free)
//     flies left under the start ledge along the gate's top; D rests on the one-way gate; TAP Dive pushes through
//     to the sealed chamber where the exit sits. Solver found a 5-input variant (R, L, D, dive, up) ~1.8 s.
// t15 Corner Whip (arc carry). R, D (1 charge) drops on the right of the divider, whip L (1 charge) under the divider
//     (window y 311..369) and into the left shelf. Solver: R, D@0.26s, L@0.72s = 3 inputs, 1.5 s.
//     Right wall hug + ride refill (gravity right/left along a floor, see 'ride' events) makes a 4th flip possible.
// t16 Twin Presses (two crushers + arc). Tunnel with two press plates 0.5 rad apart: R when both are open, hit the
//     right wall, D free, down to a ledge; L (free) along it, D (free) to the shelf with the exit (4 inputs, 2.9 s).
// t17 Gate Chute (gate punch + Late Flip). Low ceiling over the one-way gate floor. Solver: R, up, D, L (4 inputs, 1.45 s).
//     Intended: R, D onto the gate, tap Dive through, then L early and LATE D to the safe left shelf.
// t18 Crumble Stairs (crumble chain + charge banking). Solver: up, R, D = 3 inputs, 1.0 s (hop crumble 1 -> crumble 2
//     where the exit is). Linger >0.35 s and you fall onto the spikes. Right-wall spikes on the lazy line.
// t19 Piston Fall (two sliding crushers + Late Flip). R, D, then L in a window between the sliding bars; floor spikes
//     right. Solver: R, D, L = 3 inputs, 1.5-2.3 s (bar phase from seed decides the wait).
// t20 Spike Slalom (arc carry). R, then D@0.26s arcs over the spike column onto the right block, exit there (2 inputs).

const PL = (globalThis.PL = globalThis.PL || {});
PL.TEMPLATES = PL.TEMPLATES || [];
(function () {
  const W = 336, H = 500, B = 12;
  const border = () => [[0, 0, W, B], [0, H - B, W, B], [0, 0, B, H], [W - B, 0, B, H]];
  const sp = (...rs) => rs.map((r) => ({ r }));
  function mk(o) {
    return Object.assign({ w: W, h: H, mirrored: false, crumbles: [], gates: [], crushers: [], spikes: [] }, o);
  }
  function add(id, tier, teach, make) { PL.TEMPLATES.push({ id, tier, teach, make }); }

  add('t13', 3, 'Slip under the press, ride the wall, then flip late to land tight.', (rng) => {
    const phase = rng() * Math.PI * 2;
    return mk({
      name: 'Press & Drop', teach: 'Slip under the press, ride the wall, then flip late to land tight.',
      start: { x: 40, y: 139, g: 2 },
      walls: border().concat([[12, 150, 100, 14], [128, 152, 84, 14], [12, 430, 208, 58]]),
      spikes: sp([220, 472, 104, 16], [312, 290, 12, 60]),
      crushers: [{ r: [128, 80, 84, 20], ax: 0, ay: 1, amp: 50, phase }],
      exit: { x: 50, y: 419 },
    });
  });

  add('t14', 3, 'Land on the crumbling ledge, then Dive-tap through the gate.', () => mk({
    name: 'Crumble Punch', teach: 'Land on the crumbling ledge, then Dive-tap through the gate.',
    start: { x: 40, y: 59, g: 2 },
    walls: border().concat([[12, 70, 112, 14], [124, 130, 12, 358], [12, 440, 112, 48]]),
    spikes: sp([312, 40, 12, 70], [136, 472, 188, 16]),
    crumbles: [[176, 130, 148, 12]],
    gates: [{ r: [12, 130, 112, 12], dir: 2 }],
    exit: { x: 30, y: 429 },
  }));

  add('t15', 3, 'Drop past the divider, then whip back under it.', () => mk({
    name: 'Under the Divider', teach: 'Drop past the divider, then whip back under it.',
    start: { x: 40, y: 89, g: 2 },
    walls: border().concat([[12, 100, 90, 14], [102, 100, 40, 200], [12, 380, 150, 108]]),
    spikes: sp([312, 230, 12, 50], [162, 472, 162, 16], [12, 230, 12, 90]),
    exit: { x: 60, y: 369 },
  }));

  add('t16', 3, 'Two presses, one window: pass, then step down the ledges.', (rng) => {
    const phase = rng() * Math.PI * 2;
    return mk({
      name: 'Twin Presses', teach: 'Two presses, one window: pass, then step down the ledges.',
      start: { x: 40, y: 139, g: 2 },
      walls: border().concat([[12, 150, 70, 14], [82, 152, 170, 14], [212, 300, 112, 14], [12, 440, 100, 48]]),
      spikes: sp([112, 472, 212, 16]),
      crushers: [
        { r: [100, 80, 50, 20], ax: 0, ay: 1, amp: 50, phase },
        { r: [190, 80, 50, 20], ax: 0, ay: 1, amp: 50, phase: phase + 0.5 },
      ],
      exit: { x: 30, y: 429 },
    });
  });

  add('t17', 3, 'Rest on the one-way gate, Dive-tap through, flip late to land safe.', () => mk({
    name: 'Gate Chute', teach: 'Rest on the one-way gate, Dive-tap through, flip late to land safe.',
    start: { x: 40, y: 79, g: 2 },
    walls: border().concat([[12, 90, 90, 14], [102, 12, 222, 50], [12, 430, 160, 58]]),
    spikes: sp([172, 472, 152, 16]),
    gates: [{ r: [102, 90, 222, 12], dir: 2 }],
    exit: { x: 36, y: 419 },
  }));

  add('t18', 1, 'Hop the crumbling ledges: each landing refills your flips.', () => mk({
    name: 'Crumble Stairs', teach: 'Hop the crumbling ledges: each landing refills your flips.',
    start: { x: 40, y: 89, g: 2 },
    walls: border().concat([[12, 100, 60, 14]]),
    spikes: sp([312, 60, 12, 60], [12, 472, 312, 16]),
    crumbles: [[140, 150, 50, 12], [210, 230, 114, 12]],
    exit: { x: 290, y: 219 },
  }));

  add('t19', 3, 'Time the fall past the sliding bars, then flip late.', (rng) => {
    const phase = rng() * Math.PI * 2;
    return mk({
      name: 'Piston Fall', teach: 'Time the fall past the sliding bars, then flip late.',
      start: { x: 40, y: 89, g: 2 },
      walls: border().concat([[12, 100, 100, 14], [12, 430, 212, 58]]),
      spikes: sp([224, 472, 100, 16]),
      crushers: [
        { r: [150, 200, 150, 16], ax: 1, ay: 0, amp: 60, phase },
        { r: [150, 300, 150, 16], ax: 1, ay: 0, amp: 60, phase: phase + 1.6 },
      ],
      exit: { x: 36, y: 419 },
    });
  });

  add('t20', 1, 'Carry your speed over the spike column: flip down at the right moment.', () => mk({
    name: 'Spike Slalom', teach: 'Carry your speed over the spike column: flip down at the right moment.',
    start: { x: 40, y: 99, g: 2 },
    walls: border().concat([[12, 110, 70, 14], [240, 260, 84, 228]]),
    spikes: sp([312, 60, 12, 100], [160, 200, 16, 288], [82, 472, 78, 16]),
    exit: { x: 290, y: 249 },
  }));
})();

// Shaft metadata (rooms.js buildShaft reads it): family = adjacent rooms must differ; inputs = inputs on the loosest route
// (src/test/window-probe.js); rest = may fill the rest slot (<=3 inputs, no crusher); hard = may fill the hardest slot.
// Tiers after retier (REVIEW-MERGE row 2): t13, t17 -> 3; t18, t20 -> 1. Retired templates stay here for the record.
(function () {
  const M = {
    t04: { family: 'arc', inputs: 3, rest: true }, t09: { family: 'gate', inputs: 3 },
    t05: { family: 'arc', inputs: 4 }, t06: { family: 'wall', inputs: 3, rest: true }, t07: { family: 'bank', inputs: 4 },
    t10: { family: 'gate', inputs: 4 }, t08: { family: 'wall', inputs: 3 }, t11: { family: 'crusher', inputs: 2 },
    t12: { family: 'crusher', inputs: 3 },
    t13: { family: 'crusher', inputs: 5, hard: true }, t14: { family: 'crumble', inputs: 4, hard: true, retired: true }, // RETIRED: one fix attempt (ledge up 20, crumble wider) got window 8 but the jitter bot cleared only 60%
    t15: { family: 'wall', inputs: 4 }, t16: { family: 'crusher', inputs: 5, hard: true },
    t17: { family: 'gate', inputs: 5, hard: true }, t18: { family: 'crumble', inputs: 3, rest: true },
    t19: { family: 'crusher', inputs: 3, hard: true }, t20: { family: 'arc', inputs: 3, rest: true },
  };
  PL.TEMPLATES.forEach((t) => { if (M[t.id]) Object.assign(t, M[t.id]); });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PL;
