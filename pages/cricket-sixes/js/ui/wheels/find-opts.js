// @ts-check
// Find wheel: pure builder of the openWheel option object (T4 wave 3a; SPEC 2f, 5, 11a; CONTRACT-A s4, s5). No DOM, no store import.
// Wiring (spinFind -> openWheel(findWheelOpts(vm, ctx))) is a later task. vm = findSpinVM(s, id); ctx = host callbacks and keys.
import { FIND_SLICES, FIND_RATES, FIND_J } from '../../data/wheels/find.js';

export const FIND_HINT = 'Stop on a gold block to find Coins, a player or a coach. The tick shows where it will land.';
export const FIND_CHANCE = 'Find chance about ';
export const FIND_TIMING = 'Good timing helps';
/** Tier -> shape (SPEC 2f): FIND = green up-triangle, CHEER = sand dot (never rose). */
export const FIND_TIER_SHAPES = Object.freeze({ top: 'triangle', mid: 'dot', low: 'dot' });
const WORD = { coins: 'Coins', player: 'a trial player', coach: 'a trial coach' };

/** The ring for a rate: the table whose rate is nearest (rates are 0.08, 0.18, 0.26). */
export function findRingFor(rate) {
  const r = Number.isFinite(+rate) ? +rate : 0.18;
  const key = FIND_RATES.reduce((b, x) => (Math.abs(x - r) < Math.abs(b - r) ? x : b), FIND_RATES[0]);
  return FIND_SLICES[key];
}
const pct = (w) => String(Math.round(w * 100) / 10).replace(/\.0$/, '');
/** Legend for under-7% labels (one character). Returns {legend:[{ch,text}], legendText:'FIND 12%, F 2%'}: the FIND blocks grouped by printed label and width. */
export function findLegend(ring) {
  const seen = [], legend = [];
  for (const s of ring) {
    if (!s.gold) continue;
    const k = s.label + '|' + pct(s.w);
    if (seen.includes(k)) continue;
    seen.push(k);
    legend.push({ ch: s.label, text: 'FIND', w: pct(s.w), part: s.label + ' ' + pct(s.w) + '%' });
  }
  const short = ring.some((s) => s.label.length === 1);
  if (!short) return { legend: [], legendText: '' };
  return { legend: legend.filter((l) => l.ch.length === 1).map(({ ch, text, w }) => ({ ch, text: text + ' ' + w + '%' })), legendText: legend.map((l) => l.part).join(', ') };
}

const findLine = (p) => {
  if (p.type === 'coins') { const n = (p.coins | 0).toLocaleString('en'), b = p.bonus | 0; return { big: 'Found ' + n + ' Coins', chip: 'Coins', line: b > 0 ? 'Booster bonus: +' + b + ' Coins' : '', say: 'You found ' + n + ' Coins' + (b > 0 ? ', including ' + b + ' Booster bonus Coins' : '') + '.', gold: true }; }
  const w = WORD[p.type] || 'something';
  return { big: 'Found ' + w, chip: 'Trial', say: 'You found ' + w + '.', gold: true };
};

/** Wheel image name (A11Y F4, option B: grouped by tier). @param {any[]} ring */
export function findWheelAria(ring) {
  const f = ring.filter((r) => r.gold).length, c = ring.length - f;
  return 'Find wheel, ' + ring.length + ' blocks: ' + f + ' FIND blocks (top tier) and ' + c + ' CHEER blocks (middle tier)';
}

/** Result sentence for the live region (A11Y F5). FIND: the block's prize; CHEER: a free look. @param {any} row ring row @param {any} [prize] */
export function findLanded(row, prize) {
  if (row && row.gold) {
    const w = prize && prize.type === 'coins' ? ((prize.coins | 0).toLocaleString('en') + ' Coins') : prize && WORD[prize.type] ? WORD[prize.type] : 'a prize';
    return 'Landed: FIND. You found ' + w + '.';
  }
  return 'Landed: CHEER. No find this time. Next week, maybe.';
}

/**
 * @param {any} vm findSpinVM result ({rate, phys, guide, zone, chime, pending, tokens, tokLeft, spokeGain?})
 * @param {{wheelId?:string, spinKey?:string, wobKey?:string, look?:any, title?:string, stored?:any, pick:(stop:any)=>any, useToken?:(kind:string)=>any, onCollect?:()=>void, get?:()=>any}} ctx
 */
export function findWheelOpts(vm, ctx) {
  const ring = findRingFor(vm && vm.rate), get = ctx.get || (() => vm);
  const asWheel = (p) => (p ? { ...p, gain: p.find ? 1 : 0, jackpot: !!p.find } : p);
  const word = (p) => (p && p.find ? (WORD[p.type] || 'something') : 'Nothing');
  const { legend, legendText } = findLegend(ring);
  const tokensOf = (x) => (x.tokens || []).filter((t) => t.kind !== 'nudge').map((t) => (x.tokLeft != null ? { ...t, left: x.tokLeft, ...(t.count != null ? { count: Math.min(t.count | 0, x.tokLeft) } : {}) } : t)); // SPEC 11a: no Nudge on Find; xN never above uses left
  return {
    wheelId: ctx.wheelId || 'find', spinKey: ctx.spinKey, wobKey: ctx.wobKey, stored: ctx.stored,
    title: ctx.title || 'Find', cardHtml: '<p class="dr-hint">' + FIND_HINT + '</p>',
    ring, legend, legendText, tierShapes: FIND_TIER_SHAPES,
    labels: ring.map((s) => s.label), golds: ring.filter((s) => s.gold).map((s) => s.id),
    J: FIND_J, phys: vm && vm.phys ? { ...vm.phys, J: FIND_J } : undefined,
    guide: !!(vm && vm.guide), zone: (vm && vm.zone) || 0, chime: !!(vm && vm.chime), look: ctx.look,
    aria: { wheel: findWheelAria(ring), landed: (stop) => findLanded(ring[stop.sliceId], (get() || {}).pending), status: 'polite' },
    plainResult: true, jpText: 'FOUND!', tokName: 'Find',
    pending: asWheel(vm && vm.pending), getPending: () => asWheel(get().pending),
    // the one STOP callback: the store spin type (PickActivity / UseToken / FindCheer) decides and records the stop (recordFindStop / recordStop)
    onSpin: (stop) => ctx.pick(stop),
    describe: (p) => {
      const d = p.find ? findLine(p) : { big: 'Nothing this time', say: 'No find this time. Next week, maybe.' };
      return { ...d, chip: p.find ? d.chip : '', line: [p.cheerDone ? 'Second Cheer: one more look!' : '', d.line || ''].filter(Boolean).join(' ') };
    },
    outcome: (kind, b, q) => { const nm = { respin: 'Spin Again', two: 'Pick Two' }[kind] || 'Token'; return q.find && !(b && b.find) ? nm + ': found ' + word(q) + '!' : nm + ': still nothing'; },
    tokens: tokensOf(vm || {}), getTokens: () => tokensOf(get()),
    onToken: ctx.useToken ? (kind) => ctx.useToken(kind) : undefined,
    onCollect: ctx.onCollect, spokeGain: () => (get().spokeGain || 0),
  };
}
