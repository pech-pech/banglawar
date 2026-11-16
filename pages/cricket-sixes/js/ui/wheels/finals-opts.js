// @ts-check
// Finals -> openWheel option object (T4 Wave 3c, CONTRACT-A sec 4/5). PURE builder: no DOM, no openWheel import (T1's engine is not landed).
// Per-row extras for the renderer: row.sub = prize type word ('Coins' | 'TP' | 'Fans' | 'Medal'), row.tierShape = 'triangle' (top) | 'dot' (mid) | 'pale' (low). The result is a plain word card (no '(same letter)' line).
// The wiring (finals.js / spinFinals) calls openWheel(finalsWheelOpts(vm, ctx)) once T1 lands. Labels = PAID amount; the result strip says the same number.
import { paidRing } from '../../core/finals-paid.js';
import { finalsWords, finalsPairLine, finalsTokLine } from './finals.js';
import { FINALS_SLICES } from '../../data/wheels/finals.js';
import { dialLook, revealT, tokProps, TOKVAL } from './shared.js';

/** Legend under the ring (SPEC 2f, QA mockups-t4 #5): the Medal slice is 4% and prints "M"; the Medal icon sits in the legend. `icon` is an icon name for the view, `ch` is the printed letter. */
export const FINALS_LEGEND = Object.freeze([Object.freeze({ ch: 'M', icon: 'medal', text: 'M = Gold Medal (4%)' })]);

/** The one number a prize slice pays (what the label prints): Coins, TP or Fans, in that order; 0 for a Medal. @param {any} p */
export const paidOf = (p) => (p ? (p.coins | 0) || (p.tp | 0) || (p.fans | 0) || 0 : 0);

/** Wheel image name (A11Y F4, option B: grouped by tier, short). Labels are the PAID amounts. @param {any[]} ring */
export function finalsWheelAria(ring) {
  const parts = [], tiers = [['top', 'top prizes'], ['mid', 'middle prizes'], ['low', 'small prizes']];
  for (const [t, name] of tiers) {
    const rows = ring.filter((r) => r.tier === t); if (!rows.length) continue;
    parts.push(rows.length + ' ' + name + ': ' + rows.map((r) => (r.label === 'M' ? 'Gold Medal' : r.label)).join(', '));
  }
  return 'Finals prize wheel, ' + ring.length + ' slices, ' + (parts.length ? parts.join('; ') : 'no prizes listed');
}

/** Result sentence for the live region (A11Y F5), states the paid amount. @param {{label?:string, type?:string}} row ring row (+ slice type) */
export function finalsLanded(row) {
  const r = row || {}, t = r.type ? String(r.type) : '';
  if (r.label === 'M' || t === 'Medal') return 'Landed: Gold Medal. Plus 1 Medal for your cabinet.';
  return 'Landed: ' + (r.label || 'a prize') + (t ? ' ' + t : '') + '. You are paid ' + (r.label || 'the prize') + (t ? ' ' + t : '') + '.';
}

/**
 * @param {any} vm finalsSpinVM(s): {ring, cells, pending, tokens, ...ctl}; vm.ring rows are CONTRACT-A sec 5 (type/amount extra keys optional)
 * @param {{get?:()=>any, dispatch?:(k:string,p?:any)=>any, look?:any, mult?:{coins?:number,fans?:number}, onCollect?:()=>void, wheelId?:string, spinKey?:string, wobKey?:string, J?:number, stored?:any, onClose?:()=>void}} [ctx]
 * @returns {any} openWheel option object
 */
export function finalsWheelOpts(vm, ctx = {}) {
  vm = vm || {};
  const get = ctx.get || (() => vm), dispatch = ctx.dispatch || (() => {});
  // Labels = paid amount. Rows that still carry type/amount are re-labelled from ctx.mult; rows from finalsRing() already carry the paid label (Prize Pair included) and pass through.
  const rows = Array.isArray(vm.ring) ? vm.ring : [];
  const paid = ctx.mult && rows.every((r) => r && r.type) ? paidRing(rows, ctx.mult) : rows;
  const ring = paid.map((r, i) => { const ty = r.type || (FINALS_SLICES[i] || {}).type; return { ...r, tierShape: r.tier === 'top' ? 'triangle' : r.tier === 'low' ? 'pale' : 'dot', ...(ty ? { sub: ty } : {}) }; });
  const describe = (/** @type {any} */ p) => {
    const w = finalsWords(p), why = finalsPairLine(p);
    return { big: w, paid: paidOf(p), ...(why ? { line: why } : {}), say: 'Finals prize: ' + w + '.' + (why ? ' ' + why.replace('x1.5', 'times one and a half') + '.' : ''), gold: !!p.jackpot };
  };
  return {
    wheelId: ctx.wheelId || 'finals', ...(ctx.spinKey ? { spinKey: ctx.spinKey } : {}), ...(ctx.wobKey ? { wobKey: ctx.wobKey } : {}), ...(ctx.J != null ? { J: ctx.J } : {}), ...(ctx.stored ? { stored: ctx.stored } : {}),
    title: 'Finals prize', cardHtml: '<p class="dr-hint">Spin for your prize.</p>',
    ring, legend: FINALS_LEGEND.map((l) => ({ ...l })),
    aria: { wheel: finalsWheelAria(ring), landed: (/** @type {any} */ stop) => finalsLanded({ ...(ring[stop.sliceId] || {}), type: (FINALS_SLICES[stop.sliceId] || {}).type }), status: 'polite' },
    plainResult: true, jpText: 'JACKPOT!',
    plan: { total: revealT(3, vm) }, look: dialLook(ctx.look), pending: vm.pending,
    ...tokProps(get, dispatch, 'finals', 'Finals'), tokVal: TOKVAL.finals, tokText: finalsWords, tokLine: finalsTokLine,
    onSpin: (/** @type {any} */ stop) => dispatch('FinalsSpin', { stop }), getPending: () => get().pending,
    describe, onCollect: ctx.onCollect, ...(ctx.onClose ? { onClose: ctx.onClose } : {}), spokeGain: () => get().spokeGain || 0,
  };
}
