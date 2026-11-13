/* coachpick-view: screen 0, the scout list (once each season): sign one or pass. render(el, vm, dispatch). Reads coachPickVM only.
   coachPickVM = { cands:[{ id, name, step, letter, strong }], open, full, picked:signedId|null, passed, why,
     mine?:[{ id, name, letter, strong }] }      NEEDS from CORE-CLUB: mine (your coaches, to release when full)
   Commands: SignCoach {coachId}, ReleaseCoach {coachId}, PassScout {}.
   Letter grade and strong focus icons only; no numbers. */
import { esc, ctaBar, bindActs } from './dom.js';
import { deco, strongHtml, strongText } from './training-view.js';

function card(c, full) {
  const label = 'Coach ' + c.name + ', grade ' + c.letter + ', strong in ' + strongText(c.strong) + (c.signed ? '. Signed' : full ? '. Full: release one to sign' : '');
  return '<li class="c-row m0-row t2-cand' + (c.signed ? ' m0-sel' : '') + '"><div class="t2-candtxt" aria-label="' + esc(label) + '">' +
    '<span class="tr-cand__ico">' + deco('coach', 36) + '</span><span class="t2-who"><b class="name tr-cand__name">' + esc(c.name) + '</b><span class="t2-strong">' + strongHtml(c.strong) + '</span></span>' +
    '<span class="t2-grade" aria-hidden="true">' + esc(c.letter) + '</span></div>' +
    (c.signed ? '<span class="c-tag c-tag--done">Signed</span>' : '<button type="button" class="c-btn t2-cb" data-act="SignCoach" data-arg="' + esc(JSON.stringify({ id: c.id, coachId: c.id })) + '"' + (full ? ' disabled aria-disabled="true"' : '') + ' aria-label="Sign ' + esc(c.name) + '">Sign</button>') + '</li>';
}

export function render(el, vm, dispatch) {
  const cands = (vm.cands || []).map((c) => ({ ...c, signed: c.signed || (vm.picked != null && vm.picked === c.id) })), mine = vm.mine || [], full = !!vm.full;
  el.innerHTML =
    '<div class="screen tr-screen tr-pick">' +
    '<div class="c-strip strip tr-top"><span>' + deco('scout', 24) + ' Scout list</span></div>' +
    '<p class="tr-note tr-intro">' + deco('info', 24) + '<span>' + (full ? 'Full: release one to sign.' : 'Sign one coach, or pass.') + '</span></p>' +
    '<ul class="c-list m0-list tr-cands" aria-label="Coaches to sign">' + cands.map((c) => card(c, full && !c.signed)).join('') + '</ul>' +
    (full ? '<div class="c-card t2-rel"><div class="tr-h"><b>Your coaches</b></div><ul class="c-list list-flat">' + mine.map((m) =>
      '<li class="c-row m0-row t2-cand"><div class="t2-candtxt"><span class="t2-who"><b class="name">' + esc(m.name) + '</b><span class="t2-strong">' + strongHtml(m.strong) + '</span></span><span class="t2-grade" aria-hidden="true">' + esc(m.letter) + '</span></div>' +
      '<button type="button" class="c-btn t2-cb" data-act="ReleaseCoach" data-arg="' + esc(JSON.stringify({ id: m.id, coachId: m.id })) + '" aria-label="Release ' + esc(m.name) + ', grade ' + esc(m.letter) + '">Release</button></li>').join('') + '</ul></div>' : '') +
    ctaBar('<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block" data-act="PassScout">' + (cands.some((c) => c.signed) ? 'Done' : 'Pass') + '</button>') +
    '</div>';
  window.scrollTo && window.scrollTo(0, 0);
  bindActs(el.firstElementChild, dispatch);
}
