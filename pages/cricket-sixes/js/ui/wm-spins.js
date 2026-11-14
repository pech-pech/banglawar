/* wm-spins: the call sites' glue for the wheel meta dials and reels (w2). Turns the store's plain data (wmstore.js VMs) into openDial / openReel props.
   Nothing here rolls anything: onSpin only dispatches; the result is read back from the fresh view model (get()) and the view animates to it.
   Each function takes `get()` = a function returning the CURRENT piece of the view model (so the pending result is read after the dispatch). */
import { openDial } from './dial-view.js';
import { openReel } from './reel-view.js';
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

/** Hype: the aimable half dial. get() -> vm.wm.hype; dispatch('HypeSpin', {stop}). */
export function spinHype({ get, look, dispatch, onCollect, oppName }) {
  const h = get();
  return openDial({
    mode: 'aim', title: 'Crowd today', sub: oppName || '', cardHtml: '<p class="dr-hint">Stop the needle on the gold slice for a wild crowd.</p>', slices: h.slices, guide: !!h.guide, look: dialLook(look),
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
    onSpin: () => dispatch('TossSpin', {}), getPending: () => get().pending,
    describe: (p) => p.index === 0
      ? { big: 'You won the toss', chip: '+' + p.boostPct + '%', say: 'You won the toss, plus ' + p.boostPct + ' percent for your team.' }
      : { big: 'Rival won the toss', line: 'Good sport: +1 Spoke' + (p.boostPct ? ' and +' + p.boostPct + '% for your team' : ''), chip: p.boostPct ? '+' + p.boostPct + '%' : '', say: 'Rival won the toss. Good sport' + (p.boostPct ? ', plus ' + p.boostPct + ' percent' : '') + '.' },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
/** Pep: six lights chase. get() -> vm.wm.pep; names = the six's names in batting order. dispatch('PepSpin'). */
export function spinPep({ get, look, dispatch, onCollect, names }) {
  const p0 = get(), who = (p) => (p.slots || [p.index + 1]).map((x) => names[x - 1] || 'Player ' + x);
  return openDial({
    mode: 'reveal', kind: 'lights', title: 'Pep talk', cardHtml: '<p class="dr-hint">Who gets the pep talk?</p>', plan: { total: 2.5 }, slices: p0.slices, look: dialLook(look), pending: p0.pending,
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
/** Find: the aimable reel. get() -> the option's reel data (cells, pending, guide); pick = dispatch('PickActivity', {id, stop}). */
export function spinFind({ get, look, pick, onCollect, title }) {
  const r = get();
  return openReel({
    mode: 'aim', title: title || 'Find', cardHtml: '<p class="dr-hint">Stop on a gold cell to find something.</p>', cells: r.cells, guide: !!r.guide, look: dialLook(look), pending: r.pending,
    onSpin: (stop) => pick(stopOf(stop)), getPending: () => get().pending,
    describe: (p) => p.find ? findLine(p) : { big: 'Nothing this time', say: 'No find this time. Next week, maybe.' },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
/** Scout: reveal reel when the list opens. get() -> vm.spin; dispatch('ScoutSpin'). */
export function spinScout({ get, look, dispatch, onCollect }) {
  const s = get();
  return openReel({
    mode: 'reveal', title: 'The scouts', cardHtml: '<p class="dr-hint">What do the scouts bring?</p>', plan: { total: 3 }, cells: s.cells, look: dialLook(look), pending: s.pending,
    onSpin: () => dispatch('ScoutSpin', {}), getPending: () => get().pending,
    describe: (p) => p.extra ? { big: 'One more name on the list', say: 'The scouts found one more name.' } : { big: 'Top name +' + p.steps + (p.steps === 1 ? ' step' : ' steps'), say: 'The best name on the list goes up ' + p.steps + (p.steps === 1 ? ' step.' : ' steps.'), gold: !!p.jackpot },
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
/** Finals prize: reveal reel on the result screen. get() -> vm.finals; dispatch('FinalsSpin'). */
export function spinFinals({ get, look, dispatch, onCollect }) {
  const f = get();
  return openReel({
    mode: 'reveal', title: 'Finals prize', cardHtml: '<p class="dr-hint">Spin for your prize.</p>', plan: { total: 3 }, cells: f.cells, look: dialLook(look), pending: f.pending,
    onSpin: () => dispatch('FinalsSpin', {}), getPending: () => get().pending,
    describe: (p) => ({ big: p.label, say: 'Finals prize: ' + p.label + '.', gold: !!p.jackpot }),
    onCollect, spokeGain: () => get().spokeGain || 0,
  });
}
