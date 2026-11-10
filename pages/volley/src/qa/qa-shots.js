// QA capture script (visual QA inspector). Usage: node src/qa/qa-shots.js
// Opens src/game.html via file://, drives window.__pv, saves PNGs + log.json to src/qa/shots/.
// Test-only cheats (noted in QA-P0.md): hero hp topped up while hunting states; hp forced low for the death shot.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SRC = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL0 = 'file://' + path.join(SRC, 'game.html');
const log = { date: new Date().toISOString(), shots: [], notes: [], console: [] };
const note = (s) => { log.notes.push(s); console.log(s); };

async function frames(page, n = 2) {
  await page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}
async function info(page) {
  return page.evaluate(() => {
    const p = window.__pv; if (!p || !p.S) return null; const S = p.S;
    return { phase: S.phase, stage: S.stage, roomId: S.roomId, frame: S.frame, hp: S.hero.hp, maxHp: S.hero.maxHp,
      hx: S.hero.x, hy: S.hero.y, braced: S.hero.braced, lockId: S.hero.lockId, lockClear: S.hero.lockClear, level: S.hero.level,
      enemies: S.enemies.map((e) => ({ id: e.id, type: e.type, st: e.st, x: e.x, y: e.y, flashT: e.flashT, hp: e.hp })),
      shots: S.shots.length, rounds: S.rounds.length, pickups: S.pickups.map((q) => ({ x: q.x, y: q.y, kind: q.kind })),
      cards: S.cards, door: S.room && S.room.door, events: (S.events || []).map((e) => e.k), renderer: p.renderer };
  });
}
async function view(page) {
  // try to find the scene view; fall back to the contract layout
  return page.evaluate(() => {
    const c = [window.__pv && window.__pv.view, window.V && window.V.view, window.V && window.V.Main && window.V.Main.view];
    for (const v of c) if (v && v.s) return { ox: v.ox, oy: v.oy, s: v.s, src: 'live' };
    const hud = document.getElementById('hud'); const st = document.getElementById('stage');
    const r = st.getBoundingClientRect(); const hh = hud ? hud.getBoundingClientRect().height : 62;
    const s = Math.min(r.width / 9, (r.height - hh) / 15);
    return { ox: r.left + (r.width - 9 * s) / 2, oy: r.top + hh, s, src: 'guess' };
  });
}
async function shot(page, name, extra) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  const i = await info(page).catch(() => null);
  log.shots.push({ name, file, info: i && { phase: i.phase, stage: i.stage, roomId: i.roomId, frame: i.frame, hp: i.hp, braced: i.braced, lockId: i.lockId, enemies: i.enemies, shots: i.shots }, extra });
  console.log('shot', name);
}
async function crop(page, name, wx, wy, wr = 2.2) {
  const v = await view(page);
  const vp = page.viewportSize();
  let x = v.ox + (wx - wr) * v.s, y = v.oy + (wy - wr) * v.s, w = 2 * wr * v.s, h = 2 * wr * v.s;
  x = Math.max(0, x); y = Math.max(0, y); w = Math.min(w, vp.width - x); h = Math.min(h, vp.height - y);
  await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x, y, width: w, height: h } });
  log.shots.push({ name, crop: true, wx, wy, view: v });
  console.log('crop', name);
}
async function step(page, n, inp) { await page.evaluate(([n, inp]) => window.__pv.step(n, inp || { mx: 0, my: 0 }), [n, inp]); }
async function heal(page) { await page.evaluate(() => { const h = window.__pv.S.hero; h.hp = h.maxHp; }); }

// step one frame at a time until pred(info) is true; returns info or null
async function until(page, pred, max = 1800, inp, keepAlive = true) {
  for (let k = 0; k < max; k++) {
    await step(page, 1, typeof inp === 'function' ? inp(await info(page)) : inp);
    if (keepAlive) await heal(page);
    const i = await info(page);
    if (pred(i)) return i;
  }
  return null;
}
// walk toward a world point; returns when close
function toward(i, tx, ty) {
  const dx = tx - i.hx, dy = ty - i.hy, d = Math.hypot(dx, dy);
  return d < 0.15 ? { mx: 0, my: 0 } : { mx: dx / d, my: dy / d };
}
const WAY = { R01: [[4.5, 1.5]], R02: [[4.5, 7.5], [4.5, 1.5]], R03: [[1.5, 9.0], [1.5, 3.5], [4.5, 1.5]] };
async function walkTo(page, tx, ty, max = 400) {
  return until(page, (i) => !i || Math.hypot(tx - i.hx, ty - i.hy) < 0.3 || i.phase === 'pick', max, (i) => toward(i, tx, ty));
}
async function clearRoom(page) {
  // stand still and let auto-fire do the work (healed); then gather pickups
  let i = await until(page, (i) => i && (i.phase !== 'play'), 3600);
  if (!i) { note('room did not clear in 60 s sim time'); return null; }
  return i;
}
async function leaveRoom(page, onPick) {
  let i = await info(page);
  const startRoom = i.roomId, startStage = i.stage;
  for (const q of i.pickups) { i = await walkTo(page, q.x, q.y, 240); if (i && i.phase === 'pick') break; }
  i = await info(page);
  if (i.phase === 'pick' && onPick) await onPick(i);
  for (const [x, y] of WAY[startRoom] || [[4.5, 1.5]]) await walkTo(page, x, y, 400);
  i = await until(page, (i) => i.stage !== startStage || i.phase === 'pick', 400, { mx: 0, my: -1 });
  i = await info(page);
  if (i.phase === 'pick' && onPick) { await onPick(i); i = await until(page, (i) => i.stage !== startStage, 400, { mx: 0, my: -1 }); }
  return info(page);
}

(async () => {
  const errs = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { log.console.push(m.type() + ': ' + m.text()); } });
  page.on('pageerror', (e) => { log.console.push('pageerror: ' + e.message); errs.push(e.message); });
  await page.goto(URL0 + '?gpu=0&seed=7&freeze=1');
  await page.waitForFunction(() => window.__pv && window.__pv.S, null, { timeout: 15000 });
  await frames(page, 10);
  const keys = await page.evaluate(() => Object.keys(window.__pv));
  note('__pv keys: ' + keys.join(','));
  note('view: ' + JSON.stringify(await view(page)));

  const tryDo = async (label, fn) => { try { await fn(); } catch (e) { note('FAIL ' + label + ': ' + e.message); } };

  // 1 R01 start
  await tryDo('r01', async () => {
    await shot(page, '01-r01-boot');
    await step(page, 45); await frames(page);
    await shot(page, '02-r01-start');
    const i = await info(page);
    await crop(page, '02c-hero', i.hx, i.hy, 1.6);
    if (i.enemies[0]) await crop(page, '02c-e01', i.enemies[0].x, i.enemies[0].y, 1.4);
    await crop(page, '02c-door', 4.5, 0.8, 2.0);
  });
  // 2 E-01 tell
  await tryDo('e01tell', async () => {
    const i = await until(page, (i) => i.enemies.some((e) => e.type === 'E-01' && e.st === 'tell'), 900);
    if (!i) return note('no E-01 tell seen');
    await frames(page); await shot(page, '03-e01-tell');
    const e = i.enemies.find((e) => e.type === 'E-01' && e.st === 'tell'); await crop(page, '03c-e01-tell', e.x, e.y, 1.4);
  });
  // 3 hero braced + lock ring
  await tryDo('lock', async () => {
    const i = await until(page, (i) => i.braced && i.lockId != null && i.lockId >= 0 && i.enemies.length, 600);
    if (!i) return note('no braced+lock seen');
    await frames(page); await shot(page, '04-hero-braced-lock');
    await crop(page, '04c-hero-braced', i.hx, i.hy, 1.4);
    const t = i.enemies.find((e) => e.id === i.lockId) || i.enemies[0]; await crop(page, '04c-lock-target', t.x, t.y, 1.4);
  });
  // 4 hit flash on enemy
  await tryDo('hitflash', async () => {
    const i = await until(page, (i) => i.enemies.some((e) => e.flashT > 0), 600);
    if (!i) return note('no enemy flashT seen');
    await shot(page, '05-enemy-hit-flash');
    const e = i.enemies.find((e) => e.flashT > 0); await crop(page, '05c-enemy-hit-flash', e.x, e.y, 1.4);
  });
  // 5 hurt edge flash (let the hero take a hit, no heal)
  await tryDo('hurt', async () => {
    const i = await until(page, (i) => i.events.includes('hurt'), 900, { mx: 0, my: -0.2 }, false);
    if (!i) return note('no hurt event seen');
    await frames(page, 1); await shot(page, '06-hurt-edge-flash');
    const fl = await page.evaluate(() => { const f = document.getElementById('flash'); return f ? f.className + ' op=' + getComputedStyle(f).opacity : 'none'; });
    note('flash element after hurt: ' + fl);
    await heal(page);
  });
  // 6 clear R01 -> door open
  let pickShot = false;
  const onPick = async (i) => {
    await frames(page, 3);
    if (!pickShot) { await shot(page, '09-card-screen'); pickShot = true; }
    await page.evaluate(() => window.__pv.pick(0)); await frames(page, 3);
  };
  await tryDo('r01clear', async () => {
    let i = await clearRoom(page);
    if (!i) return;
    if (i.phase === 'pick') await onPick(i);
    await step(page, 30); await frames(page);
    await shot(page, '07-r01-door-open');
    await crop(page, '07c-door-open', 4.5, 0.8, 2.0);
    i = await leaveRoom(page, onPick);
    note('after leaving R01: ' + JSON.stringify({ roomId: i.roomId, stage: i.stage, phase: i.phase }));
  });
  // 7 R02 E-02 aim line
  await tryDo('r02', async () => {
    await step(page, 40); await frames(page); await shot(page, '10-r02-start');
    const i = await until(page, (i) => i.enemies.some((e) => e.type === 'E-02' && e.st === 'tell'), 900);
    if (!i) return note('no E-02 tell seen');
    await frames(page, 1); await shot(page, '11-e02-aim-line');
    const e = i.enemies.find((e) => e.type === 'E-02' && e.st === 'tell'); await crop(page, '11c-e02-aim', e.x, e.y + 1, 2.4);
    const j = await until(page, (i) => i.shots > 0, 300);
    if (j) { await frames(page, 1); await shot(page, '12-enemy-shots'); const s = await page.evaluate(() => window.__pv.S.shots[0]); await crop(page, '12c-enemy-shot', s.x, s.y, 1.2); }
  });
  await tryDo('r02clear', async () => {
    let i = await clearRoom(page); if (!i) return;
    if (i.phase === 'pick') await onPick(i);
    i = await leaveRoom(page, onPick);
    note('after leaving R02: ' + JSON.stringify({ roomId: i.roomId, stage: i.stage, phase: i.phase }));
  });
  // 8 R03 E-03 fan wedge
  await tryDo('r03', async () => {
    await step(page, 40); await frames(page); await shot(page, '13-r03-start');
    const i = await until(page, (i) => i.enemies.some((e) => e.type === 'E-03' && e.st === 'tell'), 1200);
    if (!i) return note('no E-03 tell seen');
    await frames(page, 1); await shot(page, '14-e03-fan-wedge');
    const e = i.enemies.find((e) => e.type === 'E-03'); await crop(page, '14c-e03-fan', e.x, e.y + 1.5, 3.0);
    const j = await until(page, (i) => i.shots >= 3, 300);
    if (j) { await frames(page, 1); await shot(page, '15-e03-volley'); }
  });
  await tryDo('r03clear', async () => {
    let i = await clearRoom(page); if (!i) return;
    if (i.phase === 'pick') await onPick(i);
    i = await leaveRoom(page, onPick);
    note('after leaving R03: ' + JSON.stringify({ roomId: i.roomId, stage: i.stage, phase: i.phase, level: i.level }));
  });
  if (!pickShot) note('card screen never appeared in R01-R03 run');
  // 9 pause card
  await tryDo('pause', async () => {
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
    await frames(page, 3); await shot(page, '16-pause-card');
    const vis = await page.evaluate(() => { const o = document.getElementById('ovPause'); return o && o.classList.contains('on'); });
    note('pause card on after blur: ' + vis);
    if (vis) { await page.click('#btnResume').catch(() => {}); await frames(page, 3); }
  });
  // 10 tuning drawer
  await tryDo('drawer', async () => {
    await page.click('#gear'); await frames(page, 3); await shot(page, '17-tuning-drawer');
    await page.evaluate(() => { const b = document.getElementById('drBody'); if (b) b.scrollTop = b.scrollHeight; }); await frames(page, 2);
    await shot(page, '17b-tuning-drawer-bottom');
    await page.click('#drClose').catch(() => {}); await frames(page, 3);
  });
  // 11 death screen
  await tryDo('death', async () => {
    await page.evaluate(() => { window.__pv.S.hero.hp = 1; });
    const i = await until(page, (i) => i.phase === 'dead', 1800, { mx: 0, my: -0.3 }, false);
    if (!i) return note('no death reached');
    await frames(page, 5); await shot(page, '18-death-screen');
  });
  await page.close(); await ctx.close();

  // 12 other viewports
  for (const [w, h, name] of [[1104, 884, '19-wide-1104x884'], [412, 904, '20-412x904']]) {
    await tryDo(name, async () => {
      const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
      const p = await c.newPage();
      p.on('pageerror', (e) => log.console.push(name + ' pageerror: ' + e.message));
      await p.goto(URL0 + '?gpu=0&seed=7&freeze=1'); await p.waitForFunction(() => window.__pv && window.__pv.S, null, { timeout: 15000 });
      await p.evaluate(() => window.__pv.step(60, { mx: 0, my: 0 })); await frames(p, 5);
      await p.screenshot({ path: path.join(OUT, name + '.png') }); log.shots.push({ name });
      await c.close();
    });
  }
  await browser.close();

  // 13 WebGPU (swiftshader)
  await tryDo('webgpu', async () => {
    const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'] });
    const c = await b.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 2, hasTouch: true });
    const p = await c.newPage();
    p.on('console', (m) => { if (m.type() === 'error') log.console.push('gpu: ' + m.text()); });
    p.on('pageerror', (e) => log.console.push('gpu pageerror: ' + e.message));
    await p.goto(URL0 + '?seed=7&freeze=1'); await p.waitForFunction(() => window.__pv && window.__pv.S, null, { timeout: 20000 });
    await p.evaluate(() => window.__pv.step(60, { mx: 0, my: 0 })); await frames(p, 10);
    note('webgpu run renderer: ' + await p.evaluate(() => window.__pv.renderer));
    const rb = await p.evaluate(async () => { try { return await window.__pv.readback(); } catch (e) { return String(e); } });
    note('webgpu readback: ' + JSON.stringify(rb));
    await p.screenshot({ path: path.join(OUT, '21-webgpu.png') }); log.shots.push({ name: '21-webgpu' });
    await b.close();
  });

  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 1));
  console.log('console msgs:', log.console.length);
})();
