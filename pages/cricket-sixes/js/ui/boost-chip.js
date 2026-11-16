// @ts-check
// Clinic boost chip (SPEC s8, s10). Pure HTML helpers, no state. Letters and words only; the % is the one number allowed (SPEC s10 text).
// A boost = { pcts:[5|10|20,...], extraRun:boolean } (CONTRACT-B s1 clinic.boost[playerId]). The Nets line may carry { pct, extraRun } instead.
import { esc } from './dom.js';

/** Normalise any boost shape to { pcts:number[], pct:number, extraRun:boolean }. Bad input -> zero boost. @param {any} b */
export function normBoost(b) {
  if (typeof b === 'number') b = { pct: b };
  if (!b || typeof b !== 'object') return { pcts: [], pct: 0, extraRun: false };
  const pcts = Array.isArray(b.pcts) ? b.pcts.map((x) => Math.max(0, Math.round(Number(x)) || 0)).filter((x) => x > 0) : [];
  const pct = pcts.length ? pcts.reduce((a, x) => a + x, 0) : Math.max(0, Math.round(Number(b.pct)) || 0);
  return { pcts, pct, extraRun: !!b.extraRun };
}

/** True when the boost shows anything. @param {any} b */
export const hasBoost = (b) => { const n = normBoost(b); return n.pct > 0 || n.extraRun; };

/** Row chips, one per spin: ["Clinic +10%", "Clinic +5%", "Extra run"]. @param {any} b */
export function boostParts(b) {
  const n = normBoost(b), out = n.pcts.map((x) => 'Clinic +' + x + '%');
  if (!n.pcts.length && n.pct) out.push('Clinic +' + n.pct + '%');
  if (n.extraRun) out.push('Extra run');
  return out;
}

/** One short line for the Nets result: "Clinic +15%", plus ", extra run" when it fired. @param {any} b */
export function boostTotalText(b) {
  const n = normBoost(b), a = [];
  if (n.pct) a.push('Clinic +' + n.pct + '%');
  if (n.extraRun) a.push('Extra run');
  return a.join(', ');
}

/** Row chips (one per spin) for a player row. '' when no boost. @param {any} b @param {string} [cls] */
export function boostChipsHtml(b, cls) {
  const parts = boostParts(b); if (!parts.length) return '';
  return '<span class="cn-chips' + (cls ? ' ' + esc(cls) : '') + '">' + parts.map((t) => '<span class="cn-chip' + (t === 'Extra run' ? ' cn-chip--gold' : '') + '">' + esc(t) + '</span>').join('') + '</span>';
}

/** The single total chip for the Nets Day result line ("Clinic +15%"). '' when no boost. @param {any} b */
export function boostTotalHtml(b) {
  const t = boostTotalText(b); if (!t) return '';
  return '<span class="cn-chip cn-chip--total">' + esc(t) + '</span>';
}
