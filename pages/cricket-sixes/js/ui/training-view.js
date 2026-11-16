/* training-view: screen 5, the training week (P11 redo). render(el, vm, dispatch, open). Reads trainingVM (selectors.js) only.
   A normal week = 2 taps: Run nets, Done. Focus and Effort are remembered from last week.
   Uses: week, tp, plan{focus,effort,spotlightId,coachId}, efforts[{id,cost}], rows[{id,name,bench,role,type,rates:{batPower,batSkill,bowlSpeed,bowlSkill},status:'train'|'short'|'skip',stat}],
         coaches[{id,name,letter,strong,picked}], preview{cost,trainCount,shortCount,skipCount,hint}, spotlight{wheel:{slices,jackpotIndex},pending|null},
         done, canRun, result{lines:[{id,name,rating,fromRaw,toRaw,word,wheelGain?,breakthrough}],cost,skipped}.
   Commands: SetTrainPlan {focus|effort|spotlightId|coachId}, Spin {careful}, RunNets {}, EndWeek {}. Taps: a row -> sheet:player; coach strip (wa1) -> SetTrainPlan {coachId}, sheet:coaches {course}|{scout}|none. */
import { chipHtml } from './coach-job-chip.js';
import { xpBarHtml, coachWeekly } from './coach-xp-bar.js';
import { normJob } from '../core/coach-jobs.js';
import { esc, icoDeco, bindActs, ctaBar } from './dom.js';
import { openSheet } from './sheet.js';
import { letterOfRaw, stepOfRaw } from '../core/letters.js';
import { playNets, lineHtml, skipLine, letterBar, STAT, statKey } from './nets-scene.js';
import { openWheel } from './wheel-view.js';
import { drawHead } from './club-canvas.js';
import { SPOT_SLICES } from '../data/wheel-slices-train.js';
import { applyKindFloor } from '../core/perks/kind-floor.js';

export const ROLE_ICON = { opener: 'roleOpener', middle: 'roleMiddle', lower: 'roleLower' };
export const TYPE_ICON = { fast: 'typeFast', medium: 'typeMedium', spin: 'typeSpin' };
export const RATING_ICON = { batPower: 'batPower', batSkill: 'batSkill', bowlSpeed: 'bowlSpeed', bowlSkill: 'bowlSkill' };
export const RATING_WORD = { batPower: 'Batting Power', batSkill: 'Batting Skill', bowlSpeed: 'Bowling Speed', bowlSkill: 'Bowling Skill' };
export const roleIcon = (r) => ROLE_ICON[String(r || '').toLowerCase()] || 'roleMiddle';
export const typeIcon = (t) => TYPE_ICON[String(t || '').toLowerCase()] || 'typeMedium';
/** A decorative icon (the words beside it carry the meaning). */
export const deco = (name, size) => icoDeco(name, size || 20);
/** Icon + word, kept together. */
export const iw = (name, word) => '<span class="tr-iw">' + deco(name, 20) + '<span>' + esc(word) + '</span></span>';
/** TP chip: tp icon, number, word. */
export const tp = (n) => '<span class="c-chip chip m0-tp tr-tp" aria-label="' + esc(n) + ' training points">' + deco('tp', 20) + '<b>' + esc(n) + '</b><span>TP</span></span>';
/** The Peak tag, icon + word. */
export const peak = () => '<span class="c-tag m0-peak tr-peak" aria-label="At peak">' + deco('peak', 20) + '<span>Peak</span></span>';
/** TP chip: icon + number, the cost on a button. */
export const chip = (n) => '<span class="tr-chip" aria-label="' + esc(n) + ' Training Points">' + deco('tp', 24) + '<span>' + esc(n) + '</span></span>';

export const FOCUS_WORD = { bat: 'Batting', bowl: 'Bowling', bal: 'Balanced' };
export const FOCUS_ICON = { bat: 'batPower', bowl: 'bowlSpeed', bal: 'team' };
const EFFORT_WORD = { easy: 'Easy', normal: 'Normal', push: 'Push' };
const EFFORT_ICON = { easy: 'week', normal: 'upgrade', push: 'burst' };
/** Strong focus icons + words for a coach: `[bat icon] Batting [ball icon] Bowling`. */
export const strongHtml = (strong) => (strong || []).map((f) => '<span class="t2-fi">' + deco(FOCUS_ICON[f] || 'train', 20) + '<span>' + esc(FOCUS_WORD[f] || f) + '</span></span>').join('');
export const strongText = (strong) => (strong || []).map((f) => FOCUS_WORD[f] || f).join(' and ') || 'none';

const RK = { batPower: 'bp', batSkill: 'bs', bowlSpeed: 'spd', bowlSkill: 'bsk' };
const WORD_KEY = { Power: 'bp', Technique: 'bs', Pace: 'spd', Craft: 'bsk' };
const shortRates = (r) => (r && r.bp == null ? { bp: r.batPower, bs: r.batSkill, spd: r.bowlSpeed, bsk: r.bowlSkill } : r || {});
/** Kind Floor flag from the vm: effective(s).spot.kindFloor as the selector passes it (spotlight.kindFloor), else the wheel's own field; 0 / absent = not owned. */
const kfOf = (a, w) => !!((a && a.kindFloor) || (w && w.kindFloor));
const rawTwin = (vm) => vm.twin || { held: 0, line: '', wheel: null, pending: null };
/** trainingVM -> the small shape this view draws. */
export function adapt(vm) {
  const rows = (vm.rows || []).map((r) => ({ ...r, state: r.status || r.state, rates: shortRates(r.rates) }));
  const P = vm.plan || { focus: 'bat', effort: 'normal' }, sp = rows.find((r) => r.id === P.spotlightId);
  const costs = {}; (vm.efforts || []).forEach((e) => { costs[e.id] = e.cost; });
  const pc = (vm.coaches || []).find((c) => c.picked) || null, pv = vm.preview || {};
  const wl = vm.spotlight && vm.spotlight.wheel;
  const wheel = sp && wl ? { slices: wl.slices, jackpotIndex: wl.jackpotIndex, widths: wl.widths, player: { id: sp.id, name: sp.name, rates: sp.rates }, stat: WORD_KEY[sp.stat] || 'bp', pending: vm.spotlight.pending || null, guide: !!vm.spotlight.guide, zone: +vm.spotlight.zone || 0, chime: !!vm.spotlight.chime, tokens: vm.spotlight.tokens || [], look: vm.spotlight.look || null, phys: wl.phys || null, golds: wl.golds || null, kindFloor: kfOf(vm.spotlight, wl), spinKey: vm.spotlight.spinKey || '', wobKey: vm.spotlight.wobKey || '', stored: vm.spotlight.stored || null, room: vm.spotlight.room != null ? vm.spotlight.room : vm.room } : null;
  const tw = rawTwin(vm), sp2 = tw.held > 0 ? rows.find((r) => r.id === P.spotlight2Id) : null, wl2 = tw.wheel;
  const wheel2 = sp2 && wl2 ? { slices: wl2.slices, jackpotIndex: wl2.jackpotIndex, widths: wl2.widths, player: { id: sp2.id, name: sp2.name, rates: sp2.rates }, stat: WORD_KEY[sp2.stat] || 'bp', pending: tw.pending || null, guide: !!tw.guide, zone: +tw.zone || 0, chime: !!tw.chime, tokens: tw.tokens || [], look: tw.look || null, phys: wl2.phys || null, golds: wl2.golds || null, kindFloor: kfOf(tw, wl2) || kfOf(vm.spotlight, wl), spinKey: tw.spinKey || '', wobKey: tw.wobKey || '', stored: tw.stored || null } : null;
  const nets = vm.done && vm.result ? { id: vm.week, cost: vm.result.cost, lines: vm.result.lines.map((l) => ({ ...l, stat: RK[l.rating] || l.rating || WORD_KEY[l.stat] || 'bp' })), skipped: rows.filter((r) => r.state === 'skip').map((r) => ({ id: r.id, name: r.name, why: "Can't gain" })) } : null;
  return { week: vm.week, tp: vm.tp, twin: { held: tw.held, line: tw.line, name: sp2 ? sp2.name : null }, wheel2, plan: { ...P, spotlightName: sp ? sp.name : null }, costs: { easy: 10, normal: 13, push: 18, ...costs }, coach: pc, rows, wheel, nets, canRun: vm.canRun !== false,
    preview: { cost: pv.cost || 0, trainN: pv.trainCount != null ? pv.trainCount : pv.trainN, skippedN: pv.skipCount != null ? pv.skipCount : pv.skippedN || 0, shortN: pv.shortCount != null ? pv.shortCount : pv.shortN || 0, hint: pv.hint || null } };
}

let latest = null, runPending = false, lastLive = '';

function announce(text) {
  if (typeof document === 'undefined' || text === lastLive) return;
  let n = document.getElementById('tr-live');
  if (!n) { n = document.createElement('div'); n.id = 'tr-live'; n.className = 'sr-only'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
  if (lastLive !== '') n.textContent = text;
  lastLive = text;
}

const statsStrip = (rates) => ['bp', 'bs', 'spd', 'bsk'].map((k) => {
  const r = rates && rates[k] != null ? rates[k] : 1, st = STAT(k);
  return '<span class="t2-ms" aria-label="' + esc(st.word + ' ' + letterOfRaw(r)) + '">' + deco(st.icon, 20) + '<b>' + esc(letterOfRaw(r)) + '</b></span>';
}).join('');

function rowHtml(r) {
  const word = r.state === 'skip' ? "Can't gain" : r.state === 'short' ? 'Waits: not enough TP' : '';
  const label = r.name + (r.bench ? ', bench' : '') + ', ' + ['bp', 'bs', 'spd', 'bsk'].map((k) => STAT(k).word + ' ' + letterOfRaw((r.rates || {})[k] || 1)).join(', ') + (word ? ', ' + word : '');
  return '<li class="c-row m0-row c-row--tap tr-row t2-row' + (r.bench ? ' m0-row--bench' : '') + (r.state && r.state !== 'train' ? ' is-off' : '') + '">' +
    '<button type="button" class="tr-rowbtn" data-act="sheet:player" data-arg="' + esc(JSON.stringify({ id: r.id })) + '" aria-label="' + esc(label) + '">' +
    '<span class="t2-who"><span class="c-row__title name tr-name">' + esc(r.name) + '</span><span class="t2-sub">' +
    (r.bench ? '<span class="tr-bench" role="img" aria-label="Bench">' + deco('bench', 20) + '</span>' : '') + deco(roleIcon(r.role), 20) + deco(typeIcon(r.type), 20) +
    (word ? '<span class="t2-off">' + deco(r.state === 'skip' ? 'lock' : 'tp', 20) + '<span>' + esc(word) + '</span></span>' : '') + '</span></span>' +
    '<span class="t2-ms-row">' + statsStrip(r.rates) + '</span></button></li>';
}

function seg(group, label, opts, cur) {
  return '<div class="c-seg t2-seg" role="group" aria-label="' + esc(label) + '">' + opts.map((o) =>
    '<button type="button" class="c-seg__opt t2-opt" data-act="SetTrainPlan" data-arg=\'{"' + group + '":"' + o.v + '"}\' aria-pressed="' + (cur === o.v) + '" aria-label="' + esc(o.aria) + '">' + deco(o.ico, 20) + '<span class="t2-ol"><span>' + esc(o.w) + '</span>' + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</span></button>').join('') + '</div><p class="dr-hint">The tick shows the slice under the pointer now.</p>';
}

function spotSheet(vm, dispatch, slot) {
  const two = slot === 2, key = two ? 'spotlight2Id' : 'spotlightId', skipId = two ? vm.plan.spotlightId : null;
  const rows = (vm.rows || []).filter((r) => r.id !== skipId), cur = two ? vm.plan.spotlight2Id : vm.plan.spotlightId;
  const item = (id, name, sub) => '<button type="button" class="c-btn c-btn--block t2-pickrow" data-sp="' + esc(id == null ? '' : id) + '" aria-pressed="' + (cur === id || (cur == null && id == null)) + '"><span class="t2-pk"><b>' + esc(name) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
  const close = openSheet(two ? 'Second Spotlight' : 'Spotlight wheel', '<p class="tr-note">' + deco('info', 20) + '<span>' + (two ? 'Twin Spotlight Pass: a second player spins his own wheel. Same cost.' : 'One player spins the wheel instead of his normal roll. Same cost.') + '</span></p>' + item(null, two ? 'No second player' : 'No Spotlight', 'Everyone else rolls as usual') +
    rows.filter((r) => r.state !== 'skip').map((r) => item(r.id, r.name, strongOf(r))).join(''), { returnFocus: [two ? '[data-lo="spot2pick"]' : '[data-lo="spotpick"]', '[data-lo="runnets"]'] });
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  if (body) body.addEventListener('click', (e) => { const b = e.target.closest('[data-sp]'); if (!b) return; const v = b.getAttribute('data-sp'); close(); dispatch('SetTrainPlan', { [key]: v === '' ? null : v }); });
}
const strongOf = (r) => { const k = ['bp', 'bs', 'spd', 'bsk'].reduce((m, x) => ((r.rates || {})[x] || 0) < ((r.rates || {})[m] || 0) ? x : m, 'bp'); return 'Lowest: ' + STAT(k).word + ' ' + letterOfRaw((r.rates || {})[k] || 1); };

function openSpotlightWheel(dispatch, slot) {
  const two = slot === 2, w = two ? latest.vm.wheel2 : latest.vm.wheel; if (!w) { runPending = true; dispatch('RunNets', {}); return; }
  const st = STAT(w.stat), rates = w.player.rates || {}, raw0 = rates[statKey(w.stat)] != null ? rates[statKey(w.stat)] : 1;
  const pr = w.player;
  const card = '<div class="wh-who"><b class="t2-nm">' + esc(pr.name) + '</b><span class="c-tag">Wheel is yours this week</span></div><div class="wh-gr">' +
    ['bp', 'bs', 'spd', 'bsk'].map((k) => '<span class="wh-g' + (k === statKey(w.stat) ? ' hit' : '') + '">' + deco(STAT(k).icon, 20) + '<span>' + esc(STAT(k).word) + '</span><b>' + esc(letterOfRaw(rates[k] || 1)) + '</b></span>').join('') + '</div><p class="dr-hint">The tick shows the slice under the pointer now.</p>';
  const ring = spotRing(w), cur = () => { const sp = two ? latest.raw.twin : latest.raw.spotlight; return sp || {}; };
  openWheel({
    wheelId: 'spot', spinKey: w.spinKey || undefined, wobKey: w.wobKey || undefined, stored: w.stored || undefined, ring, legend: spotLegend(ring).concat(spotKey(ring, !!w.kindFloor)), J: 1.2, plus: 'x', // CONTRACT-A sec 4: engine J 1.2 (phys.J = after Steady); STOP glow always on
    title: 'Spotlight', sub: 'Week ' + latest.vm.week + (latest.vm.wheel2 ? (two ? ', second spin' : ', first spin') : ''), cardHtml: card, pending: w.pending || null,
    // wheel meta (flag on; empty / null otherwise): guide = Aim Guide tick, tokens = buttons for the waiting result, getTokens = the fresh list after each command, look = craft look
    guide: w.guide, zone: w.zone, chime: w.chime, tokens: w.tokens, getTokens: () => cur().tokens || [], look: w.look, phys: w.phys || undefined, spokeGain: () => cur().spokeGain || 0,
    onToken: (kind, careful) => dispatch('UseToken', two ? { wheel: 'spot', kind, careful, slot: 2 } : { wheel: 'spot', kind, careful }),
    onSpin: (stop) => dispatch('Spin', two ? { careful: stop, stop, slot: 2 } : { careful: stop, stop }), getPending: () => cur().pending || null, // the handler records the stop (recordStop) and lands the same slice
    describe: (p) => {
      const g = p.applied != null ? p.applied : Math.min(p.gain, w.room == null ? 99 : w.room), to = raw0 + g, a = letterOfRaw(raw0), b = letterOfRaw(to), moved = stepOfRaw(to) !== stepOfRaw(raw0);
      return { big: st.word, from: a, to: b, line: spotLine(p, ring, !!w.kindFloor), barHtml: moved ? '' : letterBar(to, raw0), breakthrough: !!(p.jackpot || moved),
        mult: spotMult(p), say: pr.name + ' ' + st.word + (spotMult(p) ? ' ' + spotMult(p) : '') + ': +' + g + ' steps, ' + (moved ? a + ' to ' + b : a + ', the bar fills') + (p.jackpot ? ', jackpot' : '') + '.' };
    },
    onCollect: () => { if (!two && latest.vm.wheel2) { openSpotlightWheel(dispatch, 2); return; } runPending = true; dispatch('RunNets', {}); setTimeout(() => { const f = document.querySelector('[data-ft="done"], [data-lo="runnets"]'); if (f && f.focus) f.focus(); }, 0); },
    onClose: () => setTimeout(() => { const f = document.querySelector('[data-lo="' + (two ? 'spot2pick' : 'spotpick') + '"], [data-lo="runnets"]'); if (f && f.focus && !document.querySelector('.wh-ov')) f.focus(); }, 0),
  });
}

/* wa1 (SPEC 2026-11-14 s2): the coach strip at the top of the Training tab. 3 slots: portrait, letter grade, strong focus icons.
   Tap a coach = pick him for the week (SetTrainPlan {coachId}; tap the picked one again = no coach). Away = greyed "Back next week".
   Send on course and Scout list open the same flows as the Coaches sheet (sheet:coaches with arg {course} / {scout}). */
const WHY_COURSE = { max: 'Top grade', season: 'Done this season', away: 'Away', unknown: 'Not now' };
const courseWhy = (cr) => (cr.why === 'coins' ? 'Need ' + cr.cost + ' Coins' : WHY_COURSE[cr.why] || cr.why || 'Not now');
const hasSprites = () => typeof window !== 'undefined' && !!(window.SPR && window.ISO);
/** Strip display name: the surname (last word), and the first part of a double-barrelled one ("Okonkwo-Bramley" -> "Okonkwo"). Full name stays in aria and the sheets. */
export const shortName = (n) => { const w = String(n || '').trim().split(/\s+/).pop() || ''; return w.length > 9 && w.includes('-') ? w.split('-')[0] : w; };
function ctCard(c, vm) {
  const cr = c.course || {}, away = c.away > 0, price = cr.free ? 'Free' : cr.cost != null ? cr.cost + ' Coins' : '';
  const say = 'Coach ' + c.name + ', grade ' + c.letter + ', strong in ' + strongText(c.strong) + (away ? '. Away, back next week' : c.picked ? '. Coach this week. Tap for no coach' : '. Tap to pick for this week') + (!away && c.picked && !c.helps ? '. Not strong in this focus, so no help' : '') + (c.matchCoach && !c.picked && !away ? '. Match coach this week' : '');
  const face = hasSprites() ? '<canvas class="ct-face" data-ct-face="' + esc(c.id) + '" aria-hidden="true"></canvas>' : '<span class="ct-face">' + deco('coach', 24) + '</span>';
  // fixtrain: the picked state is its own full-width line (check + "This week", or warn + "No help"), never cut by the face / grade line.
  const tag = away ? '<span class="ct-tag ct-tag--away">Back next week</span>' : c.picked ? (c.helps ? '<span class="ct-tag ct-tag--on">' + deco('done', 16) + '<span aria-hidden="true">Picked</span><span class="ss-sr">This week</span></span>' : '<span class="ct-tag ct-tag--nohelp">' + deco('info', 16) + '<span>No help</span></span>') : c.matchCoach ? '<span class="ct-tag ct-tag--mc" aria-hidden="true">' + deco('coach', 14) + '<span>Match</span></span>' : '';
  const course = away ? '' : '<button type="button" class="c-btn ct-course" data-ct="course" data-id="' + esc(c.id) + '"' + (cr.ok ? '' : ' aria-disabled="true"') +
    ' aria-label="' + esc('Send ' + c.name + ' on course' + (price ? ', ' + price : '') + (cr.ok ? (cr.licence ? ', uses your Licence' : '') + '. He is away 1 week' : '. ' + courseWhy(cr))) + '">' +
    '<span class="ct-cw">' + deco('upgrade', 16) + '<span>Course</span></span><small>' + esc(cr.ok ? price + (cr.licence ? ', Licence' : '') : courseWhy(cr)) + '</small></button>';
  return '<li class="ct-slot' + (c.picked ? ' is-picked' : '') + (away ? ' is-away' : '') + '">' +
    '<button type="button" class="ct-pick" data-ct="pick" data-id="' + esc(c.id) + '" aria-pressed="' + !!c.picked + '"' + (away ? ' aria-disabled="true"' : '') + ' aria-label="' + esc(say) + '">' +
    '<span class="ct-l1"><span class="ct-name name" aria-hidden="true">' + esc(shortName(c.name)) + '</span></span>' +
    '<span class="ct-l2">' + face + '<b class="ct-grade" aria-hidden="true">' + esc(c.letter) + '</b><span class="ct-fi" aria-hidden="true">' + (c.strong || []).map((f) => deco(FOCUS_ICON[f] || 'train', 16)).join('') + '</span></span>' + tag + '</button>' + course + slotJobChip(vm, c) + slotXpBar(vm, c) + slotClinicBtn(vm, c) + '</li>';
}
/* Z5 UI slots (SEAMS-S0): fenced, return '' today. Owners: Spotlight T2, job chip + XP bar T5, Clinic button T6. */
/* SLOT:Spotlight start */
/** The Spotlight ring for a wheel vm: SPOT_SLICES with Kind Floor applied when owned (the x1.0 pieces print and pay x1.2). */
export function spotRing(w) {
  const ring = applyKindFloor(SPOT_SLICES, !!(w && w.kindFloor)), v = w && w.slices, ws = w && w.widths; // old vm fields only size the ring when the tree changed it (Widener, Extra Gold)
  if (!Array.isArray(v) || !Array.isArray(ws) || v.length !== ws.length || !v.length || (v.length === ring.length && ws.every((x, i) => Math.abs(x - ring[i].w) < 1e-6))) return ring;
  const golds = w.golds && w.golds.length ? w.golds : [w.jackpotIndex || 0], lo = Math.min(...ring.map((r) => r.value));
  return v.map((x, i) => { const same = v.length === ring.length, val = same ? ring[i].value : x; return { id: i, w: ws[i], value: val, label: same ? ring[i].label : 'x' + (Math.round(val * 100) / 100).toFixed(1), tier: val > lo ? 'top' : 'low', gold: golds.includes(i) }; });
}
/** Legend for under-7% pieces whose printed label is longer than one char and not a number. */
export function spotLegend(ring) {
  const out = (ring || []).filter((s) => s.w < 0.7 && String(s.label).length > 1 && !/^[+-]?[x\d.]+$/.test(String(s.label))).map((s) => ({ ch: String(s.label).charAt(0), text: String(s.label) }));
  (ring || []).forEach((s) => { const l = String(s.label); if (s.w < 0.7 && /^\d+(\.\d+)?$/.test(l) && !out.some((o) => o.ch === l)) out.push({ ch: l, text: 'x' + l + ': the thin slice' }); }); // a bare '1.2' on the thin slice reads as x1.2
  return out;
}
/** Tier key rows for the Spotlight legend (host rows win over T1's automatic ones): gold x3.0, triangle x1.5, dot = the floor; with Kind Floor owned, one line says why x1.0 reads x1.2. */
export function spotKey(ring, kf) {
  const lo = Math.min(...(ring || []).map((r) => r.value)), lab = (ring || []).filter((r) => r.value === lo)[0], rows = [{ ch: 'gold', text: 'x3.0 gold' }, { ch: 'tri', text: 'x1.5' }, { ch: 'dot', text: kf ? 'x1.2 (Kind Floor)' : 'x' + (lab ? String(lab.label).replace(/^x/, '') : '1.0') }];
  if (kf) rows.push({ ch: 'KF', text: 'Kind Floor: every x1.0 pays x1.2' });
  return rows;
}
/** Result meaning line under the chip: "Training gain x3.0. Gold slice." plus the Kind Floor note when it lifted the landed piece. */
export function spotLine(p, ring, kf) {
  const m = spotMult(p), i = p && p.index, base = i != null && SPOT_SLICES[i] && ring && ring[i] && SPOT_SLICES.length === ring.length ? SPOT_SLICES[i].value : null;
  return (m ? 'Training gain ' + m + '.' : '') + (p && p.jackpot ? ' Gold slice.' : '') + (kf && base != null && ring[i].value > base ? ' Kind Floor lifted this x' + base.toFixed(1) + ' piece to ' + m + '.' : '');
}
/** Result strip multiplier text ('x1.2') from a pending result; '' when unknown. */
export function spotMult(p) { const v = p && (p.mult != null ? p.mult : p.value != null ? p.value : p.gain); return v != null && isFinite(+v) ? 'x' + String(Math.round(+v * 100) / 100) : ''; }
/** Training tab strip: the multipliers on the Spotlight ring (gold first). '' with no Spotlight player. */
export function slotSpotlight(vm) {
  const w = vm && vm.wheel; if (!w || !w.player) return '';
  const ring = spotRing(w), by = {}; ring.forEach((s) => { const l = /^\d/.test(String(s.label)) ? 'x' + s.label : s.label; by[l] = (by[l] || 0) + 1; });
  const keys = Object.keys(by).sort((a, b) => parseFloat(b.replace('x', '')) - parseFloat(a.replace('x', '')));
  return '<p class="tr-note t2-spotring" role="group" aria-label="' + esc('Spotlight wheel: ' + keys.join(', ')) + '">' + deco('burst', 20) + '<span>' + esc(keys.join('  ')) + '</span></p>';
}
/* SLOT:Spotlight end */
/* SLOT:JobChip start */
export function slotJobChip(vm, coach) { // owner: T5
  if (!coach || !coach.id) return '';
  return chipHtml({ id: coach.id, job: (coach.away > 0 || coach.job === 'away') ? 'away' : normJob(coach.job), locked: !!coach.jobLocked, why: coach.why || '' });
}
/* SLOT:JobChip end */
/* SLOT:XpBar start */
export function slotXpBar(vm, coach) { // owner: T5
  if (!coach || !coach.id) return '';
  return xpBarHtml(coachWeekly(coach));
}
/* SLOT:XpBar end */
/* SLOT:ClinicBtn start */
export function slotClinicBtn(vm, coach) {
  if (!coach || !coach.id) return '';
  const k = (coach.clinic && typeof coach.clinic === 'object') ? coach.clinic : (vm && vm.clinic && vm.clinic[coach.id]) || null;
  const away = coach.away > 0, st = k && ['ready', 'used', 'nets', 'none', 'course'].includes(k.state) ? k.state : away ? 'course' : '';
  if (!st) return ''; // no Clinic data in the coach row (T7 adds coach.clinic): show nothing rather than guess
  const nm = String(coach.name || 'Coach'), won = st === 'used' ? [k && k.prize, k && k.playerName].filter(Boolean).join(' ') : '';
  const word = { ready: 'Spin ready', used: won || 'Used', nets: 'Nets done', none: 'Nobody can gain', course: 'On course' }[st];
  const say = { ready: 'Clinic spin for ' + nm + ', ready. Tap to pick a player', used: 'Clinic spin for ' + nm + ' used' + (won ? ': ' + won : ''), nets: 'Clinic for ' + nm + ': nets already done this week', none: 'Clinic for ' + nm + ': nobody can gain this week', course: 'Clinic for ' + nm + ': on course' }[st];
  return '<button type="button" class="c-btn cn-btn ' + { ready: 'cn-btn-ready', used: 'cn-btn-used', nets: 'cn-btn-nets', none: 'cn-btn-none', course: 'cn-btn-course' }[st] + '" data-cn="spin" data-id="' + esc(coach.id) + '"' + (st === 'ready' ? '' : ' aria-disabled="true"') + ' aria-label="' + esc(say) + '">' +
    '<span class="cn-bw">' + deco('burst', 16) + '<span>Clinic</span></span><small>' + esc(word) + '</small></button>';
}
/* SLOT:ClinicBtn end */
/* SLOT:Click start */
/** Click slot (S0 lead call 3d): called first in this file's click handlers. Return true when the click was handled (the handler then stops).
 *  ctx = { vm, dispatch, open, close?, refresh?, where }. T5 and T6 add their branches inside their own fence. Today: false, nothing handled. */
export function slotClick(e, ctx) {
  /* SLOT:Click:T5 */
  const jb = e && e.target && e.target.closest && e.target.closest('[data-cw="job"]'); // T5: job chip opens the job sheet
  if (jb && ctx && typeof ctx.open === 'function') { if (typeof ctx.close === 'function') ctx.close(); ctx.open('job', { coachId: jb.getAttribute('data-coach') }); return true; }
  /* SLOT:Click:T6 */
  { // Clinic button: opens the player pick sheet (sheets key 'clinicpick', state vm, arg {coachId}). Grey states do nothing.
    const b = e && e.target && e.target.closest ? e.target.closest('[data-cn="spin"]') : null;
    if (b && ctx && ctx.where !== 'scout') { if (b.getAttribute('aria-disabled') !== 'true' && ctx.open) { if (ctx.close) ctx.close(); ctx.open('clinicpick', { coachId: b.getAttribute('data-id') }); } return true; }
  }
  return false;
}
/* SLOT:Click end */
export function coachStripHtml(raw, vm) {
  const cs = (raw && raw.coaches) || [], st = (raw && raw.strip) || { slots: 3, scoutOpen: false };
  const free = Math.max(0, (st.slots || 3) - cs.length);
  const none = !cs.length; // SPEC s10: zero coaches shows one wide "No coach" slot
  const empty = none ? '<li class="ct-slot ct-empty ct-none" style="grid-column:1/-1"><button type="button" class="ct-emptyin" data-ct="scout" aria-label="No coach: open the Scout list to sign a coach">' + deco('coach', 20) + '<span>No coach</span><small>Sign a coach</small></button></li>' : Array.from({ length: free }, () => '<li class="ct-slot ct-empty"><button type="button" class="ct-emptyin" data-ct="scout" aria-label="Empty coach slot: open the Scout list to sign a coach">' + deco('coach', 20) + '<span>Empty slot</span><small>Sign a coach</small></button></li>').join('');
  // fit: compact strip (2 rows of 56 px taps); the head (All coaches, Scout list) is a narrow column at the right of the slots.
  return '<section class="ct-strip" aria-label="Coaches">' +
    '<ul class="ct-row">' + cs.map((c) => ctCard(c, vm)).join('') + empty + '</ul>' +
    '<div class="ct-head"><button type="button" class="c-btn ct-all" data-ct="all" aria-label="All coaches: pick and send on course" aria-haspopup="dialog">' + deco('coach', 20) + '<span>All</span></button><button type="button" class="c-btn ct-scout" data-ct="scout" aria-label="' + esc(st.scoutOpen ? 'Scout list: sign a new coach' : 'Scout list, done this season') + '">' + deco('scout', 20) + '<span>Scout</span>' + (st.scoutOpen ? '<i class="ct-dot" aria-hidden="true"></i>' : '') + '</button></div></section>';
}
/** fixtrain: confirm before Coins are spent (like the Stadium build confirm). Yes -> the course wheel (sheet:coaches {course}). */
function courseConfirm(raw, id, open) {
  const c = ((raw && raw.coaches) || []).find((x) => x.id === id); if (!c) return;
  const cr = c.course || {}, price = cr.free ? 'Free' : cr.cost != null ? cr.cost + ' Coins' : '';
  const close = openSheet('Send on course?', '<p class="tr-note">' + deco('upgrade', 20) + '<span>' + esc(c.name + ' goes on a course and spins the Course wheel for grade steps. He is away 1 week.') + '</span></p>' +
    '<p class="ct-cost"><b>Cost: ' + esc(price || 'Free') + '</b>' + (cr.licence ? '<span>Uses your Licence</span>' : '') + '</p>' +
    '<div class="ct-cfm"><button type="button" class="c-btn ct-cfm-no" data-cf="no">Not now</button><button type="button" class="c-btn c-btn--primary ct-cfm-yes" data-cf="yes">' + esc('Yes, send' + (price ? ': ' + price : '')) + '</button></div>',
  { returnFocus: ['[data-ct="course"][data-id="' + id + '"]', '[data-lo="runnets"]'] });
  const body = document.querySelector('.sheet-fixed .c-sheet__body');
  if (body) body.addEventListener('click', (e) => { const b = e.target.closest('[data-cf]'); if (!b) return; close(); if (b.getAttribute('data-cf') === 'yes') open('coaches', { course: id }); });
}
function drawFaces(root) { if (!hasSprites()) return; [].forEach.call(root.querySelectorAll('canvas[data-ct-face]'), (cv) => { try { drawHead(cv, 'coach:' + cv.getAttribute('data-ct-face')); } catch (_) { /* portrait is decoration */ } }); }

/** fixtrain: the Nets facility level that drives the Okay / Good / Great odds, on the Nets result card. */
function netsLevelLine(raw) {
  const L = raw && raw.nets && raw.nets.level != null ? +raw.nets.level : null; if (L == null) return '';
  return '<p class="tr-note t2-netslv">' + deco('batSkill', 20) + '<span>' + (L > 0 ? 'Nets level ' + L + ': more Good and Great drills.' : 'Nets level 0: build Nets in the Stadium for more Good and Great drills.') + '</span></p>';
}
function afterRender(el, vm, dispatch) {
  if (vm.nets && runPending) {
    runPending = false;
    const n = vm.nets;
    playNets({ lines: n.lines, skipped: n.skipped, week: vm.week }, {});
  }
}

export function render(el, rawVm, dispatch, open) {
  const vm = adapt(rawVm); latest = { vm, dispatch, raw: rawVm };
  const P = vm.plan, pv = vm.preview || { cost: 0, trainN: 0, skippedN: 0, shortN: 0, hint: null }, costs = vm.costs || { easy: 10, normal: 13, push: 18 };
  const had = el.contains(document.activeElement) ? document.activeElement : null, key = had && had.getAttribute ? (had.getAttribute('data-act') || '') + (had.getAttribute('data-arg') || '') + (had.getAttribute('data-ct') ? 'ct:' + had.getAttribute('data-ct') + ':' + (had.getAttribute('data-id') || '') : '') + (had.getAttribute('data-lo') ? 'lo:' + had.getAttribute('data-lo') : '') : '';
  const keyOf = (n) => (n.getAttribute('data-act') || '') + (n.getAttribute('data-arg') || '') + (n.getAttribute('data-ct') ? 'ct:' + n.getAttribute('data-ct') + ':' + (n.getAttribute('data-id') || '') : '') + (n.getAttribute('data-lo') ? 'lo:' + n.getAttribute('data-lo') : '');
  const nets = vm.nets, rows = vm.rows || [];
  const top = '<div class="c-strip strip tr-top"><span>' + deco('train', 24) + '<span class="tr-wk"><span class="tr-nw">Week ' + esc(vm.week) + '</span></span></span><span class="c-strip__right tr-tpw">' + tp(vm.tp) +
    '<button type="button" class="c-icon-btn tr-help" data-act="sheet:traininghelp" aria-label="Help: how training works" aria-haspopup="dialog">' + deco('why', 24) + '</button></span></div>';
  let body, cta;
  if (nets) {
    const g = nets.lines.length, up = nets.lines.filter((l) => letterOfRaw(l.toRaw) !== letterOfRaw(l.fromRaw)).length;
    body = '<div class="c-card c-card--hl t2-sum"><div class="tr-h"><b class="tr-iw">' + deco('done', 20) + '<span>Nets done</span></b></div>' +
      '<p class="tr-note">' + deco('info', 20) + '<span>' + g + ' trained' + (up ? ', ' + up + ' moved up a letter' : '') + (nets.skipped && nets.skipped.length ? ', ' + nets.skipped.length + " can't gain" : '') + '. Cost ' + esc(nets.cost) + ' TP.</span></p>' + netsLevelLine(rawVm) + '</div>' +
      '<ul class="t2-lines" aria-label="Results">' + nets.lines.map((l) => lineHtml(l)).join('') + (nets.skipped || []).map(skipLine).join('') + '</ul>';
    cta = ctaBar('<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="EndWeek" data-ft="done">Done</button>');
  } else {
    // wa1: the old coach row is now the coach strip above (coachStripHtml); the Coaches sheet opens from the strip head.
    const spotRow = '<li class="c-row m0-row c-row--tap t2-prow"><button type="button" class="tr-rowbtn" data-lo="spotpick" aria-label="' + esc(P.spotlightName ? 'Spotlight: ' + P.spotlightName + '. Tap to change' : 'Spotlight: none. Tap to pick a player for the wheel') + '">' +
      '<span class="tr-coachico">' + deco('burst', 36) + '</span><span class="c-row__body"><span class="c-row__title tr-coachtitle">Spotlight</span><span class="c-row__sub">' + esc(P.spotlightName || 'None (optional)') + '</span></span></button></li>';
    const tw = vm.twin, sp2Row = tw && tw.held > 0 ? '<li class="c-row m0-row c-row--tap t2-prow"><button type="button" class="tr-rowbtn" data-lo="spot2pick"' + (P.spotlightId ? '' : ' aria-disabled="true"') + ' aria-label="' + esc(tw.line + '. ' + (!P.spotlightId ? 'Pick the first Spotlight player first' : tw.name ? 'Second player: ' + tw.name + '. Tap to change' : 'Tap to pick the second player')) + '">' +
      '<span class="tr-coachico">' + deco('burst', 36) + '</span><span class="c-row__body"><span class="c-row__title tr-coachtitle">' + esc(tw.line) + '</span><span class="c-row__sub">' + esc(!P.spotlightId ? 'Pick the first player above' : tw.name || 'None yet') + '</span></span></button></li>' : '';
    const cost = 'Cost ' + pv.cost + ' TP' + (pv.skippedN ? ", " + pv.skippedN + " can't gain" : '');
    body = slotSpotlight(vm) + coachStripHtml(rawVm, vm) + '<div class="t2-plan">' +
      seg('focus', 'Focus', ['bat', 'bowl', 'bal'].map((f) => ({ v: f, w: FOCUS_WORD[f], ico: FOCUS_ICON[f], aria: FOCUS_WORD[f] + ' focus' })), P.focus) +
      seg('effort', 'Effort', ['easy', 'normal', 'push'].map((f) => ({ v: f, w: EFFORT_WORD[f], ico: EFFORT_ICON[f], sub: costs[f] + ' TP', aria: EFFORT_WORD[f] + ' effort, ' + costs[f] + ' training points each' })), P.effort) + '</div>' +
      '<ul class="c-list m0-list t2-pick" aria-label="This week">' + spotRow + sp2Row + '</ul>' +
      '<div class="t2-cost" role="status"><b>' + esc(cost) + '</b>' + (pv.shortN ? '<span>' + deco('tp', 20) + '<span>Short on TP: ' + pv.shortN + ' will wait</span></span>' : '') + (pv.hint ? '<span>' + deco('info', 20) + '<span>' + esc(pv.hint) + '</span></span>' : '') + '</div>' +
      '<ul class="c-list m0-list tr-list" aria-label="Your squad">' + rows.map(rowHtml).join('') + '</ul>';
    cta = ctaBar('<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block t2-run" data-lo="runnets" data-ft="run"' + (pv.trainN && vm.canRun ? '' : ' disabled aria-disabled="true"') + ' aria-label="' + esc(pv.trainN ? 'Run nets, ' + pv.cost + ' training points' : 'Run nets: nobody can train') + '">' +
      '<span class="tr-goL">' + deco('train', 24) + '<span>Run nets</span></span>' + chip(pv.cost) + '</button>');
  }
  el.innerHTML = '<div class="screen tr-screen t2-screen">' + top + body + cta + '</div>';
  const root = el.firstElementChild;
  bindActs(root, dispatch, open);
  root.addEventListener('click', (e) => {
    if (slotClick(e, { vm: rawVm, dispatch, open, where: 'training' })) { e.stopImmediatePropagation(); return; } // one slot call per click: the coach strip handler below is skipped too
    const t = e.target.closest && e.target.closest('[data-lo]'); if (!t || t.disabled) return; const a = t.getAttribute('data-lo');
    if (a === 'spotpick') spotSheet(vm, dispatch, 1);
    else if (a === 'spot2pick') { if (P.spotlightId) spotSheet(vm, dispatch, 2); }
    else if (a === 'runnets') { if (P.spotlightId) openSpotlightWheel(dispatch); else { runPending = true; dispatch('RunNets', {}); } }
  });
  root.addEventListener('click', (e) => { // wa1 coach strip
    const t = e.target.closest && e.target.closest('[data-ct]'); if (!t || t.getAttribute('aria-disabled') === 'true') return;
    const a = t.getAttribute('data-ct'), id = t.getAttribute('data-id');
    if (a === 'pick') dispatch('SetTrainPlan', { coachId: P.coachId === id ? null : id });
    else if (a === 'course' && open) courseConfirm(rawVm, id, open);
    else if (a === 'scout' && open) open('coaches', { scout: 1 });
    else if (a === 'all' && open) open('coaches');
  });
  drawFaces(root);
  if (had && key) { const same = [...el.querySelectorAll('[data-act],[data-ct],[data-lo]')].find((n) => keyOf(n) === key && !n.disabled); const b = same || el.querySelector('[data-lo="runnets"], [data-ft="done"]'); if (b) b.focus(); }
  announce(nets ? 'Nets done. ' + nets.lines.length + ' trained.' : 'Cost ' + pv.cost + ' TP' + (pv.skippedN ? ', ' + pv.skippedN + " can't gain" : '') + (pv.hint ? '. ' + pv.hint : ''));
  afterRender(el, vm, dispatch);
}

/** "?" sheet (sheet:traininghelp): short plain lines. */
export function openHelp() {
  const line = (k, t) => '<div class="tr-hl"><span class="tr-k">' + k + '</span><span>' + esc(t) + '</span></div>';
  const html = '<div class="tr-help-body">' +
    line(deco('batPower', 24), 'Focus: which ratings train this week') + line(deco('upgrade', 24), 'Effort: Easy 10, Normal 13, Push 18 TP each') +
    line(deco('coach', 24), 'Coach: pick one by hand each week') + line(deco('burst', 24), 'Spotlight: one player spins the wheel') +
    line(deco('lock', 24), "Can't gain: full, so not charged") + line('<span class="t2-ticks"><i class="t2-tk on"></i><i class="t2-tk on"></i><i class="t2-tk"></i><i class="t2-tk"></i></span>', 'Bar: 4 ticks make one letter step') +
    line('<b>C+</b>', 'Letters: F- is lowest, S+ is highest') + '</div>';
  return openSheet('Training help', html);
}
