// Ridgeline hulls: five trades, one rig. Multipliers on the base cfg. Pure, no DOM.
// Spec: GAMEPLAY.md sec 4 (wins over section 05). topSpeed is 1.00 for every hull and is not a key.
import { markDist } from './marks.js';

export const HULL_IDS = ['wren', 'kite', 'anvil', 'barge', 'spindle'];
export const STATS = ['mass', 'spring', 'damper', 'airSteer', 'dive', 'landTol', 'groundSteer', 'diveCleanKick'];

const row = (mass, spring, damper, airSteer, dive, landTol, groundSteer, diveCleanKick) =>
  ({ mass, spring, damper, airSteer, dive, landTol, groundSteer, diveCleanKick });

export const HULLS = {
  wren:    { id: 'wren',    name: 'Wren',    mark: null,           flavour: 'The baseline, learns every dune.',                                   ...row(1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00) },
  kite:    { id: 'kite',    name: 'Kite',    mark: 'lantern_row',  flavour: 'Floaty flier who steers in the air; strict landings, weak dive.',      ...row(0.80, 0.90, 0.85, 1.30, 0.80, 0.90, 1.05, 1.00) },
  anvil:   { id: 'anvil',   name: 'Anvil',   mark: 'salt_road',    flavour: 'Heavy, stable, slams down fast; bad at air tricks.',                   ...row(1.40, 1.25, 1.20, 0.80, 1.15, 1.20, 0.96, 1.00) },
  barge:   { id: 'barge',   name: 'Barge',   mark: 'deep_dusk',    flavour: 'Forgiving and slow; soft spring, lazy in the air, hard to wreck.',     ...row(1.20, 0.80, 1.40, 0.85, 0.90, 1.25, 0.95, 1.00) },
  spindle: { id: 'spindle', name: 'Spindle', mark: 'midnight',     flavour: 'Fast and sharp, strict landings: high risk, high ceiling.',            ...row(0.90, 1.10, 0.90, 1.10, 1.20, 0.85, 1.00, 1.25) },
};

// Tweak keys: hull.<id>.<stat> for every hull but Wren (Wren is 1.00 everywhere).
export const KEYS = {};
for (const id of HULL_IDS) {
  if (id === 'wren') continue;
  for (const s of STATS) {
    KEYS['hull.' + id + '.' + s] = { def: HULLS[id][s], min: 0.5, max: 1.6, step: 0.01, label: HULLS[id].name + ' ' + s + ' x', group: 'Hulls' };
  }
}

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const mul = (cfg, id, s) => num(cfg && cfg['hull.' + id + '.' + s], HULLS[id][s]);

// Multiplier for one stat, live from cfg (fallback table).
export function hullStat(cfg, id, s) { return id === 'wren' || !HULLS[id] ? 1 : mul(cfg, id, s); }

// Returns a NEW cfg object: base with hull multipliers applied. Unknown id -> wren (copy of base).
// hullMass is the tumble/impact weight multiplier (consumed by sled.js); the rest scale existing keys.
export function hullCfg(base, id) {
  const hid = HULLS[id] ? id : 'wren';
  const m = (s) => hullStat(base, hid, s);
  const out = { ...base };
  out.hullMass = m('mass');
  out.launchRatio = base.launchRatio * Math.sqrt(m('spring'));
  out.slamWobble = base.slamWobble * m('damper');
  out.airSteerMul = base.airSteerMul * m('airSteer');
  out.diveGravityMul = base.diveGravityMul * m('dive');
  out.gradeClean = base.gradeClean * m('landTol');
  out.gradeRough = base.gradeRough * m('landTol');
  out.gradeSlam = base.gradeSlam * m('landTol');
  out.steerAccel = base.steerAccel * m('groundSteer');
  out.landKickDive = base.landKickDive * m('diveCleanKick');
  out.hull = hid;
  return out;
}

// Hull ids opened by a best distance (wren always), in table order. cfg optional (live mark distances).
export function unlockedFor(bestDist, cfg) {
  const b = num(bestDist, 0);
  return HULL_IDS.filter((id) => {
    const mk = HULLS[id].mark;
    if (!mk) return true;
    const m = markDist(mk, cfg);
    return m != null && b >= m;
  });
}
