/* wheel-look: shared look helpers for the Wheel meta UI (wheel-view, workshop-view, tierup-card). Pure, no DOM at import time.
   Cosmetics only: nothing here changes a number. Colours are colour-blind safe by use: every slice also carries its number. */
export const MATERIALS = ['wood', 'brass', 'steel', 'silver', 'gold', 'star', 'crystal'];
export const MAT_NAME = { wood: 'Wooden', brass: 'Brass', steel: 'Steel', silver: 'Silver', gold: 'Gold', star: 'Star', crystal: 'Crystal' };
/** rim colour, dark edge, stud colour per material (pixel-style flat tones) */
export const MAT = {
  wood: { rim: [158, 108, 62], edge: [92, 58, 32], stud: [212, 176, 110] },
  brass: { rim: [205, 160, 58], edge: [122, 88, 24], stud: [245, 220, 140] },
  steel: { rim: [140, 152, 164], edge: [66, 76, 88], stud: [210, 220, 232] },
  silver: { rim: [214, 220, 230], edge: [96, 106, 122], stud: [120, 170, 235] },
  gold: { rim: [240, 196, 52], edge: [140, 98, 12], stud: [255, 240, 170] },
  star: { rim: [248, 214, 84], edge: [150, 104, 20], stud: [255, 255, 255] },
  crystal: { rim: [128, 222, 238], edge: [24, 100, 130], stud: [255, 255, 255] },
};
export const matOf = (id) => MAT[id] || MAT.wood;
export const rgb = (c) => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
/** Named colours a craft look may use (plus any #hex / rgb()). */
const NAMED = { red: [200, 60, 60], orange: [230, 140, 40], yellow: [240, 210, 70], green: [70, 160, 90], teal: [40, 140, 140], blue: [60, 100, 190], purple: [130, 80, 170], pink: [230, 120, 160], white: [250, 250, 250], black: [30, 26, 40], cyan: [110, 215, 235], cream: [243, 235, 211], gold: [210, 179, 87] };
/** A colour value -> [r,g,b] or null. */
export function colourOf(v) {
  if (v == null || v === '') return null;
  if (Array.isArray(v) && v.length >= 3) return [+v[0], +v[1], +v[2]];
  const s = String(v).trim().toLowerCase();
  if (NAMED[s]) return NAMED[s].slice();
  let m = /^#([0-9a-f]{6})$/.exec(s); if (m) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16));
  m = /^#([0-9a-f]{3})$/.exec(s); if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
  m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(s); if (m) return [+m[1], +m[2], +m[3]];
  return null;
}
/** Slice palettes by name. 'cvd' = colour-blind safe (Okabe-Ito blue / orange family, never red against green). low = +1 slices, then +2, +3, +4 and up. */
export const PALETTES = {
  cvd: { low: [236, 226, 196], 2: [86, 180, 233], 3: [0, 114, 178], 4: [213, 94, 0] },
  mint: { low: [226, 238, 226], 2: [150, 206, 170], 3: [40, 130, 110], 4: [60, 90, 160] },
  dusk: { low: [236, 226, 214], 2: [196, 170, 214], 3: [110, 84, 160], 4: [60, 70, 130] },
};
export const SPOKE_SHAPES = ['plain', 'round', 'blade', 'diamond'];
/** Small spoke (currency) icon as inline SVG: a wheel with four spokes. */
export function spokeIcon(px) {
  const n = px || 20;
  return '<svg class="wk-spk-ico" width="' + n + '" height="' + n + '" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
    '<circle cx="8" cy="8" r="6.5" fill="var(--gold, #d2b357)" stroke="var(--outline, #2a2238)" stroke-width="1.6"/>' +
    '<path d="M8 3v10M3 8h10M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8" stroke="var(--outline, #2a2238)" stroke-width="1"/><circle cx="8" cy="8" r="1.8" fill="var(--cream, #f3ebd3)" stroke="var(--outline, #2a2238)" stroke-width="1"/></svg>';
}
/** A wheel front view as SVG. o = { mat, spokes:number (drawn spokes), beads?:[{on,total,sel}] per spoke, size, hub?:string }. */
export function wheelSvg(o) {
  const m = matOf(o.mat), n = Math.max(3, o.spokes || 4), size = o.size || 120, cx = 50, cy = 50, R = 46;
  let s = '<svg class="wk-wheel" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
    '<circle cx="50" cy="50" r="' + R + '" fill="var(--cream, #f3ebd3)" stroke="' + rgb(m.edge) + '" stroke-width="2"/>' +
    '<circle cx="50" cy="50" r="' + (R - 2) + '" fill="none" stroke="' + rgb(m.rim) + '" stroke-width="6" class="wk-rim"/>' +
    '<circle cx="50" cy="50" r="' + (R - 5.5) + '" fill="none" stroke="' + rgb(m.edge) + '" stroke-width="1"/>';
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; s += '<rect x="' + (cx + Math.cos(a) * (R - 2) - 1.2).toFixed(1) + '" y="' + (cy + Math.sin(a) * (R - 2) - 1.2).toFixed(1) + '" width="2.4" height="2.4" fill="' + rgb(m.stud) + '"/>'; }
  for (let k = 0; k < n; k++) {
    const a = (o.angles ? o.angles[k] : -Math.PI / 2 + k / n * Math.PI * 2), b = o.beads && o.beads[k], sel = b && b.sel;
    const x2 = cx + Math.cos(a) * (R - 7), y2 = cy + Math.sin(a) * (R - 7);
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="var(--outline, #2a2238)" stroke-width="' + (sel ? 3.4 : 2) + '"/>';
    if (b && b.total > 0) {
      const t = Math.min(b.total, 24), r0 = 12, r1 = R - 9, step = (r1 - r0) / Math.max(1, t - 1), rr = Math.max(1.2, Math.min(2.8, step * 0.42));
      for (let j = 0; j < t; j++) {
        const rr0 = t === 1 ? (r0 + r1) / 2 : r0 + step * j, px = cx + Math.cos(a) * rr0, py = cy + Math.sin(a) * rr0, on = j < b.on;
        s += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + rr.toFixed(1) + '" fill="' + (on ? 'var(--gold, #d2b357)' : 'var(--cream, #f3ebd3)') + '" stroke="var(--outline, #2a2238)" stroke-width="0.9"/>';
      }
    }
  }
  s += '<circle cx="50" cy="50" r="8" fill="var(--outline, #2a2238)"/><circle cx="50" cy="50" r="4.4" fill="' + (o.hub || 'var(--cream, #f3ebd3)') + '"/></svg>';
  return s;
}

/** Craft ranks (numbers from craftLook: 0 = not owned) -> the look the wheel draws. Strings / colours given directly pass through, so a look may also be written in words.
 *  Colour-blind note: only the slice palette changes meaning-carrying colours, and every slice also prints its number. */
const RANK = {
  rim: [null, 'blue', 'orange', 'purple'], hub: [null, 'red', 'teal', 'purple'], ptr: [null, 'red', 'blue', 'purple'], trail: [null, 'yellow', 'cyan'],
  pal: [null, 'cvd', 'mint'], spoke: [null, 'round', 'diamond'], burst: [null, 'star', 'ring'], stand: [null, 'wood', 'steel'],
};
export function normLook(l) {
  if (!l || typeof l !== 'object') return null;
  const o = { material: l.material || '', crystal: !!l.crystal };
  for (const k of Object.keys(RANK)) { const v = l[k]; o[k] = typeof v === 'number' ? (RANK[k][Math.max(0, Math.min(RANK[k].length - 1, v))] || '') : (v || ''); }
  o.name = l.name === true ? 'My Wheel' : typeof l.name === 'string' ? l.name : '';
  return o;
}
