// Shared view helpers (contract section 6; frozen). Each returns trusted markup; pass user text through esc().
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function ico(name, size, deco) {
  const w = typeof window !== 'undefined' ? window : null;
  const i = w && w.SPR && w.SPR.iconImg ? w.SPR.iconImg(name, size || 24) : null;
  if (i && deco) { i.setAttribute('alt', ''); i.setAttribute('aria-hidden', 'true'); }
  return i ? i.outerHTML : '';
}

/** Decorative icon: alt="" and aria-hidden, for an icon that sits next to visible words (the words carry the meaning). Use ico() with a plain-words alt only when the icon is the sole label. */
export function icoDeco(name, size) { return ico(name, size, true); }

function argAttr(arg) { return arg === undefined ? '' : ' data-arg="' + esc(JSON.stringify(arg)) + '"'; }

export function btn(label, act, o) {
  o = o || {};
  const kind = o.kind || 'plain';
  const cls = 'c-btn' + (kind === 'cta' ? ' c-btn--primary c-btn--cta c-btn--block' : kind === 'primary' ? ' c-btn--primary' : '');
  const dis = o.disabled ? ' disabled aria-disabled="true"' : '';
  const reason = o.disabled && o.reason ? '<span class="m0-warn" role="note">' + esc(o.reason) + '</span>' : '';
  const b = '<button type="button" class="' + cls + '" data-act="' + esc(act) + '"' + argAttr(o.arg) + dis + '>' + esc(label) + '</button>';
  return reason ? '<span class="m0-btnwrap">' + reason + b + '</span>' : b;
}

export function ctaBar(main, second) {
  return '<div class="m0-ctabar cta">' + (second ? '<div class="m0-ctabar__2">' + second + '</div>' : '') + main + '</div>';
}

export function row(o) {
  o = o || {};
  const tap = o.act ? ' c-row--tap" role="button" tabindex="0" data-act="' + esc(o.act) + '"' + argAttr(o.arg) : '"';
  return '<li class="c-row m0-row' + tap + '>' +
    '<span class="c-row__body"><span class="c-row__title name">' + esc(o.title) + '</span>' +
    (o.sub ? '<span class="c-row__sub">' + esc(o.sub) + '</span>' : '') + '</span>' +
    (o.right ? '<span class="c-row__end">' + o.right + '</span>' : '') + '</li>';
}

export function gradeChip(grade, pips) {
  const n = Math.max(0, Math.min(1, Number(pips) || 0));
  if (grade == null || grade === '' || grade === '?') {
    let dots = '';
    for (let k = 0; k < 1; k++) dots += '<i class="m0-pip' + (k < n ? ' is-on' : '') + '"></i>';
    return '<span class="m0-grade m0-grade--hidden" role="img" aria-label="Potential grade not known yet. Shows after 1 practice drill. ' + n + ' of 1 done">' +
      '<span class="m0-flat m0-flat--q">?</span><span class="m0-pips" aria-hidden="true">' + dots + '</span>' +
      '<span class="m0-pipn">' + n + '/1</span></span>';
  }
  return '<span class="m0-grade" role="img" aria-label="Potential grade ' + esc(grade) + ', how high he can grow"><span class="m0-flat m0-flat--g m0-gr-' + esc(String(grade).toUpperCase()) + '">' + esc(grade) + '</span></span>';
}

export function peakTag() {
  return '<span class="m0-flat m0-peak" aria-label="At peak">Peak</span>';
}

export function abilityCell(n, max) {
  if (max) {
    return '<span class="m0-abil m0-max" aria-label="' + esc(n) + ', max. Capped at potential ' + esc(n) + '">' +
      '<b>' + esc(n) + '</b><span class="c-tag m0-maxtag">max</span><span class="m0-cap">Capped at potential ' + esc(n) + '</span></span>';
  }
  return '<span class="m0-abil"><b>' + esc(n) + '</b></span>';
}

export function tpChip(n) {
  return '<span class="c-chip chip m0-tp">' + icoDeco('tp', 16) + '<b>' + esc(n) + '</b> <span aria-hidden="true">TP</span><span class="ss-sr"> training points</span></span>';
}

export function bindActs(root, dispatch, open) {
  function fire(e) {
    const t = e.target.closest && e.target.closest('[data-act]');
    if (!t || !root.contains(t) || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    const act = t.getAttribute('data-act');
    let arg;
    const raw = t.getAttribute('data-arg');
    if (raw != null) { try { arg = JSON.parse(raw); } catch (_) { arg = undefined; } }
    if (act.indexOf('sheet:') === 0) { if (open) open(act.slice(6), arg); } else dispatch(act, arg === undefined ? {} : arg);
  }
  root.addEventListener('click', fire);
  root.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button') { e.preventDefault(); fire(e); }
  });
}

/** Rival style tag chip: scout icon plus the tag in words (never colour alone). tag = { chip, hint } from tagInfo(), or null. */
export function tagChip(tag) {
  return tag ? '<span class="rv-tag">' + icoDeco('scout', 16) + '<b>' + esc(tag.chip) + '</b></span>' : '';
}
