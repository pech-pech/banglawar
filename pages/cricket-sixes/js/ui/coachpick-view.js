/* coachpick-view: screen 0, pick the head coach (once per save). render(el, vm, dispatch). Reads coachPickVM only.
   coachPickVM = { picked: coachId|null,
     cands:[{ id, name, focus:'Power'|'Technique'|'Pace'|'Craft', drill, phrase, odds3, odds2, trees:['opener'|'middle'|'lower'|'fast'|'medium'|'spin', ...] }] }
   odds3/odds2 = Good-or-better percent at level 3 and level 2.
   Tap a card to pick (view state, module variable), the (i) button for detail, Confirm -> PickCoach {coachId}. */
import { openSheet } from './sheet.js';
import { esc, btn, ctaBar, bindActs } from './dom.js';
import { deco, ROLE_ICON, TYPE_ICON } from './training-view.js';

const FOCUS_ICON = { Power: 'batPower', Technique: 'batSkill', Pace: 'bowlSpeed', Craft: 'bowlSkill' };
const treeIcon = (k) => ROLE_ICON[k] || TYPE_ICON[k] || 'upgrade';
const treeWord = (k) => k.charAt(0).toUpperCase() + k.slice(1);
let sel = null;
const phraseOf = (c) => c.phrase || c.drill;
/** One short term per coach, used on this screen and in the training notice: 'fast bowling practice' -> 'Fast bowling'. */
const termOf = (c) => { const w = String(phraseOf(c)).replace(/ practice$/, ''); return w.charAt(0).toUpperCase() + w.slice(1); };

function treesHtml(c, words) {
  return (c.trees || []).map((k) => '<span class="tr-iw">' + deco(treeIcon(k), 20) + (words ? '<span>' + esc(treeWord(k)) + '</span>' : '') + '</span>').join('');
}

function card(c, on) {
  const label = 'Coach ' + c.name + ', level 3. Better drills: ' + termOf(c) + '.' + (on ? ' Picked.' : '');
  return '<li class="c-row m0-row tr-cand' + (on ? ' m0-sel' : '') + '">' +
    '<button type="button" class="tr-cand__pick" data-pick="' + esc(c.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + esc(label) + '">' +
    '<span class="tr-cand__ico">' + deco(FOCUS_ICON[c.focus] || 'train', 36) + '</span>' +
    '<span class="tr-cand__txt"><span class="tr-cand__l1"><b class="name tr-cand__name">' + esc(c.name) + '</b><span class="c-tag">Level 3</span></span>' +
    '<span class="tr-cand__l3">' + deco('coach', 20) + '<span>Better drills:</span></span>' +
    '<span class="tr-cand__l2"><b>' + esc(termOf(c)) + '</b></span></span></button>' +
    '<button type="button" class="tr-cand__info" data-info="' + esc(c.id) + '" aria-label="Details for coach ' + esc(c.name) + '">' + deco('info', 24) + '</button></li>';
}

function detail(c) {
  openSheet('Coach ' + c.name,
    '<p class="tr-note">' + deco(FOCUS_ICON[c.focus] || 'train', 24) + '<span><b>' + esc(c.focus) + '</b>: helps ' + esc(c.drill) + '</span></p>' +
    '<div class="tr-h"><b>Good or better chance</b></div>' +
    '<div class="tr-odds"><span class="c-tag c-tag--done">Level 3: ' + esc(c.odds3) + '%</span><span class="c-tag">Level 2: ' + esc(c.odds2) + '%</span></div>' +
    '<div class="tr-h"><b>Opens the Top node of</b></div><p class="tr-trees">' + treesHtml(c, true) + '</p>' +
    '<p class="tr-note">' + deco('lock', 20) + '<span>Needed only when you unlock a Top node. Skills stay if he leaves.</span></p>' +
    '<p class="tr-note">' + deco('coach', 20) + '<span>Those trees work x1.5 while he is here.</span></p>');
}

export function render(el, vm, dispatch) {
  const cands = vm.cands || [];
  if (!cands.some((c) => c.id === sel)) sel = vm.picked && cands.some((c) => c.id === vm.picked) ? vm.picked : null;
  const cur = cands.filter((c) => c.id === sel)[0];
  el.innerHTML =
    '<div class="screen tr-screen tr-pick">' +
    '<div class="c-strip strip tr-top"><span>' + deco('coach', 24) + ' Head coach</span>' + (vm.picked ? '<button type="button" class="c-btn tr-back" data-back aria-label="Back to training, keep the same coach">Back</button>' : '') + '</div>' +
    '<p class="tr-note tr-intro">' + deco('info', 24) + '<span>Pick your head coach.</span></p>' +
    '<ul class="c-list m0-list tr-cands" aria-label="Three coaches">' + cands.map((c) => card(c, c.id === sel)).join('') + '</ul>' +
    ctaBar(cur ? btn('Confirm ' + cur.name, 'PickCoach', { kind: 'cta', arg: { coachId: cur.id } }) : btn('Pick a coach first', 'PickCoach', { kind: 'cta', disabled: true })) +
    '</div>';
  const root = el.firstElementChild;
  if (typeof window !== 'undefined' && window.scrollTo) { window.scrollTo(0, 0); if (document.body) document.body.scrollTop = 0; } // arrive at the top (the training tips can leave the page scrolled)
  root.addEventListener('click', (e) => {
    const p = e.target.closest && e.target.closest('[data-pick]');
    const i = e.target.closest && e.target.closest('[data-info]');
    if (p) { sel = p.getAttribute('data-pick'); render(el, vm, dispatch); const b = el.querySelector('[data-pick="' + sel + '"]'); if (b) b.focus(); }
    else if (e.target.closest && e.target.closest('[data-back]')) dispatch('PickCoach', { coachId: vm.picked }); // same coach again = nothing changes
    else if (i) { const c = cands.filter((x) => x.id === i.getAttribute('data-info'))[0]; if (c) detail(c); }
  });
  bindActs(root, dispatch);
}
