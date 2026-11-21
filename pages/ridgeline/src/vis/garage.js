// B4 vis: Garage (hull picker). Cosmetic only. Same world as the front door; sled parked on a crest, close camera.
// HULLS: sledrig.js did not exist when M6 finished, so a local fallback with the same ids is used (see maker-M6.md).
// Pure state (wrapIndex, swipeDir, unlock rules) is exported for node tests; DOM is skipped when ctx.root is null.

export const KEYS = {
  lookGarageFov: { def: 46, min: 30, max: 70, step: 1, label: 'Garage FOV' },
  lookGarageSwipePx: { def: 40, min: 16, max: 120, step: 2, label: 'Garage swipe px' },
};
const kv = (ctx, k) => { const v = ctx && ctx.cfg && ctx.cfg[k]; return typeof v === 'number' ? v : KEYS[k].def; };

export const HULL_IDS = ['wren', 'kite', 'anvil', 'barge', 'spindle'];
// metres of best single run needed
export const UNLOCK_M = { wren: 0, kite: 2800, anvil: 5500, barge: 8500, spindle: 13500 };
export const FALLBACK_HULLS = {
  wren: { id: 'wren', name: 'WREN', line: 'Light and twitchy. Floats long, lands soft.', stats: [2, 3, 4] },
  kite: { id: 'kite', name: 'KITE', line: 'Big wings, big hang time. Nervous on the ground.', stats: [1, 2, 5] },
  anvil: { id: 'anvil', name: 'ANVIL', line: 'Heavy and stubborn. Plows through, never floats.', stats: [5, 4, 1] },
  barge: { id: 'barge', name: 'BARGE', line: 'Long and steady. Stays flat when the ridge gets rude.', stats: [4, 5, 2] },
  spindle: { id: 'spindle', name: 'SPINDLE', line: 'Needle-nosed and quick. Slices the wind, spins on a coin.', stats: [2, 1, 4] },
};
export const STAT_LABELS = ['GRIP', 'STEADY', 'AIR'];

export function isUnlocked(id, bestM) { const need = UNLOCK_M[id]; return need === undefined ? false : (bestM || 0) >= need; }
export function unlockText(id, bestM) {
  const need = UNLOCK_M[id] || 0;
  if (isUnlocked(id, bestM)) return 'Unlocked';
  return 'Reach ' + String(need).replace(/\B(?=(\d{3})+$)/g, ',') + ' m in one run';
}
export function wrapIndex(i, d, n) { return (((i + d) % n) + n) % n; }
// swipe: dx = finger travel in px (right positive). Swiping left (dx<0) shows the next hull.
export function swipeDir(dx, minPx) { return Math.abs(dx) < minPx ? 0 : dx < 0 ? 1 : -1; }
// normalise a hull record from sledrig HULLS (array or object keyed by id) to {id,name,line,stats:[3]}
export function normHulls(src) {
  const list = Array.isArray(src) ? src : src ? HULL_IDS.map((id) => src[id]).filter(Boolean) : [];
  if (list.length < HULL_IDS.length) return HULL_IDS.map((id) => FALLBACK_HULLS[id]);
  return list.map((h) => {
    const s = h.stats;
    const arr = Array.isArray(s) ? s.slice(0, 3) : s ? Object.values(s).slice(0, 3) : FALLBACK_HULLS[h.id].stats;
    return { id: h.id, name: String(h.name || h.id).toUpperCase(), line: h.line || '', stats: arr.map((v) => Math.max(0, Math.min(5, Math.round(v)))) };
  });
}

// shared single <style id="b4-frontdoor">; each part appends its block once
export function ensureStyle(doc, key, css) {
  if (!doc || !doc.head) return null;
  let st = doc.getElementById('b4-frontdoor');
  if (!st) { st = doc.createElement('style'); st.id = 'b4-frontdoor'; st.textContent = ''; doc.head.appendChild(st); st.setAttribute('data-keys', ''); }
  const have = (st.getAttribute('data-keys') || '').split(',');
  if (!have.includes(key)) { st.textContent += css; st.setAttribute('data-keys', have.concat(key).filter(Boolean).join(',')); }
  return st;
}

const CSS = `
.gr{position:absolute;inset:0;pointer-events:none;z-index:30;font-family:ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#3a2350;--cream:#fff4df;--cream2:#ffe9c4;--plum:#3a2350;--coral:#ff5a4a}
.gr *{box-sizing:border-box}.gr[hidden]{display:none}
.gr-sheet{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;pointer-events:auto;touch-action:pan-y;padding:6px max(16px,env(safe-area-inset-right,0px)) calc(14px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));border-radius:26px 26px 0 0;background:linear-gradient(180deg,#fffaf0,var(--cream));box-shadow:0 -10px 30px rgba(92,46,98,.38),0 -1px 0 rgba(58,35,80,.25)}
.gr-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.gr-mid{flex:1;min-width:0;text-align:center}
.gr-name{font-size:42px;line-height:44px;font-weight:900;letter-spacing:.1em;margin:0;white-space:nowrap}
.gr-dots{display:flex;gap:9px;justify-content:center;margin-top:5px}.gr-dots i{width:9px;height:9px;border-radius:50%;background:rgba(58,35,80,.22)}
.gr-dots i.on{background:var(--coral);box-shadow:0 0 0 3px rgba(255,90,74,.25)}.gr-dots i.lk{background:rgba(58,35,80,.38)}
.gr-arrow{flex:none;width:56px;height:56px;border:0;border-radius:18px;background:var(--cream2);cursor:pointer;color:var(--plum);font-size:26px;font-weight:900;box-shadow:0 3px 0 rgba(58,35,80,.38)}
.gr-line{margin:9px 4px 8px;text-align:center;font-size:14px;line-height:18px;font-weight:700;min-height:18px}
.gr-stats{display:grid;gap:5px;margin:0 6px}.gr-st{display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:800;letter-spacing:.09em}
.gr-st b{width:80px}.gr-pips{display:flex;gap:5px;flex:1}.gr-pips i{flex:1;height:10px;border-radius:5px;background:rgba(58,35,80,.16)}
.gr-pips i.on{background:linear-gradient(180deg,#ff7a66,var(--coral))}
.gr-unl{text-align:center;margin:9px 0;font-size:13px;font-weight:800;letter-spacing:.04em;min-height:18px}.gr-unl.ok{color:#8a5a14}
.gr-go{display:block;width:100%;height:56px;border:0;border-radius:18px;font:inherit;font-size:21px;font-weight:900;letter-spacing:.12em;color:#fff;background:linear-gradient(180deg,#ff7260,var(--coral));box-shadow:0 4px 0 #b8281c}
.gr-go:disabled{background:#cdb9c9;box-shadow:0 4px 0 #9d8799;color:#f4ecf3}
.gr-back{position:absolute;left:max(12px,env(safe-area-inset-left,0px));top:calc(12px + env(safe-area-inset-top,0px));pointer-events:auto;min-width:56px;height:56px;border:0;border-radius:18px;background:var(--cream2);font:inherit;font-weight:900;color:var(--plum)}
@media (prefers-reduced-motion:reduce){.gr *{transition:none!important}}
`;

// hull = {id,name,line,stats}; bestM = best single-run distance; cbs = { onSelect(id, locked), onRide(id), onClose() }
export function createGarage(ctx, o = {}) {
  const hulls = normHulls(o.hulls);
  const cbs = o;
  let index = Math.max(0, hulls.findIndex((h) => h.id === o.start));
  let openFlag = false, bestM = o.bestM || 0, tx = null, root = null, ui = null, calls = 0;
  const doc = ctx && ctx.root && ctx.root.ownerDocument;

  const cur = () => hulls[index];
  const locked = () => !isUnlocked(cur().id, bestM);
  function paint() {
    if (!ui) return;
    const h = cur(), lk = locked();
    ui.name.textContent = h.name; ui.line.textContent = h.line;
    ui.dots.forEach((d, i) => { d.className = (i === index ? 'on' : '') + (i !== index && !isUnlocked(hulls[i].id, bestM) ? ' lk' : ''); });
    ui.pips.forEach((p, k) => [...p.children].forEach((c, i) => { c.className = i < (h.stats[k] || 0) ? 'on' : ''; }));
    ui.unl.className = 'gr-unl' + (lk ? '' : ' ok'); ui.unl.textContent = unlockText(h.id, bestM);
    ui.go.disabled = lk;
  }
  function select(i) {
    index = wrapIndex(0, i, hulls.length);
    if (cbs.onSelect) cbs.onSelect(cur().id, locked());
    paint();
  }
  function step(d) { select(wrapIndex(index, d, hulls.length)); }

  function build() {
    ensureStyle(doc, 'garage', CSS);
    root = doc.createElement('div'); root.className = 'gr'; root.hidden = true;
    const dots = hulls.map(() => '<i></i>').join('');
    const stats = STAT_LABELS.map((l) => `<div class="gr-st"><b>${l}</b><div class="gr-pips"><i></i><i></i><i></i><i></i><i></i></div></div>`).join('');
    root.innerHTML = `<button class="gr-back" data-a="back" aria-label="Back">BACK</button><div class="gr-sheet"><div class="gr-head"><button class="gr-arrow" data-d="-1" aria-label="Previous hull">&lsaquo;</button><div class="gr-mid"><h2 class="gr-name"></h2><div class="gr-dots">${dots}</div></div><button class="gr-arrow" data-d="1" aria-label="Next hull">&rsaquo;</button></div><div class="gr-line"></div><div class="gr-stats">${stats}</div><div class="gr-unl"></div><button class="gr-go" data-a="ride">RIDE THIS</button></div>`;
    ctx.root.appendChild(root);
    ui = { name: root.querySelector('.gr-name'), line: root.querySelector('.gr-line'), unl: root.querySelector('.gr-unl'), go: root.querySelector('.gr-go'), dots: [...root.querySelectorAll('.gr-dots i')], pips: [...root.querySelectorAll('.gr-pips')] };
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-d],[data-a]'); if (!b) return;
      if (b.dataset.d) step(parseInt(b.dataset.d, 10));
      else if (b.dataset.a === 'ride') { if (!locked() && cbs.onRide) cbs.onRide(cur().id); }
      else if (b.dataset.a === 'back') close();
    });
    const sheet = root.querySelector('.gr-sheet');
    sheet.addEventListener('pointerdown', (e) => { tx = e.clientX; });
    sheet.addEventListener('pointerup', (e) => { if (tx === null) return; const d = swipeDir(e.clientX - tx, kv(ctx, 'lookGarageSwipePx')); tx = null; if (d) step(d); });
    sheet.addEventListener('pointercancel', () => { tx = null; });
  }
  if (doc) build();

  function open(id, best) {
    if (typeof best === 'number') bestM = best;
    openFlag = true;
    const i = hulls.findIndex((h) => h.id === id);
    if (root) root.hidden = false;
    select(i >= 0 ? i : index);
  }
  function close() { if (!openFlag) return; openFlag = false; if (root) root.hidden = true; if (cbs.onClose) cbs.onClose(); }

  // close camera: rear three-quarter, sun side, low. Writes camera; pos = parked sled {x,y,z}, heading rad (0 = +z).
  const sc = { x: 0, y: 0, z: 0 };
  function garageCam(camera, pos, heading, groundY) {
    const s = Math.sin(heading || 0), c = Math.cos(heading || 0);
    const lx = 4.4, lz = -10.2; // sled-local offset (pulled back: whole sled + a bit of crest above the sheet)
    sc.x = pos.x + lx * c + lz * s; sc.z = pos.z - lx * s + lz * c;
    sc.y = Math.max(pos.y + 0.5, (groundY ? groundY(sc.x, sc.z) : pos.y) + 0.6);
    camera.position.set(sc.x, sc.y, sc.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(pos.x, pos.y + 0.35, pos.z);
    const fov = kv(ctx, 'lookGarageFov') + (camera.aspect < 0.8 ? 6 : 0);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // sheet covers the lower ~40%: pitch down so the sled centre sits at ~34% from the top (ndc +0.32), crest above it
    camera.rotateX(-Math.atan(0.32 * Math.tan(fov * Math.PI / 360)));
    calls++;
  }

  return {
    open, close, step, select, garageCam, hulls,
    get index() { return index; }, get isOpen() { return openFlag; }, get locked() { return locked(); }, get hullId() { return cur().id; },
    setBest(m) { bestM = m || 0; paint(); },
    update() {}, fx() {}, shift() {}, setQuality() {},
    stats() { return { open: openFlag, index, hull: cur().id, camCalls: calls }; },
    dispose() { if (root && root.parentNode) root.parentNode.removeChild(root); root = null; ui = null; },
  };
}
