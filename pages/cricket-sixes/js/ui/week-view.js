/* week-view: screen 6, week summary. render(el, vm, dispatch). Reads weekVM only. Letters only (no rating digits).
   weekVM = { week, pos, tp, cta?,
     lines:[{ id, name, rating:'bp'|'bs'|'spd'|'bsk', fromRaw, toRaw, word, wheelGain?, breakthrough }]   nets lines of the week; gains[] (n=0) = did not train
     reveals:[{ name, grade }], nodes:[{ name, node }],
     roundResults:[{ a, b, ra, wa, rb, wb, me:boolean }]                     winner = more runs; equal = tie
   }
   CTA: NextWeek (label vm.cta, default "Next match"). */
import { esc, btn, ctaBar, bindActs, nameHtml } from './dom.js';
import { deco, tp } from './training-view.js';
import { lineHtml } from './nets-scene.js';
import { letterOfRaw } from '../core/letters.js';

const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]);

const skipTile = (g) => '<li class="t2-line t2-line--skip" aria-label="' + esc(g.name + ', did not train') + '"><span class="t2-l1"><b class="t2-nm">' + nameHtml(g.name) + '</b><span class="t2-wd">Did not train</span></span></li>';

function result(r) {
  const aw = r.ra > r.rb, bw = r.rb > r.ra;
  return '<li class="tr-rr' + (r.me ? ' tr-rr--me' : '') + '" aria-label="' + esc(r.a + ' ' + r.ra + ' for ' + r.wa + ', ' + r.b + ' ' + r.rb + ' for ' + r.wb + (aw ? ', ' + r.a + ' won' : bw ? ', ' + r.b + ' won' : ', tied')) + '">' +
    '<span class="tr-rr__names"><span class="tr-rr__t' + (aw ? ' is-win' : '') + '"><span>' + esc(r.a) + '</span></span>' +
    '<span class="tr-rr__v">' + (aw ? 'beat' : bw ? 'lost to' : 'tied') + '</span>' +
    '<span class="tr-rr__t' + (bw ? ' is-win' : '') + '"><span>' + esc(r.b) + '</span></span></span>' +
    '<span class="tr-rr__scores"><b class="tr-rr__s">' + esc(r.ra) + '/' + esc(r.wa) + '</b><span class="tr-rr__v">to</span><b class="tr-rr__s">' + esc(r.rb) + '/' + esc(r.wb) + '</b>' + (aw || bw ? '<span class="tr-rr__win">' + deco('medal', 20) + '<span>' + esc(aw ? r.a : r.b) + '</span></span>' : '') + '</span></li>';
}

export function render(el, vm, dispatch) {
  const lines = (vm.lines || []).map((l) => ({ ...l, stat: l.rating || l.stat })), reveals = vm.reveals || [], nodes = vm.nodes || [];
  const idle = (vm.gains || []).filter((g) => !lines.some((l) => l.id === g.id));
  const trained = lines.length, ups = lines.filter((g) => letterOfRaw(g.toRaw) !== letterOfRaw(g.fromRaw)).length;
  const notes = [];
  if (reveals.length) notes.push(['spark', 'Potential grades found: ' + reveals.map((r) => r.name + ' is ' + r.grade).join(', ')]);
  if (nodes.length) notes.push(['upgrade', 'Skill nodes: ' + nodes.map((n) => n.name + ' got ' + n.node).join(', ')]);
  const cr = vm.course; if (cr) notes.push(['coach', 'Course: ' + cr.name + ' ' + cr.fromLetter + (cr.fromLetter === cr.toLetter ? ' (top grade)' : ' to ' + cr.toLetter) + (cr.jackpot ? ', jackpot' : '')]);
  el.innerHTML =
    '<div class="screen tr-screen tr-week">' +
    '<div class="c-strip strip tr-top"><span>' + deco('week', 24) + '<span class="tr-wk"><span class="tr-nw">Week ' + esc(vm.week) + '</span> done</span></span><span class="c-strip__right tr-tpw">' + tp(vm.tp) + '</span></div>' +
    '<div class="c-card tr-card"><div class="tr-h"><b class="tr-iw">' + deco('train', 20) + '<span>' + trained + ' trained' + (ups ? ', ' + ups + ' moved up a letter' : '') + '</span></b></div>' +
    '<ul class="c-list list-flat t2-lines">' + lines.map((l) => lineHtml(l)).join('') + idle.map(skipTile).join('') + '</ul></div>' +
    (notes.length ? '<ul class="tr-notes">' + notes.map((n) => '<li class="tr-note">' + (n[0] === 'spark' ? deco('info', 20) : deco(n[0], 20)) + '<span>' + esc(n[1]) + '</span></li>').join('') + '</ul>' : '') +
    '<div class="c-card tr-card"><div class="tr-h"><b class="tr-iw">' + deco('week', 20) + '<span>Results this round</span></b>' + (vm.pos ? '<span>You are ' + esc(ord(vm.pos)) + '</span>' : '') + '</div>' +
    '<ul class="c-list list-flat tr-results">' + (vm.roundResults || []).map(result).join('') + '</ul></div>' +
    ctaBar(btn(vm.cta || 'Next match', 'NextWeek', { kind: 'cta' })) + '</div>';
  bindActs(el.firstElementChild, dispatch);
}
