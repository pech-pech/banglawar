/* wm-spins: the call sites' glue for the wheel meta dials and reels (w2). Turns the store's plain data (wmstore.js VMs) into openDial / openReel props.
   Nothing here rolls anything: onSpin only dispatches; the result is read back from the fresh view model (get()) and the view animates to it.
   Each function takes `get()` = a function returning the CURRENT piece of the view model (so the pending result is read after the dispatch). */
import { openDial } from './dial-view.js';
import { openReel } from './reel-view.js';
import { openWheel } from './wheel-view.js'; // wa1 find: Find is a big wheel
import { normLook, colourOf, matOf } from './wheel-look.js';

/** craftLook ranks -> the {rim, hub, needle} colours the dial / reel take. Missing = skin palette. */
export function dialLook(look) {
  const n = normLook(look); if (!n) return undefined;
  const o = {}, rim = colourOf(n.rim) || (n.material ? matOf(n.material).rim : null), hub = colourOf(n.hub), nd = colourOf(n.ptr);
  if (rim) o.rim = rim; if (hub) o.hub = hub; if (nd) o.needle = nd;
  return o;
}
const HYPE_WORD = { low: 'Quiet crowd', med: 'Good crowd', high: 'Big crowd', nuts: 'Wild crowd' };
const stopOf = (s) => (s && Number.isFinite(s.t) ? { stop: { t: s.t, phi: s.phi, e: s.e } } : {});
/** wa1: the token + Control props every dial / reel takes from its VM piece (get() -> {tokens, guide, zone, chime, V, J}). wheel = the UseToken wheel id. */
export function tokProps(get, dispatch, wheel, name) {
  const v = get() || {};
  return { tokens: v.tokens || [], getTokens: () => (get() || {}).tokens || [], onToken: (kind) => dispatch('UseToken', { wheel, kind }), tokName: name, guide: !!v.guide,
    ...(v.zone ? { zone: v.zone } : {}), ...(v.chime ? { chime: true } : {}), ...(v.V ? { V: v.V } : {}), ...(v.J != null ? { J: v.J } : {}) };
}
/** wa1: the value a token compares, per wheel (mirrors core tokenValue on the VM's pending shape) and the short words for the outcome line. */
export const TOKVAL = {
  hype: (p) => +p.pts || 0, toss: (p) => +p.boostPct || 0, pep: (p) => (p.slots || [0]).length, scout: (p) => +p.steps || 0,
  finals: (p) => (p.coins | 0) + (p.tp | 0) + (p.fans | 0) + 60 * (p.medal | 0),
};

/** Hype: the aimable half dial. get() -> vm.wm.hype; dispatch('HypeSpin', {stop}). */
export function spinHype({ get, look, dispatch, onCollect, oppName }) {
  const h = get();
  return openDial({
    mode: 'aim', title: 'Crowd today', sub: oppName || '', cardHtml: '<p class="dr-hint">Stop the needle on gold for a wild crowd.' + ' The tick shows where it will land.' + '</p>', slices: h.slices /* fixdial V3 */, look: dialLook(look),
    ...tokProps(get, dispatch, 'hype', 'Hype'), tokVal: TOKVAL.hype, tokText: (p) => HYPE_WORD[p.level || 'low'] + ' +' + p.pts + '%',
    pending: h.pending, onSpin: (stop) => dispatch('HypeSpin', stopOf(stop)), getPending: () => get().pending,
    describe: (p) => { const lv = p.level || 'low'; return { big: HYPE_WORD[lv], chip: '+' + p.pts + '%', say: HYPE_WORD[lv] + ', plus ' + p.pts + ' percent for your team.', gold: lv === 'nuts' }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
/** Toss: a coin flip reveal. get() -> vm.wm.toss; dispatch('TossSpin'). */
export function spinToss({ get, look, dispatch, onCollect }) {
  const t = get();
  return openDial({
    mode: 'reveal', kind: 'coin', title: 'The toss', cardHtml: '<p class="dr-hint">Toss the coin.</p>', plan: { total: 2.5 }, slices: t.slices, look: dialLook(look), pending: t.pending,
    ...tokProps(get, dispatch, 'toss', 'Toss'), tokVal: TOKVAL.toss, tokText: (p) => (p.index === 0 ? 'Won toss' : p.sport || p.boostPct ? 'Good sport' : 'Rival won') + (p.boostPct ? ' +' + p.boostPct + '%' : ''),
    onSpin: () => dispatch('TossSpin', {}), getPending: () => get().pending,
    describe: (p) => p.index === 0
      ? { big: 'You won the toss', chip: '+' + p.boostPct + '%', say: 'You won the toss, plus ' + p.boostPct + ' percent for your team.' }
      : { big: 'Rival won the toss', line: 'Good sport: +1 Spoke' + (p.boostPct ? ' and +' + p.boostPct + '% for your team' : ''), chip: p.boostPct ? '+' + p.boostPct + '%' : '', say: 'Rival won the toss. Good sport' + (p.boostPct ? ', plus ' + p.boostPct + ' percent' : '') + '.' },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
/** Pep slices show the six's names (batting order), not slot numbers (M 2026-11-15 "Replace numbers with players"). Falls back to the number. Pure. */
export const pepSlices = (/** @type {any[]} */ sl, /** @type {string[]} */ names) => (sl || []).map((c, i) => ({ ...c, label: (names && names[i]) || c.label }));
/** Pep: six lights chase. get() -> vm.wm.pep; names = the six's names in batting order. dispatch('PepSpin'). */
export function spinPep({ get, look, dispatch, onCollect, names }) {
  const p0 = get(), who = (p) => (p.slots || [p.index + 1]).map((x) => names[x - 1] || 'Player ' + x);
  return openDial({
    mode: 'reveal', kind: 'lights', title: 'Pep talk', cardHtml: '<p class="dr-hint">Who gets the pep talk?</p>', plan: { total: 2.5 }, slices: pepSlices(p0.slices, names), nameLabels: true, look: dialLook(look), pending: p0.pending,
    ...tokProps(get, dispatch, 'pep', 'Pep'), tokVal: TOKVAL.pep, tokText: (p) => who(p).join(' and '),
    onSpin: () => dispatch('PepSpin', {}), getPending: () => get().pending,
    describe: (p) => { const w = who(p).join(' and '); return { big: w + ' got the pep talk', chip: '+5%', say: w + ' got the pep talk, plus 5 percent.', gold: (p.slots || []).length > 1 }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
const FIND_WORD = { coins: 'Coins', player: 'a trial player', coach: 'a trial coach' };
/** The Find card from what was really paid (a Player / Coach cell can fall back to Coins). */
export function findLine(p) {
  if (p.type === 'coins') { const n = (p.coins | 0).toLocaleString('en'), b = p.bonus | 0; return { big: 'Found ' + n + ' Coins', chip: 'Coins', line: b > 0 ? 'Booster bonus: +' + b + ' Coins' : '', say: 'You found ' + n + ' Coins' + (b > 0 ? ', including ' + b + ' Booster bonus Coins' : '') + '.', gold: !!p.jackpot }; }
  const w = FIND_WORD[p.type] || 'something';
  return { big: 'Found ' + w, chip: 'Trial', say: 'You found ' + w + '.', gold: !!p.jackpot };
}
/** Find (wa1, agent "find"): the big wheel (openWheel, like the Spotlight). get() -> the option's wheel data (slices, widths, golds, labels, phys, pending, tokens);
    pick = dispatch('PickActivity', {id, stop}); useToken(kind) = dispatch('UseToken', {wheel:'find', kind}). One SPIN + STOP, the find blocks are gold. */
export function spinFind({ get, look, pick, useToken, onCollect, title }) {
  const r = get(), word = (p) => (p && p.find ? (FIND_WORD[p.type] || 'something') : 'Nothing');
  const asWheel = (p) => (p ? { ...p, gain: p.find ? 1 : 0, jackpot: !!p.find } : p); // the wheel reads index / gain / jackpot
  return openWheel({
    title: title || 'Find', cardHtml: '<p class="dr-hint">Stop on a gold block to find Coins, a player or a coach. The tick shows where it will land.</p>',
    slices: r.slices, widths: r.widths, jackpotIndex: r.jackpotIndex, golds: r.golds, aims: r.aims, labels: r.labels, phys: r.phys,
    guide: !!r.guide, zone: r.zone || 0, chime: !!r.chime, look, plainResult: true, jpText: 'FOUND!', tokName: 'Find',
    pending: asWheel(r.pending), onSpin: (stop) => pick(stopOf(stop)), getPending: () => asWheel(get().pending),
    describe: (p) => {
      const d = p.find ? findLine(p) : { big: 'Nothing this time', say: 'No find this time. Next week, maybe.' };
      const line = [p.second ? 'Second Cheer: one more look!' : '', d.line || ''].filter(Boolean).join(' ');
      return { ...d, chip: p.find ? d.chip : '', line };
    },
    outcome: (kind, b, q) => { const nm = { respin: 'Spin Again', two: 'Pick Two', nudge: 'Nudge' }[kind] || 'Token'; return q.find && !(b && b.find) ? nm + ': found ' + word(q) + '!' : nm + ': still nothing'; },
    tokens: r.tokens || [], getTokens: () => { const x = get(); return (x.tokens || []).map((t) => (x.tokLeft != null ? { ...t, left: x.tokLeft, ...(t.count != null ? { count: Math.min(t.count | 0, x.tokLeft) } : {}) } : t)); }, // wa1 fixfind: xN never above the uses left this season
    onToken: useToken ? (kind) => useToken(kind) : undefined,
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
/** wa1: the words for a Scout result. A Lucky Lift can add a step to an Extra name, so both can show. */
export function scoutWords(p) {
  const st = p.steps | 0, stw = '+' + st + (st === 1 ? ' step' : ' steps');
  if (p.extra && st > 0) return { big: 'One more name, top name ' + stw, say: 'The scouts found one more name, and the best name goes up ' + stw.slice(1) + '.', short: 'one more name, ' + stw };
  if (p.extra) return { big: 'One more name on the list', say: 'The scouts found one more name.', short: 'one more name' };
  return { big: 'Top name ' + stw, say: 'The best name on the list goes up ' + stw.slice(1) + '.', short: stw };
}
/** wa1: the words for a Finals prize from what it pays (a Lucky Lift adds Coins to any prize but a Medal; the slice label alone would go stale). */
export function finalsWords(p) {
  const parts = [];
  if (p.medal > 0) parts.push('+' + p.medal + ' Medal'); if (p.coins > 0) parts.push(p.coins + ' Coins'); if (p.tp > 0) parts.push(p.tp + ' TP'); if (p.fans > 0) parts.push(p.fans + ' Fans');
  return parts.length ? parts.join(' + ') : (p.label || 'Prize');
}
/** wa1 fixreel (QA V7): the reason line when the prize is not the cell's label: "Prize Pair: 20 Fans x1.5 = 30" (one part per unit Prize Pair raised). '' when none. */
export function finalsPairLine(p) {
  if (!p || !p.pair || !p.base) return '';
  const x = (v) => Math.floor(v * 1.5 + 0.5), u = [['coins', 'Coins'], ['tp', 'TP'], ['fans', 'Fans']].filter(([k]) => p.base[k] > 0);
  return u.length ? 'Prize Pair: ' + u.map(([k, w]) => p.base[k] + ' ' + w + ' x1.5 = ' + x(p.base[k])).join(', ') : '';
}
/** wa1 fixreel (QA V7): the plain Lucky Lift line ("Lucky Lift: +10 Coins"); other tokens keep the shared line (null = use it). */
export function finalsTokLine(kind, before, q) {
  if (kind !== 'lift') return null;
  const d = (TOKVAL.finals(q || {}) - TOKVAL.finals(before || q || {})) | 0;
  return d > 0 ? 'Lucky Lift: +' + d + ' Coins' : 'Lucky Lift: no bonus';
}
/** Scout: reveal reel when the list opens. get() -> vm.spin; dispatch('ScoutSpin'). */
export function spinScout({ get, look, dispatch, onCollect }) {
  const s = get();
  return openReel({
    mode: 'reveal', title: 'The scouts', cardHtml: '<p class="dr-hint">What do the scouts bring?</p>', plan: { total: 3 }, cells: s.cells, look: dialLook(look), pending: s.pending,
    ...tokProps(get, dispatch, 'scout', 'Scout'), tokVal: TOKVAL.scout, tokText: (p) => scoutWords(p).short,
    onSpin: () => dispatch('ScoutSpin', {}), getPending: () => get().pending,
    describe: (p) => { const w = scoutWords(p); return { big: w.big, say: w.say, gold: !p.extra && !!p.jackpot }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
/** Finals prize: reveal reel on the result screen. get() -> vm.finals; dispatch('FinalsSpin'). */
export function spinFinals({ get, look, dispatch, onCollect }) {
  const f = get();
  return openReel({
    mode: 'reveal', title: 'Finals prize', cardHtml: '<p class="dr-hint">Spin for your prize.</p>', plan: { total: 3 }, cells: f.cells, look: dialLook(look), pending: f.pending,
    ...tokProps(get, dispatch, 'finals', 'Finals'), tokVal: TOKVAL.finals, tokText: finalsWords, tokLine: finalsTokLine,
    onSpin: () => dispatch('FinalsSpin', {}), getPending: () => get().pending,
    describe: (p) => { const w = finalsWords(p), why = finalsPairLine(p); return { big: w, ...(why ? { line: why } : {}), say: 'Finals prize: ' + w + '.' + (why ? ' ' + why.replace('x1.5', 'times one and a half') + '.' : ''), gold: !!p.jackpot }; },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
