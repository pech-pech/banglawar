// GUARD preload: run an old e2e script against the live tree in CLASSIC mode.
// Use: NODE_OPTIONS="--require <abs>/tools/guard/e2e-classic-hook.cjs" node test/e2e/x.mjs
// Rewrites the served js/main.js so FLAGS.wheelMatch stays false (new games keep no matchMode key = classic, as on main).
const { execSync } = require('node:child_process');
const path = require('node:path');
let pw;
try { pw = require(require.resolve('playwright', { paths: [process.cwd()] })); } catch (e) {
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); pw = require(require.resolve('playwright', { paths: [g] }));
}
const fix = async (target) => target.route(/\/js\/main\.js(\?.*)?$/, async (route) => {
  const r = await route.fetch(); let body = await r.text();
  body = body.replace(/FLAGS\.wheelMatch\s*=\s*true/g, 'FLAGS.wheelMatch = false');
  await route.fulfill({ response: r, body });
});
const wrapBrowser = (b) => {
  const nc = b.newContext.bind(b), np = b.newPage.bind(b);
  b.newContext = async (...a) => { const c = await nc(...a); await fix(c); return c; };
  b.newPage = async (...a) => { const p = await np(...a); await fix(p.context()); return p; };
  return b;
};
for (const k of ['chromium']) {
  const t = pw[k]; const l = t.launch.bind(t);
  t.launch = async (...a) => wrapBrowser(await l(...a));
  if (t.launchPersistentContext) { const lp = t.launchPersistentContext.bind(t); t.launchPersistentContext = async (...a) => { const c = await lp(...a); await fix(c); return c; }; }
}
process.env.GUARD_CLASSIC_HOOK = '1';
