/* hub-view: the season home. render(el, vm, dispatch). Reads hubVM only. Clicks are handled by app.js (data-act). */
import { esc, btn, icoDeco } from './dom.js';
import { badgeCount, badgeText, badgeAria } from './book-badge.js';
import { spokeIcon } from './wheel-look.js';
import { drawBanner } from './ground-canvas.js';
import { weekItems, chipWord } from './week-sheet.js';
import { fansGateHtml } from './table-sheet.js';
import { shownCell, spoken } from './letters-ui.js';

export function helpBtn(id, label) {
  return '<button type="button" class="c-icon-btn help-btn" data-act="sheet:glossary"' + (id ? ' data-arg="' + esc(JSON.stringify(id)) + '"' : '') +
    ' aria-label="' + esc(label || 'Cricket words (glossary)') + '">?</button>';
}

const fmtN = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* L2 scoreboard: Coins (56 px button, gold edge), TP and Spokes (read-only), three cells in one board. */
function boardHtml(vm) {
  const e = vm.econ, w = vm.workshop;
  const coins = e ? '<button type="button" class="hb-cell hb-cell--coins" data-act="sheet:money" aria-label="Club money: ' + esc(fmtN(e.coins)) + ' Coins">' + icoDeco('coin', 24) + '<span class="hb-cv2"><b>' + esc(fmtN(e.coins)) + '</b><small>Coins</small></span></button>' : '';
  const tp = '<div class="hb-cell hb-cell--tp hb-tp">' + icoDeco('tp', 24) + '<span class="hb-cv2"><b>' + esc(vm.tp) + '</b><small><span aria-hidden="true">TP</span><span class="ss-sr"> training points</span></small></span></div>';
  const sp = w && w.visible ? '<div class="hb-cell hb-cell--spokes">' + spokeIcon(24) + '<span class="hb-cv2"><b>' + esc(w.spokes) + '</b><small>Spokes</small></span></div>' : '';
  return '<div class="hb-board" role="group" aria-label="Club scoreboard">' + coins + tp + sp + '</div>';
}

/* dock plate: one 56 px tile, never a wrapper. plate.flag = "!" badge (pending free facility / fan activity), aria stays as before. */
function plateHtml(slot, plate) {
  if (!plate) {
    return '<button type="button" class="c-btn hb-plate is-locked" data-plate="' + slot + '" aria-disabled="true" aria-label="' + (slot === 'workshop' ? 'Wheel Workshop' : 'Fan activity') + ', opens later">' + icoDeco('lock', 24) + '<span class="hb-pl">' + (slot === 'workshop' ? 'Workshop' : 'Fans') + '</span><span class="hb-badge" hidden></span></button>';
  }
  const bt = plate.badge ? badgeText(plate.badge) : ''; // P6: Book plate badge (session count, js/ui/book-badge.js)
  const aria = bt ? (plate.aria || plate.word) + ', ' + badgeAria(plate.badge) : plate.aria;
  const mark = bt || (plate.flag ? '!' : '');
  return '<button type="button" class="c-btn hb-plate" data-plate="' + slot + '" data-act="' + plate.act + '"' + (aria ? ' aria-label="' + esc(aria) + '"' : '') + '>' + plate.icon + '<span class="hb-pl">' + esc(plate.word) + '</span>' +
    (mark ? '<span class="hb-badge" aria-hidden="true">' + esc(mark) + '</span>' : '<span class="hb-badge" hidden></span>') + '</button>';
}

/* H2 dock: 2 x 3, table, stadium, extras / book, workshop, fans. */
function dockHtml(vm) {
  const w = vm.workshop, a = vm.activities, fp = vm.freePick;
  const P = (act, icon, word, extra) => Object.assign({ act, icon: icoDeco(icon, 24), word }, extra || {});
  const fanFlag = !!(a && !a.picked && a.available !== false);
  return '<div class="hb-dock" role="group" aria-label="Club buildings">' +
    plateHtml('table', P('sheet:table', 'league', 'Table')) +
    plateHtml('stadium', P('sheet:stadium', 'home', 'Stadium', { flag: !!(fp && fp.pending) })) +
    plateHtml('extras', P('sheet:sinks', 'shop', 'Extras')) +
    plateHtml('book', P('sheet:book', 'book', 'Book', { badge: badgeCount() })) +
    plateHtml('workshop', w && w.visible ? { act: 'sheet:workshop', icon: spokeIcon(24), word: 'Wheel Workshop', aria: 'Wheel Workshop, ' + w.spokes + ' Spokes' } : null) +
    plateHtml('fans', a ? P('sheet:activities', 'pennant', 'Fan activity', { flag: fanFlag }) : null) + '</div>';
}

/* FENCE:BANNER start */
function bannerHtml(vm) {
  const g = vm.fansGate, chip = chipWord(weekItems(vm));
  const open = g && !g.hidden;
  const n = Number(vm.econ && vm.econ.stadium) || (g && g.next ? g.next - 1 : 1);
  const tag = open ? (g.ready ? 'Fans ready: build L' + (n + 1) : fmtN(g.left) + ' fans to L' + (n + 1)) : 'Stadium L' + n;
  const aria = 'Stadium, level ' + n + '.' + (open ? (g.ready ? ' Fans ready for level ' + (n + 1) + '.' : ' Fans ' + fmtN(g.fans) + ' of ' + fmtN(g.gate) + ' for level ' + (n + 1) + '.') : '') + ' Opens Stadium.';
  return '<div class="hb-banner"><canvas class="hb-bcv" aria-hidden="true"></canvas>' +
    '<button type="button" class="c-btn hb-gb" data-act="sheet:stadium" aria-label="' + esc(aria) + '"><span class="hb-gtag">' + esc(tag) + '</span>' +
    (open ? '<span class="hb-ghost">L' + (n + 1) + ' stand</span>' : '') + '</button>' +
    '<div class="hb-band' + (chip ? ' has-week' : '') + '">' + (open ? fansGateHtml(g, 'hb-fg') : '') +
    (chip ? '<button type="button" class="c-btn hb-week" data-act="sheet:week">' + esc(chip) + '</button>' : '') + '</div></div>';
}
/* FENCE:BANNER end */

/* FENCE:STRIP start */
function stripHtml(vm) {
  vm = vm || {};
  const pr = vm.promo || null, g = vm.gap || null, rows = pr && Array.isArray(pr.rows) ? pr.rows : [];
  const r0 = rows[0] || {}, m = /(\d+)/.exec(String(r0.title || ''));
  const top = m ? m[1] : '2', tag = /^\d+(st|nd|rd|th)\b/.test(String(r0.tag || '')) ? String(r0.tag).split(' ')[0] : '';
  const wk = vm.club && vm.club.weeksLeft != null && Number.isFinite(Number(vm.club.weeksLeft)) ? Number(vm.club.weeksLeft) : null;
  const l2 = [tag ? 'You: ' + tag : '', wk === null ? '' : (wk ? wk + ' week' + (wk > 1 ? 's' : '') + ' left' : 'Last week')].filter(Boolean).join(' · ');
  const tot = pr && Number(pr.total) > 0 ? Math.min(12, Math.floor(Number(pr.total))) : 3, done = pr ? Math.max(0, Math.min(tot, Number(pr.done) || 0)) : 0;
  let boxes = ''; for (let i = 0; i < tot; i++) boxes += '<i' + (i < done ? ' class="on"' : '') + '></i>';
  const aria = 'Season goal: finish top ' + top + ' to go up.' + (l2 ? ' ' + l2.replace('You: ', 'You are ') + '.' : '') + ' ' + done + ' of ' + tot + ' goals done.';
  const rank = (L) => { const s = String(L || ''), i = 'FEDCBAS'.indexOf(s.charAt(0)); return i < 0 ? null : i * 3 + (s.charAt(1) === '+' ? 1 : s.charAt(1) === '-' ? -1 : 0); };
  const gb = (L) => '<span class="lt-box lt-' + esc(String(L).charAt(0)) + '"><b class="lt-in">' + esc(L) + '</b></span>';
  let cap = '';
  if (g && g.ours && g.theirs) {
    const a = rank(g.ours), b = rank(g.theirs), d = a === null || b === null ? 0 : a - b;
    const verb = d > 0 ? 'beats' : d < 0 ? 'trails' : 'matches', cls = d > 0 ? ' hb-cap__v--up' : d < 0 ? ' hb-cap__v--dn' : '';
    cap = '<div class="hb-cap" role="group" aria-label="Your six, grade ' + esc(g.ours) + ', ' + verb + ' their six, grade ' + esc(g.theirs) + '.">' +
      '<span class="hb-cap__sr">Our six ' + esc(g.ours) + ' Their six ' + esc(g.theirs) + '</span><span aria-hidden="true">Your six</span>' + gb(g.ours) +
      '<span class="hb-cap__v' + cls + '" aria-hidden="true">' + verb + '</span><span aria-hidden="true">their six</span>' + gb(g.theirs) + '</div>';
  }
  const mi = (px, cls) => { const n = px.length; let o = ''; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = px[y][x]; if (c !== '.') o += '<rect class="' + cls[c] + '" x="' + x + '" y="' + y + '" width="1" height="1"/>'; } return '<svg class="hb-mi" viewBox="0 0 ' + n + ' ' + n + '" width="' + 2 * n + '" height="' + 2 * n + '" shape-rendering="crispEdges" aria-hidden="true">' + o + '</svg>'; };
  const bat = mi(['......oo', '.....oo.', '...oooo.', '..oggoo.', '.ogggo..', 'ogggo...', 'oggo....', 'ooo.....'], { o: 'mo', g: 'mg' });
  const bowl = mi(['..ooo..', '.orrwo.', 'orrrwRo', 'orrwRRo', 'orwRRRo', '.owRRo.', '..ooo..'], { o: 'mo', r: 'mr', w: 'mw', R: 'mR' });
  return '<div class="hb-strip" role="group" aria-label="Season goals">' +
    '<div class="hb-goal" role="group" aria-label="' + esc(aria) + '">' + icoDeco('medal', 24) +
    '<span class="hb-goal__t" aria-hidden="true"><span class="hb-goal__a">Finish <em>top ' + esc(top) + '</em> to go up</span>' + (l2 ? '<span class="hb-goal__b">' + esc(l2) + '</span>' : '') + '</span>' +
    '<span class="hb-goal__g" aria-hidden="true"><span class="hb-goal__n">Goals <b>' + done + '/' + tot + '</b></span><span class="hb-goal__cx">' + boxes + '</span></span></div>' +
    cap + '<div class="hb-th" aria-hidden="true"><span>Batting order</span><span class="hb-th__k">Each player:<span>' + bat + 'Bat,</span><span>' + bowl + 'Bowl</span></span></div></div>';
}
/* FENCE:STRIP end */

/* FENCE:SIX start */
function sixHtml(vm) {
  return '<div class="hb-six" role="group" aria-label="Our six, batting order">' + (vm.six || []).map((p, i) => {
    const b = shownCell(p.bat), w = shownCell(p.bowl);
    return '<button type="button" class="hb-p" data-act="sheet:team" data-arg=\'{"tab":"six"}\' aria-label="' +
      esc((i + 1) + '. ' + p.name + ', batting ' + spoken(b.letter) + ', bowling ' + spoken(w.letter) + '. Edit the six') + '">' +
      '<span class="hb-n" aria-hidden="true">' + (i + 1) + '</span><span class="nm">' + esc(p.name) + '</span>' + b.html + w.html + '</button>';
  }).join('') + '</div>';
}
/* FENCE:SIX end */

/* FENCE:FOOT start */
function footHtml(vm, cta) {
  const plan = vm.plan || { ok: true, word: '' };
  const n = (vm.six || []).length, cl = Math.max(0, Math.min(3, ((vm.matchPlan && vm.matchPlan.clinic) | 0))), word = String(plan.word || '');
  const aria = 'Match plan: ' + n + ' picked, overs ' + word.toLowerCase() + (cl ? ', ' + cl + ' Clinic spin' + (cl === 1 ? '' : 's') + ' left' : '');
  const why = cta.disabled && cta.reason ? '<span class="hb-why">' + esc(cta.reason) + '</span>' : '';
  const edits = '<button type="button" class="c-btn hb-edit hb-plan' + (plan.ok ? '' : ' is-warn') + '" data-act="sheet:team" data-arg=\'' + (plan.ok ? '{"tab":"six"}' : '{"tab":"overs"}') + '\' aria-label="' + esc(aria) + '">' + icoDeco('team', 24) +
    '<span class="tx"><span>Match Plan</span><small class="hb-pl-sub' + (plan.ok ? '' : ' is-red') + '">' + esc(n + ' picked · Overs: ' + word) + '</small>' + why + '</span>' +
    '<span class="hb-badge" aria-hidden="true"' + (cl ? '' : ' hidden') + '>' + cl + '</span></button>';
  const go = '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block hb-cta" data-act="' + esc(cta.act || 'StartMatch') + '"' + (cta.disabled ? ' disabled aria-disabled="true"' : '') + '>' + icoDeco('match', 24) +
    '<span class="tx"><span>' + esc(cta.label) + '</span>' + (cta.sub ? '<small>' + esc(cta.sub) + '</small>' : '') + '</span></button>';
  return '<div class="m0-ctabar cta hb-foot">' + edits + (cta.disabled && cta.reason ? '<span class="m0-warn" role="note">' + esc(cta.reason) + '</span>' : '') + go + '</div>';
}
/* FENCE:FOOT end */

export function render(el, vm, dispatch) {
  const season = vm.season && typeof vm.season === 'object' ? vm.season : { n: vm.season, league: 1 };
  const cta = typeof vm.cta === 'string' ? { label: vm.cta } : (vm.cta || {});
  const run = vm.run || null;
  const full = !!(vm.six && vm.promo && vm.plan);
  const l1 = run ? 'Season ' + run.season + ' of ' + run.of : 'Season ' + (season.n || 1);
  const l2 = 'League ' + (season.league || (run && run.league) || 1);
  const chap = run && run.nextChapter ? run.nextChapter : null;
  const sub = vm.phaseWord || '';
  const top = '<div class="c-strip strip hb-head"><span class="ss-strip"><b class="rn-head">' + esc(l1) + '</b><b class="hb-lg">' + esc(l2) + '</b>' + (chap ? '' : (sub ? '<small class="hb-sub">' + esc(sub) + '</small>' : '')) + '</span>' +
    '<button type="button" class="c-btn hb-save ss-save" data-act="sheet:save" aria-label="Save">' + icoDeco('save', 24) + '<span>Save</span></button>' + helpBtn('league-table') + '</div>' +
    (chap ? '<div class="hb-chap">Next chapter: <b>' + esc(chap.name) + '</b> (Season ' + esc(chap.season) + ')</div>' : '');
  try { const old = el.querySelector('.hb-banner'); if (old && old.__banner && old.__banner.destroy) old.__banner.destroy(); } catch (e) { /* ignore */ }
  if (!full) {
    el.innerHTML = '<div class="screen ss ss-hub hb-hub">' + top + '<div class="m0-ctabar cta hb-foot">' + btn(cta.label || 'Pick your six', cta.act || 'OpenSquad', { kind: 'cta', disabled: cta.disabled, reason: cta.reason }) + '</div></div>';
    return;
  }
  el.innerHTML =
    '<div class="screen ss ss-hub hb-hub hb-l2">' + top +
    '<div class="hb-mid"><div class="hb-colA">' + boardHtml(vm) + bannerHtml(vm) + dockHtml(vm) + '</div>' +
    '<div class="hb-colB" tabindex="0">' + stripHtml(vm) + sixHtml(vm) + '</div></div>' +
    footHtml(vm, cta) + '</div>';
  const bn = el.querySelector('.hb-banner');
  if (bn) try {
    const rm = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    drawBanner(bn, { stadium: (vm.econ && vm.econ.stadium) | 0, levels: (vm.econ && vm.econ.fac) || {}, gate: vm.fansGate, reducedMotion: !!rm });
  } catch (e) { /* the banner is decoration: the rest of the hub still works */ }
}
