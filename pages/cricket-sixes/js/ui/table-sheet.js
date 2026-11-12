/* table-sheet: the full league table (tableVM) in a bottom sheet, plus the shared table markup. Reads tableVM only. */
import { openSheet } from './sheet.js';
import { esc, tagChip } from './dom.js';

export const nameOf = (x) => (x && typeof x === 'object' ? x.name : x);
const rdText = (n) => { n = Number(n) || 0; return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); };
export const ordinal = (n) => { n = Number(n) || 0; const t = n % 100, u = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); };

/** Table markup. rows: [{pos,name,p,w,l,t,pts,rd,me}]. opts.ties adds a Tied column; opts.cut draws the Top 4 line. */
export function tableHtml(rows, opts) {
  opts = opts || {};
  const head = '<tr><th scope="col" title="Position">#</th><th scope="col">Club</th><th scope="col" title="Played">P</th><th scope="col" title="Won">W</th><th scope="col" title="Lost">L</th>' +
    (opts.ties ? '<th scope="col" title="Tied">T</th>' : '') + '<th scope="col" title="Points">Pts</th><th scope="col" title="Run difference">RD</th></tr>';
  const cols = opts.ties ? 8 : 7;
  const body = (rows || []).map((r, i) => {
    const cut = opts.cut && i === 4 ? '<tr class="ss-cut"><td colspan="' + cols + '"><b class="ss-cutlbl">Top 4</b> play the semi-finals</td></tr>' : '';
    return cut + '<tr class="ss-tr' + (r.me ? ' m0-sel' : '') + (i < 4 && opts.cut ? ' ss-top' : '') + '"' + (r.me ? ' aria-label="Your club"' : '') + '>' +
      '<td>' + esc(r.pos) + '</td><td class="ss-club' + (r.tag ? ' ss-club--tag' : '') + '"><span class="name">' + esc(r.name) + '</span>' + (r.me ? '<b class="ss-you">You</b>' : '') + (r.tag ? '<span class="ss-rv">' + tagChip(r.tag) + '</span>' : '') + '</td>' +
      '<td>' + esc(r.p) + '</td><td>' + esc(r.w) + '</td><td>' + esc(r.l) + '</td>' + (opts.ties ? '<td>' + esc(r.t) + '</td>' : '') +
      '<td class="ss-pts">' + esc(r.pts) + '</td><td>' + rdText(r.rd) + '</td></tr>';
  }).join('');
  return '<table class="m0-table ss-table' + (opts.ties ? ' ss-table--ties' : '') + '"><caption class="ss-sr">League table</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
}

function koLine(label, m) {
  if (!m) return '';
  const w = m.winner != null ? nameOf(m.winner) : null;
  const a = nameOf(m.a), b = nameOf(m.b);
  const side = (n) => '<span class="name' + (w != null && w === n ? ' ss-won' : '') + '">' + esc(n) + (w != null && w === n ? ' (won)' : '') + '</span>';
  return '<li class="ss-ko"><b>' + esc(label) + '</b>' + side(a) + ' <span class="ss-vs">v</span> ' + side(b) + (w == null ? '<em class="ss-tbd">to play</em>' : '') + '</li>';
}

export function finalsHtml(f) {
  if (!f) return '';
  const semis = (f.semis || []).map((m, i) => koLine('Semi-final ' + (i + 1), m)).join('');
  return '<ul class="ss-kos list-flat">' + semis + koLine('Final', f.final) + '</ul>';
}

/** Spelled-out key for the column letters. opts.ties adds T. */
export function keyHtml(opts) {
  return '<p class="ss-key">P played, W won, L lost, ' + (opts && opts.ties ? 'T tied, ' : '') + 'Pts points, RD run difference' + (opts && opts.tp ? ', TP training points' : '') + '.</p>';
}

export function html(vm) {
  return tableHtml(vm.rows, { ties: true, cut: true }) + keyHtml({ ties: true }) +
    '<p class="ss-note">Same points? Bigger run difference (RD) ranks higher: runs scored minus runs given away.</p>' +
    (vm.finals ? '<h4 class="ss-h">Finals</h4>' + finalsHtml(vm.finals) : '');
}

export function open(vm) { return openSheet('League table', '<div class="ss-sheet">' + html(vm) + '</div>'); }
