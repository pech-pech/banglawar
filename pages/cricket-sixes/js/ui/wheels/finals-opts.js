// @ts-check
// Finals -> openWheel option object (T4 Wave 3c, CONTRACT-A sec 4/5). PURE builder: no DOM, no openWheel import (T1's engine is not landed).
// The wiring (finals.js / spinFinals) calls openWheel(finalsWheelOpts(vm, ctx)) once T1 lands. Labels = PAID amount; the result strip says the same number.
import { paidRing } from '../../core/finals-paid.js';
import { finalsWords, finalsPairLine, finalsTokLine } from './finals.js';
import { dialLook, revealT, tokProps, TOKVAL } from './shared.js';

/** Legend under the ring (SPEC 2f, QA mockups-t4 #5): the Medal slice is 4% and prints "M"; the Medal icon sits in the legend. `icon` is an icon name for the view, `ch` is the printed letter. */
export const FINALS_LEGEND = Object.freeze([Object.freeze({ ch: 'M', icon: 'medal', text: 'Gold Medal (4%)' })]);

/** The one number a prize slice pays (what the label prints): Coins, TP or Fans, in that order; 0 for a Medal. @param {any} p */
export const paidOf = (p) => (p ? (p.coins | 0) || (p.tp | 0) || (p.fans | 0) || 0 : 0);

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
  const ring = ctx.mult && rows.every((r) => r && r.type) ? paidRing(rows, ctx.mult) : rows;
  const describe = (/** @type {any} */ p) => {
    const w = finalsWords(p), why = finalsPairLine(p);
    return { big: w, paid: paidOf(p), ...(why ? { line: why } : {}), say: 'Finals prize: ' + w + '.' + (why ? ' ' + why.replace('x1.5', 'times one and a half') + '.' : ''), gold: !!p.jackpot };
  };
  return {
    wheelId: ctx.wheelId || 'finals', ...(ctx.spinKey ? { spinKey: ctx.spinKey } : {}), ...(ctx.wobKey ? { wobKey: ctx.wobKey } : {}), ...(ctx.J != null ? { J: ctx.J } : {}), ...(ctx.stored ? { stored: ctx.stored } : {}),
    title: 'Finals prize', cardHtml: '<p class="dr-hint">Spin for your prize.</p>',
    ring, legend: FINALS_LEGEND.map((l) => ({ ...l })),
    plan: { total: revealT(3, vm) }, look: dialLook(ctx.look), pending: vm.pending,
    ...tokProps(get, dispatch, 'finals', 'Finals'), tokVal: TOKVAL.finals, tokText: finalsWords, tokLine: finalsTokLine,
    onSpin: (/** @type {any} */ stop) => dispatch('FinalsSpin', { stop }), getPending: () => get().pending,
    describe, onCollect: ctx.onCollect, ...(ctx.onClose ? { onClose: ctx.onClose } : {}), spokeGain: () => get().spokeGain || 0,
  };
}
