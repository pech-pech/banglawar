/* wheel-view: the Spotlight wheel and the Course wheel, layout A (big centre wheel under the card, result box + COLLECT below).
   openWheel(o) -> close()
   o = { title, sub?, cardHtml,                 card under the strip (trusted markup)
         slices:number[10], jackpotIndex, widths?:number[10],   from core wheelSlices / courseWheel (widths: units; missing = looked up from the jackpot gain)
         plus:'+'  (slice label prefix),
         pending: {index,gain,jackpot}|null,    already spun (reload / reopen): opens on the result
         onSpin(stop),                          stop = {t, phi, e}: the STOP time (wheel seconds), start offset and wobble. Dispatch it as the Spin payload's `careful` value; core spinResult(rng, wheel, stop) derives the slice from it. The result must then be readable from getPending()
         onTick?({loud, rate}),                 optional: one call per slice boundary under the pointer (sound hook; the project has no audio yet)
         getPending() -> {index,gain,jackpot}|null,
         describe(p) -> { big:'+2 Power', from:'C', to:'C+', barHtml?, breakthrough:bool, say:'one line for the live region' },
         onCollect(), collectLabel?:'COLLECT', onClose?(),
         Wheel meta (all optional; absent = the wheel looks and behaves exactly as before):
         phys?:{W0,J,SD}        physics from the wheel (Slow / Steady / Guide); passed to wheelSpeed, wheelArc, stopDist, stopExtra, stopLanding, carefulTapTime and used for the wobble and the spin start speed
         zone?:number           Aim Zone (seconds, e.g. 0.2): the dashed pointer-lane marks glow gold while a gold slice is within that many seconds of the pointer (a timing cue; no odds change). None with reduced motion
         chime?:boolean         Gold Chime: the pointer flashes gold, and onTick gets {chime:true}, each time a gold slice passes under it. None with reduced motion
         guide?:boolean         Aim Guide: a landing tick on the rim while the wheel turns (where the slice under the pointer ends up if STOP is tapped now)
         tokens?:[{kind,label,count?,left?}], getTokens?()=>[...] (the fresh list; read after every result)   token buttons after the result (count = shown as "x2"; left = Spotlight uses left this season); onToken(kind) uses one, then getPending() is read again; the wheel visibly acts (short re-spin / slice step / second pointer flash / bonus pop; none with reduced motion) and one outcome line is shown ("Spin Again: kept +3")
         spokeGain?()=>number   Spokes this spin drops (a small chip on the result card; absent or 0 = no chip)
         look?:{rim,hub,ptr,trail,pal,spoke,burst,stand,name,crystal,material}   craft look (cosmetic only; the tier-7 Crystal look wins over Rim Paint / Hub Cap) }
   SPIN then STOP (two taps, no auto-start). WHEEL-STOP-V2: the wheel slows by itself (w = W0*exp(-t/TAU)); STOP (live from 1 s) eases it out over 1 s
   from the current speed with a small wobble; the slice under the pointer wins (no snap, no hidden aim, no preview). No STOP by 6 s = the game taps at 6 s.
   Reduced motion: no spin; one tap shows the result at once, from an average careful player's synthetic tap. Result is read once (live region).
   Canvas drawn in code, pixel style, palette read from the page's CSS variables (Green and chalk and Scorebook both work). */
import { esc, icoDeco } from './dom.js';
import { releaseInert } from './inert.js';
import { wheelWidths, wheelSpeed, wheelArc, stopDist, stopExtra, stopLanding, carefulTapTime } from '../core/training.js';
import { matOf, colourOf, normLook, PALETTES, spokeIcon } from './wheel-look.js';
import { TRAIN2 } from '../data/training.js';

const TAU = Math.PI * 2;
const reducedNow = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolve a CSS variable to [r,g,b] (works through var() chains and both skins). */
function tok(name, fb) {
  const p = document.createElement('i'); p.style.cssText = 'position:absolute;visibility:hidden;color:var(' + name + ',' + fb + ')'; document.body.appendChild(p);
  const m = getComputedStyle(p).color.match(/\d+(\.\d+)?/g) || [0, 0, 0]; p.remove(); return [+m[0], +m[1], +m[2]];
}
/** QA3 m5: "Breakthrough!" is kept for a whole-letter change (E+ to D-), not every step (E to E+). */
export const wholeLetter = (a, b) => String(a || '').charAt(0) !== String(b || '').charAt(0);
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const dim = (c, k) => c.map((v) => Math.round(v * (1 - k)));

/** Aim Zone: is a gold slice under the pointer, or due under it (or just past it) within `zone` seconds at the wheel's speed (units/second)? cum = slice edges in wheel units (cum[i]..cum[i+1] is slice i), C = the wheel's total width, golds = gold slice indices. Pure. */
export function goldNearPointer(pos, speed, zone, cum, C, golds) {
  if (!(zone > 0)) return false;
  const reach = Math.max(0, speed) * zone;
  for (const g of golds) { const a = cum[g], b = cum[g + 1], inside = (((pos - a) % C) + C) % C < b - a, ahead = (((a - pos) % C) + C) % C, behind = (((pos - b) % C) + C) % C; if (inside || ahead <= reach || behind <= reach) return true; }
  return false;
}
/** Gold Chime: does the pointer moving from slice a to slice b just enter a gold slice? Pure. */
export const chimeEnters = (a, b, golds) => a !== b && golds.includes(b) && !golds.includes(a);

export function openWheel(o) {
  const N = o.slices.length, JP = o.jackpotIndex || 0, reduced = reducedNow();
  const ZONE = !reduced && +o.zone > 0 ? +o.zone : 0, CHIME = !reduced && !!o.chime, PH = o.phys || null, WS = PH ? { ...TRAIN2.wheelStop, ...PH } : TRAIN2.wheelStop, LK = normLook(o.look), GD = o.golds && o.golds.length ? o.golds : [o.jackpotIndex || 0], PX = PH ? [PH] : []; // PX: the optional trailing phys argument for the core helpers
  const widths = wheelWidths({ slices: o.slices, jackpotIndex: JP, widths: o.widths }), C = widths.reduce((a, b) => a + b, 0), U = TAU / C; // units -> radians
  const WO = { slices: o.slices, jackpotIndex: JP, widths, ...(PH ? { phys: PH } : {}), ...(o.golds ? { golds: o.golds } : {}) }; // the wheel the core helpers see
  const cum = [0]; widths.forEach((w, i) => cum.push(cum[i] + w));
  const sliceOf = (pos) => { let u = pos % C; if (u < 0) u += C; for (let i = 0; i < N; i++) if (u < cum[i + 1]) return i; return N - 1; };
  const app = document.getElementById('app'), opener = document.activeElement;
  const pal = { cream: tok('--cream', '#F3EBD3'), out: tok('--outline', '#2A2238'), gold: tok('--gold', '#D2B357'), wall: tok('--wall1', '#E3D8B9'), g2: tok('--grass2', '#7EB261'), acc: tok('--accent', '#22625D'), b1: tok('--kitA1', '#3b5ba5') };
  const LP = LK && PALETTES[LK.pal] || null, mat = LK && LK.material ? matOf(LK.material) : null; // craft look: colour-blind safe slice palette, tier material on the rim
  const crys = !!(LK && LK.crystal), cmat = matOf('crystal'), ringCol = crys ? cmat.rim : (LK && colourOf(LK.rim)) || (mat && mat.rim) || pal.cream, trailCol = (LK && colourOf(LK.trail)) || pal.cream, hubCol = crys ? cmat.rim : (LK && colourOf(LK.hub)) || pal.acc, ptrCol = LK && colourOf(LK.ptr);
  const shape = LK && LK.spoke ? String(LK.spoke) : '';
  const fillOf = (i) => (GD.includes(i) ? pal.gold : LP ? (o.slices[i] <= 1 ? LP.low : o.slices[i] === 2 ? LP[2] : o.slices[i] === 3 ? LP[3] : LP[4]) : o.slices[i] <= 1 ? pal.wall : o.slices[i] === 2 ? pal.g2 : o.slices[i] === 3 ? pal.acc : pal.b1);
  const fills = o.slices.map((_, i) => fillOf(i));
  const ov = document.createElement('section');
  ov.className = 't2-ov wh-ov' + (crys ? ' is-crystal' : ''); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', o.title);
  const sliceWords = o.slices.map((v, i) => '+' + v + (GD.includes(i) ? ' jackpot' : '')).join(', ');
  ov.innerHTML = '<div class="t2-strip"><span>' + icoDeco('burst', 24) + ' ' + esc(o.title) + (o.sub ? ' <small>' + esc(o.sub) + '</small>' : '') + '</span>' +
    '<button type="button" class="c-icon-btn wh-x" aria-label="Close"><span class="c-ico c-ico--x"></span></button></div>' +
    '<div class="wh-card c-card">' + (o.cardHtml || '') + '</div>' +
    '<div class="wh-stage"><div class="wh-wrap" role="img" aria-label="Wheel of ' + N + ' slices: ' + esc(sliceWords) + '"><canvas class="wh-cv"></canvas><span class="wh-ptr" aria-hidden="true"></span><span class="wh-hub" aria-hidden="true"></span>' + (LK && LK.crystal ? '<span class="wh-crystal" aria-hidden="true"></span>' : '') + (LK && LK.stand ? '<span class="wh-stand wh-stand--' + esc(String(LK.stand).replace(/[^a-z]/gi, '')) + '" aria-hidden="true"></span>' : '') + (LK && LK.name ? '<span class="wh-plate" aria-hidden="true" hidden></span>' : '') + '</div></div>' +
    '<div class="wh-foot"><div class="wh-msg c-card" data-msg></div><div class="wh-res c-card c-card--inset" data-res hidden></div><div class="wh-tok" data-tok hidden></div>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block wh-go" data-go>SPIN</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite" data-live></div>';
  document.body.appendChild(ov); if (app) app.inert = true;
  const $ = (q) => ov.querySelector(q), wrap = $('.wh-wrap'), cv = $('.wh-cv'), ctx = cv.getContext('2d'), go = $('[data-go]'), msg = $('[data-msg]'), res = $('[data-res]'), live = $('[data-live]'), ptr = $('.wh-ptr'), tokBox = $('[data-tok]');
  if (LK) { if (ptrCol) ov.style.setProperty('--wh-ptr', 'rgb(' + ptrCol + ')'); if (LK.hub && colourOf(LK.hub)) ov.style.setProperty('--wh-hub', 'rgb(' + hubCol + ')'); const pl = $('.wh-plate'); if (LK.name && pl) { pl.textContent = String(LK.name).slice(0, 24); pl.hidden = false; pl.setAttribute('aria-hidden', 'true'); } }
  const labels = o.slices.map((v, i) => { const s = document.createElement('span'); s.className = 'wh-lab' + (GD.includes(i) ? ' is-jp' : ''); s.textContent = (o.plus || '+') + v; s.setAttribute('aria-hidden', 'true'); wrap.appendChild(s); return s; });
  // wheel state: pos = the wheel coordinate (units) under the pointer; the wheel's turn is rot = pos * U.
  let state = 'idle', pos = Math.random() * C, phi = pos, speed = 0, clock = 0, lastF = 0, tapT = 0, stopInfo = null, adj = 0, raf = 0, closed = false, S = 2, size = 100, css = 200, spinEv = 0, prevIdx = sliceOf(pos);
  const centreOf = (i) => (cum[i] + cum[i + 1]) / 2;

  function layout() { // wheel sized from the free height (stage), never wider than the screen
    const st = $(".wh-stage"), RES = LK && LK.name ? 34 : LK && LK.stand ? 14 : 0, h = st.clientHeight - 24 - 22 - RES, w = st.clientWidth - 24; // RES: room under the rim for the stand / name plate (they hang from the wheel box)
    css = Math.max(160, Math.min(w, h, 340)); size = Math.floor(css / S / 2) * 2; css = size * S; wrap.style.marginBottom = RES ? RES + 'px' : '';
    wrap.style.width = wrap.style.height = css + 'px'; cv.width = cv.height = size; cv.style.width = cv.style.height = css + 'px'; draw();
  }
  function hubSpoke(th, r, rot) { // the hub's spokes as pixels: shape plain (none) / round (dots) / blade (thin) / diamond
    if (shape === 'plain') return false;
    const k = 8, a = (((th - rot * 0.15) % TAU) + TAU) % TAU, f = (a / TAU * k) % 1, d = Math.abs(f - 0.5) * 2; // 0 on a spoke, 1 between
    if (shape === 'round') return d < 0.5 && Math.abs(r - 8) < 1.6;
    if (shape === 'diamond') return d < (1 - Math.abs(r - 8) / 4) * 0.7 && Math.abs(r - 8) < 4;
    return d < 0.22 && r > 4;
  }
  const ZONE_COL = [255, 226, 110];
  /** Aim Zone: is a gold slice under the pointer, or due under it (or just past it) within ZONE seconds at the current speed? Spin state only. */
  const goldNear = () => state === 'spin' && goldNearPointer(pos, speed, ZONE, cum, C, GD);
  function draw() {
    const w = size, cx = w / 2, cy = w / 2, R = w / 2 - 1, im = ctx.createImageData(w, w), d = im.data, moving = state === 'spin' || state === 'land' || state === 'tok', rot = pos * U, zoneOn = ZONE > 0 && goldNear();
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy); if (r > R) continue;
      const th = Math.atan2(dy, dx); let q = (rot - (th + Math.PI / 2)) % TAU; if (q < 0) q += TAU; // wheel angle under this pixel; slices pass the pointer in list order
      const u = q / U; let idx = 0; while (idx < N - 1 && u >= cum[idx + 1]) idx++;
      const m = (u - cum[idx]) * U, wa = widths[idx] * U, bd = r * Math.sin(Math.min(m, wa - m, Math.PI / 2));
      const sa = ((th + Math.PI / 2 + Math.PI * 3) % TAU) - Math.PI; let c;
      if (r > R - 1.6) c = pal.out;
      else if (r > R - 6) { c = r < R - 5.2 || bd < 1.3 ? pal.out : ringCol; if (crys && r > R - 4.8 && r < R - 2.2 && Math.abs(((q / TAU * 16) % 1) - 0.5) * TAU / 16 * r < 1.1) c = cmat.stud; } // Crystal: white pixel studs on the cyan rim
      else if (crys && r < 12) { const a = (((th - rot * 0.15) % TAU) + TAU) % TAU, f = (a / TAU * 12) % 1, dm = Math.abs(dx) + Math.abs(dy); c = dm < 3.2 ? (dm < 1.6 ? [255, 255, 255] : cmat.rim) : r > 4 && Math.abs(f - 0.5) * 2 < 0.2 ? cmat.rim : pal.out; } // Crystal gem cap: dark hub, light spokes, a gem diamond
      else if (LK && shape && r < 12) c = r < 4 ? [255, 255, 255] : hubSpoke(th, r, rot) ? pal.cream : hubCol;
      else if (r < 4) c = [255, 255, 255]; else if (r < 10) c = pal.acc; else if (r < 12) c = pal.cream;
      else if (bd < 0.9) c = pal.out;
      else {
        c = fills[idx]; if (((x + y) & 1) === 0 && r > R - 15 && r < R - 8) c = dim(c, 0.18);
        if (moving && ((r > R * 0.36 && r < R * 0.4) || (r > R * 0.66 && r < R * 0.69)) && Math.floor(q * 27 / TAU) % 3 !== 0) c = trailCol;
        if (r > R - 9.6 && r < R - 7.4 && Math.abs(sa) < 0.62 && Math.floor((sa + 0.62) / 0.095) % 2 === 0) c = zoneOn ? ZONE_COL : dim(pal.gold, 0.25); // dashes mark the pointer lane (no aim help); Aim Zone: they glow gold when gold is near
        if (r > R - 10.4 && r <= R - 9.6 && Math.abs(sa) < 0.62) c = zoneOn ? ZONE_COL : pal.out;
        if (zoneOn && r > R - 11.4 && r <= R - 10.4 && Math.abs(sa) < 0.62) c = pal.out; // Aim Zone: the glow sits in an outlined lane
      }
      const p = (y * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    if (o.guide && state === 'spin') { // Aim Guide: where the slice under the pointer ends up if STOP is tapped now (pointer + ease-out distance), as a radial tick on the rim
      const ga = -Math.PI / 2 - stopDist(Math.min(clock - spinEv, WS.COAST), ...PX) * U, gx = Math.cos(ga), gy = Math.sin(ga), r0 = R - 15, plot = (rr, o, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(cx + gx * rr - gy * o), Math.round(cy + gy * rr + gx * o), 1, 1); };
      for (const [grow, col] of [[1.6, 'rgb(' + pal.out + ')'], [0, 'rgb(' + pal.gold + ')']]) for (let rr = r0 - grow; rr <= R - 0.5; rr += 0.5) { const t = Math.max(0, (rr - r0) / (R - r0)), hw = 0.6 + t * 3.4 + grow; for (let o = -hw; o <= hw; o += 0.5) plot(rr, o, col); } // Aim Guide: an outlined gold wedge on the rim, wide end at the rim
      for (let rr = r0 + 2; rr <= R - 2; rr += 0.5) plot(rr, 0, '#fff');
    }
    const a = rot - centreOf(JP) * U - Math.PI / 2, ax = Math.round(cx + Math.cos(a) * (R - 3.6)), ay = Math.round(cy + Math.sin(a) * (R - 3.6));
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const q = Math.abs(i) + Math.abs(j); if (q > 5) continue; ctx.fillStyle = q >= 5 ? 'rgb(' + pal.out + ')' : q >= 4 ? '#fff' : 'rgb(' + pal.gold + ')'; ctx.fillRect(ax + i, ay + j, 1, 1); } // diamond on the jackpot slice
    labels.forEach((l, i) => {
      const b = rot - centreOf(i) * U - Math.PI / 2, thin = widths[i] * U < 0.2, rl = R * (GD.includes(i) ? 0.8 : 0.62); l.style.fontSize = thin ? '14px' : ''; // a thin slice (the extra gold): a smaller label so it stays inside the slice edges
      l.style.left = (cx + Math.cos(b) * rl) * S + 'px'; l.style.top = (cy + Math.sin(b) * rl) * S + 'px';
      l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = moving && speed > 8 ? '.55' : '1';
    });
  }
  const setMsg = (t) => { msg.textContent = t; };
  function tick(from, to, loud) { // one call per slice boundary crossed; the pointer flexes a little (cosmetic, never moves the wheel)
    const a = sliceOf(from), b = sliceOf(to); if (a === b) return;
    const chime = CHIME && chimeEnters(a, b, GD); // Gold Chime: a gold slice has just come under the pointer
    if (o.onTick) o.onTick(chime ? { loud: true, rate: speed, chime: true } : { loud: !!loud, rate: speed });
    if (chime) { ptr.classList.add('is-chime'); setTimeout(() => ptr.classList.remove('is-chime'), 320); }
    if (!reduced) { ptr.style.transform = 'rotate(' + Math.min(10, speed * 0.5) + 'deg)'; requestAnimationFrame(() => { ptr.style.transform = ''; }); }
  }
  function frame(t) {
    if (closed) return; const dt = Math.min(0.05, (t - lastF) / 1000 || 0.016); lastF = t; clock += dt; const was = pos;
    if (state === 'spin') {
      const c = Math.min(clock - spinEv, WS.COAST); speed = wheelSpeed(c, ...PX); pos = phi + wheelArc(c, ...PX);
      if (c >= WS.STOP_FROM && go.getAttribute('aria-disabled') === 'true') { go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); go.textContent = 'STOP'; go.setAttribute('aria-label', 'Stop the wheel'); setMsg(MSG_GO); }
      if (clock - spinEv >= WS.COAST) { stop(WS.COAST); } else tick(was, pos);
    } else if (state === 'land') {
      const s = clock - tapT, L = stopInfo, u = Math.min(1, s / WS.D);
      pos = L.base + stopExtra(L.dist, L.e, s, ...PX) + adj * (3 * u * u - 2 * u * u * u);
      speed = Math.max(0, (L.dist * 3 * (1 - u) * (1 - u) + L.e * 6 * u * (1 - u) + adj * 6 * u * (1 - u)) / WS.D); tick(was, pos, u >= 1);
      if (s >= WS.D) { state = 'result'; draw(); showResult(); return; }
    }
    else if (state === 'tok') {
      const T = tw, u = Math.min(1, Math.max(0, (clock - T.t0) / T.dur)), e = (v) => 1 - Math.pow(1 - v, 3);
      if (T.kind === 'two') { const h = 0.5; pos = u < h ? T.from + (T.mid - T.from) * e(u / h) : T.mid + (T.to - T.mid) * e((u - h) / (1 - h)); if (!T.flashed && u >= h) { T.flashed = true; flash2(); } speed = 10 * (1 - (u < h ? u / h : (u - h) / (1 - h))); }
      else if (T.kind === 'nudge') { pos = T.from + (T.to - T.from) * (u * u * (3 - 2 * u)); speed = 2; }
      else if (T.kind === 'lift') { speed = 0; }
      else { pos = T.from + (T.to - T.from) * e(u); speed = 14 * (1 - u); }
      tick(was, pos);
      if (u >= 1) { pos = T.dest; state = 'result'; draw(); finishToken(); return; }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  const MSG_GO = 'Turning. Tap STOP when you want it to slow down. Tap early and it goes further.';
  const TOKNAME = { respin: 'Spin Again', two: 'Pick Two', nudge: 'Nudge', lift: 'Lucky Lift' }, PL = () => o.plus || '+';
  /** One outcome line for a used token: what the wheel now says, whether or not it improved. */
  function outcomeLine(kind, b, q) {
    const nm = TOKNAME[kind] || 'Token', g0 = b ? b.gain : q.gain;
    if (kind === 'lift') return q.gain > g0 ? nm + ': +' + (q.gain - g0) + ' bonus, now ' + PL() + q.gain : nm + ': no bonus, kept ' + PL() + g0;
    if (kind === 'nudge') return q.index !== (b && b.index) ? nm + ': moved to ' + PL() + q.gain : nm + ': kept ' + PL() + g0;
    return q.gain > g0 ? nm + ': new ' + PL() + q.gain : nm + ': kept ' + PL() + g0;
  }
  function showTokens(p, line) { // token buttons after the result (only when the store offers some); a used token plays a short action on the wheel, then the result and the buttons are read again
    const list = (o.getTokens ? o.getTokens() : typeof o.tokens === 'function' ? o.tokens(p) : o.tokens) || [];
    tokBox.hidden = !list.length && !line; tokBox.innerHTML = ''; tokBox.classList.remove('is-busy');
    if (line) { const l = document.createElement('p'); l.className = 'wh-out'; l.setAttribute('data-out', ''); l.textContent = line; tokBox.appendChild(l); }
    list.forEach((t) => { const b = document.createElement('button'), n = t.count > 0 ? ' x' + t.count : ''; b.type = 'button'; b.className = 'c-btn wh-tk'; b.textContent = t.label + n; b.setAttribute('data-kind', t.kind); b.setAttribute('aria-label', t.label + (n ? ', ' + t.count + ' left' : ''));
      b.addEventListener('click', () => { if (state !== 'result' || !o.onToken) return; const before = o.getPending(); o.onToken(t.kind); const q = o.getPending(); if (!q) return; useVisible(t.kind, before, q); }); tokBox.appendChild(b); });
    const left = list.length && list[0].left !== undefined ? list[0].left : null;
    if (left !== null) { const n = document.createElement('p'); n.className = 'wh-tknote'; n.textContent = 'Spotlight: ' + left + (left === 1 ? ' token use' : ' token uses') + ' left this season'; tokBox.appendChild(n); }
  }
  let tw = null;
  function flash2() { // Pick Two: the second pointer flashes
    ptr.classList.add('is-flash'); const g = document.createElement('span'); g.className = 'wh-ptr wh-ptr2'; g.setAttribute('aria-hidden', 'true'); wrap.appendChild(g); setTimeout(() => { g.remove(); ptr.classList.remove('is-flash'); }, 520);
  }
  function useVisible(kind, before, q) { // the wheel visibly acts, then the outcome line. Reduced motion: no motion, just the line.
    const line = outcomeLine(kind, before, q), dest = centreOf(q.index);
    if (reduced) { pos = dest; draw(); showResult(true, line); const f = tokBox.querySelector('button') || go; f.focus(); return; }
    const from = pos, fwd = (((dest - from) % C) + C) % C, half = (((dest - from + C / 2) % C) + C) % C - C / 2;
    tw = { kind, t0: clock, from, dest, line, dur: kind === 'two' ? 1.9 : kind === 'nudge' ? 0.5 : kind === 'lift' ? 0.8 : 1.3, to: kind === 'nudge' ? from + half : from + 2 * C + fwd };
    if (kind === 'two') { tw.mid = from + C + ((((centreOf((q.index + 3) % N) - from) % C) + C) % C); tw.to = tw.mid + C + ((((dest - tw.mid) % C) + C) % C); } // first stop on another slice (the pointer flashes), then the final one
    state = 'tok'; tokBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-disabled', 'true')); tokBox.classList.add('is-busy');
    waitLook(kind === 'lift' ? 'Lifting...' : kind === 'nudge' ? 'Stepping...' : 'Spinning again...', 'Please wait'); ov.classList.add('is-turning');
    if (kind === 'lift') { const bn = document.createElement('span'), d = q.gain - (before ? before.gain : q.gain); bn.className = 'wh-bonus'; bn.setAttribute('aria-hidden', 'true'); bn.textContent = d > 0 ? '+' + d : '+0'; wrap.appendChild(bn); setTimeout(() => bn.remove(), 900); }
    raf = requestAnimationFrame(frame);
  }
  function finishToken() { ov.classList.remove('is-turning'); showResult(true, tw && tw.line); const f = tokBox.querySelector('button') || go; f.focus(); tw = null; }
  function burst() { // landing burst (craft look): a few pixel bits fly out once; none with reduced motion
    if (!LK || !LK.burst || reduced) return; const b = document.createElement('span'); b.className = 'wh-burst wh-burst--' + String(LK.burst).replace(/[^a-z]/gi, ''); b.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = css * 0.46, e = document.createElement('i'); e.style.setProperty('--bx', Math.round(Math.cos(a) * r) + 'px'); e.style.setProperty('--by', Math.round(Math.sin(a) * r) + 'px'); b.appendChild(e); }
    wrap.appendChild(b); setTimeout(() => b.remove(), 1000);
  }
  function showResult(again, line) {
    const p = o.getPending(); if (!p) return; const d = o.describe(p), sg = o.spokeGain ? Number(o.spokeGain()) || 0 : 0;
    state = 'result'; ov.classList.remove('is-turning'); msg.hidden = true; res.hidden = false; ov.classList.toggle('is-jp', !!p.jackpot);
    res.innerHTML = (p.jackpot ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' JACKPOT! Breakthrough!</span>' : d.breakthrough && wholeLetter(d.from, d.to) ? '<span class="wh-bt">Breakthrough!</span>' : '') +
      '<div class="wh-big"><span class="wh-chip' + (p.boosted || p.hot ? ' is-boost' : '') + '">' + esc(o.plus || '+') + esc(p.gain) + '</span><b>' + esc(d.big) + '</b></div>' +
      (p.boosted || p.hot ? '<div class="wh-bst">' + (p.boosted ? '<span class="wh-bst1">Booster ' + esc(o.plus || '+') + esc(p.boostBy || 1) + '</span>' : '') + (p.hot ? '<span class="wh-bst1">Hot Streak ' + esc(o.plus || '+') + esc(p.hotBy || 1) + '</span>' : '') + '</div>' : '') +
      '<div class="wh-chg">' + (d.from !== d.to ? '<span>' + esc(d.from) + '</span><span class="t2-arr" aria-hidden="true"></span><b class="t2-new">' + esc(d.to) + '</b>' : d.barHtml ? d.barHtml + '<small>(bar fills)</small>' : '<span>' + esc(d.from) + '</span><small>(same letter)</small>') + '</div>' +
      (sg > 0 ? '<div class="wh-sp">' + spokeIcon(20) + '<b>+' + esc(sg) + ' Spokes</b></div>' : '');
    live.textContent = (line ? line + '. ' : '') + (d.say || '') + (p.boosted ? ' Booster plus ' + (p.boostBy || 1) + '.' : '') + (p.hot ? ' Hot Streak plus ' + (p.hotBy || 1) + '.' : ''); // read once
    showTokens(p, line); if (!again && !o.pending) burst();
    go.textContent = o.collectLabel || 'COLLECT'; go.classList.add('is-collect', 'c-btn--gold'); go.classList.remove('c-btn--primary'); go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); go.setAttribute('aria-label', o.collectLabel || 'Collect'); xLook(false); go.focus();
    if (LK) layout(); // wheel meta only (flag off: unchanged). The foot is taller now (result, tokens, outcome line): size the wheel to the room left so the stand and plate under it are never covered or clipped
    if (!reduced) draw();
  }
  /** m5: the button shows it is waiting: words, dimmed look (css .wh-go.is-wait), aria-disabled. Static: nothing flashes. */
  function waitLook(text, aria) { go.textContent = text; go.setAttribute('aria-label', aria); go.setAttribute('aria-disabled', 'true'); go.classList.add('is-wait', 'is-disabled'); xLook(true); }
  /** QA3 m11: the X cannot close while the wheel turns or slows, so it looks off (dashed, dimmed, aria-disabled) and says why. Static. */
  function xLook(off) { const x = $('.wh-x'); if (!x) return; x.classList.toggle('is-wait', off); x.classList.toggle('is-disabled', off); if (off) { x.setAttribute('aria-disabled', 'true'); x.setAttribute('aria-label', 'Close (wait for the wheel to stop)'); } else { x.removeAttribute('aria-disabled'); x.setAttribute('aria-label', 'Close'); } }
  function spin() { state = 'spin'; phi = pos; spinEv = clock; speed = WS.W0; setMsg('Get ready. STOP wakes up in a moment.'); waitLook('Wait...', 'Wait. STOP wakes up in a moment'); ov.classList.add('is-turning'); raf = requestAnimationFrame(frame); }
  /** STOP at wheel time t (seconds after SPIN, from the tap's own timestamp). The wobble is drawn now; the result comes from the landing position. */
  function stop(t) {
    const e = (Math.random() * 2 - 1) * WS.J, L = stopLanding(WO, { t, phi, e }, ...PX);
    o.onSpin({ t: L.t, phi: L.phi, e: L.e }); const p = o.getPending(); if (!p) { close(); return; }
    // the store agrees with the landing: the wheel just eases out. If an older store answered with its own slice, steer the ease to that slice so the card never contradicts the wheel.
    adj = 0; if (p.index !== L.index) { const end = L.base + L.dist + L.e, mid = centreOf(p.index); adj = (((mid - end) % C) + C) % C; }
    stopInfo = { base: L.base, dist: L.dist, e: L.e }; tapT = spinEv + L.t; state = 'land'; speed = wheelSpeed(L.t, ...PX); ov.classList.remove('is-turning'); waitLook('Slowing...', 'Slowing down. Please wait'); setMsg('Slowing down...');
  }
  function onGo(ev) {
    if (state === 'idle') {
      if (reduced) { // no spin: an average careful player's tap, same pipeline
        const ph = Math.random() * C, e = (Math.random() * 2 - 1) * WS.J, t = carefulTapTime(WO, ph, 1 - Math.random(), Math.random(), ...PX);
        const L = stopLanding(WO, { t, phi: ph, e }, ...PX); o.onSpin({ t: L.t, phi: L.phi, e: L.e }); const p = o.getPending(); if (!p) return;
        pos = centreOf(p.index) ; draw(); showResult();
      } else spin();
    } else if (state === 'spin') {
      const sinceFrame = Math.max(0, Math.min(0.05, ((ev && ev.timeStamp > 0 ? ev.timeStamp : lastF) - lastF) / 1000)), t = clock - spinEv + sinceFrame;
      if (t < WS.STOP_FROM) return; // ignore early presses and a second press (state leaves 'spin' on the first)
      stop(Math.min(t, WS.COAST));
    } else if (state === 'result') { const f = o.onCollect; close(true); if (f) f(); }
  }
  go.addEventListener('click', onGo);
  function close(done) {
    if (closed) return; closed = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', layout);
    ov.remove(); releaseInert(app); if (opener && opener.isConnected && opener.focus) opener.focus(); if (!done && o.onClose) o.onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape' && state !== 'spin' && state !== 'land' && state !== 'tok') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { const f = [...ov.querySelectorAll('button')].filter((b) => !b.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  $('.wh-x').addEventListener('click', () => { if (state !== 'spin' && state !== 'land' && state !== 'tok') close(); });
  document.addEventListener('keydown', onKey, true); window.addEventListener('resize', layout);
  layout();
  const pend = o.pending || null;
  if (pend) { pos = centreOf(pend.index); state = 'result'; draw(); showResult(); }
  else { setMsg(reduced ? 'Tap SPIN. The result shows at once.' : 'Tap SPIN. Tap STOP when the gold slice is near the top.'); go.focus(); }
  return close;
}
