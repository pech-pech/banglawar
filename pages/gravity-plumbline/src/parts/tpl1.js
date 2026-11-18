// tpl1.js - Plumbline slice templates t04..t12 (9 rooms, tiers 1-3). Node-loadable, no DOM, rng only for crusher phases.
// Physics: G 1500, cap 700, bob box 22 (half 11), flip keeps velocity, 12 px border walls. Layouts are UNMIRRORED
// (mirrorRoom swaps left/right). A ledge with top T rests the bob at y = T - 11. "free" = flip/dive while grounded.
// Every solution below is machine-checked by src/test/tpl1-solve.js (<=5 inputs, <=25 s, both mirrors, 3 seeds).
//
// t04 "Long Carry" (tier 1, Arc Carry): start left pillar. Pit spikes below the gap, spikes on the right wall.
//     RIGHT (free) -> sweep over the gap; DOWN (1 charge) before the pit edge so the arc lands on the right block.
// t09 "Gate Floor" (tier 1, Gate Punch): start resting ON a full-width one-way gate (needs 120 px/s down).
//     TAP (dive, free) punches through; then RIGHT / DOWN flips bend the long drop away from the floor spikes.
// t05 "Rise and Bend" (tier 2, Arc Carry upward): spiked ceiling and a spiked pillar. UP (free), RIGHT mid-rise
//     (hump over the pillar), DOWN (brake before the ceiling spikes) onto the right block.
// t06 "Late Flip" (tier 2): hug the left wall (start g=left). DOWN (free) slides; a spiked baffle shuts the lane
//     to the right, so go RIGHT below it and DOWN late, so the arc lands past the floor spikes and before the wall spikes.
// t07 "Stepping Stones" (tier 2, Charge Banking): leg 1 costs both charges (RIGHT free, UP, DOWN over a spiked pillar)
//     and lands on the stone (refill); leg 2 (RIGHT free, DOWN) needs a charge you only have because you landed.
// t10 "Side Gate" (tier 2, Gate Punch sideways): wall of one-way gate. RIGHT (free) rests on the gate, TAP punches
//     through, DOWN (free) rides the far wall to the exit.
// t08 "Corner Whip" (tier 3): start hugging left wall. DOWN (free) slides in wall contact (WALL_RIDE refills a charge
//     after 0.25 s, a bonus; not required); whip RIGHT under the spiked baffle and DOWN late onto the safe floor.
//     Solvable WITHOUT wall-ride (verified); with it the window is more forgiving.
// t11 "Double Press" (tier 3, crusher rhythm): RIGHT (free) flies the corridor between two slabs and two plates;
//     wait for both plates to be open at your arrival, then DOWN (free) along the wall onto the floor exit.
// t12 "Sweeper" (tier 3, crusher + late flip): hug the left wall, wait for the sliding slab to clear the lane,
//     DOWN (free), then RIGHT and late DOWN to clear the floor spikes.

const PL = (globalThis.PL = globalThis.PL || {});
PL.TEMPLATES = PL.TEMPLATES || [];

(function () {
  const W = 336, H = 500, B = 12;
  const border = () => [[0, 0, W, B], [0, H - B, W, B], [0, 0, B, H], [W - B, 0, B, H]];
  const room = (name, teach, start, walls, o) => ({
    name, teach, w: W, h: H, start,
    walls: border().concat(walls),
    spikes: (o.spikes || []).map((r) => ({ r })),
    crumbles: o.crumbles || [], gates: o.gates || [], crushers: o.crushers || [],
    exit: o.exit, mirrored: false,
  });
  const phase = (rng) => rng() * Math.PI * 2;

  PL.TEMPLATES.push({
    id: 't04', tier: 1, teach: 'Arc Carry: flip right, then flip down mid-air to bend over the pit.',
    make() {
      return room('Long Carry', 'Flip right, then flip down mid-air: your speed bends into an arc.',
        { x: 40, y: 109, g: 2 },
        [[12, 120, 80, 368], [232, 260, 92, 228]],
        { spikes: [[92, 472, 140, 16], [312, 60, 12, 150]], exit: { x: 280, y: 249 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't09', tier: 1, teach: 'Gate Punch: tap to dive through the one-way gate, then bend the drop.',
    make() {
      return room('Gate Floor', 'You rest on a one-way gate. Tap to dive through it.',
        { x: 40, y: 89, g: 2 }, [],
        { gates: [{ r: [12, 100, 312, 8], dir: 2 }], spikes: [[12, 472, 170, 16]], exit: { x: 290, y: 477 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't05', tier: 2, teach: 'Arc Carry upward: rise, bend over the pillar, brake before the ceiling.',
    make() {
      return room('Rise and Bend', 'Flip up, bend right over the pillar, flip down before the spikes.',
        { x: 40, y: 477, g: 2 },
        [[150, 200, 40, 288], [230, 250, 94, 238]],
        { spikes: [[12, 12, 312, 14], [150, 184, 40, 16]], exit: { x: 280, y: 239 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't06', tier: 2, teach: 'Late Flip: carry the fall sideways under the baffle, flip down late.',
    make() {
      return room('Late Flip', 'Slide the wall, turn under the baffle, flip down late.',
        { x: 23, y: 60, g: 3 },
        [],
        { spikes: [[12, 472, 100, 16], [112, 300, 212, 14], [312, 314, 12, 150]], exit: { x: 290, y: 477 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't07', tier: 2, teach: 'Charge Banking: land on the stone to refill, then spend charges again.',
    make() {
      return room('Stepping Stones', 'Land on the stone to refill your charges before the next leg.',
        { x: 40, y: 289, g: 2 },
        [[12, 300, 80, 188], [150, 200, 24, 288], [210, 320, 40, 168], [290, 380, 34, 108]],
        { spikes: [[92, 472, 58, 16], [174, 472, 36, 16], [250, 472, 40, 16], [150, 184, 24, 16], [312, 200, 12, 170]],
          exit: { x: 300, y: 369 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't10', tier: 2, teach: 'Gate Punch sideways: rest on the gate, tap to dive through.',
    make() {
      return room('Side Gate', 'Fly into the gate, tap to punch through, ride the far wall down.',
        { x: 138, y: 189, g: 2 },
        [[12, 200, 138, 288], [150, 312, 10, 176]],
        { gates: [{ r: [150, 12, 10, 300], dir: 1 }], spikes: [[160, 472, 130, 16]], exit: { x: 305, y: 477 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't08', tier: 3, teach: 'Corner Whip: slide the wall, whip under the baffle, flip down late.',
    make() {
      return room('Corner Whip', 'Slide the wall, whip right under the baffle, flip down late.',
        { x: 23, y: 40, g: 3 },
        [[100, 150, 224, 14]],
        { spikes: [[100, 164, 224, 12], [12, 472, 170, 16]], exit: { x: 290, y: 477 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't11', tier: 3, teach: 'Crusher rhythm: pass two presses while both are open.',
    make(rng) {
      const p = phase(rng);
      return room('Double Press', 'Two presses. Fly through when both are open.',
        { x: 40, y: 119, g: 2 },
        [[12, 130, 70, 358], [100, 132, 70, 14], [200, 132, 70, 14]],
        { spikes: [[82, 472, 200, 16]],
          crushers: [{ r: [100, 60, 70, 20], ax: 0, ay: 1, amp: 50, phase: p },
                     { r: [200, 60, 70, 20], ax: 0, ay: 1, amp: 50, phase: p + Math.PI * 0.5 }],
          exit: { x: 305, y: 477 } });
    },
  });

  PL.TEMPLATES.push({
    id: 't12', tier: 3, teach: 'Crusher rhythm + Late Flip: wait for the sweeper, then flip late.',
    make(rng) {
      const p = phase(rng);
      return room('Sweeper', 'Wait for the sweeper to clear the lane, then flip late.',
        { x: 23, y: 60, g: 3 },
        [],
        { spikes: [[12, 472, 170, 16]],
          crushers: [{ r: [60, 260, 200, 16], ax: 1, ay: 0, amp: 56, phase: p }],
          exit: { x: 290, y: 477 } });
    },
  });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PL;
