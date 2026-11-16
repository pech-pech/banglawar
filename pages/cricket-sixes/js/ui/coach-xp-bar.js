// Coach XP bar (SPEC s5, s7): segmented, no digits on the bar; 'XP a / b' only in title/aria-label (long-press via data-cw="xp").
import { XP_PER_STEP, XP_MAX_STEP } from '../data/coach-weekly.js';
export const XP_SEGMENTS = 10;
/** @param {any} c coach (step, xp, job) @returns {{xp:number, xpNeed:number|null, job:string, max:boolean}} */
export function coachWeekly(c) {
  const step = Math.max(1, Math.min(XP_MAX_STEP, (c && c.step) | 0 || 1));
  const max = step >= XP_MAX_STEP;
  const need = max ? null : XP_PER_STEP[step - 1];
  const xp = max ? 0 : Math.max(0, Math.min(need - 1, Math.floor(Number(c && c.xp)) || 0));
  const job = c && ['nets', 'match', 'study', 'scout'].includes(c.job) ? c.job : 'study';
  return { xp, xpNeed: need, job, max };
}
/** @param {{xp:number, xpNeed:number|null, max:boolean}} w */
export function xpBarHtml(w) {
  const segs = (n) => Array.from({ length: XP_SEGMENTS }, (_, i) => `<i class="cw-seg${i < n ? ' on' : ''}"></i>`).join('');
  if (w.max || !w.xpNeed) return `<span class="cw-xp cw-max" data-cw="xp" role="img" aria-label="MAX" title="MAX">${segs(XP_SEGMENTS)}<b class="cw-maxtag">MAX</b></span>`;
  const n = Math.max(0, Math.min(XP_SEGMENTS, Math.floor((w.xp / w.xpNeed) * XP_SEGMENTS)));
  const t = `XP ${w.xp} / ${w.xpNeed}`;
  return `<span class="cw-xp" data-cw="xp" data-fill="${n}" role="img" aria-label="${t}" title="${t}">${segs(n)}</span>`;
}
