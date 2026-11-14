/* dial-view: the half-dial for Hype (aim) and the one-tap reveals Toss (coin flip) and Pep (six lights chase). Wheel meta w2, spec 03 sections 1-6.
   openDial(o) -> close()
   o = { mode:'aim'|'reveal', kind?:'coin'|'lights' (reveal only), title, sub?, cardHtml?, legendHtml?,
         slices:[{label, sub?, w, gold?}],       arc order left to right; w = units (arc L = 10 for aim, sum of w), gold = the narrow nuts slice (aim)
         pending:{index,...}|null,               already spun (reload / reopen): opens on the result
         onSpin(stop),                           aim: stop = {t, phi, e} (STOP time in dial seconds, start phase over the whole 2L loop, wobble); reveal: {reveal:true} then the result is read from getPending()
         getPending() -> {index, jackpot?}|null,
         describe(p) -> { big, chip?, flash?, lineHtml?, say, gold?:bool },
         onCollect(), collectLabel?, onClose?(), onTick?({loud, rate}), spokeGain?()=>number (a '+N Spokes' chip on the result card; 0 = none),
         guide?:bool                              Aim Guide upgrade: a small tick on the rim shows where the needle would land if STOP were pressed now
         look?:{rim, hub, needle, gold}           craft look (css colour strings or [r,g,b]); missing = skin palette
         J?:number, V?:number,                    overrides (aim): wobble in units, sweep speed units/s; default J = 1.2 x gold width, V = 16
         plan?:{total}                            reveal length in s (default 2.5; the coordinator's latest)
         wa1: tokens?:[{kind,label,count?,left?,match?}], getTokens?(), onToken(kind), tokName?, tokVal?(p), tokText?(p)   same pattern as wheel-view: buttons after the result, a short replay (none with reduced motion), one outcome line ("Spin Again: kept +4%") and the uses-left note
         wa1: zone?:s, chime?:bool (aim dial: the needle glows near gold / flashes on entering it); guide on a reveal = a feel-only tick as it slows }
   Aim: SPIN then STOP. The needle sweeps back and forth at a fixed speed from a random phase; STOP is live from 0.8 s, the game presses it at 3.0 s.
   STOP glides 0.5 s (cubic ease-out) plus a small wobble; the slice under the needle wins. No snap, no hidden roll, no landing preview (a fixed tick at 12 o'clock only).
   Reveal: the result is already drawn; one tap plays the coin or the lights, tap again (or anywhere) to skip. Reduced motion: no motion, result at once.
   Canvas drawn in code, pixel style, palette read from the page's CSS variables (both skins). */
import { esc, icoDeco } from './dom.js';
import { releaseInert } from './inert.js';
import { spokeIcon } from './wheel-look.js';

export const DR = { L: 10, V: 16, G: 0.5, STOP_FROM: 0.8, COAST: 3, AIM_LO: 1.5, AIM_HI: 2.5, JK: 1.2, HOLD: 0.3, REVEAL_T: 2.5, RAMP: 0.2 / 1.5, CRUISE: 0.8 / 1.5 };
const TAU = Math.PI * 2;
export const reducedNow = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
export const dim = (c, k) => c.map((v) => Math.round(v * (1 - k)));
export const lift = (c, k) => c.map((v) => Math.round(v + (255 - v) * k));

/** Resolve a CSS variable (or a literal colour when `lit`) to [r,g,b] (works through var() chains and both skins). */
export function tok(name, fb, lit) {
  const p = document.createElement('i'); p.style.cssText = 'position:absolute;visibility:hidden;color:' + (lit ? name : 'var(' + name + ',' + fb + ')'); document.body.appendChild(p);
  let m = getComputedStyle(p).color.match(/\d+(\.\d+)?/g); p.remove();
  if (!m && lit) return tok(fb, fb, false);
  m = m || [0, 0, 0]; return [+m[0], +m[1], +m[2]];
}
export function palette(look) {
  const pal = { cream: tok('--cream', '#F3EBD3'), out: tok('--outline', '#2A2238'), gold: tok('--gold', '#D2B357'), wall: tok('--wall1', '#E3D8B9'), g2: tok('--grass2', '#7EB261'), acc: tok('--accent', '#22625D'), b1: tok('--kitA1', '#3b5ba5'), stone: tok('--stone1', '#C9CDD3') };
  const lk = look || {}, pick = (v, fb) => (Array.isArray(v) ? v : typeof v === 'string' && v ? tok(v, 'transparent', true) : fb);
  pal.rim = pick(lk.rim, pal.cream); pal.hub = pick(lk.hub, pal.acc); pal.needle = pick(lk.needle, pal.cream); pal.gold = pick(lk.gold, pal.gold);
  return pal;
}

// ---------- pure maths (spec 03 section 6; tested) ----------
/** Triangle reflect: phase q on the loop 0..2L -> position 0..L. */
export const reflect = (q, L) => { let m = q % (2 * L); if (m < 0) m += 2 * L; return m <= L ? m : 2 * L - m; };
export const cumOf = (w) => { const c = [0]; w.forEach((v, i) => c.push(c[i] + v)); return c; };
export const sliceAtX = (cum, x) => { const n = cum.length - 1; for (let i = 0; i < n; i++) if (x < cum[i + 1]) return i; return n - 1; };
export const easeOut3 = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
export const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return 3 * u * u - 2 * u * u * u; };
/** Where the dial lands for a STOP at t (clamped 0.8..3): phase base+dist+e, slice by reflection. widths = units, loop 2L. */
export function dialLand(widths, stop, V = DR.V, G = DR.G) {
  const L = widths.reduce((a, b) => a + b, 0), t = Math.min(DR.COAST, Math.max(DR.STOP_FROM, stop.t)), dist = V * G / 3, base = stop.phi + V * t, e = stop.e || 0;
  const end = base + dist + e, x = reflect(end, L);
  return { t, L, base, dist, e, end, x, index: sliceAtX(cumOf(widths), x), phi: stop.phi };
}
/** Phase during the glide: s seconds after STOP. */
export const dialGlideQ = (L0, s, G = DR.G) => L0.base + L0.dist * easeOut3(s / G) + L0.e * smooth(s / G);
/** Fraction (0..1) of the total reveal distance covered at time t of T: ramp, cruise, cubic ease-out (spec 03 section 5, phases scaled to T). */
export function revealFrac(t, T) {
  const a = DR.RAMP * T, b = DR.CRUISE * T, tot = a / 2 + (b - a) + (T - b) / 3; let d;
  if (t <= 0) d = 0; else if (t <= a) d = t * t / (2 * a); else if (t <= b) d = a / 2 + (t - a); else if (t < T) d = a / 2 + (b - a) + (T - b) * easeOut3((t - b) / (T - b)) / 3; else d = tot;
  return d / tot;
}
/** Pep: K = n + target steps, interval d_i = 0.06 + 0.20 (i/(K-1))^2 rescaled to total T. Returns the times (s) each light comes on: length K+1, [0] = 0, last = T. */
export function pepSchedule(n, target, T) {
  const K = n + Math.max(0, target | 0), d = []; let sum = 0;
  for (let i = 0; i < K; i++) { const v = 0.06 + 0.20 * Math.pow(i / Math.max(1, K - 1), 2); d.push(v); sum += v; }
  const times = [0]; for (let i = 0; i < K; i++) times.push(times[i] + d[i] * T / sum); times[K] = T; return times;
}
// ---------- wa1 tokens (pure; tested) ----------
export const TOKNAME = { respin: 'Spin Again', two: 'Pick Two', nudge: 'Nudge', lift: 'Lucky Lift' };
const defVal = (p) => +(p && (p.value != null ? p.value : p.pts != null ? p.pts : p.gain)) || 0;
const defText = (p) => '+' + defVal(p);
/** One outcome line for a used token ("Spin Again: kept +4%"): what the widget now says, whether or not it improved. txt(p) = the short result words, val(p) = its value. */
export function tokenLine(kind, before, q, txt = defText, val = defVal) {
  const nm = TOKNAME[kind] || 'Token', b = before || q, up = val(q) > val(b);
  if (kind === 'lift') return up ? nm + ': bonus, now ' + txt(q) : nm + ': no bonus, kept ' + txt(b);
  if (kind === 'nudge') return q.index !== b.index ? nm + ': moved to ' + txt(q) : nm + ': kept ' + txt(b);
  return up ? nm + ': new ' + txt(q) : nm + ': kept ' + txt(b);
}
/** The uses-left note under the token buttons: "Hype: 1 token use left this season. 1 token a match day." Read from the first option's left / match. '' when the list says nothing. */
export function tokenNote(list, name) {
  const t = list && list[0]; if (!t) return '';
  const a = t.left != null ? (name || 'This wheel') + ': ' + t.left + (t.left === 1 ? ' token use' : ' token uses') + ' left this season.' : '';
  const b = t.match ? '1 token a match day.' : '';
  return (a + (a && b ? ' ' : '') + b);
}
/** fixdial V4: the uses a token button can really give now = min(tokens held, season uses left, 1 when capped a match day). Pure. */
export function tokUsable(t) {
  let n = (t && t.count) | 0; if (t && t.left != null) n = Math.min(n, t.left | 0); if (t && t.match) n = Math.min(n, 1);
  return Math.max(0, n);
}
/** Aim Zone on the dial: is the needle at x inside a gold slice or within `reach` units of one? Pure. */
export function goldNearX(x, reach, cum, golds) {
  if (!(reach > 0)) return false;
  return golds.some((g) => x >= cum[g] - reach && x <= cum[g + 1] + reach);
}
const ZONE_COL = [255, 226, 110];
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return (s - 3) / Math.sqrt(0.5); };

// ---------- shared overlay shell (same conventions as wheel-view) ----------
export function mountShell(o, cfg) {
  const app = document.getElementById('app'), opener = document.activeElement;
  const ov = document.createElement('section');
  ov.className = 't2-ov wh-ov dr-ov ' + (cfg.cls || ''); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', o.title);
  ov.innerHTML = '<div class="t2-strip"><span>' + icoDeco('burst', 24) + ' ' + esc(o.title) + (o.sub ? ' <small>' + esc(o.sub) + '</small>' : '') + '</span>' +
    '<button type="button" class="c-icon-btn wh-x" aria-label="Close"><span class="c-ico c-ico--x"></span></button></div>' +
    '<div class="wh-card c-card">' + (o.cardHtml || '') + '</div>' + (o.legendHtml ? '<div class="dr-legend">' + o.legendHtml + '</div>' : '') +
    '<div class="wh-stage dr-stage">' + cfg.stageHtml + '</div>' +
    '<div class="wh-foot"><div class="wh-msg c-card" data-msg></div><div class="wh-res c-card c-card--inset" data-res hidden></div><div class="wh-tok" data-tok hidden></div>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block wh-go" data-go>' + esc(cfg.goLabel || 'SPIN') + '</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite" data-live></div>';
  document.body.appendChild(ov); if (app) app.inert = true;
  const $ = (q) => ov.querySelector(q), go = $('[data-go]'), msg = $('[data-msg]'), res = $('[data-res]'), live = $('[data-live]'), sh = { ov, $, go, msg, res, live, stage: $('.wh-stage'), busy: false, closed: false, onResize: null, dispose: [] };
  sh.setMsg = (t) => { msg.textContent = t; };
  sh.xLook = (off) => { const x = $('.wh-x'); if (!x) return; x.classList.toggle('is-wait', off); x.classList.toggle('is-disabled', off); if (off) { x.setAttribute('aria-disabled', 'true'); x.setAttribute('aria-label', 'Close (wait for it to stop)'); } else { x.removeAttribute('aria-disabled'); x.setAttribute('aria-label', 'Close'); } };
  sh.waitLook = (text, aria) => { go.textContent = text; go.setAttribute('aria-label', aria); go.setAttribute('aria-disabled', 'true'); go.classList.add('is-wait', 'is-disabled'); sh.xLook(true); };
  sh.goLook = (text, aria) => { go.textContent = text; go.setAttribute('aria-label', aria); go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); };
  sh.setBusy = (b) => { sh.busy = b; ov.classList.toggle('is-turning', b); if (!b) sh.xLook(false); };
  sh.showResult = (p, d) => {
    const sg = o.spokeGain ? Number(o.spokeGain()) || 0 : 0; sh.busy = false; ov.classList.remove('is-turning'); msg.hidden = true; res.hidden = false; ov.classList.toggle('is-jp', !!(p.jackpot || d.gold));
    res.innerHTML = (p.jackpot || d.gold ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' ' + esc(d.flash || 'Gold!') + '</span>' : '') +
      '<div class="wh-big">' + (d.chip ? '<span class="wh-chip">' + esc(d.chip) + '</span>' : '') + '<b>' + esc(d.big) + '</b></div>' + (d.lineHtml ? '<div class="wh-chg">' + d.lineHtml + '</div>' : d.line ? '<div class="wh-chg"><span>' + esc(d.line) + '</span></div>' : '') +
      (sg > 0 ? '<div class="wh-sp">' + spokeIcon(20) + '<b>+' + esc(sg) + ' Spokes</b></div>' : '');
    live.textContent = d.say || ''; // read once
    go.textContent = o.collectLabel || 'COLLECT'; go.classList.add('is-collect', 'c-btn--gold'); go.classList.remove('c-btn--primary'); sh.goLook(o.collectLabel || 'COLLECT', o.collectLabel || 'Collect'); sh.xLook(false); sh.state = 'result';
    sh.showTokens(sh.tokLine); sh.tokLine = ''; if (sh.onResize) sh.onResize(); go.focus(); // wa1: the foot is taller now (result, tokens, outcome line): size the widget to the room left so it is never clipped
  };
  // wa1 tokens (same pattern as wheel-view): buttons after the result; a used token replays a short spin on the widget (cfg.replay), then the result and the buttons are read again with one outcome line.
  const tokBox = $('[data-tok]'); sh.tokLine = '';
  sh.showTokens = (line) => {
    const list = (o.getTokens ? o.getTokens() : o.tokens) || [];
    tokBox.hidden = !list.length && !line; tokBox.innerHTML = ''; tokBox.classList.remove('is-busy');
    if (line) { const l = document.createElement('p'); l.className = 'wh-out'; l.setAttribute('data-out', ''); l.textContent = line; tokBox.appendChild(l); }
    list.forEach((t) => {
      const use = tokUsable(t), b = document.createElement('button'), n = use > 0 ? ' x' + use : ''; b.type = 'button'; b.className = 'c-btn wh-tk'; b.textContent = t.label + n; b.setAttribute('data-kind', t.kind); b.setAttribute('aria-label', t.label + (n ? ', ' + use + ' left' : '')); // fixdial V4: the count is what can really be used now (agrees with the note)
      b.addEventListener('click', () => {
        if (sh.state !== 'result' || sh.busy || !o.onToken) return; const before = o.getPending(); o.onToken(t.kind); const q = o.getPending(); if (!q) return;
        const ln = tokenLine(t.kind, before, q, o.tokText || defText, o.tokVal || defVal);
        sh.state = 'tok'; sh.setBusy(true); tokBox.classList.add('is-busy'); tokBox.querySelectorAll('button').forEach((x) => x.setAttribute('aria-disabled', 'true'));
        sh.waitLook(t.kind === 'lift' ? 'Lifting...' : t.kind === 'nudge' ? 'Stepping...' : 'Spinning again...', 'Please wait');
        const done = () => { if (sh.closed) return; sh.setBusy(false); sh.tokLine = ln; sh.showResult(q, o.describe(q)); live.textContent = ln + '. ' + live.textContent; const f = tokBox.querySelector('button') || go; f.focus(); };
        if (reducedNow() || !cfg.replay) done(); else cfg.replay(t.kind, before, q, done);
      });
      tokBox.appendChild(b);
    });
    const note = tokenNote(list, o.tokName); if (note) { const p = document.createElement('p'); p.className = 'wh-tknote'; p.textContent = note; tokBox.appendChild(p); }
  };
  /** Lucky Lift: a bonus pops over the widget (none with reduced motion). */
  sh.pop = (txt, host) => { const bn = document.createElement('span'); bn.className = 'wh-bonus'; bn.setAttribute('aria-hidden', 'true'); bn.textContent = txt; (host || sh.stage).appendChild(bn); setTimeout(() => bn.remove(), 900); };
  sh.close = (done) => {
    if (sh.closed) return; sh.closed = true; sh.dispose.forEach((f) => f()); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onRz);
    ov.remove(); releaseInert(app); if (opener && opener.isConnected && opener.focus) opener.focus();
    if (!done && sh.state === 'result' && o.onCollect) o.onCollect(); else if (!done && o.onClose) o.onClose(); // Escape / X at a result = Collect (the result is kept either way)
  };
  const onRz = () => { if (sh.onResize) sh.onResize(); };
  function onKey(e) {
    if (e.key === 'Escape' && !sh.busy) { e.preventDefault(); e.stopPropagation(); sh.close(); }
    else if (e.key === 'Tab') { const f = [...ov.querySelectorAll('button')].filter((b) => !b.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  $('.wh-x').addEventListener('click', () => { if (!sh.busy) sh.close(); });
  document.addEventListener('keydown', onKey, true); window.addEventListener('resize', onRz);
  return sh;
}

// ---------- the dial ----------
export function openDial(o) {
  const reveal = o.mode === 'reveal', kind = o.kind || 'lights', reduced = reducedNow(), S = 2;
  const sl = o.slices, N = sl.length, widths = sl.map((s) => s.w), L = widths.reduce((a, b) => a + b, 0), cum = cumOf(widths), U = Math.PI / L;
  const goldI = sl.reduce((b, s, i) => (s.gold && (b < 0 || widths[i] > widths[b]) ? i : b), -1) < 0 ? 0 : sl.reduce((b, s, i) => (s.gold && (b < 0 || widths[i] > widths[b]) ? i : b), -1), V = o.V || DR.V, Jw = o.J != null ? o.J : DR.JK * (widths[goldI] || 1), T = (o.plan && o.plan.total) || DR.REVEAL_T;
  const centreOf = (i) => (cum[i] + cum[i + 1]) / 2;
  const pal = palette(o.look), coin = reveal && kind === 'coin';
  const fillOf = (i) => (sl[i].gold ? pal.gold : [pal.wall, pal.g2, pal.stone, pal.b1][i % 4]);
  const fills = sl.map((_, i) => fillOf(i));
  const words = sl.map((s) => s.label + (s.sub ? ' ' + s.sub : '')).join(', ');
  const stageHtml = '<div class="dr-wrap" role="img" aria-label="' + (coin ? 'Coin: ' : 'Half dial of ' + N + ' slices: ') + esc(words) + '"><canvas class="dr-cv"></canvas>' + (coin || (reveal && kind === 'lights') ? '' : '<span class="dr-ptr" aria-hidden="true"></span>') + '</div>';
  const cfg = { cls: 'dr-dial dr-' + (reveal ? kind : 'aim'), stageHtml, goLabel: 'SPIN' }, sh = mountShell(o, cfg);
  const ZONE = !reduced && !reveal && +o.zone > 0 ? +o.zone : 0, CHIME = !reduced && !reveal && !!o.chime, golds = sl.map((s, i) => (s.gold ? i : -1)).filter((i) => i >= 0); // wa1 Control feel on the Hype dial: Aim Zone glow, Gold Chime flash
  const { ov, go, stage } = sh, wrap = ov.querySelector('.dr-wrap'), cv = ov.querySelector('.dr-cv'), ctx = cv.getContext('2d'), ptr = ov.querySelector('.dr-ptr');
  const labs = coin ? [] : sl.map((s, i) => { const e = document.createElement('span'); e.className = 'dr-lab' + (s.gold ? ' is-gold' : ''); e.setAttribute('aria-hidden', 'true'); e.innerHTML = s.gold && !reveal ? '<i class="dr-star"></i>' : '<b>' + esc(s.label) + '</b>' + (s.sub ? '<small>' + esc(s.sub) + '</small>' : ''); wrap.appendChild(e); return e; });
  let coinLab = null; if (coin) { coinLab = document.createElement('span'); coinLab.className = 'dr-coinlab'; coinLab.setAttribute('aria-hidden', 'true'); wrap.appendChild(coinLab); }
  let state = 'idle', needle = L / 2, lit = -1, size = 100, css = 200, hh = 60, raf = 0, clock = 0, lastF = 0, spinEv = 0, phi = 0, tapT = 0, stopInfo = null, adj = 0, prevIdx = sliceAtX(cum, L / 2), shown = 0, flip = 0, face = 0, sched = null, target = 0, revT0 = 0, base0 = null, skipped = false, tw = null, chimeT = -9;
  let layer = null, layerLit = '', lits = [], litGold = false; // fixdial V5: lits = extra lit slices (Pep double), litGold = draw the lit slices gold
  const isLit = (i) => i === lit || lits.includes(i), litKey = () => lit + '|' + lits.join(',') + '|' + litGold;
  const MSG_GO = 'Turning. Stop the needle on gold.' + (o.guide ? ' The tick shows where it will land.' : '') + ' Tap early and it goes further.'; // fixdial V3: the needle moves, the slices stay still

  function layout() {
    const w = stage.clientWidth - 16, h = stage.clientHeight - 36;
    css = Math.max(220, Math.min(w, coin ? h : 2 * h, 420)); size = Math.floor(css / S / 2) * 2; css = size * S; hh = coin ? size : size / 2 + 3;
    wrap.style.width = css + 'px'; wrap.style.height = hh * S + 'px'; cv.width = size; cv.height = hh; cv.style.width = css + 'px'; cv.style.height = hh * S + 'px'; layer = null; draw();
  }
  /** Static dial (slices, rim, hub): drawn once per lit change, the needle goes on top each frame. */
  function build() {
    const w = size, cx = w / 2, cy = coin ? 0 : w / 2, R = w / 2 - 1, im = ctx.createImageData(w, hh), d = im.data, dimR = lit >= 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = cy - (y + 0.5), r = Math.sqrt(dx * dx + dy * dy); let c = null;
      if (dy < 0) { if (dy > -3 && r <= R) c = pal.out; }
      else if (r <= R) {
        const ang = Math.atan2(dy, dx), u = (Math.PI - ang) / U, idx = sliceAtX(cum, Math.min(L - 1e-9, Math.max(0, u))), m = (u - cum[idx]) * U, wa = widths[idx] * U, bd = r * Math.sin(Math.min(m, wa - m, Math.PI / 2));
        if (r > R - 1.6) c = pal.out;
        else if (r > R - 6) c = r < R - 5.2 || bd < 1.3 ? pal.out : pal.rim;
        else if (r < R * 0.3) c = r > R * 0.3 - 1.4 ? pal.out : pal.rim;
        else if (bd < 0.9) c = pal.out;
        else {
          c = fills[idx]; if (((x + y) & 1) === 0 && r > R - 15 && r < R - 8) c = dim(c, 0.18);
          if (dimR) c = isLit(idx) ? (litGold ? (((x + y) & 1) === 0 && r > R - 15 && r < R - 8 ? dim(pal.gold, 0.12) : pal.gold) : lift(c, 0.45)) : dim(c, 0.35);
        }
      }
      if (c) { const p = (y * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255; }
    }
    layer = im; layerLit = litKey();
  }
  function line(x0, y0, x1, y1, col, th) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); ctx.fillStyle = 'rgb(' + col + ')'; for (let i = 0; i <= n; i++) { const t = i / n; ctx.fillRect(Math.round(x0 + (x1 - x0) * t - th / 2), Math.round(y0 + (y1 - y0) * t - th / 2), th, th); } }
  const diamond = (ax, ay, k, fill) => { for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) { const q = Math.abs(i) + Math.abs(j); if (q > k) continue; ctx.fillStyle = q >= k ? 'rgb(' + pal.out + ')' : q >= k - 1 ? '#fff' : 'rgb(' + fill + ')'; ctx.fillRect(ax + i, ay + j, 1, 1); } };
  /** fixdial V2: the Aim Guide landing mark, a dark-outlined wedge across the rim band (about 16 css px), readable on every slice colour. */
  const landMark = (x, R) => { const a = polar(x, R + 1), b = polar(x, R - 9); line(a[0], a[1], b[0], b[1], pal.out, 5); line(a[0], a[1], b[0], b[1], [255, 255, 255], 3); const c = polar(x, R - 9); diamond(Math.round(c[0]), Math.round(c[1]), 3, ZONE_COL); };
  const polar = (x, rr) => { const a = Math.PI - x * U; return [size / 2 + Math.cos(a) * rr, size / 2 - Math.sin(a) * rr]; };
  function drawCoin() {
    const w = size, cx = w / 2, cy = w / 2, R = w / 2 - 3, ph = flip % TAU, cs = Math.cos(ph), frontSide = cs >= 0, rx = Math.max(1.5, Math.abs(cs) * R);
    ctx.clearRect(0, 0, w, w); const col = frontSide ? pal.gold : lift(pal.gold, 0.35);
    for (let y = -R; y <= R; y++) { const k = Math.sqrt(R * R - y * y) * rx / R, x0 = Math.round(cx - k), x1 = Math.round(cx + k); ctx.fillStyle = 'rgb(' + pal.out + ')'; ctx.fillRect(x0 - 1, Math.round(cy + y), x1 - x0 + 2, 1); ctx.fillStyle = 'rgb(' + (Math.abs(y) > R - 3 || (((x0 + y) & 1) === 0 && Math.abs(y) > R - 6) ? dim(col, 0.2) : col) + ')'; ctx.fillRect(x0, Math.round(cy + y), x1 - x0, 1); }
    const sc = Math.abs(cs); coinLab.style.opacity = sc > 0.35 ? '1' : '0'; coinLab.style.transform = 'translate(-50%,-50%) scaleX(' + sc.toFixed(2) + ')'; coinLab.style.left = css / 2 + 'px'; coinLab.style.top = css / 2 + 'px'; coinLab.textContent = frontSide ? sl[target].label + (sl[target].sub ? ' ' + sl[target].sub : '') : sl[(target + 1) % N].label + (sl[(target + 1) % N].sub ? ' ' + sl[(target + 1) % N].sub : '');
  }
  function draw() {
    if (coin) { drawCoin(); return; }
    if (!layer || layerLit !== litKey()) build(); ctx.putImageData(layer, 0, 0);
    const R = size / 2 - 1, cx = size / 2, cy = size / 2;
    if (o.guide && reveal && !coin && state === 'play' && clock - revT0 >= T * 0.65) landMark(centreOf(target), R); // wa1 Aim Guide on a reveal: feel only, the tick shows the light it is slowing onto
    if (o.guide && !reveal && state === 'spin' && shown >= DR.STOP_FROM) landMark(reflect(phi + V * shown + V * DR.G / 3, L), R); // Aim Guide: where STOP would land now (no wobble)
    if (!reveal) {
      const tip = polar(needle, R - 7), ex = tip[0], ey = tip[1], zoneOn = state === 'spin' && goldNearX(needle, V * ZONE, cum, golds);
      line(cx, cy, ex, ey, pal.out, 4); line(cx, cy, ex, ey, zoneOn ? ZONE_COL : pal.needle, 2); // Aim Zone: the needle glows gold while gold is near
      if (CHIME && clock - chimeT < 0.32) diamond(Math.round(ex), Math.round(ey), 5, ZONE_COL); // Gold Chime: a gold flash at the needle tip as it enters gold
      for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { if (i * i + j * j > 22 || cy + j > cy + 2) continue; ctx.fillStyle = i * i + j * j > 14 ? 'rgb(' + pal.out + ')' : 'rgb(' + pal.hub + ')'; ctx.fillRect(Math.round(cx) + i, Math.round(cy) + j, 1, 1); }
    }
    labs.forEach((l, i) => {
      const rl = R * (widths[i] * 18 / L < 24 ? 0.7 : 0.66), p = polar(centreOf(i), rl);
      l.style.left = p[0] * S + 'px'; l.style.top = p[1] * S + 'px';
      if (reveal) { l.style.color = 'rgb(' + pal.cream + ')'; l.style.fontSize = '22px'; l.style.textShadow = '-2px 0 rgb(' + pal.out + '),2px 0 rgb(' + pal.out + '),0 -2px rgb(' + pal.out + '),0 2px rgb(' + pal.out + '),2px 2px rgb(' + pal.out + ')'; l.style.opacity = '1'; } // fixdial V5: cream numbers with a dark outline, >= 4.5:1 on any slice, lit or dim
      else { l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = lit >= 0 && !isLit(i) ? '.5' : '1'; }
      if (sl[i].gold && !reveal) l.style.width = '';
    });
    if (ptr) ptr.style.left = '50%';
  }
  const tick = (a, b, loud) => { if (a === b) return; const ch = CHIME && state === 'spin' && golds.includes(b) && !golds.includes(a); if (ch) chimeT = clock; if (o.onTick) o.onTick(ch ? { loud: true, rate: V, chime: true } : { loud: !!loud, rate: V }); if (ptr && !reduced) { ptr.style.transform = 'rotate(6deg)'; requestAnimationFrame(() => { ptr.style.transform = ''; }); } };

  // ----- aim -----
  function frame(t) {
    if (sh.closed) return; const dt = Math.min(0.05, (t - lastF) / 1000 || 0.016); lastF = t; clock += dt;
    if (state === 'spin') {
      const c = Math.min(clock - spinEv, DR.COAST); shown = c; const x = reflect(phi + V * c, L); needle = L / 2 + (x - L / 2) * smooth(c / 0.15);
      if (c >= DR.STOP_FROM && go.getAttribute('aria-disabled') === 'true') { sh.goLook('STOP', 'Stop the dial'); go.classList.remove('is-wait', 'is-disabled'); sh.setMsg(MSG_GO); }
      const ix = sliceAtX(cum, needle); tick(prevIdx, ix); prevIdx = ix;
      if (clock - spinEv >= DR.COAST) stopNow(DR.COAST);
    } else if (state === 'land') {
      const s = Math.min(DR.G, clock - tapT), q = dialGlideQ(stopInfo, s) + adj * smooth(s / DR.G); needle = reflect(q, L); const ix = sliceAtX(cum, needle); tick(prevIdx, ix, s >= DR.G); prevIdx = ix;
      if (s >= DR.G) { state = 'result'; draw(); showRes(); return; }
    } else if (state === 'play') { playFrame(); if (state !== 'play') return; }
    else if (state === 'tok') { tokFrame(); if (state !== 'tok') return; }
    draw(); raf = requestAnimationFrame(frame);
  }
  function stopNow(t) {
    const e = (Math.random() * 2 - 1) * Jw, Lq = dialLand(widths, { t, phi, e }, V);
    o.onSpin({ t: Lq.t, phi: Lq.phi, e: Lq.e }); const p = o.getPending(); if (!p) { sh.close(); return; }
    adj = 0; if (p.index !== Lq.index) { const x = centreOf(p.index), c1 = x, c2 = 2 * L - x; // the store drew another slice: steer the glide to it so the card never contradicts the dial
      const f = (c) => (((c - Lq.end) % (2 * L)) + 2 * L) % (2 * L); adj = Math.min(f(c1), f(c2)); }
    stopInfo = Lq; tapT = spinEv + Lq.t; state = 'land'; sh.waitLook('Slowing...', 'Slowing down. Please wait'); sh.setMsg('Slowing down...');
  }
  /** Reduced motion: an average careful player's tap (spec 03 line 8): the arrival of gold nearest 2.0 s plus gauss(0, 0.11), clamped. */
  function syntheticTap(ph) {
    let best = 2, bd = 9; for (let t = DR.STOP_FROM; t <= DR.COAST + 1e-9; t += 0.01) { if (dialLand(widths, { t, phi: ph, e: 0 }, V).index === goldI && Math.abs(t - 2) < bd) { bd = Math.abs(t - 2); best = t; } }
    return Math.min(DR.COAST, Math.max(DR.STOP_FROM, best + gauss() * 0.11));
  }
  // ----- reveal -----
  function startReveal() {
    o.onSpin({ reveal: true, t: 0, phi: 0, e: 0 }); const p = o.getPending(); if (!p) { sh.close(); return; }
    target = Math.max(0, Math.min(N - 1, p.index | 0)); revT0 = clock; skipped = false; state = 'play'; sh.setBusy(true); sh.waitLook('Tap to skip', 'Skip to the result'); go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); sh.setMsg(coin ? 'Flipping...' : 'The lights are chasing...');
    sched = kind === 'lights' ? pepSchedule(N, target, T) : null; lit = kind === 'lights' ? 0 : -1; lits = []; litGold = false; raf = requestAnimationFrame(frame);
  }
  function playFrame() {
    const t = clock - revT0;
    if (coin) { flip = TAU * 3 * revealFrac(Math.min(t, T), T); face = 0; }
    else { let k = 0; while (k + 1 < sched.length && sched[k + 1] <= t) k++; const nl = k % N; if (nl !== lit) { lit = nl; tick(-1, nl, k === sched.length - 1); } }
    if (t >= T + DR.HOLD) finishReveal();
  }
  function finishReveal() { lit = coin ? -1 : target; flip = TAU * 3; state = 'result'; draw(); showRes(); }
  function showRes() { const p = o.getPending(); if (!p) return; if (reveal && !coin) { lit = p.index; lits = (p.slots || []).map((x) => (x | 0) - 1).filter((i) => i >= 0 && i < N); litGold = lits.length > 1; } draw(); const d = o.describe(p); sh.showResult(p, d); }
  // ----- wa1 token replay: a short spin to the new result (respin / two), one step (nudge) or a bonus pop (lift); then the shell shows the result again -----
  function replay(k, before, q, done) {
    const to = Math.max(0, Math.min(N - 1, q.index | 0)), dur = k === 'two' ? 1.9 : k === 'nudge' ? 0.5 : k === 'lift' ? 0.8 : 1.3, x0 = needle, other = (to + Math.max(1, N >> 1)) % N;
    tw = { k, t0: clock, dur, done, to, x0, from: target, qm: 2 * L + centreOf(other), q1: (k === 'two' ? 4 * L : 2 * L) + centreOf(to) };
    if (k === 'lift') { const d = (o.tokVal ? o.tokVal(q) - o.tokVal(before || q) : 0); sh.pop(d > 0 ? '+' + Math.round(d * 10) / 10 : '+0', wrap); }
    if (reveal && kind === 'lights' && k !== 'lift' && k !== 'nudge') sched = pepSchedule(N, to, dur);
    target = to; state = 'tok'; if (k !== 'lift') { lits = []; litGold = false; } raf = requestAnimationFrame(frame);
  }
  function tokFrame() {
    const T2 = tw, t = clock - T2.t0, u = Math.min(1, t / T2.dur), h = 0.5;
    if (T2.k !== 'lift') {
      if (coin) { flip = TAU * (T2.k === 'nudge' ? 1 : 3) * revealFrac(Math.min(t, T2.dur), T2.dur); }
      else if (reveal) { if (T2.k === 'nudge') { if (u >= 0.5) lit = T2.to; } else { let k = 0; while (k + 1 < sched.length && sched[k + 1] <= t) k++; const nl = k % N; if (nl !== lit) { lit = nl; tick(-1, nl, false); } } }
      else {
        const q = T2.k === 'nudge' ? T2.x0 + (centreOf(T2.to) - T2.x0) * smooth(u) : T2.k === 'two' ? (u < h ? T2.x0 + (T2.qm - T2.x0) * easeOut3(u / h) : T2.qm + (T2.q1 - T2.qm) * easeOut3((u - h) / (1 - h))) : T2.x0 + (T2.q1 - T2.x0) * easeOut3(u);
        needle = reflect(q, L); const ix = sliceAtX(cum, needle); tick(prevIdx, ix, u >= 1); prevIdx = ix;
      }
    }
    if (u >= 1) { cancelAnimationFrame(raf); needle = reveal ? needle : centreOf(T2.to); lit = reveal && !coin ? T2.to : -1; flip = TAU * 3; state = 'result'; draw(); tw = null; T2.done(); }
  }
  cfg.replay = replay;
  function onGo(ev) {
    if (state === 'idle') {
      if (reveal) { if (reduced) { o.onSpin({ reveal: true, t: 0, phi: 0, e: 0 }); const p = o.getPending(); if (!p) return; target = p.index | 0; flip = TAU * 3; lit = coin ? -1 : target; state = 'result'; showRes(); } else startReveal(); }
      else if (reduced) {
        const ph = Math.random() * 2 * L, t = syntheticTap(ph), e = (Math.random() * 2 - 1) * Jw, Lq = dialLand(widths, { t, phi: ph, e }, V);
        o.onSpin({ t: Lq.t, phi: Lq.phi, e: Lq.e }); const p = o.getPending(); if (!p) return; needle = centreOf(p.index); state = 'result'; showRes();
      } else { state = 'spin'; phi = Math.random() * 2 * L; spinEv = clock; shown = 0; sh.setBusy(true); sh.setMsg('Get ready. STOP wakes up in a moment.'); sh.waitLook('Wait...', 'Wait. STOP wakes up in a moment'); raf = requestAnimationFrame(frame); }
    } else if (state === 'spin') {
      const sinceFrame = Math.max(0, Math.min(0.05, ((ev && ev.timeStamp > 0 ? ev.timeStamp : lastF) - lastF) / 1000)), t = clock - spinEv + sinceFrame;
      if (t < DR.STOP_FROM) return; stopNow(Math.min(t, DR.COAST)); // ignore early presses and a second press (state leaves 'spin' on the first)
    } else if (state === 'play') { skip(); }
    else if (state === 'result') { const f = o.onCollect; sh.close(true); if (f) f(); }
  }
  function skip() { if (state !== 'play' || skipped) return; skipped = true; cancelAnimationFrame(raf); finishReveal(); }
  go.addEventListener('click', onGo); stage.addEventListener('click', () => { if (state === 'play') skip(); });
  sh.dispose.push(() => cancelAnimationFrame(raf)); sh.onResize = layout;
  layout();
  const pend = o.pending || null;
  if (pend) { target = pend.index | 0; needle = centreOf(target); flip = TAU * 3; lit = reveal && !coin ? target : -1; state = 'result'; draw(); showRes(); }
  else {
    sh.setMsg(reduced ? 'Tap SPIN. The result shows at once.' : reveal ? 'One tap. Tap again to skip.' : 'Tap SPIN, then stop the needle on gold.' + (o.guide ? ' The tick shows where it will land.' : '')); if (coin) { target = 0; draw(); } go.focus();
  }
  return () => sh.close();
}
