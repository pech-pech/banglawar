// @ts-check
// Match day screen (r9, FEATURES s4): Squad > Match day > Plan. render(el, vm, dispatch). Reads only matchdayVM.
// The rolls are already made (vm); taps only REVEAL them. Reveal state is view state, never saved, never rolls anything.
// vm = STORE selectors.matchdayVM: {oppName, kindWord, hype:{level, idx, word, perfPct, fanMult}, odds:[{level,word,pct}x4],
//   roar:{on, chancePct, overs}, toss:{won, boostPct, line}, pep:{slot,id,name,boostPct}|null, six:[{slot,id,name,pep}], boost, auto, forced}.
// Commands: MatchdayGo (vm.next: 'Start match' when it starts the match, 'Next: Plan' when it opens Plan), BackToSquad. Plain words, no countdown, no sound, no spend on luck.
import { esc, icoDeco } from './dom.js';
import { openSheet } from './sheet.js';
import { spinHype, spinToss, spinPep } from './wm-spins.js';

export const HYPE = {
  low: { word: 'Quiet crowd', line: 'Quiet crowd today' },
  med: { word: 'Good crowd', line: 'Good crowd today' },
  high: { word: 'Big crowd', line: 'Big crowd today' },
  nuts: { word: 'Wild crowd', line: 'Wild crowd today' },
};
const LEVELS = ['low', 'med', 'high', 'nuts'];
/** Plain word for a hype level. Pure. */
export function hypeWord(level) { return (HYPE[level] || HYPE.low).line; }

const pct = (x) => Math.round((x - 1) * 100);
/**
 * Boost the player has SEEN so far, multiplicative (SPEC s7): team = (1+hype)(1+toss), pep player also x(1+pep). Whole percent. Pure.
 * @param {any} vm @param {{hype?:boolean,toss?:boolean,pep?:boolean}} shown
 */
export function boostTotals(vm, shown) {
  const h = shown.hype ? 1 + (vm.hype.perfPct || 0) / 100 : 1;
  const t = shown.toss && vm.toss && vm.toss.won ? 1 + (vm.toss.boostPct || 0) / 100 : 1;
  const p = shown.pep && vm.pep ? 1 + (vm.pep.boostPct || 0) / 100 : 1;
  return { teamPct: pct(h * t), pepPct: pct(h * t * p) };
}

const ICON = { hype: 'fan', toss: 'medal', pep: 'team', roar: 'fan' };
/** Small row of result chips (Plan, match headers) when the screen was skipped. chips: [{k, text}]. Pure. */
export function chipRowHtml(chips) {
  if (!chips || !chips.length) return '';
  chips = chips.map((c) => ({ k: c.k || c.key, text: c.text, aria: c.aria }));
  return '<ul class="md-chips list-flat" aria-label="Match day boosts">' +
    chips.map((c) => '<li class="md-chip"' + (c.aria ? ' aria-label="' + esc(c.aria) + '"' : '') + '>' + icoDeco(ICON[c.k] || 'medal', 16) + '<span>' + esc(c.text) + '</span></li>').join('') + '</ul>';
}
/** Gold "Crowd roar +5%" chip for a roar over (words, never colour alone). Pure. roar: boolean or {on} or {pct}. */
export function roarChipHtml(roar) {
  const on = roar === true || (roar && typeof roar === 'object' && roar.on !== false);
  if (!on) return '';
  const o = typeof roar === 'object' ? roar : {};
  return '<p class="md-roar" role="status"' + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + '>' + icoDeco('fan', 20) + '<b>' + esc(o.text || 'Crowd roar +5%') + '</b></p>';
}

/** Info sheet body: odds, toss, pep, roar, in plain words. Pure. */
export function oddsHtml(vm) {
  const od = vm.odds || [], o = LEVELS.map((k, i) => (od[i] ? od[i].pct : [35, 35, 20, 10][i])), per = [2, 4, 6, 10];
  const rows = LEVELS.map((k, i) => '<tr' + (k === vm.hype.level && !vm.wm ? ' class="is-today"' : '') + '><th scope="row">' + esc(HYPE[k].word) + '</th><td>+' + per[i] + '% to your team</td><td>' + o[i] + ' in 100</td></tr>').join('');
  return '<div class="md-info"><p>Each match day the crowd mood is drawn before you see it. More Fans and fan activities tilt the odds a little. Nothing here costs Coins.</p>' +
    '<table class="md-odds"><caption class="ss-sr">Crowd mood odds today</caption><thead><tr><th scope="col">Mood</th><th scope="col">Boost</th><th scope="col">Chance</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p><b>Toss:</b> win it for +5% for your team. If the rival wins it, nothing changes.</p>' +
    '<p><b>Pep talk:</b> one of your six gets +5% more.</p>' +
    '<p><b>Crowd roar:</b> some overs your whole team gets +5% for that over. More Fans, more roars.</p>' +
    '<p>Boosts stack by multiplying. They are for your team only.</p></div>';
}

/** The whole screen as markup. shown = which cards are revealed. Pure. @param {any} vm @param {{hype?:boolean,toss?:boolean,pep?:boolean}} shown */
export function matchdayHtml(vm, shown) {
  const b = boostTotals(vm, shown);
  const lvl = LEVELS.indexOf(vm.hype.level);
  // m9: a meter of 4 steps in one row. The level is marked by the fill AND the word "Today" (never colour alone).
  const steps = LEVELS.map((k, i) => { const on = shown.hype && i <= lvl, now = shown.hype && i === lvl, w = HYPE[k].word.replace(' crowd', '');
    return '<li class="md-step' + (on ? ' is-on' : '') + (now ? ' is-now' : '') + '"' + (now ? ' aria-current="true"' : '') + '><span class="md-bar" aria-hidden="true"></span><span class="md-lab">' + esc(w) + '</span><span class="md-today">' + (now ? 'Today' : '') + '</span></li>'; }).join('');
  const hype = shown.hype
    ? '<section class="c-card md-card is-shown" aria-label="Crowd today"><h2 class="md-h">' + icoDeco('fan', 24) + esc(hypeWord(vm.hype.level)) + ' <span class="md-pct">+' + esc(vm.hype.perfPct) + '%</span></h2><ol class="md-steps list-flat" aria-label="Crowd meter, four steps: Quiet, Good, Big, Wild">' + steps + '</ol></section>'
    : '<button type="button" class="c-btn md-tap" data-md="hype">' + icoDeco('fan', 24) + '<span><b>Tap to see the crowd today</b><small>Quiet, good, big or wild</small></span></button>';
  const toss = shown.toss
    ? '<section class="c-card md-card is-shown" aria-label="Toss"><h2 class="md-h">' + icoDeco('medal', 24) + (vm.toss.won ? 'You won the toss <span class="md-pct">+' + esc(vm.toss.boostPct) + '%</span>' : 'Rival won the toss. Nothing changes.') + '</h2></section>'
    : '<button type="button" class="c-btn md-tap" data-md="toss">' + icoDeco('medal', 24) + '<span><b>Tap to flip the coin</b><small>Win the toss for a boost</small></span></button>';
  const six = (vm.six || []).map((p) => '<li class="md-six' + (shown.pep && vm.pep && p.slot === vm.pep.slot ? ' is-pep' : '') + '"><span class="md-slot" aria-hidden="true">' + esc(p.slot) + '</span><span class="name">' + esc(p.name) + '</span>' +
    (shown.pep && vm.pep && p.slot === vm.pep.slot ? '<span class="md-tag">' + icoDeco('team', 16) + 'Pep talk +' + esc(vm.pep.boostPct) + '%</span>' : '') + '</li>').join('');
  const pep = shown.pep
    ? '<section class="c-card md-card is-shown" aria-label="Pep talk"><h2 class="md-h">' + icoDeco('team', 24) + esc(vm.pep.name) + ' got the pep talk</h2><ol class="md-sixl list-flat" aria-label="Your six, in batting order">' + six + '</ol></section>'
    : '<button type="button" class="c-btn md-tap" data-md="pep">' + icoDeco('team', 24) + '<span><b>Tap for the pep talk</b><small>One of your six gets a lift</small></span></button>';
  const roar = vm.roar && vm.roar.chancePct != null ? '<p class="md-line">' + icoDeco('fan', 20) + 'Crowd roar chance: ' + esc(vm.roar.chancePct) + '% an over</p>' : '';
  const names = shown.pep && vm.pep && b.pepPct !== b.teamPct;
  const total = (shown.hype || shown.toss || shown.pep)
    ? 'Team +' + b.teamPct + '%' + (names ? ', ' + esc(vm.pep.name) + ' +' + b.pepPct + '%' : '')
    : 'Tap the cards to see your boost.';
  return '<div class="md-root">' +
    '<header class="strip c-dark md-strip"><span class="mid"><b>Match day</b><span>' + esc((vm.kindWord ? vm.kindWord + ' ' : '') + (vm.oppName ? 'vs ' + vm.oppName : 'Before the match')) + '</span></span>' +
    '<button type="button" class="c-icon-btn help-btn" data-md="info" aria-label="How match day works">?</button></header>' +
    '<div class="md-body">' + hype + roar + toss + pep +
    '<p class="md-total" aria-label="Boost total">' + total + '</p>' +
    '<p class="ss-sr" role="status" aria-live="polite" aria-atomic="true" data-md-live></p></div>' +
    '<div class="ctabar md-cta"><button type="button" class="c-btn md-back" data-act="BackToSquad">Back to squad</button>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta" data-act="MatchdayGo">' + esc(vm.next || 'Next: Plan') + '</button></div></div>';
}

/** Spoken line for a card the moment it is shown (the live region reads it once). Pure. */
export function liveLine(vm, which) {
  if (which === 'hype') return hypeWord(vm.hype.level) + ', plus ' + vm.hype.perfPct + ' percent.';
  if (which === 'toss') return vm.toss.won ? 'You won the toss, plus ' + vm.toss.boostPct + ' percent.' : 'Rival won the toss. Nothing changes.';
  return vm.pep.name + ' got the pep talk, plus ' + vm.pep.boostPct + ' percent.';
}

/** Fixture for screenshots and tests until STORE publishes the real shape. */
export const FIXTURE_VM = {
  oppName: 'Brackwell CC', kindWord: 'League match',
  hype: { level: 'med', idx: 1, word: 'Good crowd', perfPct: 4, fanMult: 1.1 },
  odds: [{ level: 'low', word: 'Quiet crowd', pct: 35 }, { level: 'med', word: 'Good crowd', pct: 35 }, { level: 'high', word: 'Big crowd', pct: 20 }, { level: 'nuts', word: 'Wild crowd', pct: 10 }],
  roar: { on: true, chancePct: 12, overs: 3 },
  toss: { won: true, boostPct: 5, line: 'You won the toss. +5% for your team.' },
  pep: { slot: 3, id: 'p3', name: 'Rafi', boostPct: 5 },
  six: [{ slot: 1, name: 'Dev' }, { slot: 2, name: 'Imran' }, { slot: 3, name: 'Rafi', pep: true }, { slot: 4, name: 'Sam' }, { slot: 5, name: 'Okoye' }, { slot: 6, name: 'Tariq' }],
  boost: { teamPct: 9, pepPct: 15, line: 'Team +9%, Rafi +15%' }, auto: false, forced: false, next: 'Next: Plan', back: 'Back to squad',
};

const SEEN = {}; // reveal state by vm.key, so coming back from Squad keeps what the player already saw (the rolls never change)
/** @param {HTMLElement} el @param {any} vm @param {(cmd:string, payload:any)=>void} dispatch */
export function render(el, vm, dispatch) {
  const E = /** @type {any} */ (el);
  const key = vm.key ? String(vm.key) : vm.wm ? [vm.kindWord, vm.oppName, 'wm'].join('|') : [vm.kindWord, vm.oppName, vm.hype.level, vm.toss.won, vm.pep && vm.pep.id].join('|'); // wheel meta: the spins change the roll, the reveal state must survive that
  const shown = SEEN[key] || (SEEN[key] = {});
  const paint = (live, focus) => {
    // r9 QA2 m1: a reveal tap repaints only the body, so the strip keeps the Settings gear the report hooks put there
    const oldBody = live != null ? el.querySelector('.md-root > .md-body') : null;
    if (oldBody) {
      const tpl = document.createElement('template'); tpl.innerHTML = matchdayHtml(vm, shown);
      const nb = tpl.content.querySelector('.md-body');
      if (nb) oldBody.replaceWith(nb); else el.innerHTML = matchdayHtml(vm, shown);
    } else el.innerHTML = matchdayHtml(vm, shown);
    if (live) { const r = el.querySelector('[data-md-live]'); if (r) r.textContent = live; }
    if (focus) { const f = el.querySelector(focus); if (f) /** @type {HTMLElement} */ (f).focus(); }
  };
  // the upgrades switch went On with cards already opened (Off-mode rolls): keep those rolls, never re-spin them
  if (vm.wm) { const keep = ['hype', 'toss', 'pep'].filter((w) => shown[w] && vm.wm[w] && !vm.wm[w].spun); if (keep.length && !E.__mdKeeping) { E.__mdKeeping = true; Promise.resolve().then(() => { E.__mdKeeping = false; (E.__mdDispatch || dispatch)('MdKeep', { which: keep }); }); } }
  E.__mdVM = vm; E.__mdShown = shown; E.__mdPaint = paint;
  paint();
  if (!E.__mdBound) {
    E.__mdBound = true;
    // r9 review H1: no bindActs here. el is the shared #app, which app.js already binds once; a second handler fired every data-act twice.
    el.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target).closest('[data-md]'); if (!t || !el.contains(t)) return;
      const w = t.getAttribute('data-md'), V = E.__mdVM;
      if (w === 'info') { openSheet('How match day works', oddsHtml(V), { returnFocus: '[data-md="info"]' }); return; }
      if (V.wm && V.wm[w] && !E.__mdShown[w]) { // wheel meta: the card opens the spin; Collect reveals the card (the result is already stored by the spin command)
        const get = () => E.__mdVM.wm[w], d = (c, a) => E.__mdDispatch(c, a || {});
        const done = () => { E.__mdShown[w] = true; const nx = ['hype', 'toss', 'pep'].find((k) => !E.__mdShown[k]); E.__mdPaint(liveLine(E.__mdVM, w), nx ? '[data-md="' + nx + '"]' : '[data-act="MatchdayGo"]'); };
        const o = { get, look: V.look, dispatch: d, onCollect: done };
        if (w === 'hype') spinHype({ ...o, oppName: V.oppName }); else if (w === 'toss') spinToss(o); else spinPep({ ...o, names: (V.six || []).map((p) => p.name) });
        return;
      }
      E.__mdShown[w] = true;
      // focus moves to the Next button when the last card opens; otherwise to the next unopened card
      const nxt = ['hype', 'toss', 'pep'].find((k) => !E.__mdShown[k]);
      E.__mdPaint(liveLine(V, w), nxt ? '[data-md="' + nxt + '"]' : '[data-act="MatchdayGo"]');
    });
  }
  E.__mdDispatch = dispatch;
}
export { render as renderMatchday };
