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
         onCollect(), collectLabel?:'COLLECT', onClose?() }
   SPIN then STOP (two taps, no auto-start). WHEEL-STOP-V2: the wheel slows by itself (w = W0*exp(-t/TAU)); STOP (live from 1 s) eases it out over 1 s
   from the current speed with a small wobble; the slice under the pointer wins (no snap, no hidden aim, no preview). No STOP by 6 s = the game taps at 6 s.
   Reduced motion: no spin; one tap shows the result at once, from an average careful player's synthetic tap. Result is read once (live region).
   Canvas drawn in code, pixel style, palette read from the page's CSS variables (Green and chalk and Scorebook both work). */
import { esc, icoDeco } from './dom.js';
import { wheelWidths, wheelSpeed, wheelArc, stopExtra, stopLanding, carefulTapTime } from '../core/training.js';
import { TRAIN2 } from '../data/training.js';

const TAU = Math.PI * 2, WS = TRAIN2.wheelStop;
const reducedNow = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolve a CSS variable to [r,g,b] (works through var() chains and both skins). */
function tok(name, fb) {
  const p = document.createElement('i'); p.style.cssText = 'position:absolute;visibility:hidden;color:var(' + name + ',' + fb + ')'; document.body.appendChild(p);
  const m = getComputedStyle(p).color.match(/\d+(\.\d+)?/g) || [0, 0, 0]; p.remove(); return [+m[0], +m[1], +m[2]];
}
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const dim = (c, k) => c.map((v) => Math.round(v * (1 - k)));

export function openWheel(o) {
  const N = o.slices.length, JP = o.jackpotIndex || 0, reduced = reducedNow();
  const widths = wheelWidths({ slices: o.slices, jackpotIndex: JP, widths: o.widths }), C = widths.reduce((a, b) => a + b, 0), U = TAU / C; // units -> radians
  const cum = [0]; widths.forEach((w, i) => cum.push(cum[i] + w));
  const sliceOf = (pos) => { let u = pos % C; if (u < 0) u += C; for (let i = 0; i < N; i++) if (u < cum[i + 1]) return i; return N - 1; };
  const app = document.getElementById('app'), wasInert = !!(app && app.inert), opener = document.activeElement;
  const pal = { cream: tok('--cream', '#F3EBD3'), out: tok('--outline', '#2A2238'), gold: tok('--gold', '#D2B357'), wall: tok('--wall1', '#E3D8B9'), g2: tok('--grass2', '#7EB261'), acc: tok('--accent', '#22625D'), b1: tok('--kitA1', '#3b5ba5') };
  const fillOf = (i) => (i === JP ? pal.gold : o.slices[i] <= 1 ? pal.wall : o.slices[i] === 2 ? pal.g2 : o.slices[i] === 3 ? pal.acc : pal.b1);
  const fills = o.slices.map((_, i) => fillOf(i));
  const ov = document.createElement('section');
  ov.className = 't2-ov wh-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', o.title);
  const sliceWords = o.slices.map((v, i) => '+' + v + (i === JP ? ' jackpot' : '')).join(', ');
  ov.innerHTML = '<div class="t2-strip"><span>' + icoDeco('burst', 24) + ' ' + esc(o.title) + (o.sub ? ' <small>' + esc(o.sub) + '</small>' : '') + '</span>' +
    '<button type="button" class="c-icon-btn wh-x" aria-label="Close"><span class="c-ico c-ico--x"></span></button></div>' +
    '<div class="wh-card c-card">' + (o.cardHtml || '') + '</div>' +
    '<div class="wh-stage"><div class="wh-wrap" role="img" aria-label="Wheel of ' + N + ' slices: ' + esc(sliceWords) + '"><canvas class="wh-cv"></canvas><span class="wh-ptr" aria-hidden="true"></span><span class="wh-hub" aria-hidden="true"></span></div></div>' +
    '<div class="wh-foot"><div class="wh-msg c-card" data-msg></div><div class="wh-res c-card c-card--inset" data-res hidden></div>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block wh-go" data-go>SPIN</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite" data-live></div>';
  document.body.appendChild(ov); if (app) app.inert = true;
  const $ = (q) => ov.querySelector(q), wrap = $('.wh-wrap'), cv = $('.wh-cv'), ctx = cv.getContext('2d'), go = $('[data-go]'), msg = $('[data-msg]'), res = $('[data-res]'), live = $('[data-live]'), ptr = $('.wh-ptr');
  const labels = o.slices.map((v, i) => { const s = document.createElement('span'); s.className = 'wh-lab' + (i === JP ? ' is-jp' : ''); s.textContent = (o.plus || '+') + v; s.setAttribute('aria-hidden', 'true'); wrap.appendChild(s); return s; });
  // wheel state: pos = the wheel coordinate (units) under the pointer; the wheel's turn is rot = pos * U.
  let state = 'idle', pos = Math.random() * C, phi = pos, speed = 0, clock = 0, lastF = 0, tapT = 0, stopInfo = null, adj = 0, raf = 0, closed = false, S = 2, size = 100, css = 200, spinEv = 0, prevIdx = sliceOf(pos);
  const centreOf = (i) => (cum[i] + cum[i + 1]) / 2;

  function layout() { // wheel sized from the free height (stage), never wider than the screen
    const st = $(".wh-stage"), h = st.clientHeight - 24 - 22, w = st.clientWidth - 24;
    css = Math.max(160, Math.min(w, h, 340)); size = Math.floor(css / S / 2) * 2; css = size * S;
    wrap.style.width = wrap.style.height = css + 'px'; cv.width = cv.height = size; cv.style.width = cv.style.height = css + 'px'; draw();
  }
  function draw() {
    const w = size, cx = w / 2, cy = w / 2, R = w / 2 - 1, im = ctx.createImageData(w, w), d = im.data, moving = state === 'spin' || state === 'land', rot = pos * U;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy); if (r > R) continue;
      const th = Math.atan2(dy, dx); let q = (rot - (th + Math.PI / 2)) % TAU; if (q < 0) q += TAU; // wheel angle under this pixel; slices pass the pointer in list order
      const u = q / U; let idx = 0; while (idx < N - 1 && u >= cum[idx + 1]) idx++;
      const m = (u - cum[idx]) * U, wa = widths[idx] * U, bd = r * Math.sin(Math.min(m, wa - m, Math.PI / 2));
      const sa = ((th + Math.PI / 2 + Math.PI * 3) % TAU) - Math.PI; let c;
      if (r > R - 1.6) c = pal.out;
      else if (r > R - 6) c = r < R - 5.2 || bd < 1.3 ? pal.out : pal.cream;
      else if (r < 4) c = [255, 255, 255]; else if (r < 10) c = pal.acc; else if (r < 12) c = pal.cream;
      else if (bd < 0.9) c = pal.out;
      else {
        c = fills[idx]; if (((x + y) & 1) === 0 && r > R - 15 && r < R - 8) c = dim(c, 0.18);
        if (moving && ((r > R * 0.36 && r < R * 0.4) || (r > R * 0.66 && r < R * 0.69)) && Math.floor(q * 27 / TAU) % 3 !== 0) c = pal.cream;
        if (r > R - 9.6 && r < R - 7.4 && Math.abs(sa) < 0.62 && Math.floor((sa + 0.62) / 0.095) % 2 === 0) c = dim(pal.gold, 0.25); // dashes mark the pointer lane (no aim help)
        if (r > R - 10.4 && r <= R - 9.6 && Math.abs(sa) < 0.62) c = pal.out;
      }
      const p = (y * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    const a = rot - centreOf(JP) * U - Math.PI / 2, ax = Math.round(cx + Math.cos(a) * (R - 3.6)), ay = Math.round(cy + Math.sin(a) * (R - 3.6));
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const q = Math.abs(i) + Math.abs(j); if (q > 5) continue; ctx.fillStyle = q >= 5 ? 'rgb(' + pal.out + ')' : q >= 4 ? '#fff' : 'rgb(' + pal.gold + ')'; ctx.fillRect(ax + i, ay + j, 1, 1); } // diamond on the jackpot slice
    labels.forEach((l, i) => {
      const b = rot - centreOf(i) * U - Math.PI / 2, rl = R * (i === JP ? 0.8 : 0.62);
      l.style.left = (cx + Math.cos(b) * rl) * S + 'px'; l.style.top = (cy + Math.sin(b) * rl) * S + 'px';
      l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = moving && speed > 8 ? '.55' : '1';
    });
  }
  const setMsg = (t) => { msg.textContent = t; };
  function tick(from, to, loud) { // one call per slice boundary crossed; the pointer flexes a little (cosmetic, never moves the wheel)
    const a = sliceOf(from), b = sliceOf(to); if (a === b) return;
    if (o.onTick) o.onTick({ loud: !!loud, rate: speed });
    if (!reduced) { ptr.style.transform = 'rotate(' + Math.min(10, speed * 0.5) + 'deg)'; requestAnimationFrame(() => { ptr.style.transform = ''; }); }
  }
  function frame(t) {
    if (closed) return; const dt = Math.min(0.05, (t - lastF) / 1000 || 0.016); lastF = t; clock += dt; const was = pos;
    if (state === 'spin') {
      const c = Math.min(clock - spinEv, WS.COAST); speed = wheelSpeed(c); pos = phi + wheelArc(c);
      if (c >= WS.STOP_FROM && go.getAttribute('aria-disabled') === 'true') { go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); go.textContent = 'STOP'; go.setAttribute('aria-label', 'Stop the wheel'); setMsg(MSG_GO); }
      if (clock - spinEv >= WS.COAST) { stop(WS.COAST); } else tick(was, pos);
    } else if (state === 'land') {
      const s = clock - tapT, L = stopInfo, u = Math.min(1, s / WS.D);
      pos = L.base + stopExtra(L.dist, L.e, s) + adj * (3 * u * u - 2 * u * u * u);
      speed = Math.max(0, (L.dist * 3 * (1 - u) * (1 - u) + L.e * 6 * u * (1 - u) + adj * 6 * u * (1 - u)) / WS.D); tick(was, pos, u >= 1);
      if (s >= WS.D) { state = 'result'; draw(); showResult(); return; }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  const MSG_GO = 'Turning. Tap STOP when you want it to slow down. Tap early and it goes further.';
  function showResult() {
    const p = o.getPending(); if (!p) return; const d = o.describe(p);
    state = 'result'; ov.classList.remove('is-turning'); msg.hidden = true; res.hidden = false; ov.classList.toggle('is-jp', !!p.jackpot);
    res.innerHTML = (p.jackpot ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' JACKPOT! Breakthrough!</span>' : d.breakthrough ? '<span class="wh-bt">Breakthrough!</span>' : '') +
      '<div class="wh-big"><span class="wh-chip">' + esc(o.plus || '+') + esc(p.gain) + '</span><b>' + esc(d.big) + '</b></div>' +
      '<div class="wh-chg">' + (d.from !== d.to ? '<span>' + esc(d.from) + '</span><span class="t2-arr" aria-hidden="true"></span><b class="t2-new">' + esc(d.to) + '</b>' : d.barHtml ? d.barHtml + '<small>(bar fills)</small>' : '<span>' + esc(d.from) + '</span><small>(same letter)</small>') + '</div>';
    live.textContent = d.say || ''; // read once
    go.textContent = o.collectLabel || 'COLLECT'; go.classList.add('is-collect', 'c-btn--gold'); go.classList.remove('c-btn--primary'); go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); go.setAttribute('aria-label', o.collectLabel || 'Collect'); go.focus();
    if (!reduced) draw();
  }
  /** m5: the button shows it is waiting: words, dimmed look (css .wh-go.is-wait), aria-disabled. Static: nothing flashes. */
  function waitLook(text, aria) { go.textContent = text; go.setAttribute('aria-label', aria); go.setAttribute('aria-disabled', 'true'); go.classList.add('is-wait', 'is-disabled'); }
  function spin() { state = 'spin'; phi = pos; spinEv = clock; speed = WS.W0; setMsg('Get ready. STOP wakes up in a moment.'); waitLook('Wait...', 'Wait. STOP wakes up in a moment'); ov.classList.add('is-turning'); raf = requestAnimationFrame(frame); }
  /** STOP at wheel time t (seconds after SPIN, from the tap's own timestamp). The wobble is drawn now; the result comes from the landing position. */
  function stop(t) {
    const e = (Math.random() * 2 - 1) * WS.J, L = stopLanding({ slices: o.slices, jackpotIndex: JP, widths }, { t, phi, e });
    o.onSpin({ t: L.t, phi: L.phi, e: L.e }); const p = o.getPending(); if (!p) { close(); return; }
    // the store agrees with the landing: the wheel just eases out. If an older store answered with its own slice, steer the ease to that slice so the card never contradicts the wheel.
    adj = 0; if (p.index !== L.index) { const end = L.base + L.dist + L.e, mid = centreOf(p.index); adj = (((mid - end) % C) + C) % C; }
    stopInfo = { base: L.base, dist: L.dist, e: L.e }; tapT = spinEv + L.t; state = 'land'; speed = wheelSpeed(L.t); ov.classList.remove('is-turning'); waitLook('Slowing...', 'Slowing down. Please wait'); setMsg('Slowing down...');
  }
  function onGo(ev) {
    if (state === 'idle') {
      if (reduced) { // no spin: an average careful player's tap, same pipeline
        const ph = Math.random() * C, e = (Math.random() * 2 - 1) * WS.J, t = carefulTapTime({ slices: o.slices, jackpotIndex: JP, widths }, ph, 1 - Math.random(), Math.random());
        const L = stopLanding({ slices: o.slices, jackpotIndex: JP, widths }, { t, phi: ph, e }); o.onSpin({ t: L.t, phi: L.phi, e: L.e }); const p = o.getPending(); if (!p) return;
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
    ov.remove(); if (app) app.inert = wasInert; if (opener && opener.isConnected && opener.focus) opener.focus(); if (!done && o.onClose) o.onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape' && state !== 'spin' && state !== 'land') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { const f = [...ov.querySelectorAll('button')].filter((b) => !b.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  $('.wh-x').addEventListener('click', () => { if (state !== 'spin' && state !== 'land') close(); });
  document.addEventListener('keydown', onKey, true); window.addEventListener('resize', layout);
  layout();
  const pend = o.pending || null;
  if (pend) { pos = centreOf(pend.index); state = 'result'; draw(); showResult(); }
  else { setMsg(reduced ? 'Tap SPIN. The result shows at once.' : 'Tap SPIN. Tap STOP when the gold slice is near the top.'); go.focus(); }
  return close;
}
