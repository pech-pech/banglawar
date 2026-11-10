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
  i = await until(page, (i) => i.phase === 'pick', 90);
  if (i && onPick) await onPick(i);
  i = await info(page);
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

  // opportunistic capture: each target shot once, checked every frame
  const done = {};
  const T = [
    ['03-e01-tell', (i) => i.enemies.find((e) => e.type === 'E-01' && e.st === 'tell'), 1.4],
    ['11-e02-aim-line', (i) => i.enemies.find((e) => e.type === 'E-02' && e.st === 'tell'), 2.6],
    ['14-e03-fan-wedge', (i) => i.enemies.find((e) => e.type === 'E-03' && e.st === 'tell'), 3.2],
    ['12-enemy-shots', (i) => (i.shots > 0 ? 'shot' : null), 1.2],
    ['15-e03-volley', (i) => (i.shots >= 3 && i.enemies.some((e) => e.type === 'E-03') ? 'shot' : null), 2.5],
    ['04-hero-braced-lock', (i) => (i.braced && i.lockId != null && i.lockClear ? i.enemies.find((e) => e.id === i.lockId) : null), 1.4],
    ['04b-lock-blocked-amber', (i) => (i.braced && i.lockId != null && !i.lockClear ? i.enemies.find((e) => e.id === i.lockId) : null), 1.4],
    ['05-enemy-hit-flash', (i) => i.enemies.find((e) => e.flashT > 0.05), 1.4],
    ['06-hurt-edge-flash', (i) => (i.events.includes('hurt') ? 'hero' : null), 1.6],
  ];
  async function check(i) {
    for (const [name, f, r] of T) {
      if (done[name]) continue;
      const hit = f(i); if (!hit) continue;
      done[name] = true; await frames(page, 1); await shot(page, name);
      if (hit === 'shot') { const s = await page.evaluate(() => window.__pv.S.shots[0]); if (s) await crop(page, name + 'c', s.x, s.y, r); }
      else if (hit === 'hero') { await crop(page, name + 'c', i.hx, i.hy, r); const fl = await page.evaluate(() => { const f = document.getElementById('flash'); return f.className + ' op=' + getComputedStyle(f).opacity; }); note('flash el at hurt: ' + fl); }
      else { await crop(page, name + 'c', hit.x, hit.y + (r > 2 ? r * 0.5 : 0), r); await crop(page, name + 'c-hero', i.hx, i.hy, 1.4); }
    }
  }
  let pickShot = false;
  const onPick = async () => {
    await frames(page, 3);
    if (!pickShot) { await shot(page, '09-card-screen'); pickShot = true; }
    await page.evaluate(() => window.__pv.pick(0)); await frames(page, 3);
  };
  async function playRoom(tag) {
    let i = await info(page);
    await step(page, 45); await frames(page); await shot(page, tag + '-start');
    i = await info(page);
    await crop(page, tag + '-start-c-hero', i.hx, i.hy, 1.6);
    for (const e of i.enemies) { await crop(page, tag + '-start-c-' + e.type + '-' + e.id, e.x, e.y, 1.3); }
    // A: strafe (no fire) so machines tell and shoot
    for (let k = 0; k < 420 && i.phase === 'play'; k++) {
      const dir = Math.floor(k / 40) % 2 ? 1 : -1;
      await step(page, 1, { mx: dir, my: 0 }); if (!done['06-hurt-edge-flash'] && k > 200) {} else await heal(page);
      i = await info(page); await check(i);
    }
    await heal(page);
    // B: stand braced and clear
    for (let k = 0; k < 3600 && i.phase === 'play'; k++) { await step(page, 1); await heal(page); i = await info(page); await check(i); }
    if (i.phase === 'play') { note(tag + ': room did not clear'); return false; }
    if (i.phase === 'pick') await onPick();
    await step(page, 30); await frames(page); await shot(page, tag + '-door-open'); await crop(page, tag + '-door-open-c', 4.5, 0.8, 2.0);
    i = await leaveRoom(page, onPick);
    note('after ' + tag + ': ' + JSON.stringify({ roomId: i.roomId, stage: i.stage, phase: i.phase, level: i.level }));
    return true;
  }
  await tryDo('boot', async () => { await shot(page, '01-r01-boot'); });
  await tryDo('R01', () => playRoom('02-r01'));
  await tryDo('R02', () => playRoom('10-r02'));
  await tryDo('R03', () => playRoom('13-r03'));
  await tryDo('R01b', async () => { await step(page, 45); await frames(page); await shot(page, '13z-r01-lap2-start'); });
  for (const [n] of T) if (!done[n]) note('NOT captured: ' + n);
  if (!pickShot) note('card screen never appeared in R01-R03 run');
  // 9 pause card
  await tryDo('pause', async () => {
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
    await frames(page, 3); await shot(page, '16-pause-card');
    const vis = await page.evaluate(() => { const o = document.getElementById('ovPause'); return o && o.classList.contains('on'); });
    note('pause card on after blur: ' + vis);
    await page.evaluate(() => window.__pv.resume()); await frames(page, 3);
  });
  // 10 tuning drawer
  await tryDo('drawer', async () => {
    await page.tap('#gear').catch(async (e) => { note('gear tap failed: ' + e.message.split('\n')[0]); await page.evaluate(() => window.__pv.drawer(true)); }); await frames(page, 3); await shot(page, '17-tuning-drawer');
    await page.evaluate(() => { const b = document.getElementById('drBody'); if (b) b.scrollTop = b.scrollHeight; }); await frames(page, 2);
    await shot(page, '17b-tuning-drawer-bottom');
    await page.evaluate(() => window.__pv.drawer(false)); await frames(page, 3);
  });
  // 11 death screen
  await tryDo('death', async () => {
    await page.evaluate(() => { window.__pv.S.hero.hp = 1; });
    const i = await until(page, (i) => i.phase === 'dead', 1800, (i) => { const e = i.enemies[0]; return e ? toward(i, e.x, e.y) : { mx: 0, my: -1 }; }, false);
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
    note('webgpu run renderer: ' + await p.evaluate(() => window.__pv.renderer + ' why=' + window.__pv.rendererWhy + ' gpu=' + !!navigator.gpu));
    const rb = await p.evaluate(async () => { try { return await window.__pv.readback(); } catch (e) { return String(e); } });
    note('webgpu readback: ' + JSON.stringify(rb));
    await p.screenshot({ path: path.join(OUT, '21-webgpu.png') }); log.shots.push({ name: '21-webgpu' });
    await b.close();
  });

  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 1));
  console.log('console msgs:', log.console.length);
})();
