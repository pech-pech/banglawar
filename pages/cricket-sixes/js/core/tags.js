// @ts-check
// Apply a rival style tag to an AI club (P9). Pure: no rng, no clock. Offsets go on every squad player, clamped 1-99.
import { capSum } from './ability.js';
import { TAGS, TAGGED_RIVALS } from '../data/tags.js';
import { aiPickSix } from './clubs.js';

const KEYS = /** @type {const} */ (['bp', 'bs', 'spd', 'bsk']);
const clamp = (/** @type {number} */ v) => Math.min(99, Math.max(1, v));

/** The tagged rival for a league and AI slot (1..3), or null. @param {number} league @param {number} slot */
export function taggedRival(league, slot) {
  const list = TAGGED_RIVALS[Math.min(5, Math.max(1, Math.round(league || 1)))];
  return list && slot >= 1 && slot <= list.length ? list[slot - 1] : null;
}

/** Tag label, hint and kit of a club for the views, or null when it has no tag. @param {any} club */
export function tagInfo(club) {
  const t = club && club.tag ? TAGS[club.tag] : null;
  return t ? { key: club.tag, chip: t.chip, hint: t.hint, kit: club.kit || null } : null;
}

/**
 * Name, tag and kit the club and add the tag offsets to its players. Mutates the club it is given (call on a fresh or cloned club).
 * Does nothing if the club is already tagged. Potential is raised only if the cap-sum floor needs it (same rule as growClubs).
 * @param {any} club @param {number} league @param {number} slot 1..3
 */
export function applyTag(club, league, slot) {
  const r = taggedRival(league, slot);
  if (!r || club.tag) return club;
  const t = TAGS[r.tag];
  club.name = r.name; club.tag = r.tag; club.kit = r.kit.slice();
  for (const p of club.squad) {
    for (const k of KEYS) p[k] = clamp(p[k] + t[k]);
    while (p.potential < 200 && capSum(p.potential) < p.bp + p.bs + p.spd + p.bsk + 12) p.potential++;
  }
  club.six = aiPickSix(club);
  return club;
}
