/* wheel-view: the Spotlight wheel and the Course wheel, layout A (big centre wheel under the card, result box + COLLECT below).
   openWheel(o) -> close()
   o = { title, sub?, cardHtml,                 card under the strip (trusted markup)
         slices:number[10], jackpotIndex, aim,  from core wheelSlices / courseWheel
         plus:'+'  (slice label prefix),
         pending: {index,gain,jackpot}|null,    already spun (reload / reopen): opens on the result
         onSpin(careful:boolean),               dispatch the store command (spin / courseSpin); the result must then be readable from getPending()
         getPending() -> {index,gain,jackpot}|null,
         describe(p) -> { big:'+2 Power', from:'C', to:'C+', barHtml?, breakthrough:bool, say:'one line for the live region' },
         onCollect(), collectLabel?:'COLLECT', onClose?() }
   SPIN then STOP (two taps, no auto-start). The wheel slows as it turns; STOP in the slow zone = careful, else random.
   Reduced motion: no spin; one tap shows the result at once at the careful rate. Result is read once (live region).
   Canvas drawn in code, pixel style, palette read from the page's CSS variables (Green and chalk and Scorebook both work). */
import { esc, icoDeco } from './dom.js';

const TAU = Math.PI * 2;
const W0 = 11, WMIN = 1.2, TAUD = 1.0, WIN0 = 3.2, WIN1 = 3.8, COAST = 6; // rad/s start, floor, decay time (s); careful window (s after SPIN, 0.6 s long); no tap by COAST s = coast to a random landing
const reducedNow = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolve a CSS variable to [r,g,b] (works through var() chains and both skins). */
function tok(name, fb) {
  const p = document.createElement('i'); p.style.cssText = 'position:absolute;visibility:hidden;color:var(' + name + ',' + fb + ')'; document.body.appendChild(p);
  const m = getComputedStyle(p).color.match(/\d+(\.\d+)?/g) || [0, 0, 0]; p.remove(); return [+m[0], +m[1], +m[2]];
}
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const dim = (c, k) => c.map((v) => Math.round(v * (1 - k)));

export function openWheel(o) {
  const N = o.slices.length, A = TAU / N, JP = o.jackpotIndex, reduced = reducedNow();
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
    '<div class="wh-foot"><div class="wh-msg c-card" data-msg></div><div class="wh-res c-card" data-res hidden></div>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block wh-go" data-go>SPIN</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite" data-live></div>';
  document.body.appendChild(ov); if (app) app.inert = true;
  const $ = (q) => ov.querySelector(q), wrap = $('.wh-wrap'), cv = $('.wh-cv'), ctx = cv.getContext('2d'), go = $('[data-go]'), msg = $('[data-msg]'), res = $('[data-res]'), live = $('[data-live]');
  const labels = o.slices.map((v, i) => { const s = document.createElement('span'); s.className = 'wh-lab' + (i === JP ? ' is-jp' : ''); s.textContent = (o.plus || '+') + v; s.setAttribute('aria-hidden', 'true'); wrap.appendChild(s); return s; });
  let state = 'idle', rot = -(JP + 0.5) * A + 1.55 * A, speed = 0, t0 = 0, raf = 0, closed = false, S = 2, size = 100, css = 200, lastT = 0, landing = null;

  function layout() { // wheel sized from the free height (stage), never wider than the screen
    const st = $(".wh-stage"), h = st.clientHeight - 24 - 22, w = st.clientWidth - 24;
    css = Math.max(160, Math.min(w, h, 340)); size = Math.floor(css / S / 2) * 2; css = size * S;
    wrap.style.width = wrap.style.height = css + 'px'; cv.width = cv.height = size; cv.style.width = cv.style.height = css + 'px'; draw();
  }
  const elapsed = () => (performance.now() - t0) / 1000, inWin = () => { const e = elapsed(); return e >= WIN0 && e <= WIN1; };
  function draw() {
    const w = size, cx = w / 2, cy = w / 2, R = w / 2 - 1, im = ctx.createImageData(w, w), d = im.data, slow = state === 'spin' && inWin(), moving = state === 'spin' || state === 'land';
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy); if (r > R) continue;
      const th = Math.atan2(dy, dx); let phi = (th + Math.PI / 2 - rot) % TAU; if (phi < 0) phi += TAU;
      const idx = Math.floor(phi / A), m = phi - idx * A, bd = r * Math.sin(Math.min(m, A - m));
      const sa = ((th + Math.PI / 2 + Math.PI * 3) % TAU) - Math.PI; let c;
      if (r > R - 1.6) c = pal.out;
      else if (r > R - 6) c = r < R - 5.2 || bd < 1.3 ? pal.out : pal.cream;
      else if (r < 4) c = [255, 255, 255]; else if (r < 10) c = pal.acc; else if (r < 12) c = pal.cream;
      else if (bd < 0.9) c = pal.out;
      else {
        c = fills[idx]; if (((x + y) & 1) === 0 && r > R - 15 && r < R - 8) c = dim(c, 0.18);
        if (moving && ((r > R * 0.36 && r < R * 0.4) || (r > R * 0.66 && r < R * 0.69)) && Math.floor(phi * 27 / TAU) % 3 !== 0) c = pal.cream;
        if (r > R - 9.6 && r < R - 7.4 && Math.abs(sa) < 0.62 && Math.floor((sa + 0.62) / 0.095) % 2 === 0) c = slow ? pal.gold : dim(pal.gold, 0.25); // slow zone: gold dashes at the pointer
        if (r > R - 10.4 && r <= R - 9.6 && Math.abs(sa) < 0.62) c = pal.out;
      }
      const p = (y * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    const a = JP * A + A / 2 + rot - Math.PI / 2, ax = Math.round(cx + Math.cos(a) * (R - 3.6)), ay = Math.round(cy + Math.sin(a) * (R - 3.6));
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const q = Math.abs(i) + Math.abs(j); if (q > 5) continue; ctx.fillStyle = q >= 5 ? 'rgb(' + pal.out + ')' : q >= 4 ? '#fff' : 'rgb(' + pal.gold + ')'; ctx.fillRect(ax + i, ay + j, 1, 1); } // diamond on the jackpot slice
    labels.forEach((l, i) => {
      const b = (i + 0.5) * A + rot - Math.PI / 2, rl = R * 0.67;
      l.style.left = (cx + Math.cos(b) * rl) * S + 'px'; l.style.top = (cy + Math.sin(b) * rl) * S + 'px';
      l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = moving && speed > 3 ? '.55' : '1';
    });
  }
  const setMsg = (t) => { msg.textContent = t; };
  function frame(t) {
    if (closed) return; const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (state === 'spin') { speed = WMIN + (W0 - WMIN) * Math.exp(-((t - t0) / 1000) / TAUD); rot += speed * dt; const w = inWin(); if (w !== ov.classList.contains('is-slow')) { ov.classList.toggle('is-slow', w); setMsg(w ? 'Now: tap STOP for a careful stop.' : elapsed() > WIN1 ? 'Too late: a random stop.' : 'Turning. Tap STOP when the slow marker glows.'); }
      if ((t - t0) / 1000 > COAST) stop(); }
    else if (state === 'land') {
      const k = Math.min(1, (t - landing.t) / landing.D), e = 1 - Math.pow(1 - k, 3); rot = landing.r0 + (landing.r1 - landing.r0) * e;
      if (k >= 1) { state = 'result'; rot = landing.r1; draw(); showResult(); return; }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  function landOn(index) { // ease-out onto the engine's slice; the start speed matches the current one so it does not jerk
    const D = 0.9, r1base = -(index + 0.5) * A; let need = Math.max(speed * D / 3, A); let r1 = r1base + TAU * Math.ceil((rot + need - r1base) / TAU);
    landing = { t: performance.now(), D: D * 1000, r0: rot, r1 }; state = 'land';
  }
  function showResult() {
    const p = o.getPending(); if (!p) return; const d = o.describe(p);
    state = 'result'; ov.classList.remove('is-slow'); msg.hidden = true; res.hidden = false; ov.classList.toggle('is-jp', !!p.jackpot);
    res.innerHTML = (p.jackpot ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' JACKPOT!</span>' : '') + (d.breakthrough ? '<span class="wh-bt">Breakthrough!</span>' : '') +
      '<div class="wh-big"><span class="wh-chip">' + esc(o.plus || '+') + esc(p.gain) + '</span><b>' + esc(d.big) + '</b></div>' +
      '<div class="wh-chg"><span>' + esc(d.from) + '</span>' + (d.from !== d.to ? '<span class="t2-arr" aria-hidden="true"></span><b class="t2-new">' + esc(d.to) + '</b>' : '<small>stays, the bar fills</small>') + (d.barHtml || '') + '</div>';
    live.textContent = d.say || ''; // read once
    go.textContent = o.collectLabel || 'COLLECT'; go.classList.add('is-collect'); go.setAttribute('aria-label', o.collectLabel || 'Collect'); go.focus();
    if (!reduced) draw();
  }
  function spin() { state = 'spin'; t0 = performance.now(); speed = W0; setMsg('Turning. Tap STOP when the slow marker glows.'); go.textContent = 'STOP'; go.setAttribute('aria-label', 'Stop the wheel'); ov.classList.add('is-turning'); raf = requestAnimationFrame(frame); }
  function stop() { const careful = inWin(); ov.classList.remove('is-turning'); o.onSpin(careful); const p = o.getPending(); if (!p) { close(); return; } setMsg(careful ? 'Good timing!' : 'Stopping...'); landOn(p.index); }
  go.addEventListener('click', () => {
    if (state === 'idle') { if (reduced) { o.onSpin(true); const p = o.getPending(); if (!p) return; rot = -(p.index + 0.5) * A; draw(); showResult(); } else spin(); }
    else if (state === 'spin') stop();
    else if (state === 'result') { const f = o.onCollect; close(true); if (f) f(); }
  });
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
  if (pend) { rot = -(pend.index + 0.5) * A; state = 'result'; draw(); showResult(); }
  else { setMsg(reduced ? 'Tap SPIN. The result shows at once.' : 'Tap SPIN. The wheel slows. Tap STOP when the slow marker glows.'); go.focus(); }
  return close;
}
