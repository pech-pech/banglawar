// @ts-check
// Scout wheel: pure openWheel option builder (wheels SPEC 2f, 9, 11a; 08-A11Y F4, F5, N7; CONTRACT-A sec 4, 5). T4 wave 3b, scout.
// No DOM, no openWheel call: the host does `openWheel(scoutWheelOpts(vm, ctx))` once T1's engine lands. spinScout (wheels/scout.js) stays the live path.
import { scoutWords } from './scout.js';

/** Radial budget in px from the rim (QA defects 1, 2, 6): tier shape, focus icon, grade chip, then the surname growing OUTWARD from the hub side. */
export const SCOUT_PARTS = Object.freeze({ tier: 12, icon: 30, iconR: 6, chip: 56, chipW: 30, chipH: 20, nameFromHub: 32, nameMax: 6, fontMin: 14 });
/** Tier triangles point radially outward (QA defect 3). */
export const SCOUT_TRI = 'out';

const FOCUS_WORD = Object.freeze({ bat: 'bat', bowl: 'bowl', bal: 'all-rounder' });
const FOCUS_ICON = Object.freeze({ bat: 'bat', bowl: 'ball', bal: 'all' });
const focusWord = (/** @type {string} */ f) => FOCUS_WORD[/** @type {'bat'} */ (f)] || 'all-rounder';

/** Surname cut for the wheel: 6 letters or fewer as is, longer = first 6 + "." (QA defect 2). @param {string} n */
export const cutName = (n) => { const t = String(n == null ? '' : n); return t.length > SCOUT_PARTS.nameMax ? t.slice(0, SCOUT_PARTS.nameMax) + '.' : t; };

/** One slice's card parts for the wheel drawing. @param {{grade:string,surname:string,focus:string}} c */
export const cardParts = (c) => ({ grade: c.grade, name: cutName(c.surname), fullName: c.surname, focus: c.focus, icon: FOCUS_ICON[/** @type {'bat'} */ (c.focus)] || 'all', ...SCOUT_PARTS });

/** "Centre", "Centre plus 1 step" for a slice value. @param {number} v */
const centreWords = (v) => (v > 0 ? 'Centre plus ' + v + (v === 1 ? ' step' : ' steps') : 'Centre');

/** The 10 slice rows: ring row (CONTRACT-A sec 5, extra keys allowed) + the card parts. gold = the +2 slice. @param {any} vm */
export function scoutRing(vm) {
  const cards = vm.cards || [];
  return (vm.ring || []).map((/** @type {any} */ r, /** @type {number} */ i) => {
    const c = cards[i] || { grade: '', surname: '', focus: 'bal' };
    return { id: r.id, w: r.w, value: r.value, label: c.grade + ' ' + cutName(c.surname), tier: r.tier, gold: !!r.gold, card: cardParts(c) };
  });
}

/** Legend under the wheel (QA 7: no empty icon, tiers named in words; the +2 gold swatch). Glyphs are decorative (A11Y: legend glyphs aria-hidden). */
export const SCOUT_LEGEND = Object.freeze([
  Object.freeze({ ch: 'tri', text: 'above centre' }),
  Object.freeze({ ch: 'dot', text: 'centre' }),
  Object.freeze({ ch: 'gold', text: '+2 gold' }),
]);

/** Wheel image name (A11Y F4, option B: grouped by tier, short). @param {any[]} ring */
export function scoutWheelAria(ring) {
  const gold = ring.filter((r) => r.gold).length, one = ring.filter((r) => r.value === 1 && !r.gold).length, zero = ring.filter((r) => r.value === 0).length;
  const parts = [];
  if (gold) parts.push(gold + (gold === 1 ? ' gold card' : ' gold cards') + ', centre plus 2 steps');
  if (one) parts.push(one + ' cards centre plus 1 step');
  if (zero) parts.push(zero + ' cards centre');
  return 'Scout wheel, ' + ring.length + ' candidate cards: ' + parts.join(', ');
}

/** Result sentence for the live region (A11Y F5), equal to the visible panel text. @param {{grade:string,surname:string,focus:string}} c @param {number} value */
export function scoutLanded(c, value) {
  return 'Landed: ' + c.grade + ' ' + c.surname + ', ' + focusWord(c.focus) + '. ' + centreWords(value) + '. New card goes first on your list.';
}

/**
 * @param {any} vm scoutSpinVM(s) (store/wheels/scout.js): ring, cards, stored, spinKey, pending, J, spokeGain
 * @param {{get?:()=>any, dispatch:(t:string,p?:any)=>any, onCollect?:()=>void, look?:any, dialLook?:(l:any)=>any, tokProps?:Function, wobKey?:string, onClose?:()=>void}} ctx
 *   get() -> the fresh vm piece. wobKey comes from wobbleKey() (host). tokProps/dialLook = ./shared.js helpers, passed in so this stays pure.
 * @returns {Record<string, any>} the openWheel option object
 */
export function scoutWheelOpts(vm, ctx) {
  const get = ctx.get || (() => vm), ring = scoutRing(vm), cards = vm.cards || [];
  const cardOf = (/** @type {number} */ id) => cards[id] || { grade: '', surname: '', focus: 'bal' };
  return {
    wheelId: 'scout', spinKey: vm.spinKey, ring, J: vm.J != null ? vm.J : 1.2, wobKey: ctx.wobKey,
    ...(vm.stored ? { stored: { ...vm.stored } } : {}),
    title: 'The scouts', cardHtml: '<p class="dr-hint">What do the scouts bring?</p>',
    pending: vm.pending, getPending: () => (get() || {}).pending,
    legend: SCOUT_LEGEND.map((l) => ({ ...l })),
    hub: { text: '', ariaHidden: true }, // N7: hub text dropped, hub aria-hidden
    tierShape: { tri: SCOUT_TRI }, look: ctx.dialLook && ctx.look ? ctx.dialLook(ctx.look) : undefined,
    aria: { wheel: scoutWheelAria(ring), landed: (/** @type {any} */ stop) => scoutLanded(cardOf(stop.sliceId), (ring[stop.sliceId] || {}).value | 0), status: 'polite' },
    ...(ctx.tokProps ? ctx.tokProps(get, ctx.dispatch, 'scout', 'Scout') : {}),
    tokText: (p) => scoutWords(p).short,
    onSpin: (/** @type {any} */ stop) => ctx.dispatch('ScoutSpin', { stop }),
    describe: (/** @type {any} */ p) => { const w = scoutWords(p); return { big: w.big, say: w.say, gold: !p.extra && !!p.jackpot }; },
    onCollect: ctx.onCollect || (() => {}), spokeGain: () => (get() || {}).spokeGain || 0,
    ...(ctx.onClose ? { onClose: ctx.onClose } : {}),
  };
}
