/* week-view: screen 6, week summary. render(el, vm, dispatch). Reads weekVM only. One screen, no scroll at 344x780.
   weekVM = { week, pos, tp, cta?,
     gains:[{ id, name, rating:'batPower'|..|null, n, before, after }],      n = 0 when not drilled
     reveals:[{ name, grade }], nodes:[{ name, node }], coachUps:[{ name, focus, level }],
     roundResults:[{ a, b, ra, wa, rb, wb, me:boolean }]                     winner = more runs; equal = tie
   }
   CTA: NextWeek (label vm.cta, default "Next match"). */
import { esc, btn, ctaBar, bindActs } from './dom.js';
import { deco, tp, RATING_ICON, RATING_WORD } from './training-view.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]);

function gainTile(g) {
  const none = !g.n;
  return '<li class="tr-gain" aria-label="' + esc(g.name + (none ? ', not drilled' : ', ' + (RATING_WORD[g.rating] || '') + ' plus ' + g.n + ', ability ' + g.before + ' to ' + g.after)) + '">' +
    '<b class="name tr-gain__n">' + esc(g.name) + '</b>' +
    '<span class="tr-gain__v">' + (none ? '<span class="tr-gain__none">No drill</span>' : deco(RATING_ICON[g.rating] || 'train', 20) + '<b>+' + esc(g.n) + '</b>') + '</span>' +
    '<span class="tr-gain__a">' + (none ? esc(g.after) : esc(g.before) + ' to ' + esc(g.after)) + '</span></li>';
}

function result(r) {
  const aw = r.ra > r.rb, bw = r.rb > r.ra;
  return '<li class="tr-rr' + (r.me ? ' tr-rr--me' : '') + '" aria-label="' + esc(r.a + ' ' + r.ra + ' for ' + r.wa + ', ' + r.b + ' ' + r.rb + ' for ' + r.wb + (aw ? ', ' + r.a + ' won' : bw ? ', ' + r.b + ' won' : ', tied')) + '">' +
    '<span class="tr-rr__names"><span class="tr-rr__t' + (aw ? ' is-win' : '') + '">' + (aw ? deco('done', 20) : '') + '<span>' + esc(r.a) + '</span></span>' +
    '<span class="tr-rr__v">' + (aw ? 'beat' : bw ? 'lost to' : 'tied') + '</span>' +
    '<span class="tr-rr__t' + (bw ? ' is-win' : '') + '">' + (bw ? deco('done', 20) : '') + '<span>' + esc(r.b) + '</span></span></span>' +
    '<span class="tr-rr__scores"><b class="tr-rr__s">' + esc(r.ra) + '/' + esc(r.wa) + '</b><span class="tr-rr__v">to</span><b class="tr-rr__s">' + esc(r.rb) + '/' + esc(r.wb) + '</b></span></li>';
}

export function render(el, vm, dispatch) {
  const gains = vm.gains || [], reveals = vm.reveals || [], nodes = vm.nodes || [], ups = vm.coachUps || [];
  const total = gains.reduce((a, g) => a + (g.n || 0), 0), drilled = gains.filter((g) => g.n).length;
  const notes = [];
  if (reveals.length) notes.push(['spark', 'Grades revealed: ' + reveals.map((r) => r.name + ' is ' + r.grade).join(', ')]);
  if (nodes.length) notes.push(['upgrade', 'Skill nodes: ' + nodes.map((n) => n.name + ' got ' + n.node).join(', ')]);
  if (ups.length) notes.push(['coach', 'Coach levels: ' + ups.map((u) => u.name + ' ' + u.focus + ' ' + u.level).join(', ')]);
  el.innerHTML =
    '<div class="screen tr-screen tr-week">' +
    '<div class="c-strip strip tr-top"><span>' + deco('week', 24) + ' Week ' + esc(vm.week) + ' done</span><span class="c-strip__right tr-tpw">' + tp(vm.tp) + '</span></div>' +
    '<div class="c-card tr-card"><div class="tr-h"><b class="tr-iw">' + deco('train', 20) + '<span>' + drilled + ' drilled, +' + total + ' in all</span></b></div>' +
    '<ul class="c-list list-flat tr-gains">' + gains.map(gainTile).join('') + '</ul></div>' +
    (notes.length ? '<ul class="tr-notes">' + notes.map((n) => '<li class="tr-note">' + (n[0] === 'spark' ? deco('info', 20) : deco(n[0], 20)) + '<span>' + esc(n[1]) + '</span></li>').join('') + '</ul>' : '') +
    '<div class="c-card tr-card"><div class="tr-h"><b class="tr-iw">' + deco('week', 20) + '<span>Results this round</span></b>' + (vm.pos ? '<span>You are ' + esc(ord(vm.pos)) + '</span>' : '') + '</div>' +
    '<ul class="c-list list-flat tr-results">' + (vm.roundResults || []).map(result).join('') + '</ul></div>' +
    ctaBar(btn(vm.cta || 'Next match', 'NextWeek', { kind: 'cta' })) + '</div>';
  bindActs(el.firstElementChild, dispatch);
}
