// Renders lantern/awning icons with Playwright. Run: node pages/bad-trade-bazaar/tools/make-icons.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const req = createRequire(import.meta.url);
let pw;
for (const id of ['playwright', 'playwright-core', ...(process.env.NODE_PATH || '').split(':').filter(Boolean).map(d => d + '/playwright')]) { try { pw = req(id); break; } catch {} }
if (!pw) { const { execSync } = await import('node:child_process'); pw = req(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
<defs>
<radialGradient id="g" cx="50%" cy="54%" r="50%"><stop offset="0" stop-color="#ffb23e" stop-opacity=".75"/><stop offset=".55" stop-color="#e0702a" stop-opacity=".25"/><stop offset="1" stop-color="#1a0f0a" stop-opacity="0"/></radialGradient>
<linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#f08a2c"/></linearGradient>
</defs>
<rect width="512" height="512" fill="#1a0f0a"/>
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
<circle cx="256" cy="290" r="230" fill="url(#g)"/>
<path d="M96 120 H416 L440 190 H72 Z" fill="#b8321f"/>
<path d="M72 190 q23 30 46 0 q23 30 46 0 q23 30 46 0 q23 30 46 0 q23 30 46 0 q23 30 46 0 q23 30 46 0 q23 30 46 0 Z" fill="#f3e2c0"/>
<path d="M96 120 h64 l-14 70 h-74 Z M224 120 h64 l-6 70 h-52 Z M352 120 h64 l24 70 h-74 Z" fill="#f3e2c0" opacity=".9"/>
<line x1="256" y1="190" x2="256" y2="232" stroke="#6b4a2e" stroke-width="8"/>
<rect x="226" y="228" width="60" height="12" rx="4" fill="#6b4a2e"/>
<path d="M236 240 h40 q34 36 34 76 q0 50 -54 62 q-54 -12 -54 -62 q0 -40 34 -76 Z" fill="url(#l)" stroke="#6b4a2e" stroke-width="6"/>
<path d="M256 262 q22 30 0 64 q-22 -34 0 -64 Z" fill="#fff3c8"/>
<rect x="232" y="376" width="48" height="14" rx="5" fill="#6b4a2e"/>
</g></svg>`;
const jobs = [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.72]];
const b = await chromium.launch();
for (const [f, s, sc] of jobs) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<body style="margin:0;background:#1a0f0a;width:${s}px;height:${s}px;overflow:hidden">${svg(sc)}</body>`);
  await p.screenshot({ path: path.join(dir, f) });
  await p.close();
  console.log('wrote', f);
}
await b.close();
