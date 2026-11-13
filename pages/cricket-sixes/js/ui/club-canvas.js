/* club-canvas: the hub's 2:1 stadium picture, code-drawn from kit/sprites.js (SPR, ISO, PAL are page globals).
   drawClub(host, opts) fills `host` with a canvas and one transparent button per building.
   opts: { levels: {id: 0..5} (real econ.fac; 0 = not built, drawn as level 1), marks: {id: 'upgrade'|'alert'}, onTap(id, name, level), names }  Pins show only for ids in marks.
   Whole-number scale from a 160x80 base, so the picture is exactly 2:1 and pixel-sharp at every width. */
const BASEW = 160, BASEH = 80;
/* id, label, dx from centre (internal px), y of footprint centre, roof height above centre */
const FAC = [
  ['scout', 'Scout', -60, 38, 35], ['academy', 'Academy', -22, 38, 35], ['stands', 'Stands', 24, 38, 37], ['shop', 'Shop', 63, 40, 25],
  ['nets', 'Nets', -56, 68, 23], ['pitch', 'Pitch', 0, 64, 14], ['gym', 'Gym', 58, 67, 25],
];
export const BUILDINGS = FAC.map((f) => ({ id: f[0], name: f[1] }));

export function drawClub(host, opts) {
  const w = typeof window !== 'undefined' ? window : null;
  if (!w || !w.SPR || !w.ISO || !w.PAL) { host.innerHTML = ''; return null; }
  const { SPR, ISO, PAL: P } = w;
  opts = opts || {};
  const levels = opts.levels || {}, marks = opts.marks || {};
  const calm = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); // still frame either way: no timers
  const avail = Math.min(600, Math.max(BASEW * 2, (host.clientWidth || 316) - 4));
  const SC = Math.max(2, Math.floor(avail / BASEW));
  let W = Math.floor(avail / SC); W -= W % 2;
  const H = W / 2, DY = Math.floor((H - BASEH) / 2);
  host.style.width = W * SC + 'px'; host.style.height = H * SC + 'px';
  host.classList.toggle('is-roomy', SC >= 3);
  host.innerHTML = '<canvas class="hb-cv" aria-hidden="true"></canvas>';
  const sc = ISO.makeScene(host.firstChild, { internalW: W, internalH: H, scale: SC }), ctx = sc.ctx, mid = Math.round(W / 2);

  const L = FAC.map((f) => {
    const fp = SPR.footprint[f[0]];
    const o = { id: f[0], name: f[1], x: mid + f[2], y: f[3] + DY, fp, lv: Math.max(0, Number(levels[f[0]]) || 0), mark: marks[f[0]] || null };
    o.halfW = o.id === 'pitch' ? 32 : (fp.w + fp.d) * 4; o.halfH = o.id === 'pitch' ? 16 : (fp.w + fp.d) * 2;
    o.top = o.y - f[4]; o.front = o.id !== 'pitch' && f[3] > 55;
    o.tip = o.front ? o.y - 2 : Math.max(o.top - 1, 20);
    o.px = o.id === 'pitch' ? o.x - 26 : o.front ? o.x - o.halfW - 2 : o.x;
    let top = Math.min(o.top, o.mark ? o.tip - 19 : o.top), bot = o.y + o.halfH + 2;
    let l = Math.min(o.x - o.halfW, o.mark ? o.px - 8 : 1e9), r = o.x + o.halfW;
    const minI = Math.ceil(56 / SC);
    if (r - l < minI) { l = o.x - minI / 2; r = o.x + minI / 2; }
    if (bot - top < minI) top = bot - minI;
    l = Math.max(0, l); r = Math.min(W, r); top = Math.max(0, top); bot = Math.min(H, bot);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hb-fac'; b.dataset.id = o.id;
    b.setAttribute('aria-label', o.name + ', ' + (o.lv > 0 ? 'level ' + o.lv : 'not built') + (o.mark === 'upgrade' ? ', upgrade ready' : o.mark === 'alert' ? ', something waiting' : ''));
    b.innerHTML = '<span class="hb-fac__tag" aria-hidden="true">' + o.name + '</span>';
    b.style.cssText = 'left:' + l * SC + 'px;top:' + top * SC + 'px;width:' + (r - l) * SC + 'px;height:' + (bot - top) * SC + 'px';
    if (opts.onTap) b.addEventListener('click', () => opts.onTap(o.id, o.name, o.lv));
    host.appendChild(b);
    return o;
  });
  const by = {}; L.forEach((o) => { by[o.id] = o; });

  const at = (y, fn) => ISO.add({ gx: 0, gy: 0, w: 0, d: 0, depth: y, draw: fn });
  function pin(kind, x, y) { // outlined plate with a tail and a kit icon (same pin as the stadium screen)
    const y0 = y - 19, bg = kind === 'alert' ? P.danger : P.cream;
    ISO.px(ctx, x - 8, y0 + 1, 16, 14, P.outline); ISO.px(ctx, x - 7, y0, 14, 16, P.outline); ISO.px(ctx, x - 7, y0 + 1, 14, 14, bg);
    ISO.px(ctx, x - 3, y0 + 16, 6, 1, P.outline); ISO.px(ctx, x - 2, y0 + 17, 4, 1, P.outline); ISO.px(ctx, x - 1, y0 + 18, 2, 1, P.outline);
    ISO.px(ctx, x - 2, y0 + 15, 4, 1, bg); ISO.px(ctx, x - 1, y0 + 16, 2, 1, bg);
    ctx.drawImage(SPR.icon(kind), x - 6, y0 + 2);
  }
  sc.clear(P.grass2);
  ISO.px(ctx, 0, 0, W, 3, P.grass3);
  ISO.setOrigin(by.pitch.x, by.pitch.y); ISO.ellipseField(ctx, 0, 0, 4, 4, { radiusX: 40, radiusY: 17 });
  L.forEach((o) => {
    const ox = o.x - (o.fp.w - o.fp.d) * 4, oy = o.y - (o.fp.w + o.fp.d) * 2;
    const put = (k) => { ISO.setOrigin(ox, oy); SPR.building(o.id, k, 0, 0, Math.max(1, o.lv)); };
    if (o.id === 'pitch') put(ctx); else at(o.y + o.halfH, put);
  });
  [[4, H - 3, 0], [W - 4, H - 2, 0], [mid - 92, 24, 1], [mid + 92, 26, 1]].forEach((r) => { if (r[0] > 2 && r[0] < W - 2) at(r[1], (c) => SPR.tree(c, r[0], r[1], { size: r[2] })); });
  const fy = by.stands.y - 6; at(fy, (c) => SPR.flag(c, by.stands.x + 26, fy, { colour: P.kitA1, t: 3 * 125, h: 10 }));
  const pt = by.pitch;
  [[pt.x + 6, pt.y - 4, 'A', 'bat', 'helmet'], [pt.x - 12, pt.y + 8, 'B', 'bowl', 'cap']].forEach((q, k) => {
    at(q[1], (c) => SPR.player(c, q[0], q[1], { kit: q[2], pose: q[3], hat: q[4], skin: k + 1, hair: 1, facing: 'r', frame: 0 }));
  });
  ISO.flush(ctx);
  L.forEach((o) => { if (o.mark) pin(o.mark, o.px, o.id === 'pitch' ? o.y - 2 : o.tip); });
  return { scale: SC, calm };
}

/** A small head-and-shoulders portrait of a player, for the six. Look is picked from the id so it stays the same. */
export function drawHead(cv, key) {
  const w = typeof window !== 'undefined' ? window : null;
  if (!w || !w.SPR || !w.ISO) return;
  let h = 0; for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const s = w.ISO.makeScene(cv, { internalW: 14, internalH: 14, scale: 2 });
  w.SPR.player(s.ctx, 7, 21, { kit: 'A', pose: 'idle', hat: 'cap', skin: 1 + (h % 3), hair: 1 + ((h >> 3) % 2), shadow: false });
}
