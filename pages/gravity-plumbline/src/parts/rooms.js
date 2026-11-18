// rooms.js - Plumbline: seeded RNG + 3 hardcoded rooms (336x500, border walls 12 px included).
// Node-loadable, no DOM. Seed only picks per-room x-mirror and crusher phase.
//
// Geometry notes: G 1500, cap 700, bob box 22 (half 11), flip keeps velocity.
// A ledge with top at T puts a grounded bob at y = T - 11. Fly lines use that y.
// Solutions below are written for the UNMIRRORED layout; when a room is mirrored swap
// left<->right (gravity dir 1<->3) and x -> 336 - x. Times are seconds from first input.
//
// ROOM 1  "Arc Carry" (teach: flip mid-fall bends a carried speed into an arc)
//   Start on left pillar (40,109). Pit with floor spikes below the gap; spikes on the right
//   wall at y 80-120 sit on the lazy line (flip right and hold).
//   Solution (2 flips, ~1.0 s): t=0.00 swipe RIGHT (free, grounded) -> bob sweeps over the gap;
//   t=0.31..0.46 swipe DOWN (costs 1 charge; before bob x~185) -> arc lands on the right block
//   around x 265-313. If landing is past the exit, swipe LEFT (free) to slide back through it.
//   Too late = right-wall spikes; never flipping right = pit spikes.
//
// ROOM 2  "Charge Banking" (teach: landing refills charges; crumble ledge; Dive-tap gate)
//   Start on top-left ledge (40,79). Wall spikes at y 40-90 on the right wall.
//   Solution (3 flips + 1 dive, ~3 s): t=0 swipe RIGHT (free); t=0.31..0.45 swipe DOWN
//   (1 charge) -> land on the crumble ledge (right, y 200, charges refill to 2, it breaks 0.35 s
//   after landing and below it are floor spikes). Immediately (<0.3 s) swipe LEFT (free) -> bob
//   flies along the 26 px tall corridor and stops on the plug at its end (x 111). Swipe DOWN (free,
//   grounded): bob rests on the one-way gate floor (needs 120 px/s down; corridor is too short
//   to build it). TAP = Dive (+250) -> bob drops through the gate, lands x~111 on the safe left
//   part of the lower floor (spikes start x 124). Swipe LEFT (free) -> slide into the exit.
//
// ROOM 3  "Rhythm Press" (teach: crusher rhythm + Late Flip)
//   Start on the left ledge (40,119). A press plate (ay, amp 50, period 2.4 s, phase from seed)
//   closes onto a slab; the 22 px bob fits the gap only while sin(phase_t) < ~0.56 (about 60 %).
//   Solution (3 flips, ~4-5 s incl. waiting): watch the plate, swipe RIGHT (free) so bob
//   passes x~117..223 (arrives ~0.33 s after the swipe) while the gap is open; bob hits right wall (grounded);
//   swipe DOWN (free) and fall along the wall at ~600-700 px/s; at about y 190-230 (t~0.3 s after
//   the wall) swipe LEFT (1 charge) to carry speed sideways, then LATE swipe DOWN (1 charge) in the
//   last ~0.2 s so the arc drops onto the left shelf (top y 430, x 12-220). Floor spikes x 220-324
//   punish the lazy straight fall. Swipe LEFT (free) to slide into the exit.

const PL = (globalThis.PL = globalThis.PL || {});

PL.mulberry32 = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

(function () {
  const W = 336, H = 500, B = 12;
  const border = () => [[0, 0, W, B], [0, H - B, W, B], [0, 0, B, H], [W - B, 0, B, H]];

  function base() {
    return [
      { // Room 1: Arc Carry
        name: 'Arc Carry',
        teach: 'Flip mid-fall: your speed turns into a sideways arc over the gap.',
        start: { x: 40, y: 109, g: 2 },
        walls: border().concat([[12, 120, 90, 368], [190, 200, 134, 288]]),
        spikes: [{ r: [102, 472, 88, 16] }, { r: [312, 80, 12, 40] }],
        crumbles: [], gates: [], crushers: [],
        exit: { x: 285, y: 189 },
      },
      { // Room 2: Charge Banking
        name: 'Charge Banking',
        teach: 'Landing refills charges. The ledge crumbles; tap to Dive through the gate.',
        start: { x: 40, y: 79, g: 2 },
        walls: border().concat([
          [12, 90, 90, 14],      // start ledge
          [100, 150, 126, 24],   // corridor ceiling
          [88, 150, 12, 58],     // corridor end plug
          [12, 450, 312, 38],    // lower floor
        ]),
        spikes: [{ r: [312, 40, 12, 50] }, { r: [124, 436, 200, 14] }],
        crumbles: [[226, 200, 98, 12]],
        gates: [{ r: [100, 200, 126, 8], dir: 2 }],
        crushers: [],
        exit: { x: 40, y: 439 },
      },
      { // Room 3: Rhythm Press
        name: 'Rhythm Press',
        teach: 'Slip through when the press opens, then flip late to land tight.',
        start: { x: 40, y: 119, g: 2 },
        walls: border().concat([
          [12, 130, 100, 14],    // start ledge
          [128, 132, 84, 14],    // press slab
          [12, 430, 208, 58],    // landing shelf
        ]),
        spikes: [{ r: [220, 472, 104, 16] }],
        crumbles: [], gates: [],
        crushers: [{ r: [128, 60, 84, 20], ax: 0, ay: 1, amp: 50, phase: 0 }],
        exit: { x: 50, y: 419 },
      },
    ];
  }

  const mr = (r) => [W - r[0] - r[2], r[1], r[2], r[3]];

  function mirror(room) {
    room.start.x = W - room.start.x;
    room.exit.x = W - room.exit.x;
    room.walls = room.walls.map(mr);
    room.spikes = room.spikes.map((s) => ({ r: mr(s.r) }));
    room.crumbles = room.crumbles.map(mr);
    room.gates = room.gates.map((g) => ({ r: mr(g.r), dir: g.dir === 1 ? 3 : g.dir === 3 ? 1 : g.dir }));
    room.crushers = room.crushers.map((c) => ({ r: mr(c.r), ax: c.ax, ay: c.ay, amp: c.amp, phase: c.phase }));
    room.mirrored = true;
  }

  PL.buildRooms = function (seed) {
    const rng = PL.mulberry32(seed);
    const rooms = base();
    for (const room of rooms) {
      const m = rng() < 0.5;
      const phase = rng() * Math.PI * 2;
      room.w = W; room.h = H;
      room.mirrored = false;
      for (const c of room.crushers) c.phase = phase;
      if (m) mirror(room);
    }
    return rooms;
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PL;
