// Playwright e2e for Candle Duel. Run: node src/test/e2e.js (needs `playwright` resolvable).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); }
function freePort() { return new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(800);
  const url = 'http://127.0.0.1:' + port + '/index.html';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + port });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });

  async function playDuel(seed, opts) {
    opts = opts || {};
    await page.click('#btn-settings');
    await page.fill('#in-seed', String(seed));
    await page.click('#btn-back');
    await page.click('#btn-play');
    const ids = [];
    for (let n = 1; n <= 6; n++) {
      await page.waitForFunction(k => document.querySelector('#q-num').textContent.trim() === 'Q ' + k + '/7', n);
      await page.waitForSelector('#scr-duel.active .btn-ans:not([disabled])');
      if (n === 1 && opts.shots) { await sleep(300); await shot('duel-question'); }
      await page.click('#scr-duel .btn-ans[data-pos="' + (n % 2 ? 0 : 1) + '"]');
      if (n === 1 && opts.shots) { await sleep(300); await shot('duel-revealed'); }
      await page.waitForSelector('#btn-next', { state: 'visible' });
      if (n % 3 === 0) await page.click('#btn-next'); // manual; others auto/manual mix
      else if (await page.$('#q-fact:not(:empty)')) await page.click('#btn-next');
      else await page.waitForFunction(k => document.querySelector('#q-num').textContent.trim() !== 'Q ' + k + '/7' || document.querySelector('#scr-wager.active'), n, { timeout: 5000 });
    }
    await page.waitForSelector('#scr-wager.active');
    if (opts.shots) await shot('wager');
    await page.click('#btn-x2');
    await page.click('#btn-wager-go');
    await page.waitForFunction(() => document.querySelector('#q-num').textContent.trim() === 'Q 7/7');
    await page.waitForSelector('#scr-duel.active .btn-ans:not([disabled])');
    await page.click('#scr-duel .btn-ans[data-pos="2"]');
    await page.waitForSelector('#btn-next', { state: 'visible' });
    await page.click('#btn-next');
    await page.waitForSelector('#scr-result.active');
    await sleep(500);
    if (opts.shots) await shot('result');
  }

  await page.goto(url);
  await page.waitForSelector('#scr-home.active');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#scr-home.active');
  const NAME = 'Zorbulax';
  await page.fill('#in-name', NAME);
  await page.click('#btn-mode-book');
  await page.click('.btn-topic[data-topic="creatures"]');
  await shot('home');
  const pb = await page.evaluate(() => { const r = document.querySelector('#btn-play').getBoundingClientRect(); const sc = document.querySelector('#scr-home'); return { b: r.bottom, sh: sc.scrollHeight, ch: sc.clientHeight }; });
  ok(pb.b <= 638, 'home #btn-play bottom <= 638 (' + pb.b + ', scroll ' + pb.sh + '/' + pb.ch + ')');

  // layout checks on duel screen (use seed run)
  await playDuel(12345, { shots: true });
  const ids1 = (await page.evaluate(() => TD.tweak.lastState.log.map(l => l.id)));
  ok(ids1.length === 7, '7 questions logged');

  // report
  await page.click('#btn-report');
  await sleep(300);
  const rep = await page.evaluate(() => navigator.clipboard.readText());
  ok(/12345/.test(rep), 'report has seed');
  ok(!rep.includes(NAME), 'report lacks player name');
  const qlines = ids1.filter(id => rep.includes(id)).length;
  ok(qlines === 7, 'report has 7 question lines (' + qlines + ')');

  // XP persists
  const xp1 = await page.evaluate(() => JSON.parse(localStorage.getItem('td.save')).topicXp);
  ok(Object.values(xp1).reduce((a, b) => a + b, 0) > 0, 'xp saved ' + JSON.stringify(xp1));
  await page.reload();
  await page.waitForSelector('#scr-home.active');
  const xp2 = await page.evaluate(() => JSON.parse(localStorage.getItem('td.save')).topicXp);
  ok(JSON.stringify(xp1) === JSON.stringify(xp2), 'save persists after reload');
  ok((await page.inputValue('#in-name')) === NAME, 'name persists');

  // settings / dev badge
  await page.click('#btn-settings');
  await page.waitForSelector('#scr-settings.active');
  await shot('settings');
  ok(!(await page.isVisible('#dev-badge')), 'dev badge hidden at defaults');
  const inp = page.locator('#tweak-root input[type=number]').first();
  const old = await inp.inputValue();
  await inp.fill(String(Number(old) + 3));
  await inp.dispatchEvent('change');
  await inp.blur();
  ok(await page.isVisible('#dev-badge'), 'dev badge visible after tweak');
  await page.getByText(/reset all/i).first().click();
  ok(!(await page.isVisible('#dev-badge')), 'dev badge hidden after reset');
  await page.click('#btn-back');

  // same seed twice -> same ids (fresh memory each time)
  async function idsFor(seed) {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('td.save')); s.memory = { seen: {}, missed: {} }; localStorage.setItem('td.save', JSON.stringify(s)); });
    await page.reload(); await page.waitForSelector('#scr-home.active');
    await playDuel(seed);
    return page.evaluate(() => TD.tweak.lastState.log.map(l => l.id));
  }
  // keep rival step constant for comparability
  const a = await idsFor(777), b = await idsFor(777);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed same ids: ' + a.join(','));
  await page.reload(); await page.waitForSelector('#scr-home.active');

  // layout: duel no scroll + button heights at two viewports
  for (const vp of [{ width: 475, height: 638 }, { width: 344, height: 882 }]) {
    await page.setViewportSize(vp);
    await page.click('#btn-play');
    await page.waitForSelector('#scr-duel.active .btn-ans:not([disabled])');
    const m = await page.evaluate(() => {
      const s = document.querySelector('#scr-duel');
      return { sh: s.scrollHeight, ch: s.clientHeight, small: [...s.querySelectorAll('button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 56).map(b => b.id || b.textContent) };
    });
    ok(m.sh <= m.ch, 'duel no scroll ' + vp.width + 'x' + vp.height + ' (' + m.sh + '/' + m.ch + ')');
    ok(m.small.length === 0, 'duel buttons >=56px ' + vp.width + ' ' + m.small.join('|'));
    // also after reveal (wrong answer shows fact + next)
    await page.evaluate(() => { const D = 0; });
    const wrongPos = await page.evaluate(() => { const c = document.querySelectorAll('#scr-duel .btn-ans'); return 0; });
    await page.click('#scr-duel .btn-ans[data-pos="0"]');
    await page.waitForSelector('#btn-next', { state: 'visible' });
    const m2 = await page.evaluate(() => {
      const s = document.querySelector('#scr-duel');
      return { sh: s.scrollHeight, ch: s.clientHeight, small: [...s.querySelectorAll('button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 56).map(b => b.id || b.textContent) };
    });
    ok(m2.sh <= m2.ch, 'revealed no scroll ' + vp.width + 'x' + vp.height + ' (' + m2.sh + '/' + m2.ch + ')');
    ok(m2.small.length === 0, 'revealed buttons >=56px ' + m2.small.join('|'));
    await page.reload(); await page.waitForSelector('#scr-home.active');
  }

  ok(errs.length === 0, 'no console errors ' + errs.join(' || '));
  await browser.close(); srv.kill();
  console.log(fails ? 'FAILED ' + fails : 'ALL GREEN');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
