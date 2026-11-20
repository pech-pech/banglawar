// uikit.js: PL.UI = design tokens + text helpers + pure canvas draw functions (one per component).
// Every component: fn(ctx, rect{x,y,w,h}, state, t_seconds). No side effects (ctx state is saved/restored), no hex outside T.
const PL = (globalThis.PL = globalThis.PL || {});
(function () {
  'use strict';
  // ---------- tokens (plan s2). The ONLY place hex literals live. ----------
  const T = Object.freeze({
    c: Object.freeze({
      dusk: '#232a5c', night: '#151a3d', plum: '#2e2350', plumPress: '#221a3f',
      cream: '#f4efe0', creamPress: '#ddd6bf', muted: '#c9d4ff', dim: '#8e97c4',
      brass: '#e8bd5a', ink: '#1c2048', teal: '#5fe0c8', coral: '#ff7a6b', coralDeep: '#9c2f3a',
      silver: '#c9d2e0', bronze: '#c98b5a'
    }),
    stack: 'ui-rounded, "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
    // [narrow<400, wide], weight
    type: Object.freeze({
      title: [30, 36, 800], h2: [22, 26, 700], body: [16, 18, 600], teach: [16, 17, 600],
      small: [14, 15, 600], cause: [24, 24, 800]
    }),
    space: Object.freeze([4, 8, 12, 16, 24, 32]),
    touch: 56, key: 60, keyVisual: 56, dive: 56,
    radius: Object.freeze({ key: 14, button: 16, card: 20, chip: 10 }),
    minFont: 14,
    // text/background pairs that must be >= 4.5:1 (text.dim only on dusk: disabled label, not info)
    pairs: Object.freeze([
      ['cream', 'dusk'], ['cream', 'plum'], ['cream', 'night'], ['muted', 'dusk'], ['muted', 'plum'], ['dim', 'dusk'],
      ['brass', 'dusk'], ['brass', 'plum'], ['ink', 'cream'], ['ink', 'brass'], ['ink', 'teal'], ['teal', 'dusk'],
      ['teal', 'plum'], ['coral', 'dusk'], ['coral', 'night'], ['ink', 'coral'], ['cream', 'coralDeep'],
      ['cream', 'plumPress'], ['ink', 'creamPress'], ['ink', 'silver'], ['ink', 'bronze']
    ])
  });
  const C = T.c;

  // ---------- colour maths ----------
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lum(hex) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [r, g, b] = rgb(hex); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function alpha(hex, a) { const [r, g, b] = rgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }

  // ---------- type ----------
  const narrow = (w) => w < 400;
  function size(name, w, scale) {
    const e = T.type[name]; const base = narrow(w) ? e[0] : e[1];
    const body = name === 'body' || name === 'teach' || name === 'small';
    return Math.max(T.minFont, Math.round(base * (body ? (scale || 1) : 1)));
  }
  function font(name, w, scale) { const e = T.type[name]; return e[2] + ' ' + size(name, w, scale) + 'px ' + T.stack; }
  function fontPx(px, weight) { return (weight || 600) + ' ' + Math.max(T.minFont, px) + 'px ' + T.stack; }

  // text: o {font, color, align, base, maxW}. Shrinks to fit down to minFont, then clips with ellipsis.
  function text(ctx, str, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = o.font; ctx.fillStyle = o.color || C.cream; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
    let s = String(str);
    if (o.maxW) {
      let m = /(\d+(?:\.\d+)?)px/.exec(o.font), px = m ? +m[1] : 16;
      while (ctx.measureText(s).width > o.maxW && px > T.minFont) { px -= 1; ctx.font = o.font.replace(/\d+(?:\.\d+)?px/, px + 'px'); }
      if (ctx.measureText(s).width > o.maxW) { while (s.length > 1 && ctx.measureText(s + '…').width > o.maxW) s = s.slice(0, -1); s += '…'; }
    }
    ctx.fillText(s, x, y); ctx.restore();
  }
  function wrap(ctx, str, maxW, fnt) {
    ctx.save(); ctx.font = fnt; const out = []; let line = '';
    for (const wd of String(str).split(' ')) {
      const tryL = line ? line + ' ' + wd : wd;
      if (line && ctx.measureText(tryL).width > maxW) { out.push(line); line = wd; } else line = tryL;
    }
    if (line) out.push(line); ctx.restore(); return out;
  }

  // ---------- shape helpers ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function starPath(ctx, cx, cy, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
    ctx.closePath();
  }
  const easeOutBack = (x) => { x = Math.max(0, Math.min(1, x)); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const cx = (r) => r.x + r.w / 2, cy = (r) => r.y + r.h / 2;

  // Sticker: soft shadow, thin cream outer border, fill, brass inner edge, faint top highlight (soft sketch look).
  // o {fill, edge, radius, press 0..1, shake px, focus, disabled, shadow}
  function sticker(ctx, r, o) {
    const s = 1 - 0.08 * (o.press || 0), rad = o.radius == null ? T.radius.button : o.radius;
    const x = cx(r) + (o.shake || 0), y = cy(r), w = r.w * s, h = r.h * s;
    ctx.save();
    if (o.shadow !== false) {
      const k = 1 - 0.6 * (o.press || 0);
      for (let i = 3; i >= 1; i--) { rr(ctx, x - w / 2 - i, y - h / 2 + 3 - i + 2, w + i * 2, h + i * 2, rad + i); ctx.fillStyle = alpha(C.night, 0.14 * k); ctx.fill(); }
    }
    rr(ctx, x - w / 2 - 1.5, y - h / 2 - 1.5, w + 3, h + 3, rad + 1.5); ctx.lineWidth = 3; ctx.strokeStyle = C.cream; ctx.stroke();
    rr(ctx, x - w / 2, y - h / 2, w, h, rad); ctx.fillStyle = o.fill; ctx.fill();
    if (!o.disabled) { rr(ctx, x - w / 2 + 2.5, y - h / 2 + 2.5, w - 5, h - 5, Math.max(2, rad - 2.5)); ctx.lineWidth = 2; ctx.strokeStyle = o.edge || C.brass; ctx.stroke(); }
    // soft highlight strip
    if (o.fill === C.cream || o.fill === C.brass) { ctx.save(); rr(ctx, x - w / 2 + 6, y - h / 2 + 5, w - 12, Math.max(4, h * 0.18), rad / 2); ctx.fillStyle = alpha(C.cream, 0.35); ctx.fill(); ctx.restore(); }
    if (o.focus) { rr(ctx, x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, rad + 6); ctx.lineWidth = 3; ctx.strokeStyle = C.teal; ctx.stroke(); }
    ctx.restore();
  }

  // ---------- icons (all stroked/filled with given colour) ----------
  function chevron(ctx, x, y, s, dir, col) { // dir: up right down left
    const rot = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir] || 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = col; ctx.lineWidth = Math.max(4, s * 0.2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.42, s * 0.2); ctx.lineTo(0, -s * 0.22); ctx.lineTo(s * 0.42, s * 0.2); ctx.stroke(); ctx.restore();
  }
  function retryIcon(ctx, x, y, s, col, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.36, -Math.PI * 0.35, Math.PI * 1.45); ctx.stroke();
    const a = -Math.PI * 0.35, px = Math.cos(a) * s * 0.36, py = Math.sin(a) * s * 0.36;
    ctx.beginPath(); ctx.moveTo(px + s * 0.2, py - s * 0.02); ctx.lineTo(px - s * 0.02, py - s * 0.2); ctx.lineTo(px - s * 0.12, py + s * 0.1); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function causeIcon(ctx, kind, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    if (kind === 'spikes') { ctx.beginPath(); ctx.moveTo(-s / 2, s / 2); ctx.lineTo(-s / 4, -s / 2); ctx.lineTo(0, s / 2); ctx.lineTo(s / 4, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.closePath(); ctx.fill(); }
    else if (kind === 'crusher') { ctx.fillRect(-s / 2, -s / 2, s, s * 0.35); ctx.fillRect(-s * 0.1, -s * 0.15, s * 0.2, s * 0.4); ctx.fillRect(-s / 2, s * 0.3, s, s * 0.2); }
    else if (kind === 'crystal') { ctx.beginPath(); ctx.moveTo(0, -s / 2); ctx.lineTo(s * 0.4, 0); ctx.lineTo(0, s / 2); ctx.lineTo(-s * 0.4, 0); ctx.closePath(); ctx.fill(); }
    else if (kind === 'edge') { ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.15); ctx.lineTo(0, -s * 0.15); ctx.moveTo(s * 0.15, -s * 0.2); ctx.lineTo(s * 0.15, s * 0.4); ctx.moveTo(-s * 0.05, s * 0.2); ctx.lineTo(s * 0.15, s * 0.45); ctx.lineTo(s * 0.35, s * 0.2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * 0.28); ctx.lineTo(0, 0); ctx.lineTo(s * 0.2, s * 0.14); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- components ----------
  // Sticker button. st {label, pressed 0..1, disabled, focus, kind:'plain'|'primary'|'danger', sub, w(viewport for type), scale}
  function button(ctx, r, st, t) {
    st = st || {}; const kind = st.kind || 'plain', dis = !!st.disabled, vw = st.vw || 475;
    const fill = dis ? C.plumPress : kind === 'primary' ? C.brass : kind === 'danger' ? C.coralDeep : (st.pressed > 0.5 ? C.creamPress : C.cream);
    const ink = dis ? C.dim : kind === 'danger' ? C.cream : C.ink;
    sticker(ctx, r, { fill, edge: kind === 'primary' ? C.cream : C.brass, radius: T.radius.button, press: st.pressed, focus: st.focus, disabled: dis, shadow: !dis });
    const big = r.h >= 72;
    const f = big ? fontPx(size('h2', vw, 1), 800) : font('body', vw, st.scale);
    if (st.sub) {
      text(ctx, st.label, cx(r), cy(r) - 8, { font: f, color: ink, align: 'center', maxW: r.w - 24 });
      text(ctx, st.sub, cx(r), cy(r) + 14, { font: font('small', vw, st.scale), color: ink, align: 'center', maxW: r.w - 24 });
    } else text(ctx, st.label, cx(r), cy(r) + 1, { font: f, color: ink, align: 'center', maxW: r.w - 24 });
  }

  // Arrow key (rect = 60 cell, drawn 56). st {dir, lit, pressed, dim, focus}
  function arrowKey(ctx, r, st, t) {
    const dim = !!st.dim, lit = !!st.lit && !dim;
    const k = { x: r.x + 2, y: r.y + 2, w: 56, h: 56 };
    const shake = dim && st.pressed > 0 ? Math.sin(t * 90) * 2 : 0;
    sticker(ctx, k, { fill: lit ? C.teal : dim ? C.night : C.plum, edge: lit ? C.ink : dim ? C.dusk : C.brass, radius: T.radius.key, press: st.pressed, shake, focus: st.focus, disabled: dim });
    if (lit) { const g = ctx.createRadialGradient(cx(k), cy(k), 4, cx(k), cy(k), 40); g.addColorStop(0, alpha(C.teal, 0.35)); g.addColorStop(1, alpha(C.teal, 0)); ctx.save(); ctx.fillStyle = g; ctx.fillRect(k.x - 14, k.y - 14, k.w + 28, k.h + 28); ctx.restore(); sticker(ctx, k, { fill: C.teal, edge: C.ink, radius: T.radius.key, press: st.pressed, shadow: false }); }
    chevron(ctx, cx(k) + shake, cy(k), 30, st.dir, lit ? C.ink : dim ? C.dim : C.cream);
  }

  // Dive key: round 56. st {pressed, cooldown 0..1 (ring sweep, 1=just used), disabled, airCost}
  function diveKey(ctx, r, st, t) {
    const dis = !!st.disabled, c = { x: cx(r), y: cy(r) }, R = 28;
    const shake = dis && st.pressed > 0 ? Math.sin(t * 90) * 2 : 0, s = 1 - 0.08 * (st.pressed || 0);
    ctx.save(); ctx.translate(c.x + shake, c.y); ctx.scale(s, s);
    for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(0, 3, R + i, 0, 7); ctx.fillStyle = alpha(C.night, 0.14); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, R + 1.5, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = C.cream; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fillStyle = dis ? C.plumPress : C.brass; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, R - 3, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = dis ? C.dusk : C.cream; ctx.stroke();
    starPath(ctx, 0, st.airCost ? -3 : 0, 14, 6); ctx.fillStyle = dis ? C.dim : C.ink; ctx.fill();
    if (st.airCost) { ctx.font = fontPx(14, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.ink; ctx.fillText('1', 0, 15); }
    if (st.cooldown > 0) { ctx.beginPath(); ctx.arc(0, 0, R - 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - st.cooldown)); ctx.lineWidth = 4; ctx.strokeStyle = C.teal; ctx.stroke(); }
    ctx.restore();
  }

  // Retry: 56 round with label under is NOT drawn inside (rect stays 56); label drawn to the right/below by caller via retryLabel
  function retryKey(ctx, r, st, t) {
    const c = { x: cx(r), y: cy(r) }, s = 1 - 0.08 * (st.pressed || 0), R = 28;
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(s, s);
    for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(0, 3, R + i, 0, 7); ctx.fillStyle = alpha(C.night, 0.14); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, R + 1.5, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = C.cream; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fillStyle = st.pressed > 0.5 ? C.plumPress : C.plum; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, R - 3, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = C.brass; ctx.stroke();
    if (st.focus) { ctx.beginPath(); ctx.arc(0, 0, R + 6, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = C.teal; ctx.stroke(); }
    retryIcon(ctx, 0, 0, 32, C.cream, (st.spin || 0) * Math.PI); // icon only; the word Retry lives in the Pause menu
    ctx.restore();
  }
  function pauseKey(ctx, r, st, t) {
    sticker(ctx, r, { fill: st.pressed > 0.5 ? C.plumPress : C.plum, edge: C.brass, radius: T.radius.key + 2, press: st.pressed, focus: st.focus });
    ctx.save(); ctx.fillStyle = C.cream; rr(ctx, cx(r) - 10, cy(r) - 11, 6, 22, 2); ctx.fill(); rr(ctx, cx(r) + 4, cy(r) - 11, 6, 22, 2); ctx.fill(); ctx.restore();
  }

  // Move pips: st {n, max, pop 0..1 (gain pop), size}
  function pips(ctx, r, st, t) {
    const max = st.max || 2, n = st.n == null ? max : st.n, R = (st.size || 18) / 2, gap = R * 2 + 4, w = max * gap - 4, x0 = cx(r) - w / 2 + R;
    for (let i = 0; i < max; i++) {
      const x = x0 + i * gap, y = cy(r), on = i < n, pop = on && i === n - 1 && st.pop > 0 ? 1 + 0.2 * Math.sin(st.pop * Math.PI) : 1;
      ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop); starPath(ctx, 0, 0, R, R * 0.45);
      if (on) { ctx.fillStyle = C.brass; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.cream; ctx.stroke(); } else { ctx.lineWidth = 2; ctx.strokeStyle = C.brass; ctx.stroke(); }
      ctx.restore();
    }
  }

  // Timer + flip counter: small text on night strip. st {text, align, glow(best), vw, scale}
  function hudText(ctx, r, st, t) {
    ctx.save(); rr(ctx, r.x, r.y, r.w, r.h, T.radius.chip); ctx.fillStyle = alpha(C.night, 0.82); ctx.fill();
    if (st.glow) { ctx.lineWidth = 2; ctx.strokeStyle = C.brass; ctx.stroke(); }
    ctx.restore();
    text(ctx, st.text, cx(r), cy(r) + 1, { font: font('small', st.vw || 475, st.scale), color: C.cream, align: 'center', maxW: r.w - 12 });
  }

  // Teach slot: plum card 85% + brass left bar. st {lines[], alpha, slide px, vw, scale}
  function teachSlot(ctx, r, st, t) {
    const a = st.alpha == null ? 1 : st.alpha; if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 8 * (st.slide == null ? 1 : st.slide));
    rr(ctx, r.x, r.y, r.w, r.h, T.radius.chip + 2); ctx.fillStyle = alpha(C.plum, 0.85); ctx.fill();
    ctx.save(); rr(ctx, r.x, r.y, r.w, r.h, T.radius.chip + 2); ctx.clip(); ctx.fillStyle = C.brass; ctx.fillRect(r.x, r.y, 5, r.h); ctx.restore();
    const f = font('teach', st.vw || 475, st.scale), px = size('teach', st.vw || 475, st.scale), lh = Math.round(px * 1.3);
    let y = r.y + 12 + px / 2;
    for (const ln of (st.lines || [])) for (const w of wrap(ctx, ln, r.w - 30, f)) { text(ctx, w, r.x + 16, y, { font: f, color: C.cream }); y += lh; }
    ctx.restore();
  }

  // Death cause tag: pill. st {kind, text, age ms, iconOnly, vw}
  function causeTag(ctx, r, st, t) {
    const age = st.age == null ? 999 : st.age, sc = age < 150 ? easeOutBack(age / 150) : 1, fade = age > 1000 ? Math.max(0, 1 - (age - 1000) / 700) : 1;
    if (fade <= 0) return;
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(cx(r), cy(r)); ctx.scale(sc, sc);
    let w = 44; if (!st.iconOnly) { ctx.font = fontPx(24, 800); w = Math.min(r.w, Math.ceil(ctx.measureText(st.text).width) + 56); } const h = 36, b = { x: -w / 2, y: -h / 2, w, h };
    rr(ctx, b.x, b.y, w, h, 18); ctx.fillStyle = C.coralDeep; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.cream; ctx.stroke();
    if (st.iconOnly) causeIcon(ctx, st.kind, 0, 0, 20, C.cream);
    else { causeIcon(ctx, st.kind, b.x + 20, 0, 18, C.cream); text(ctx, st.text, b.x + 36, 1, { font: fontPx(24, 800), color: C.cream, maxW: w - 46 }); }
    ctx.restore();
  }

  // Panel/card: opaque plum, brass edge, cream outline. st {anim 0..1 (in), scrim: alpha (draws full-view scrim given vw/vh)}
  function card(ctx, r, st, t) {
    const a = st && st.anim != null ? st.anim : 1, s = 0.94 + 0.06 * easeOutBack(a);
    ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.translate(cx(r), cy(r)); ctx.scale(s, s); ctx.translate(-cx(r), -cy(r));
    sticker(ctx, r, { fill: C.plum, edge: C.brass, radius: T.radius.card });
    ctx.restore();
  }
  function scrim(ctx, w, h, a, col) { ctx.save(); ctx.fillStyle = alpha(col || C.night, a); ctx.fillRect(0, 0, w, h); ctx.restore(); }
  // the one scrim every overlay uses (pause, settings, room clear, shaft complete, 5-death nudge): 85% dusk, drawn once, over the field only
  const SCRIM_A = 0.85;
  function overlayScrim(ctx, w, h) { scrim(ctx, w, h, SCRIM_A, C.dusk); }
  // scroll hint for a clipped list: fade over the bottom of the list + a chevron in the strip r below it. st {more, less}
  function scrollHint(ctx, list, strip, st) {
    if (st.more) { ctx.save(); const g = ctx.createLinearGradient(0, list.y + list.h - 30, 0, list.y + list.h); g.addColorStop(0, alpha(C.dusk, 0)); g.addColorStop(1, alpha(C.dusk, 0.92)); ctx.fillStyle = g; ctx.fillRect(list.x, list.y + list.h - 30, list.w, 30); ctx.restore(); }
    if (st.more || st.less) chevron(ctx, cx(strip), cy(strip) + (st.more ? -3 : 3), 18, st.more ? 'down' : 'up', C.brass);
  }

  // Slider (rect = control zone). st {value 0..1, drag, disabled}
  function slider(ctx, r, st, t) {
    const x0 = r.x + 14, x1 = r.x + r.w - 14, y = cy(r), v = Math.max(0, Math.min(1, st.value || 0)), kx = x0 + (x1 - x0) * v, dis = !!st.disabled;
    ctx.save(); rr(ctx, x0, y - 4, x1 - x0, 8, 4); ctx.fillStyle = C.night; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = alpha(C.cream, 0.5); ctx.stroke();
    if (v > 0) { rr(ctx, x0, y - 4, kx - x0, 8, 4); ctx.fillStyle = dis ? C.dim : C.teal; ctx.fill(); }
    const kr = (st.drag ? 15 : 13);
    ctx.beginPath(); ctx.arc(kx, y + 2, kr, 0, 7); ctx.fillStyle = alpha(C.night, 0.3); ctx.fill();
    ctx.beginPath(); ctx.arc(kx, y, kr, 0, 7); ctx.fillStyle = dis ? C.dim : C.cream; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.restore();
  }
  // Toggle 56x32 centred in rect. st {on, disabled, knob 0..1 (anim, default = on)}
  function toggle(ctx, r, st, t) {
    const w = 56, h = 32, x = cx(r) - w / 2, y = cy(r) - h / 2, k = st.knob == null ? (st.on ? 1 : 0) : st.knob, dis = !!st.disabled;
    ctx.save(); rr(ctx, x, y, w, h, 16); ctx.fillStyle = st.on ? (dis ? C.dim : C.teal) : C.night; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = st.on ? C.ink : C.cream; ctx.stroke();
    const kx = x + 16 + 24 * k; ctx.beginPath(); ctx.arc(kx, cy(r), 11, 0, 7); ctx.fillStyle = C.cream; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
    if (st.on) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(kx - 4, cy(r)); ctx.lineTo(kx - 1, cy(r) + 3); ctx.lineTo(kx + 5, cy(r) - 4); ctx.stroke(); }
    ctx.restore();
  }
  // Tab: h 48 drawn in a 56 hit rect. st {label, active, pressed, vw}
  function tab(ctx, r, st, t) {
    const b = { x: r.x, y: cy(r) - 24, w: r.w, h: 48 };
    ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, T.radius.chip + 2); ctx.fillStyle = st.pressed > 0.5 ? C.plumPress : C.plum; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = st.active ? C.brass : alpha(C.cream, 0.4); ctx.stroke();
    if (st.active) { ctx.fillStyle = C.brass; rr(ctx, b.x + 12, b.y + b.h - 7, b.w - 24, 4, 2); ctx.fill(); }
    ctx.restore();
    text(ctx, st.label, cx(b), cy(b) - 2, { font: font('body', st.vw || 475), color: C.cream, align: 'center', maxW: b.w - 12 });
  }
  // Medal 72. st {tier:'gold'|'silver'|'bronze'|'none', isNew, drop 0..1}
  function medal(ctx, r, st, t) {
    const tier = st.tier || 'none', col = { gold: C.brass, silver: C.silver, bronze: C.bronze }[tier], d = st.drop == null ? 1 : st.drop;
    const R = Math.min(r.w, r.h) / 2 - 2, y = cy(r) - (1 - easeOutBack(d)) * 40 * (d < 1 ? 1 : 0);
    ctx.save(); ctx.globalAlpha = Math.min(1, d * 3 + 0.001);
    if (!col) { ctx.beginPath(); ctx.arc(cx(r), y, R, 0, 7); ctx.setLineDash([6, 5]); ctx.lineWidth = 3; ctx.strokeStyle = C.muted; ctx.stroke(); ctx.setLineDash([]); starPath(ctx, cx(r), y, R * 0.45, R * 0.2); ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore(); return; }
    ctx.fillStyle = C.coralDeep; ctx.fillStyle = C.plumPress; // ribbon tails
    ctx.beginPath(); ctx.moveTo(cx(r) - R * 0.55, y); ctx.lineTo(cx(r) - R * 0.2, y + R * 1.05); ctx.lineTo(cx(r) - R * 0.55, y + R * 0.9); ctx.lineTo(cx(r) - R * 0.9, y + R * 1.05); ctx.closePath(); ctx.fillStyle = C.teal; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx(r) + R * 0.55, y); ctx.lineTo(cx(r) + R * 0.2, y + R * 1.05); ctx.lineTo(cx(r) + R * 0.55, y + R * 0.9); ctx.lineTo(cx(r) + R * 0.9, y + R * 1.05); ctx.closePath(); ctx.fill();
    for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(cx(r), y + 3, R + i, 0, 7); ctx.fillStyle = alpha(C.night, 0.14); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx(r), y, R, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.cream; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx(r), y, R - 6, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
    starPath(ctx, cx(r), y, R * 0.5, R * 0.22); ctx.fillStyle = C.ink; ctx.fill();
    if (st.isNew) for (let i = 0; i < 6; i++) { const a = i * 1.047 + t * 1.2, rr2 = R + 8 + Math.sin(t * 6 + i) * 3; starPath(ctx, cx(r) + Math.cos(a) * rr2, y + Math.sin(a) * rr2, 4, 1.6); ctx.fillStyle = C.brass; ctx.fill(); }
    ctx.restore();
  }
  // Toast: h 40 pill. st {text, kind:'info'|'error', alpha, vw}
  function toast(ctx, r, st, t) {
    const a = st.alpha == null ? 1 : st.alpha; if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; rr(ctx, r.x, r.y, r.w, 40, 20); ctx.fillStyle = alpha(C.night, 0.9); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = alpha(C.cream, 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(r.x + 18, r.y + 20, 5, 0, 7); ctx.fillStyle = st.kind === 'error' ? C.brass : C.teal; ctx.fill();
    text(ctx, st.text, r.x + 32, r.y + 21, { font: font('body', st.vw || 475), color: C.cream, maxW: r.w - 44 });
    ctx.restore();
  }
  function devBadge(ctx, r, st, t) {
    const b = { x: r.x, y: r.y, w: Math.max(56, r.w), h: 24 };
    ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, T.radius.chip); ctx.fillStyle = C.brass; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke(); ctx.restore();
    text(ctx, (st && st.label) || PL.Strings.dev.badge, cx(b), cy(b) + 1, { font: fontPx(14, 800), color: C.ink, align: 'center', maxW: b.w - 8 });
  }
  function artChip(ctx, r, st, t) {
    const b = { x: r.x, y: r.y, w: Math.max(100, r.w), h: 24 };
    ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, T.radius.chip); ctx.fillStyle = alpha(C.night, 0.8); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.muted; ctx.stroke(); ctx.restore();
    text(ctx, PL.Strings.dev.artFallback, cx(b), cy(b) + 1, { font: fontPx(14, 600), color: C.cream, align: 'center', maxW: b.w - 8 });
  }

  // Title lettering "sticker": cream fill, brass edge, cream die-cut border, soft glow, gentle arc + tilt. Drawn per letter in
  // three passes (border, brass edge, fill) so neighbours never cover each other. st {text, vw, reduced}. rect = title zone.
  function titleArt(ctx, r, st, t) {
    const str = String(st.text), reduced = !!st.reduced, pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.6);
    let px = Math.min(Math.round(r.h * 0.82), 64);
    const mk = (p) => '800 ' + p + 'px ' + T.stack;
    ctx.save(); ctx.font = mk(px);
    while (px > 24 && ctx.measureText(str).width > r.w - px * 0.5) { px -= 2; ctx.font = mk(px); }
    const ws = [...str].map((ch) => ctx.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0), R = Math.max(total * 2.4, 260);
    const cxm = cx(r), base = cy(r) + px * 0.1;
    ctx.translate(cxm, base); ctx.rotate(-0.045); ctx.translate(-cxm, -base);
    ctx.font = mk(px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // arc: letters sit on a circle of radius R whose top is at base; y offset = R(1-cos th) is a drop, so centre letters are highest
    const place = (fn) => { let a = -total / 2; [...str].forEach((ch, i) => { const th = (a + ws[i] / 2) / R;
      ctx.save(); ctx.translate(cxm + Math.sin(th) * R, base + (1 - Math.cos(th)) * R); ctx.rotate(th); fn(ch); ctx.restore(); a += ws[i]; }); };
    ctx.save(); ctx.translate(0, 4); ctx.lineWidth = px * 0.3; ctx.strokeStyle = alpha(C.night, 0.55); place((ch) => ctx.strokeText(ch, 0, 0)); ctx.restore();
    ctx.save(); ctx.shadowColor = alpha(C.brass, 0.35 + 0.35 * pulse); ctx.shadowBlur = 18 + 14 * pulse; ctx.lineWidth = px * 0.3; ctx.strokeStyle = C.cream;
    place((ch) => ctx.strokeText(ch, 0, 0)); ctx.restore();
    ctx.lineWidth = px * 0.17; ctx.strokeStyle = C.brass; place((ch) => ctx.strokeText(ch, 0, 0));
    ctx.fillStyle = C.cream; place((ch) => ctx.fillText(ch, 0, 0));
    ctx.restore();
  }

  // ring of sparkles that bursts out of a point once. age seconds since the burst; r0 start radius, r1 end radius.
  function sparkRing(ctx, x, y, age, r0, r1, n) {
    const d = age / 0.9; if (d <= 0 || d >= 1) return;
    const e = 1 - Math.pow(1 - d, 3), rad = r0 + (r1 - r0) * e;
    ctx.save(); ctx.globalAlpha = Math.min(1, (1 - d) * 1.6);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3, big = i % 2 ? 5 : 7.5;
      starPath(ctx, x + Math.cos(a) * rad, y + Math.sin(a) * rad, big * (1 - d * 0.4), big * 0.4 * (1 - d * 0.4)); ctx.fillStyle = i % 3 === 0 ? C.teal : i % 3 === 1 ? C.brass : C.cream; ctx.fill(); }
    ctx.lineWidth = 3 * (1 - d); ctx.strokeStyle = alpha(C.brass, 0.8); ctx.beginPath(); ctx.arc(x, y, rad * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // a few star motes drifting upward inside rect r (not drawn when st.reduced)
  function motes(ctx, r, t, st) {
    if (st && st.reduced) return;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    for (let i = 0; i < 9; i++) {
      const sp = 6 + (i % 4) * 2.5, ph = (i * 0.618) % 1, yy = r.y + r.h - ((t * sp + ph * (r.h + 40)) % (r.h + 40)) + 20;
      const xx = r.x + r.w * ((i * 0.37 + 0.08) % 1) + Math.sin(t * 0.5 + i * 2) * 10, tw = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.3);
      ctx.globalAlpha = 0.25 + 0.55 * tw; starPath(ctx, xx, yy, 3.5 + (i % 3), 1.4); ctx.fillStyle = i % 2 ? C.cream : C.brass; ctx.fill();
    }
    ctx.restore();
  }

  PL.UI = { T, C, lum, contrast, alpha, size, font, fontPx, text, wrap, rr, starPath, sticker, scrim, SCRIM_A, overlayScrim, scrollHint, easeOutBack, titleArt, sparkRing, motes,
    button, arrowKey, diveKey, retryKey, pauseKey, pips, hudText, teachSlot, causeTag, card, slider, toggle, tab, medal, toast, devBadge, artChip,
    chevron, causeIcon };
})();
