// rooms.js - Plumbline: seeded RNG, the 3 tutorial rooms, templates t02/t03 and buildShaft (slot table).
// Node-loadable, no DOM. Rooms are 336x500 with 12 px border walls included.
//
// Geometry notes: G 1500, cap 700, bob box 22 (half 11), flip keeps velocity.
// A ledge with top at T puts a grounded bob at y = T - 11. Fly lines use that y.
// Solutions are written for the UNMIRRORED layout; mirrored rooms swap left<->right and x -> 336 - x.
//
// TUTORIALS (PL.buildRooms(seed) returns these 3, never mirrored, seed has no effect; never in shafts):
//   tut1 "Flip"      start (40,109) on a pillar, nothing else. RIGHT (free) flies to the wall, DOWN (free) drops to the
//                    exit. Two free flips, every window is huge, no spikes.
//   t01  "Arc Carry" (tutorial 2) flip mid-fall bends a carried speed into an arc over the pit: RIGHT (free), DOWN
//                    (1 charge) before bob x~185, land on the right block. Teaches "2 moves in the air".
//   tut3 "Dive Gate" rest on a full-width one-way gate; Dive (free on the ground) punches through and falls to the exit.
//
// SHAFT TEMPLATES in this file:
//   t02  "Charge Banking" (tier 2, family gate): RIGHT, DOWN (1 charge) onto the crumble ledge (refills); LEFT (free)
//        through the corridor; DOWN (free) on the gate; Dive; RIGHT into the exit.
//   t03  "Rhythm Press" (tier 2, family crusher, FIRST crusher a player meets, crusher alone): wait for the press to rise,
//        RIGHT (free) hits the right wall, DOWN (free) drops onto the safe stub, LEFT (free) flies over the shelf into the
//        exit. All free. Late Flip (LEFT mid-fall, DOWN late) stays as an optional faster line.

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
      { // Tutorial 1: Flip (flip alone, no hazards)
        name: 'Flip',
        teach: 'Flip right to fly across, then flip down to drop to the exit. On the ground flips are free.',
        start: { x: 40, y: 109, g: 2 },
        walls: border().concat([[12, 120, 90, 368]]),
        spikes: [], crumbles: [], gates: [], crushers: [],
        exit: { x: 300, y: 477 },
      },
      { // Tutorial 2 (t01): Arc Carry
        name: 'Arc Carry',
        teach: 'Flip mid-fall: your speed turns into a sideways arc. You have 2 moves in the air.',
        start: { x: 40, y: 109, g: 2 },
        walls: border().concat([[12, 120, 90, 368], [215, 200, 109, 288]]),
        spikes: [{ r: [102, 472, 113, 16] }, { r: [312, 80, 12, 40] }],
        crumbles: [], gates: [], crushers: [],
        exit: { x: 285, y: 189 },
      },
      { // Tutorial 3: Dive through the gate
        name: 'Dive Gate',
        teach: 'You rest on a one-way gate. On the ground Dive is free. In the air it uses a move.',
        start: { x: 168, y: 89, g: 2 },
        walls: border(),
        spikes: [], crumbles: [],
        gates: [{ r: [12, 100, 312, 12], dir: 2 }],
        crushers: [],
        exit: { x: 168, y: 477 },
      },
    ];
  }
  PL.tutorialRooms = base;

  const T2 = () => ({ // Charge Banking (shaft tier 2)
    name: 'Charge Banking',
    teach: 'Landing refills your moves. The ledge breaks 0.35 s after you land: ride the corridor, then drop through the gate.',
    start: { x: 40, y: 79, g: 2 },
    walls: border().concat([
      [12, 90, 88, 360],     // start ledge + sealed left column (x 12-100, down to floor)
      [100, 130, 126, 24],   // corridor ceiling (raised 20 px: lane 46 px tall, was 26)
      [226, 212, 12, 238],   // chamber right wall: the gate is the ONLY way into the chamber
      [12, 450, 312, 38],    // lower floor
    ]),
    spikes: [{ r: [312, 40, 12, 30] }, { r: [238, 436, 86, 14] }],
    crumbles: [[226, 200, 98, 12]],
    gates: [{ r: [100, 200, 126, 12], dir: 2 }],
    crushers: [],
    exit: { x: 160, y: 439 },
  });
  const T3 = () => ({ // Rhythm Press: the crusher met alone
    name: 'Rhythm Press',
    teach: 'Wait for the press to rise, slip under it, drop down the wall onto the stub, then fly left to the exit.',
    start: { x: 40, y: 119, g: 2 },
    walls: border().concat([
      [12, 130, 100, 14],    // start ledge
      [12, 430, 208, 58],    // landing shelf
      [284, 430, 40, 58],    // safe stub (right)
    ]),
    spikes: [{ r: [220, 472, 64, 16] }],
    crumbles: [], gates: [],
    crushers: [{ r: [142, 85, 84, 60], ax: 0, ay: 1, amp: 50, phase: 0 }],
    exit: { x: 50, y: 419 },
  });

  const mr = (r) => [W - r[0] - r[2], r[1], r[2], r[3]];

  // PL.buildRooms(seed): the 3 tutorial rooms. Never mirrored; seed has no effect (kept in the signature for callers).
  PL.buildRooms = function (seed) {
    const rooms = base();
    for (const room of rooms) { room.w = W; room.h = H; room.mirrored = false; }
    return rooms;
  };

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
  // meta: tier (0 = tutorial only), family (adjacent shaft rooms differ), inputs (needed inputs on the loosest route),
  // rest (may fill the rest slot), hard (may fill the hardest slot), tutorial (never in a shaft), retired (never in a shaft).
  function reg(id, tier, mk, meta) {
    const t = Object.assign({ id, tier, teach: mk().teach, make(rng) {
      const room = mk(); room.w = W; room.h = H; room.mirrored = false;
      const phase = rng() * Math.PI * 2;
      for (const c of room.crushers) c.phase = phase;
      return room;
    } }, meta);
    PL.TEMPLATES.push(t);
  }
  const tut = (i) => () => base()[i];
  reg('tut1', 0, tut(0), { family: 'tutorial', inputs: 2, tutorial: true });
  reg('t01', 1, tut(1), { family: 'arc', inputs: 3, tutorial: true });
  reg('tut3', 0, tut(2), { family: 'tutorial', inputs: 1, tutorial: true });
  reg('t02', 2, T2, { family: 'gate', inputs: 5 });
  reg('t03', 2, T3, { family: 'crusher', inputs: 3 });

  // ---- buildShaft: slot table, seeded and deterministic ----
  // Slot kinds: T1/T2/T3 = tier pools, T3* = hardest slot (hard templates), T2r = rest room (few inputs, no crusher).
  PL.SLOTS = {
    5: ['T1', 'T1', 'T2', 'T3*', 'T2r'],
    7: ['T1', 'T1', 'T2', 'T2', 'T3', 'T3*', 'T2r'],
  };
  function slotsFor(n) {
    if (PL.SLOTS[n]) return PL.SLOTS[n];
    if (n <= 1) return ['T1'];
    if (n === 2) return ['T1', 'T2r'];
    if (n === 3) return ['T1', 'T2', 'T2r'];
    if (n === 4) return ['T1', 'T2', 'T3*', 'T2r'];
    if (n === 6) return ['T1', 'T1', 'T2', 'T3', 'T3*', 'T2r'];
    const mid = []; // n >= 8: 7-slot table with extra T2/T3 rooms in the middle
    for (let i = 0; i < n - 5; i++) mid.push(i % 2 ? 'T3' : 'T2');
    return ['T1', 'T1'].concat(mid, ['T3*', 'T2r'].slice(0, 2));
  }
  const meta = new Map();
  function info(t) {
    let m = meta.get(t.id);
    if (!m) {
      const r = t.make(PL.mulberry32(1));
      m = { crusher: r.crushers.length > 0, crumble: r.crumbles.length > 0 };
      meta.set(t.id, m);
    }
    return m;
  }
  const inPool = (kind, t) => !t.tutorial && !t.retired && (
    kind === 'T1' ? t.tier === 1 : kind === 'T2' ? t.tier === 2 : kind === 'T3' ? t.tier === 3
      : kind === 'T3*' ? t.tier === 3 && !!t.hard : !!t.rest);

  // Returns the chosen templates for a shaft (no rooms built). Rules (relaxed in order only if no placement exists):
  //  L0 all rules; L1 drops "after a crusher / 5-input room: no crusher, <=3 inputs"; L2 also drops first-meet rules;
  //  L3 also drops the family rule; L4 any unused template (never happens with the shipped pool, asserted by tests).
  // Rules: no template twice; adjacent rooms differ in family; the first crusher met is t03 and the first crumble is t18;
  // opts.exclude = ids played recently (soft: skipped while the slot keeps >= 2 other candidates).
  PL.pickShaft = function (seed, n, opts) {
    if (n === undefined) n = 7;
    const slots = slotsFor(n);
    const excl = new Set((opts && opts.exclude) || []);
    const all = PL.TEMPLATES.filter((t) => !t.tutorial && !t.retired);
    for (let level = 0; level <= 4; level++) {
      const rng = PL.mulberry32((seed >>> 0) ^ 0x5bd1e995);
      const used = [];
      const ok = (t, i) => {
        if (level >= 4) return true;
        const prev = used[i - 1];
        if (level < 3 && prev && prev.family === t.family) return false;
        if (level < 2) {
          const m = info(t);
          if (m.crusher && t.id !== 't03' && !used.some((u) => u.id === 't03')) return false;
          if (m.crumble && t.id !== 't18' && !used.some((u) => u.id === 't18')) return false;
        }
        if (level < 1 && prev && (info(prev).crusher || prev.inputs >= 5)) {
          if (info(t).crusher || (t.inputs > 3 && slots[i] !== 'T3*')) return false; // the hardest slot may exceed 3 inputs (else t11/t12 never appear)
        }
        return true;
      };
      const dfs = (i) => {
        if (i === slots.length) return true;
        let c = (level >= 4 ? all : all.filter((t) => inPool(slots[i], t))).filter((t) => !used.includes(t));
        for (let k = c.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const x = c[k]; c[k] = c[j]; c[j] = x; }
        const fresh = c.filter((t) => !excl.has(t.id));
        if (fresh.length >= 2) c = fresh.concat(c.filter((t) => excl.has(t.id)));
        for (const t of c) {
          if (!ok(t, i)) continue;
          used[i] = t;
          if (dfs(i + 1)) return true;
          used.length = i;
        }
        return false;
      };
      if (dfs(0)) return { level, templates: used.slice(), slots };
    }
    return { level: 5, templates: all.slice(0, n), slots };
  };

  PL.buildShaft = function (seed, n, opts) {
    if (n === undefined) n = 7;
    const p = PL.pickShaft(seed, n, opts);
    const mrng = PL.mulberry32(((seed >>> 0) ^ 0x2545f491) + 17);
    let mir = mrng() < 0.5; // adjacent rooms alternate mirrored flag, start side from the seed
    return p.templates.map((t, i) => {
      let room = t.make(PL.mulberry32(((seed >>> 0) * 31 + i * 7919 + 101) >>> 0));
      if (mir) room = PL.mirrorRoom(room);
      mir = !mir;
      room.templateId = t.id;
      room.slot = p.slots[i];
      return room;
    });
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PL;
