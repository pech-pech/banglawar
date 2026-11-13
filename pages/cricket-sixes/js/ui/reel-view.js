/* reel-view: the vertical slot reel for Find (aim) and the one-tap reveals Scout and Finals. Wheel meta w2, spec 03 sections 1-6.
   openReel(o) -> close()
   o = { mode:'aim'|'reveal', title, sub?, cardHtml?, legendHtml?,
         cells:[{label, icon?, w, find?:bool, tone?:'coach'|'coins'|'player'|'none'|'gold'|...}],   strip order top to bottom; w = units (loop C = sum, 12 for Find); find = gold border
         pending:{index,...}|null,                already spun (reload / reopen): opens on the result
         onSpin(stop),                            aim: stop = {t, phi, e} (STOP time in reel seconds, start offset 0..C, wobble); reveal: {reveal:true}, the result is then read from getPending()
         getPending() -> {index, jackpot?}|null,  index = the cell under the line
         describe(p) -> { big, chip?, flash?, lineHtml?, say, gold?:bool },
         onCollect(), collectLabel?, onClose?(), onTick?({loud, rate}),
         guide?:bool, look?:{rim, hub, needle, gold}, V?, J?, plan?:{total} (reveal s, default 3), px?:px per unit (default 100) }
   Aim: SPIN then STOP, live from 0.8 s, auto at 3.0 s. The strip loops one way (7 units/s); STOP glides 0.5 s plus a wobble; the cell under the 4 px centre line wins.
   No snap, no hidden roll, no landing preview (the Aim Guide upgrade only). Reveal: result already drawn; one tap plays, tap again or anywhere skips; reduced motion = result at once.
   Cells 19 px tall (Street Game) still read: icon + text, text size follows the cell. Canvas drawn in code (pixel style), palette from CSS vars (both skins). */
import { esc, icoDeco } from './dom.js';
import { DR, mountShell, palette, reducedNow, lum, dim, cumOf, sliceAtX, easeOut3, smooth, revealFrac } from './dial-view.js';

export const RL = { C: 12, V: 7, G: 0.5, J: 0.8, REVEAL_T: 3, PX: 100 };
const mod = (a, m) => ((a % m) + m) % m;
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return (s - 3) / Math.sqrt(0.5); };
/** Where the reel lands for a STOP at t: offset base+dist+e (mod C); index = cell under the line. */
export function reelLand(widths, stop, V = RL.V, G = RL.G) {
  const C = widths.reduce((a, b) => a + b, 0), t = Math.min(DR.COAST, Math.max(DR.STOP_FROM, stop.t)), dist = V * G / 3, base = stop.phi + V * t, e = stop.e || 0, end = base + dist + e, x = mod(end, C);
  return { t, C, base, dist, e, end, x, index: sliceAtX(cumOf(widths), x), phi: stop.phi };
}
export const reelGlideQ = (L0, s, G = RL.G) => L0.base + L0.dist * easeOut3(s / G) + L0.e * smooth(s / G);
/** Reveal distance (units) to travel from x0 so the strip ends at xEnd with a cruise of at least minV units/s over a reveal of T s. */
export function reelRevealDist(x0, xEnd, C, T, minV = 7) {
  const a = DR.RAMP * T, b = DR.CRUISE * T, k = a / 2 + (b - a) + (T - b) / 3; let A = mod(xEnd - x0, C); while (A / k < minV) A += C; return A;
}

export function openReel(o) {
  const reveal = o.mode === 'reveal', reduced = reducedNow(), S = 2, cells = o.cells, N = cells.length, widths = cells.map((c) => c.w), C = widths.reduce((a, b) => a + b, 0), cum = cumOf(widths);
  const PX = o.px || RL.PX, V = o.V || RL.V, Jw = o.J != null ? o.J : RL.J, T = (o.plan && o.plan.total) || RL.REVEAL_T, pal = palette(o.look);
  const centreOf = (i) => (cum[i] + cum[i + 1]) / 2;
  const TONES = { coach: pal.acc, coins: pal.gold, player: pal.g2, none: pal.wall, gold: pal.gold };
  const fillOf = (c, i) => TONES[c.tone] || (c.find ? [pal.g2, pal.b1, pal.acc][i % 3] : pal.wall);
  const fills = cells.map(fillOf);
  const words = cells.map((c) => c.label + (c.find ? ' (find)' : '')).join(', ');
  const stageHtml = '<div class="dr-reel" role="img" aria-label="Slot reel of ' + N + ' cells: ' + esc(words) + '"><canvas class="dr-rcv"></canvas><div class="dr-labs"></div><canvas class="dr-ov2" aria-hidden="true"></canvas></div>';
  const sh = mountShell(o, { cls: 'dr-reelov dr-' + (reveal ? 'reveal' : 'aim'), stageHtml, goLabel: 'SPIN' });
  const { ov, go, stage } = sh, box = ov.querySelector('.dr-reel'), cv = ov.querySelector('.dr-rcv'), ctx = cv.getContext('2d'), top = ov.querySelector('.dr-ov2'), tctx = top.getContext('2d'), labBox = ov.querySelector('.dr-labs');
  const COPIES = [-1, 0, 1, 2]; const labs = [];
  cells.forEach((c, i) => COPIES.forEach((m) => { const e = document.createElement('span'); e.className = 'dr-cell' + (c.find ? ' is-find' : ''); e.setAttribute('aria-hidden', 'true'); e.innerHTML = (c.icon ? icoDeco(c.icon, 16) : '') + '<b>' + esc(c.label) + '</b>'; labBox.appendChild(e); labs.push({ e, i, m }); }));
  let state = 'idle', off = Math.random() * C, phi = off, clock = 0, lastF = 0, spinEv = 0, tapT = 0, stopInfo = null, adj = 0, raf = 0, W = 100, H = 400, shown = 0, prevIdx = sliceAtX(cum, off), target = 0, revT0 = 0, rev = null, skipped = false;
  const MSG_GO = 'Turning. Tap STOP when a gold cell is on the line. Tap early and it goes further.';

  function layout() {
    const w = stage.clientWidth - 16, h = stage.clientHeight - 12;
    W = Math.max(200, Math.min(w, 420)); H = Math.max(200, Math.min(h, 4.4 * PX)); W = Math.floor(W / S) * S; H = Math.floor(H / S) * S;
    box.style.width = W + 'px'; box.style.height = H + 'px'; cv.width = W / S; cv.height = H / S; cv.style.width = W + 'px'; cv.style.height = H + 'px'; top.width = W; top.height = H; top.style.width = W + 'px'; top.style.height = H + 'px';
    drawTop(); draw();
  }
  /** Static overlay: edge shade (dither), the 4 px centre line and the side arrows. */
  function drawTop() {
    tctx.clearRect(0, 0, W, H); const band = Math.min(56, H * 0.14);
    for (let y = 0; y < band; y += 2) for (let x = 0; x < W; x += 2) { const k = 1 - y / band; if ((x / 2 + y / 2) % 2 === 0 || k > 0.6) { tctx.fillStyle = 'rgba(' + pal.out + ',' + (0.6 * k).toFixed(2) + ')'; tctx.fillRect(x, y, 2, 2); tctx.fillRect(x, H - y - 2, 2, 2); } }
    const cy = H / 2; if (state !== 'result') { tctx.fillStyle = 'rgb(' + pal.out + ')'; tctx.fillRect(0, cy - 2, W, 4); tctx.fillStyle = 'rgb(' + pal.needle + ')'; tctx.fillRect(0, cy - 1, W, 2); } // result: side arrows only, the winning label is never struck through // 4 px line: outline rim, cream core
    const tri = (x, dir) => { for (let i = 0; i < 12; i++) { const hgt = 12 - i; tctx.fillStyle = 'rgb(' + pal.out + ')'; tctx.fillRect(x + dir * i * 2 - (dir < 0 ? 2 : 0), cy - hgt - 2, 2, hgt * 2 + 4); tctx.fillStyle = 'rgb(' + pal.needle + ')'; tctx.fillRect(x + dir * i * 2 - (dir < 0 ? 2 : 0), cy - hgt + 1, 2, hgt * 2 - 2); } };
    tri(0, 1); tri(W, -1);
  }
  function draw() {
    const w = W / S, h = H / S, cyL = h / 2, ppu = PX / S; ctx.fillStyle = 'rgb(' + pal.out + ')'; ctx.fillRect(0, 0, w, h);
    const marg = 4; // logical px of side margin
    for (const { e, i, m } of labs) {
      const t0 = cyL + (cum[i] + m * C - off) * ppu, t1 = t0 + widths[i] * ppu;
      if (t1 < 0 || t0 > h) { e.style.visibility = 'hidden'; continue; }
      const c = cells[i], f = fills[i], y0 = Math.round(t0), y1 = Math.round(t1);
      ctx.fillStyle = 'rgb(' + dim(f, 0.0) + ')'; ctx.fillRect(marg, y0 + 1, w - marg * 2, Math.max(1, y1 - y0 - 1)); // body (gap line = outline row above)
      if (c.find) { ctx.fillStyle = 'rgb(' + pal.gold + ')'; ctx.fillRect(marg, y0 + 1, w - marg * 2, 1); ctx.fillRect(marg, y1 - 1, w - marg * 2, 1); ctx.fillRect(marg, y0 + 1, 1, y1 - y0 - 1); ctx.fillRect(w - marg - 1, y0 + 1, 1, y1 - y0 - 1); ctx.fillStyle = 'rgb(' + dim(f, 0.25) + ')'; if (y1 - y0 > 6) ctx.fillRect(marg + 1, y0 + 2, w - marg * 2 - 2, 1); }
      else if (y1 - y0 > 8) { ctx.fillStyle = 'rgb(' + dim(f, 0.12) + ')'; for (let x = marg + 1; x < w - marg - 1; x += 2) ctx.fillRect(x, y0 + 2, 1, 1); }
      const vis0 = Math.max(0, t0), vis1 = Math.min(h, t1), hpx = (t1 - t0) * S, fs = Math.max(11, Math.min(20, Math.floor(hpx - 5)));
      e.style.visibility = 'visible'; e.style.fontSize = fs + 'px'; e.style.lineHeight = fs + 'px'; e.style.color = lum(f) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; e.style.transform = 'translate(-50%,-50%) translateY(' + (((vis0 + vis1) / 2) * S).toFixed(1) + 'px)';
    }
    if (o.guide && !reveal && state === 'spin' && shown >= DR.STOP_FROM) { const gy = cyL + (V * RL.G / 3) * ppu; ctx.fillStyle = 'rgb(' + pal.out + ')'; ctx.fillRect(0, gy - 3, 6, 7); ctx.fillStyle = 'rgb(' + pal.gold + ')'; ctx.fillRect(0, gy - 2, 5, 5); ctx.fillStyle = 'rgb(' + pal.out + ')'; ctx.fillRect(w - 6, gy - 3, 6, 7); ctx.fillStyle = 'rgb(' + pal.gold + ')'; ctx.fillRect(w - 5, gy - 2, 5, 5); } // Aim Guide: the cell that will be on the line if STOP is pressed now sits here
  }
  labBox.style.left = '0'; labBox.style.top = '0';
  const tick = (a, b, loud) => { if (a !== b && o.onTick) o.onTick({ loud: !!loud, rate: V }); };

  function frame(t) {
    if (sh.closed) return; const dt = Math.min(0.05, (t - lastF) / 1000 || 0.016); lastF = t; clock += dt;
    if (state === 'spin') {
      const c = Math.min(clock - spinEv, DR.COAST); shown = c; off = mod(phi + V * c, C); const ix = sliceAtX(cum, off); tick(prevIdx, ix); prevIdx = ix;
      if (c >= DR.STOP_FROM && go.getAttribute('aria-disabled') === 'true') { sh.goLook('STOP', 'Stop the reel'); sh.setMsg(MSG_GO); }
      if (clock - spinEv >= DR.COAST) stopNow(DR.COAST);
    } else if (state === 'land') {
      const s = Math.min(RL.G, clock - tapT); off = mod(reelGlideQ(stopInfo, s) + adj * smooth(s / RL.G), C); const ix = sliceAtX(cum, off); tick(prevIdx, ix, s >= RL.G); prevIdx = ix;
      if (s >= RL.G) { state = 'result'; draw(); showRes(); return; }
    } else if (state === 'play') {
      const t2 = clock - revT0; off = mod(rev.x0 + rev.A * revealFrac(Math.min(t2, T), T), C); const ix = sliceAtX(cum, off); tick(prevIdx, ix); prevIdx = ix; if (t2 >= T + DR.HOLD) { finishReveal(); return; }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  function stopNow(t) {
    const e = (Math.random() * 2 - 1) * Jw, Lq = reelLand(widths, { t, phi, e }, V);
    o.onSpin({ t: Lq.t, phi: Lq.phi, e: Lq.e }); const p = o.getPending(); if (!p) { sh.close(); return; }
    adj = 0; if (p.index !== Lq.index) adj = mod(centreOf(p.index) - Lq.end, C); // the store drew another cell: steer the glide so the card never contradicts the reel
    stopInfo = Lq; tapT = spinEv + Lq.t; state = 'land'; sh.waitLook('Slowing...', 'Slowing down. Please wait'); sh.setMsg('Slowing down...');
  }
  function syntheticTap(ph) { // spec 03 line 8: the arrival of a find cell nearest 2.0 s, plus gauss(0, 0.11), clamped
    let best = 2, bd = 9; for (let t = DR.STOP_FROM; t <= DR.COAST + 1e-9; t += 0.01) { const ix = reelLand(widths, { t, phi: ph, e: 0 }, V).index; if (cells[ix].find && Math.abs(t - 2) < bd) { bd = Math.abs(t - 2); best = t; } }
    return Math.min(DR.COAST, Math.max(DR.STOP_FROM, best + gauss() * 0.11));
  }
  function startReveal() {
    o.onSpin({ reveal: true, t: 0, phi: 0, e: 0 }); const p = o.getPending(); if (!p) { sh.close(); return; }
    target = Math.max(0, Math.min(N - 1, p.index | 0)); const x0 = off, xEnd = centreOf(target); rev = { x0, A: reelRevealDist(x0, xEnd, C, T) }; revT0 = clock; skipped = false; state = 'play';
    sh.setBusy(true); sh.waitLook('Tap to skip', 'Skip to the result'); go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); sh.setMsg('The reel is turning...'); raf = requestAnimationFrame(frame);
  }
  function finishReveal() { cancelAnimationFrame(raf); off = centreOf(target); state = 'result'; draw(); showRes(); }
  function showRes() { const p = o.getPending(); if (!p) return; drawTop(); draw(); sh.showResult(p, o.describe(p)); }
  function onGo(ev) {
    if (state === 'idle') {
      if (reveal) { if (reduced) { o.onSpin({ reveal: true, t: 0, phi: 0, e: 0 }); const p = o.getPending(); if (!p) return; target = p.index | 0; off = centreOf(target); state = 'result'; showRes(); } else startReveal(); }
      else if (reduced) {
        const ph = Math.random() * C, t = syntheticTap(ph), e = (Math.random() * 2 - 1) * Jw, Lq = reelLand(widths, { t, phi: ph, e }, V);
        o.onSpin({ t: Lq.t, phi: Lq.phi, e: Lq.e }); const p = o.getPending(); if (!p) return; off = centreOf(p.index); state = 'result'; showRes();
      } else { state = 'spin'; phi = off = Math.random() * C; spinEv = clock; shown = 0; sh.setBusy(true); sh.setMsg('Get ready. STOP wakes up in a moment.'); sh.waitLook('Wait...', 'Wait. STOP wakes up in a moment'); raf = requestAnimationFrame(frame); }
    } else if (state === 'spin') {
      const sinceFrame = Math.max(0, Math.min(0.05, ((ev && ev.timeStamp > 0 ? ev.timeStamp : lastF) - lastF) / 1000)), t = clock - spinEv + sinceFrame;
      if (t < DR.STOP_FROM) return; stopNow(Math.min(t, DR.COAST));
    } else if (state === 'play') skip();
    else if (state === 'result') { const f = o.onCollect; sh.close(true); if (f) f(); }
  }
  function skip() { if (state !== 'play' || skipped) return; skipped = true; finishReveal(); }
  go.addEventListener('click', onGo); stage.addEventListener('click', () => { if (state === 'play') skip(); });
  sh.dispose.push(() => cancelAnimationFrame(raf)); sh.onResize = layout;
  layout();
  const pend = o.pending || null;
  if (pend) { target = pend.index | 0; off = centreOf(target); state = 'result'; draw(); showRes(); }
  else { sh.setMsg(reduced ? 'Tap SPIN. The result shows at once.' : reveal ? 'One tap. Tap again to skip.' : 'Tap SPIN. Tap STOP when a gold cell is on the line.'); go.focus(); }
  return () => sh.close();
}
