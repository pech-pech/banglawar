// Ridgeline marks: named distances, first reach fires a milestone (and a hull unlock). Pure, no DOM.
// Spec: GAMEPLAY.md sec 4. Mark distances are Tweak keys markDist1..11 (group Marks).

export const MARKS = [
  { id: 'first_light',   name: 'First Light',   m: 500 },
  { id: 'brass_mile',    name: 'Brass Mile',    m: 1000 },
  { id: 'dust_bell',     name: 'Dust Bell',     m: 2000 },
  { id: 'lantern_row',   name: 'Lantern Row',   m: 2800, hull: 'kite' },
  { id: 'dune_crown',    name: 'Dune Crown',    m: 4000 },
  { id: 'salt_road',     name: 'Salt Road',     m: 5500, hull: 'anvil' },
  { id: 'deep_dusk',     name: 'Deep Dusk',     m: 8500, hull: 'barge' },
  { id: 'starfall',      name: 'Starfall',      m: 11000 },
  { id: 'midnight',      name: 'Midnight',      m: 13500, hull: 'spindle' },
  { id: 'cold_horizon',  name: 'Cold Horizon',  m: 16000 },
  { id: 'past_the_lamps', name: 'Past the Lamps', m: 20000 },
];
export const LAST_MARK = 'past_the_lamps';

export const KEYS = {};
MARKS.forEach((k, i) => {
  KEYS['markDist' + (i + 1)] = { def: k.m, min: 100, max: 40000, step: 100, label: 'Mark: ' + k.name + ' (m)', group: 'Marks' };
});
KEYS.markRepeat = { def: 5000, min: 500, max: 20000, step: 500, label: 'Past the Lamps repeat (m)', group: 'Marks' };

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Live mark list (distances from cfg), sorted by distance (stable on ties by table order).
export function marksFor(cfg) {
  const c = cfg || {};
  return MARKS.map((k, i) => ({ ...k, m: num(c['markDist' + (i + 1)], k.m), idx: i }))
    .sort((a, b) => a.m - b.m || a.idx - b.idx);
}
export const markDist = (id, cfg) => { const k = marksFor(cfg).find((x) => x.id === id); return k ? k.m : null; };

export function createMarks(opts = {}, cfg = {}) {
  const reached = opts.reached instanceof Set ? opts.reached : new Set(opts.reached || []);
  const list = marksFor(cfg);
  const rep = Math.max(1, num(cfg.markRepeat, KEYS.markRepeat.def));
  const last = list[list.length - 1];
  let repeatN = 0;   // repeats already fired this run (n-th repeat sits at last.m + n*rep)
  let lastDist = -Infinity;

  function step(dist) {
    const out = [];
    if (!(dist > lastDist)) return out;
    lastDist = dist;
    for (const k of list) {
      if (k.m > dist) break;
      if (reached.has(k.id)) continue;
      reached.add(k.id);
      out.push({ type: 'milestone', id: k.id, dist: k.m });
      if (k.hull) out.push({ type: 'hull_unlock', hull: k.hull });
    }
    if (reached.has(last.id) || dist >= last.m) {
      while (last.m + (repeatN + 1) * rep <= dist) {
        repeatN++;
        out.push({ type: 'milestone', id: LAST_MARK, dist: last.m + repeatN * rep, repeat: repeatN });
      }
    }
    return out;
  }

  // Nearest mark above dist. unlocked: array or Set of hull ids already owned.
  function nextGoal(dist, unlocked) {
    const own = unlocked instanceof Set ? unlocked : new Set(unlocked || []);
    const d = Math.max(0, num(dist, 0));
    let k = list.find((x) => x.m > d);
    let target, name, hull = null;
    if (k) { target = k.m; name = k.name; hull = k.hull && !own.has(k.hull) ? k.hull : null; }
    else {
      target = last.m + (Math.floor((d - last.m) / rep) + 1) * rep;
      name = last.name;
    }
    const remaining = Math.ceil(target - d);
    const text = remaining + ' m to ' + name + (hull ? ', opens ' + hull[0].toUpperCase() + hull.slice(1) : '');
    return { text, remaining, hull, id: k ? k.id : LAST_MARK, target };
  }

  return { step, nextGoal, reached: () => reached, reset() { repeatN = 0; lastDist = -Infinity; } };
}
