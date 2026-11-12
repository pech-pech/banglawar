// @ts-check
// Skill trees: node status and unlock, coach boost x1.5, and the per-player effects handed to the match (fx).
// Pure: no Math.random, Date or DOM. Invalid commands return the SAME state object.
import { SKILLS } from '../data/training.js';
import { coachLevel, findPlayer } from './training.js';

export const COSTS = SKILLS.costs;
export const NODE_COUNT = COSTS.length;

/** Tree name of a player for a side ('bat' -> his batting role, 'bowl' -> his bowling type). */
export const treeOf = (p, side) => (side === 'bat' ? p.bat : p.bowl);
/** Matching coach focus of a tree. */
export const focusOf = (tree) => SKILLS.trees[tree].focus;
const owned = (p, side) => p.nodes?.[side] || 0;

/** x1.5 while any staff coach has the tree's matching focus at level 3+, else 1. */
export function treeBoost(coaches, tree) {
  return coachLevel(coaches, focusOf(tree)) >= SKILLS.boostMinLevel ? SKILLS.boost : 1;
}

/**
 * One node's state for the tree sheet. status 'owned' | 'available' | 'locked'; reason when locked, in the order
 * checked: 'unknown' 'order' 'week' 'coach' 'tp'.
 */
export function nodeStatus(state, playerId, side, node) {
  const p = findPlayer(state, playerId);
  if (!p || (side !== 'bat' && side !== 'bowl') || !(node >= 1 && node <= NODE_COUNT)) return { status: 'locked', reason: 'unknown', cost: 0 };
  const def = SKILLS.trees[treeOf(p, side)].nodes[node - 1];
  const base = { cost: def.cost, text: def.text, tree: treeOf(p, side), top: def.needsCoachLevel != null };
  if (node <= owned(p, side)) return { ...base, status: 'owned' };
  if (node !== owned(p, side) + 1) return { ...base, status: 'locked', reason: 'order' };
  if (state.training.nodeBought?.[playerId]) return { ...base, status: 'locked', reason: 'week' };
  if (def.needsCoachLevel != null && coachLevel(state.coaches, focusOf(base.tree)) < def.needsCoachLevel) return { ...base, status: 'locked', reason: 'coach' };
  if (state.training.tp < def.cost) return { ...base, status: 'locked', reason: 'tp' };
  return { ...base, status: 'available' };
}

/** Buy the next node: in order, one per player per week, does not use the drill. */
export function unlockNode(state, { playerId, side, node } = {}) {
  const st = nodeStatus(state, playerId, side, node);
  if (st.status !== 'available') return state;
  const n = structuredClone(state);
  n.training.weekStart ||= {};
  for (const q of n.clubs.find((c) => c.id === 'c0').squad) n.training.weekStart[q.id] ||= [q.bp, q.bs, q.spd, q.bsk];
  const p = findPlayer(n, playerId);
  p.nodes = { bat: 0, bowl: 0, ...p.nodes, [side]: node };
  n.training.tp -= st.cost; n.training.nodeBought = { ...n.training.nodeBought, [playerId]: true };
  (n.training.weekLog ||= []).push({ type: 'NodeUnlocked', playerId, side, node, cost: st.cost });
  return n;
}

const scale = (e, m) => ({ ...e, v: e.v * m });
/**
 * Effects for the match hook. null when the player owns no node.
 * { bat:{ bad, eff[] }, bowl:{ great, burst?, eff[] } }. eff item: { k:'wicket'|'six'|'four'|'single', v (probability, 0.01 = 1 point),
 * ph (0 early, 1 middle, 2 late, or null), vs (opponent type or null), intent, field }. bad / great are rating points off a Bad / Great
 * pairing. burst is the extra wicket probability in the one Burst over. Every value is x1.5 under a level 3+ matching coach.
 */
export function playerFx(p, coaches) {
  const out = { bat: { bad: 0, eff: [] }, bowl: { great: 0, eff: [] } }; let any = false;
  for (const side of ['bat', 'bowl']) {
    const tree = treeOf(p, side), k = owned(p, side); if (!k) continue;
    const m = treeBoost(coaches, tree);
    for (const nd of SKILLS.trees[tree].nodes.slice(0, k)) for (const e of nd.effects.map((x) => scale(x, m))) {
      any = true;
      if (e.k === 'bad') out.bat.bad += e.v;
      else if (e.k === 'great') out.bowl.great += e.v;
      else if (e.k === 'burst') out.bowl.burst = (out.bowl.burst || 0) + e.v;
      else out[side].eff.push(e);
    }
  }
  return any ? out : null;
}

/** fx argument for ballProbs / playOver: { of(player) -> PlayerFx|undefined }, cached per player object. */
export function makeFx(coaches) {
  const memo = new WeakMap();
  return { of(p) {
    if (!p || typeof p !== 'object') return undefined;
    if (!memo.has(p)) memo.set(p, playerFx(p, coaches) || undefined);
    return memo.get(p);
  } };
}
