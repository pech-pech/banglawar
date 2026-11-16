// @ts-check
// Find wheel: pure builder of the openWheel option object (T4 wave 3a; SPEC 2f, 5, 11a; CONTRACT-A s4, s5). No DOM, no store import.
// Per-row extras for the renderer (T1 draws them): row.sub = the prize text under the label (CHEER rows: the cheer prize only if vm.cheerPrize is set, else omitted; FIND rows: none, the type is drawn on landing),
// row.tierShape = 'triangle' (FIND) | 'dot' (CHEER). Legend rows {ch, text}: '[F] FIND 4%'. Result card: CHEER lands as 'CHEER! No find this time.' (or 'CHEER! <prize>' when vm.cheerPrize is set; same wording in log / aria / say).
// Wiring (spinFind -> openWheel(findWheelOpts(vm, ctx))) is a later task. vm = findSpinVM(s, id); ctx = host callbacks and keys.
import { FIND_SLICES, FIND_RATES, FIND_J } from '../../data/wheels/find.js';

export const FIND_HINT = 'Stop on a gold block to find Coins, a player or a coach. The tick shows about where it will land.';
export const FIND_CHANCE = 'Find chance about ';
export const FIND_TIMING = 'Good timing helps';
/** Tier -> shape (SPEC 2f): FIND = green up-triangle, CHEER = sand dot (never rose). */
export const FIND_TIER_SHAPES = Object.freeze({ top: 'triangle', mid: 'dot', low: 'dot' });
// OPEN: SPEC sec 5 says a CHEER piece pays today's cheer prize; none found in code (numbers thread to confirm)
/** The prize a CHEER block pays: none by default (''); a vm.cheerPrize string overrides. */
export const FIND_CHEER_PRIZE = '';
export const cheerPrizeOf = (/** @type {any} */ vm) => (vm && typeof vm.cheerPrize === 'string' && vm.cheerPrize ? vm.cheerPrize : FIND_CHEER_PRIZE);
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
export function findLanded(row, prize, cheer) {
  if (row && row.gold) {
    const w = prize && prize.type === 'coins' ? ((prize.coins | 0).toLocaleString('en') + ' Coins') : prize && WORD[prize.type] ? WORD[prize.type] : 'a prize';
    return 'Landed: FIND. You found ' + w + '.';
  }
  return 'Landed: CHEER. ' + ((cheer || FIND_CHEER_PRIZE) ? (cheer || FIND_CHEER_PRIZE) + '. ' : '') + 'No find this time. Next week, maybe.';
}

/**
 * @param {any} vm findSpinVM result ({rate, phys, guide, zone, chime, pending, tokens, tokLeft, spokeGain?})
 * @param {{wheelId?:string, spinKey?:string, wobKey?:string, look?:any, title?:string, stored?:any, pick:(stop:any)=>any, useToken?:(kind:string)=>any, onCollect?:()=>void, get?:()=>any}} ctx
 */
export function findWheelOpts(vm, ctx) {
  // The ring MUST be the store wheel's own rows (vm.rows): the tree (Widener, Sharp Eyes, Extra Gold) widens / adds FIND blocks, so the base table for the rate
  // has other slice ids. A stop's sliceId is an index into the drawn ring and the store decides on the wheel's cells, so both must be the same ring.
  const ring0 = vm && Array.isArray(vm.rows) && vm.rows.length ? vm.rows.map((r, i) => ({ ...r, id: i })) : findRingFor(vm && vm.rate), get = ctx.get || (() => vm);
  const cheerP = cheerPrizeOf(vm);
  const ring = ring0.map((r) => ({ ...r, tierShape: r.gold ? 'triangle' : 'dot', ...(r.gold || !cheerP ? {} : { sub: cheerP }) }));
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
    aria: { wheel: findWheelAria(ring), landed: (stop) => findLanded(ring[stop.sliceId], (get() || {}).pending, cheerP), status: 'polite' },
    plainResult: true, jpText: 'FOUND!', tokName: 'Find',
    pending: asWheel(vm && vm.pending), getPending: () => asWheel(get().pending),
    // the one STOP callback: the store spin type (PickActivity / UseToken / FindCheer) decides and records the stop (recordFindStop / recordStop)
    onSpin: (stop) => ctx.pick(stop),
    describe: (p) => {
      const d = p.find ? findLine(p) : { big: cheerP ? 'CHEER! ' + cheerP : 'CHEER! No find this time.', say: 'CHEER! ' + (cheerP ? cheerP + '. ' : '') + 'No find this time. Next week, maybe.' };
      return { ...d, chip: p.find ? d.chip : '', line: [p.cheerDone ? 'Second Cheer: one more look!' : '', d.line || ''].filter(Boolean).join(' ') };
    },
    outcome: (kind, b, q) => { const nm = { respin: 'Spin Again', two: 'Pick Two' }[kind] || 'Token'; return q.find && !(b && b.find) ? nm + ': found ' + word(q) + '!' : nm + ': still nothing'; },
    tokens: tokensOf(vm || {}), getTokens: () => tokensOf(get()),
    onToken: ctx.useToken ? (kind) => ctx.useToken(kind) : undefined,
    onCollect: ctx.onCollect, spokeGain: () => (get().spokeGain || 0),
  };
}
