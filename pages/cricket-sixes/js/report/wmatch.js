// Wheel match mode lines for the copy report (2026-11-15 wheel match SPEC s14, 06-DEV-SPEED "Copy report"). Pure: records in, strings out.
// Header: `mode:W off:-9` (WHEEL_RIVAL_OFF; or `mode:C off:+1.9`); W line: spins, auto, stop buckets, landed vs expected, Aim Guide; `dev:` line (changed keys only).
// Over rows of a WheelOver carry the classic columns that still mean something (bowler, matchup, runs, wickets, ball-level xr/xw) and null for
// field / intent / their fit (there are no calls in wheel mode), plus wa auto 1/0, wb stop bucket (c|e|l|o, null when auto), wc careful 1/0,
// wg Aim Guide 1/0, wx [model xr, model xw] (the Expected line of that over).
import { overRecord } from './metrics.js';
import { WHEEL_RIVAL_OFF, CLASSIC_RIVAL_OFF } from '../data/wheelmatch.js';

const r1 = (x) => Math.round(x * 10) / 10;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const sgn = (n) => (n >= 0 ? '+' : '') + r1(n).toFixed(1);
export const isWheel = (/** @type {any} */ m) => !!m && m.mo === 'W';

/** Over row for a WheelOver that moved `before` to `after` (the newest s.wheelLog entry is this over). @param {any} before @param {any} after @param {any} [t] */
export function wheelOverRecord(before, after, t = {}) {
  let rec;
  try { rec = overRecord(before, after, t); } catch (e) { // a wheel state the classic selectors cannot read: the plain facts only
    const L = after.last, balls = (L && L.balls) || [];
    rec = { o: L ? L.over : null, s: before.stage === 'bowl' ? 'b' : 'c', b: L ? L.bowler : null, g: null, mu: '?', gb: 0, gm: 0, f: null, i: null,
      r: sum(balls.map((x) => (typeof x.o === 'number' ? x.o : 0))), w: balls.filter((x) => x.o === 'W').length, xr: null, xw: null, rr: null, fit: [null, null, null], th: t.th == null ? null : Math.round(t.th), bm: null, wp: null };
  }
  rec.f = null; rec.i = null; rec.fit = [rec.s === 'b' && rec.fit ? rec.fit[0] : null, null, null]; // no field / intent calls in wheel mode
  const L0 = (before && before.wheelLog) || [], L1 = (after && after.wheelLog) || [], e = L1.length > L0.length || (L1.length && L1 !== L0) ? L1[L1.length - 1] : null;
  if (e) {
    rec.wa = e.auto ? 1 : 0; rec.wb = e.auto ? null : (e.bucket || null); rec.wc = !e.auto && e.careful ? 1 : 0; rec.wg = e.guide ? 1 : 0;
    rec.wx = [Number.isFinite(e.xr) ? r1(e.xr) : rec.xr, Number.isFinite(e.xw) ? Math.round(e.xw * 100) / 100 : rec.xw];
  } else { rec.wa = 0; rec.wb = null; rec.wc = 0; rec.wg = 0; rec.wx = [rec.xr, rec.xw]; }
  return rec;
}

/** W numbers over a set of match records: {n, b, a, auto, c, e, l, o, dr, dw, guide, adr, adw}. dr / dw = landed minus expected for us over AIMED overs only
 *  (REVIEW F10); adr / adw = the same for auto overs
 *  (bat overs runs - xr, bowl overs xr - runs; wickets: bowl overs w - xw, bat overs xw - w). Auto overs count in n and the landed totals,
 *  never in the stop buckets, careful or the aimed landed delta. @param {any[]} ms */
export function wheelStats(ms) {
  const ov = ms.filter(isWheel).flatMap((m) => (m.ov || []).filter((o) => o && o.wx));
  const aimed = ov.filter((o) => !o.wa), cnt = (f) => ov.filter(f).length, ac = (k) => aimed.filter((o) => o.wb === k).length;
  const xr = (o) => (o.wx && o.wx[0] != null ? o.wx[0] : o.xr || 0), xw = (o) => (o.wx && o.wx[1] != null ? o.wx[1] : o.xw || 0);
  const DR = (os) => r1(sum(os.map((o) => (o.s === 'c' ? (o.r | 0) - xr(o) : xr(o) - (o.r | 0)))));
  const DW = (os) => r1(sum(os.map((o) => (o.s === 'b' ? (o.w | 0) - xw(o) : xw(o) - (o.w | 0)))));
  const auto = ov.filter((o) => o.wa); // auto / skip / reduced-motion overs land unaimed: their delta is printed apart, never mixed into the aim number
  return { n: ov.length, b: cnt((o) => o.s === 'b'), a: cnt((o) => o.s === 'c'), auto: auto.length, c: aimed.filter((o) => o.wc).length, e: ac('e'), l: ac('l'), o: ac('o'), dr: DR(aimed), dw: DW(aimed), guide: ov.some((o) => o.wg), adr: DR(auto), adw: DW(auto) };
}
/** SPEC s14 W line. @param {ReturnType<typeof wheelStats>} w */
export const wheelLine = (w) => `Wheel: ${w.n} spun (${w.b} bowl, ${w.a} bat), auto ${w.auto}. Stops careful ${w.c} / early ${w.e} / late ${w.l} / coast ${w.o}. Landed vs expected ${sgn(w.dr)} runs, wickets ${sgn(w.dw)}. Aim Guide ${w.guide ? 'on' : 'off'}.${w.auto ? ` Auto overs landed vs expected ${sgn(w.adr)} runs, wickets ${sgn(w.adw)}.` : ''}`;
/** Compact JSON / machine form. @param {ReturnType<typeof wheelStats>} w */
export const wheelArr = (w) => [w.n, w.b, w.a, w.auto, w.c, w.e, w.l, w.o, w.dr, w.dw, w.guide ? 1 : 0, w.adr, w.adw];

/** Mode of the window: 'W' | 'C' | 'W+C' from records that carry mo; none -> envMode ('wheel'|'classic') or null (old records, no env). */
export function modeOf(ms, envMode) {
  const k = new Set(ms.filter((m) => m && (m.mo === 'W' || m.mo === 'C')).map((m) => m.mo));
  if (k.size === 2) return 'W+C';
  if (k.size === 1) return [...k][0];
  return envMode === 'wheel' ? 'W' : envMode === 'classic' ? 'C' : null;
}
const offTxt = (v) => (v > 0 ? '+' : '') + v;
/** Header piece (from WHEEL_RIVAL_OFF / CLASSIC_RIVAL_OFF): `mode:W off:-9`, `mode:C off:+1.9`, mixed `mode:W+C off:-9/+1.9`; null when unknown. */
export function modeHeader(mode) {
  if (!mode) return null;
  const off = mode === 'W' ? offTxt(WHEEL_RIVAL_OFF) : mode === 'C' ? offTxt(CLASSIC_RIVAL_OFF) : offTxt(WHEEL_RIVAL_OFF) + '/' + offTxt(CLASSIC_RIVAL_OFF);
  return `mode:${mode} off:${off}`;
}
/** CLEAN build kind: 'wheel' | 'classic' | 'mixed' | null. */
export const kindOf = (mode) => (mode === 'W' ? 'wheel' : mode === 'C' ? 'classic' : mode ? 'mixed' : null);
/** `dev: matchW0=48 otherMult=1.5` for the changed keys (devChanged(s)); null when none (Dev off or all defaults). @param {Record<string, number>|null|undefined} ch */
export function devLine(ch) {
  const ks = ch ? Object.keys(ch) : [];
  return ks.length ? 'dev: ' + ks.map((k) => k + '=' + ch[k]).join(' ') : null;
}
