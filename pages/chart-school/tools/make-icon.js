// Code-drawn Chart School icon. Usage: node tools/make-icon.js
// Writes src/icon.svg and icon-192.png, icon-512.png, icon-maskable-512.png
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const P = 60, CX = 256, SW = 12;           // pitch, centre x, stroke width
const X0 = CX - 1.5 * P;                   // column 0 centre x
const BASE = 256 + 1.25 * P;               // row 0 centre y; rows span -1.5..4 around centre
const cols = [
  { t: 'O', rows: [0, 1] },
  { t: 'X', rows: [1, 2, 3] },
  { t: 'O', rows: [2, 3] },
  { t: 'X', rows: [2, 3, 4] },
];
const cx = c => X0 + c * P, cy = r => BASE - r * P + 0 - 0;
const BLUE = '#4da3ff', ORANGE = '#ff9f43';
let g = '', m = '';
const gx0 = X0 - P * 0.5, gx1 = X0 + 3.5 * P, gy0 = cy(4) - P * 0.5, gy1 = cy(-1) + P * 0.5;
for (let i = 0; i <= 4; i++) { const x = gx0 + i * P; g += `<path d="M${x} ${gy0}V${gy1}"/>`; }
for (let i = 0; i <= 6; i++) { const y = gy0 + i * P; g += `<path d="M${gx0} ${y}H${gx1}"/>`; }
const h = P * 0.32;
cols.forEach((c, i) => c.rows.forEach(r => {
  const x = cx(i), y = cy(r);
  m += c.t === 'X'
    ? `<path d="M${x-h} ${y-h}L${x+h} ${y+h}M${x+h} ${y-h}L${x-h} ${y+h}" stroke="${BLUE}"/>`
    : `<circle cx="${x}" cy="${y}" r="${h*1.05}" stroke="${ORANGE}"/>`;
}));
// 45-degree support line, one row below each column's lowest mark
const sup = `<path d="M${cx(0)} ${cy(-1.5)}L${cx(3)} ${cy(1.5)}" stroke="#8a97b2" stroke-width="8" stroke-linecap="round"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="#0b0e14"/>
<g stroke="#1c2433" stroke-width="3" fill="none">${g}</g>
${sup}
<g fill="none" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">${m}</g>
</svg>
`;
fs.writeFileSync(path.join(root, 'src/icon.svg'), svg);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  for (const [n, s] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
    await pg.setViewportSize({ width: s, height: s });
    await pg.setContent(`<body style="margin:0;background:#0b0e14">${svg.replace('width="512" height="512"', `width="${s}" height="${s}"`)}</body>`);
    await pg.screenshot({ path: path.join(root, n) });
  }
  await b.close();
})();
