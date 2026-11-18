// rooms.js - Plumbline: seeded RNG + 3 hardcoded rooms (336x500, border walls 12 px included).
// Node-loadable, no DOM. Seed only picks per-room x-mirror and crusher phase.
//
// Geometry notes: G 1500, cap 700, bob box 22 (half 11), flip keeps velocity.
// A ledge with top at T puts a grounded bob at y = T - 11. Fly lines use that y.
// Solutions below are written for the UNMIRRORED layout; when a room is mirrored swap
// left<->right (gravity dir 1<->3) and x -> 336 - x. Times are seconds from first input.
//
// ROOM 1  "Arc Carry" (teach: flip mid-fall bends a carried speed into an arc)
//   Start on left pillar (40,109). Pit (x 102-215) with floor spikes; right-wall spikes y 80-120 sit
//   on the lazy line (flip right and hold, or flip right + tick-1 Dive: both die on the wall spikes).
//   Solution (2 flips, ~1.0 s): t=0.00 swipe RIGHT (free, grounded); t~0.31..0.45 swipe DOWN
//   (1 charge, before bob x~185) -> arc lands on the right block (top y 200, x 215-324) near
//   x 270-313. If past the exit, swipe LEFT (free) to slide back through it.
//
// ROOM 2  "Charge Banking" (teach: landing refills charges; crumble ledge; Dive-tap gate)
//   Start on top-left ledge (40,79). The left column (x 12-100) is solid to the floor and a wall
//   under the ledge's right end seals the chamber, so the gate floor is the only way in.
//   Solution (3 flips + 1 dive, ~3 s): t=0 swipe RIGHT (free); t~0.31..0.45 swipe DOWN (1 charge)
//   -> land on the crumble ledge (right, y 200, x 256-324; charges refill; it breaks 0.35 s after landing and
//   below it are floor spikes). Within 0.3 s swipe LEFT (free) -> bob flies the 26 px corridor and
//   stops at its end (x 111). Swipe DOWN (free, grounded): bob rests on the one-way gate floor (needs
//   120 px/s down; the corridor is too short to build it, max ~110). TAP = Dive (+250) -> falls into the
//   sealed chamber (x 100-226). Swipe RIGHT (free) -> slide into the exit (160,439).
//
// ROOM 3  "Rhythm Press" (teach: crusher rhythm + Late Flip)
//   Start on left ledge (40,119). A press plate (x 128-212, 60 tall, ay amp 50, period 2.4 s, phase from
//   seed) sits across the flight line y~119: it is clear only while its bottom is above y 108 or its top
//   below y 130 (about 40 % of the cycle, two windows), so the swipe-right moment differs per seed.
//   Solution (3 flips, ~3-5 s incl. waiting): time the first swipe RIGHT (free) so the bob arrives ~0.33 s
//   later while the plate is clear, hits the right wall (grounded); swipe DOWN (free) and fall along the
//   wall at 600-700 px/s; ~0.3 s later swipe LEFT (1 charge) to carry the speed sideways, then LATE swipe
//   DOWN (1 charge) in the last ~0.2 s so the arc drops onto the left shelf (top y 430, x 12-220).
//   Floor spikes x 220-324 punish the straight fall. Swipe LEFT (free) to slide into the exit.

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
        walls: border().concat([[12, 120, 90, 368], [215, 200, 109, 288]]),
        spikes: [{ r: [102, 472, 113, 16] }, { r: [312, 80, 12, 40] }],
        crumbles: [], gates: [], crushers: [],
        exit: { x: 285, y: 189 },
      },
      { // Room 2: Charge Banking
        name: 'Charge Banking',
        teach: 'Landing refills charges. The ledge crumbles; tap to Dive through the gate.',
        start: { x: 40, y: 79, g: 2 },
        walls: border().concat([
          [12, 90, 88, 360],     // start ledge + sealed left column (x 12-100, down to floor)
          [100, 150, 126, 24],   // corridor ceiling
          [226, 200, 30, 12],    // solid strip between ledge and gate (no fall-in at speed from the broken ledge)
          [226, 212, 12, 238],   // chamber right wall: gate is the ONLY way into the chamber
          [12, 450, 312, 38],    // lower floor
        ]),
        spikes: [{ r: [312, 40, 12, 50] }, { r: [238, 436, 86, 14] }],
        crumbles: [[256, 200, 68, 12]],
        gates: [{ r: [100, 200, 126, 8], dir: 2 }],
        crushers: [],
        exit: { x: 160, y: 439 },
      },
      { // Room 3: Rhythm Press
        name: 'Rhythm Press',
        teach: 'Slip through when the press opens, then flip late to land tight.',
        start: { x: 40, y: 119, g: 2 },
        walls: border().concat([
          [12, 130, 100, 14],    // start ledge
          [12, 430, 208, 58],    // landing shelf
        ]),
        spikes: [{ r: [220, 472, 104, 16] }],
        crumbles: [], gates: [],
        crushers: [{ r: [128, 85, 84, 60], ax: 0, ay: 1, amp: 50, phase: 0 }],
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

  // --- slice additions ---
  PL.mirrorRoom = function (room) {
    const r = JSON.parse(JSON.stringify(room));
    r.start.x = W - r.start.x;
    if (r.start.g === 1) r.start.g = 3; else if (r.start.g === 3) r.start.g = 1;
    r.exit.x = W - r.exit.x;
    r.walls = r.walls.map(mr);
    r.spikes = r.spikes.map((s) => ({ r: mr(s.r) }));
    r.crumbles = r.crumbles.map(mr);
    r.gates = r.gates.map((g) => ({ r: mr(g.r), dir: g.dir === 1 ? 3 : g.dir === 3 ? 1 : g.dir }));
    r.crushers = r.crushers.map((c) => ({ r: mr(c.r), ax: c.ax, ay: c.ay, amp: c.amp, phase: 0 - c.phase }));
    r.mirrored = true;
    return r;
  };

  PL.TEMPLATES = PL.TEMPLATES || [];
  [[1, 1], [2, 2], [3, 2]].forEach(([n, tier], i) => {
    const id = 't0' + n;
    PL.TEMPLATES.push({
      id, tier, teach: base()[i].teach,
      make(rng) {
        const room = base()[i];
        const phase = rng() * Math.PI * 2;
        room.w = W; room.h = H; room.mirrored = false;
        for (const c of room.crushers) c.phase = phase;
        return room;
      },
    });
  });

  PL.buildShaft = function (seed, n) {
    if (n === undefined) n = 7;
    const rng = PL.mulberry32(seed);
    const all = PL.TEMPLATES.slice();
    for (let i = all.length - 1; i > 0; i--) { // Fisher-Yates
      const j = Math.floor(rng() * (i + 1));
      const t = all[i]; all[i] = all[j]; all[j] = t;
    }
    const pick = all.slice(0, Math.min(n, all.length))
      .map((t, idx) => ({ t, idx }))
      .sort((a, b) => a.t.tier - b.t.tier || a.idx - b.idx)
      .map((o) => o.t);
    return pick.map((t) => {
      let room = t.make(rng);
      if (rng() < 0.5) room = PL.mirrorRoom(room);
      room.templateId = t.id;
      return room;
    });
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PL;
