/* wheel-look: shared look helpers for the Wheel meta UI (wheel-view, workshop-view, tierup-card). Pure, no DOM at import time.
   Cosmetics only: nothing here changes a number. Colours are colour-blind safe by use: every slice also carries its number. */
import { WHEEL_ENGINE } from '../data/wheel-engine.js';
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
const BEAD_MAX = 8;
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
    if (sel) s += '<line class="wk-sel" x1="' + cx + '" y1="' + cy + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="var(--gold, #d2b357)" stroke-width="7"/>'; // the open branch: a gold bar behind the spoke
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="var(--outline, #2a2238)" stroke-width="' + (sel ? 3.4 : 2) + '"/>';
    if (b && b.total > BEAD_MAX) { // too many to read as beads at this size: one "3/12" tag
      const lx = cx + Math.cos(a) * 27, ly = cy + Math.sin(a) * 27, tx = b.on + '/' + b.total;
      s += '<rect x="' + (lx - 11).toFixed(1) + '" y="' + (ly - 5.5).toFixed(1) + '" width="22" height="11" fill="var(--cream, #f3ebd3)" stroke="var(--outline, #2a2238)" stroke-width="1.2"/><text x="' + lx.toFixed(1) + '" y="' + (ly + 3.4).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--outline, #2a2238)" font-family="inherit">' + tx + '</text>';
    } else if (b && b.total > 0) {
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

/** A real slice wheel as SVG (the tier-up card art): ten slices, the rim in the tier material, studs from tier 2, bars on the hub, a gem cap at Crystal.
 *  o = { mat, bars, size, plain? } plain = a first wheel with no material yet (unpainted: no rim colour, no studs). Cosmetic only. */
const SLICE_VALS = [5, 2, 1, 3, 1, 1, 3, 1, 1, 2];
export function sliceWheelSvg(o) {
  const m = matOf(o.mat), plain = !!o.plain, size = o.size || 120, n = SLICE_VALS.length, cx = 50, cy = 50, R = 46, bars = Math.max(3, o.bars || 4), fu = Math.max(9, 1400 / size) /* >= 14 px rendered; below 100 px the +v text is dropped (shape only) */, crystal = o.mat === 'crystal' && !plain;
  const fill = (v) => (v === 5 ? 'var(--gold, #d2b357)' : v === 3 ? 'var(--accent, #22625d)' : v === 2 ? 'var(--grass2, #7eb261)' : 'var(--wall1, #e3d8b9)');
  const pt = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const rim = plain ? [196, 186, 160] : m.rim, edge = plain ? [90, 84, 72] : m.edge;
  let s = '<svg class="wk-wheel wk-slicewheel" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><circle cx="50" cy="50" r="' + R + '" fill="var(--outline, #2a2238)"/>';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i - 0.5) * TAU10, a1 = a0 + TAU10, [x0, y0] = pt(a0, R - 6), [x1, y1] = pt(a1, R - 6), v = SLICE_VALS[i], am = (a0 + a1) / 2, [tx, ty] = pt(am, 28);
    s += '<path d="M50 50L' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'A' + (R - 6) + ' ' + (R - 6) + ' 0 0 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'Z" fill="' + fill(v) + '" stroke="var(--outline, #2a2238)" stroke-width="1"/>' +
      (size < 100 ? '' : '<text x="' + tx.toFixed(1) + '" y="' + (ty + fu * 0.38).toFixed(1) + '" text-anchor="middle" font-size="' + fu.toFixed(1) + '" font-weight="700" font-family="inherit" fill="' + (v === 3 ? '#fff' : 'var(--outline, #2a2238)') + '">+' + v + '</text>');
  }
  s += '<circle cx="50" cy="50" r="' + (R - 2) + '" fill="none" stroke="' + rgb(rim) + '" stroke-width="6" class="wk-rim"/><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="' + rgb(edge) + '" stroke-width="1.6"/><circle cx="50" cy="50" r="' + (R - 5.2) + '" fill="none" stroke="' + rgb(edge) + '" stroke-width="1"/>';
  if (!plain && o.mat !== 'wood') for (let i = 0; i < 16; i++) { const [sx, sy] = pt(i / 16 * TAU, R - 2); s += '<rect class="wk-stud" x="' + (sx - 1.3).toFixed(1) + '" y="' + (sy - 1.3).toFixed(1) + '" width="2.6" height="2.6" fill="' + rgb(m.stud) + '"/>'; }
  s += '<circle cx="50" cy="50" r="13" fill="var(--outline, #2a2238)"/>';
  for (let k = 0; k < bars; k++) { const [bx, by] = pt(-Math.PI / 2 + k / bars * TAU + 0.2, 11); s += '<line x1="50" y1="50" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) + '" stroke="' + rgb(plain ? [150, 140, 120] : m.rim) + '" stroke-width="' + (bars > 8 ? 1.4 : 2.2) + '"/>'; }
  s += crystal ? '<path d="M50 44L56 50L50 56L44 50Z" fill="#fff" stroke="' + rgb(m.rim) + '" stroke-width="1.4"/>' : '<circle cx="50" cy="50" r="3.4" fill="' + rgb(plain ? [150, 140, 120] : m.stud) + '" stroke="var(--outline, #2a2238)" stroke-width="1"/>';
  return s + '</svg>';
}
const TAU = Math.PI * 2, TAU10 = TAU / 10;

/* ---- A2.2: look helpers for the pulse wheels (pure, cosmetic; SPEC 2f, 14 tests 8 and 12). ---- */
/** STOP glow window in cycle seconds (WHEEL_ENGINE.GLOW). Time only: no slice, tier or ring changes it. */
export const GLOW_WINDOW = WHEEL_ENGINE.GLOW;
/** An under-7% slice (rim units: 0.7 of 10) prints one character or a signed number. */
export const LABEL_MIN_W = 0.7;
/** true while the STOP glow is lit: tInCycle in [3.2, 3.8] (both ends in). Same for any slice at AIM. */
export function glowOn(tInCycle) {
  const t = +tInCycle;
  return t >= GLOW_WINDOW[0] && t <= GLOW_WINDOW[1];
}
/** Draw spec for the AIM marker: a gold up-pointing triangle with an ink outline and the word AIM (shape + text, never colour alone).
 *  Coordinates are in a 100-unit box, tip pointing down at the wheel from above the rim. */
export function aimMarker(o) {
  const size = (o && o.size) || 100, k = size / 100;
  const pts = [[38, 0], [62, 0], [50, 22]].map((p) => Object.freeze([+(p[0] * k).toFixed(2), +(p[1] * k).toFixed(2)]));
  return Object.freeze({
    shape: 'triangle-down', points: Object.freeze(pts), fill: 'var(--gold, #d2b357)', stroke: 'var(--outline, #2a2238)', strokeW: 2.5,
    text: 'AIM', fontPx: 14, bold: true, textHalo: 2.5, textX: 50 * k, textY: 36 * k,
  });
}
const LEAD_NUM = /^[x×]?\s*([+\-−]?\d+(?:\.\d+)?)(?![\d.])/i;
/** The text a slice prints. w >= 0.7: the row label. w < 0.7: exactly one character, or a signed number ("+2", "1.2"). */
export function sliceLabel(row) {
  const r = row || {}, raw = r.label == null ? '' : String(r.label).trim();
  if (!(r.w < LABEL_MIN_W)) return raw;
  const m = LEAD_NUM.exec(raw);
  if (m) return m[1];
  const ch = Array.from(raw)[0];
  if (ch) return ch;
  return typeof r.value === 'number' ? String(r.value) : '?';
}
/** The one printed text of a slice row outside the wheel face (readout, result chip): the renderer's chosen short name when it set one (Scout cards), else the row label + sub. */
export function rowText(row) {
  const r = row || {}; if (r.short != null && r.short !== '') return String(r.short);
  return String(r.label == null ? r.value : r.label) + (r.sub != null && String(r.sub).trim() ? ' ' + String(r.sub).trim() : '');
}
/** Legend rows [{ch, text}] for every under-7% slice of a ring, one per distinct slice meaning (SPEC 2f).
 *  Same printed character + same text = one row. Same character with different text = both listed, never merged. */
export function legendRows(ring) {
  const out = [], seen = new Set();
  for (const r of Array.isArray(ring) ? ring : []) {
    if (!r || !(r.w < LABEL_MIN_W)) continue;
    const ch = sliceLabel(r);
    const text = String(r.legend || r.name || (r.label != null && String(r.label).trim()) || (typeof r.value === 'number' ? 'value ' + r.value : ch));
    const key = ch + '\u0000' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(Object.freeze({ ch, text }));
  }
  return out;
}
const SAND = [226, 208, 160], PALE_SAND = [240, 232, 206], TIER_GREEN = [126, 178, 97];
const TIER_SHAPES = {
  top: Object.freeze({ tier: 'top', shape: 'triangle-up', colour: TIER_GREEN, name: 'high' }),
  mid: Object.freeze({ tier: 'mid', shape: 'dot', colour: SAND, name: 'middle' }),
  low: Object.freeze({ tier: 'low', shape: 'dot', colour: PALE_SAND, name: 'lowest' }),
};
/** Tier mark: top = green up-triangle, mid = sand dot, low = pale sand dot (a quiet "fine", never rose). Shape differs from colour alone. */
export function tierShape(tier) { return TIER_SHAPES[tier] || TIER_SHAPES.mid; }

/* ---- QA fixes (T3 QA D4 / D5, T1 QA D2 / D3): radial slice labels and drawn tier marks. Pure. ---- */
/** Tier mark drawn on every ring slice (SPEC 2f, mockups): gold and top = dark green up-triangle, mid = sand dot, low = pale sand dot. Always upright on screen. */
const MARKS = {
  top: Object.freeze({ shape: 'triangle-up', fill: Object.freeze([63, 143, 58]) }),
  mid: Object.freeze({ shape: 'dot', fill: Object.freeze([205, 181, 114]) }),
  low: Object.freeze({ shape: 'dot', fill: Object.freeze([255, 250, 240]) }),
};
export function tierMark(tier, gold) { return gold ? MARKS.top : MARKS[tier] || MARKS.mid; }
/** Slices narrower than this (radians, 10 degrees) may drop the tier mark when they carry a letter (SPEC 2f). */
export const MARK_MIN_RAD = Math.PI / 18;
/** The ways a label may be set: one line, then two lines (split at ", " if any, else at the space nearest the middle). */
export function labelLines(text) {
  const t = String(text == null ? '' : text).trim(), out = [[t]];
  const c = t.indexOf(', ');
  if (c > 0) { out.push([t.slice(0, c + 1), t.slice(c + 2)]); return out; }
  const sp = [...t.matchAll(/ /g)].map((m) => m.index);
  if (sp.length) { const k = sp.reduce((a, b) => (Math.abs(b - t.length / 2) < Math.abs(a - t.length / 2) ? b : a)); out.push([t.slice(0, k), t.slice(k + 1)]); }
  return out;
}
/** Fit a radial label in its slice (T3 QA D4 option A): the text runs along the slice centre line, between rIn (hub) and rOut (inside the tier mark).
 *  half = half the slice angle (radians). measure(lines, f) -> {w, h} in px. Largest font from fMax down to fMin, one line before two at the same font.
 *  The text box (h across) must fit between the slice edges at its inner end: r0 * sin(half) >= h / 2 + pad.
 *  Returns {f, lines, rc} (rc = radius of the text box centre, kept at rPref when that fits) or null (too long: print sliceLabel + a legend row). */
export function radialFit(o) {
  const { text, half, rIn, rOut, measure } = o, fMax = o.fMax || 18, fMin = o.fMin || 12, pad = o.pad == null ? 2 : o.pad;
  const sa = Math.sin(Math.min(Math.max(half, 1e-6), Math.PI / 2)), ways = Array.isArray(o.ways) && o.ways.length ? o.ways : labelLines(text); // o.ways: the caller's own line sets, tried in order
  for (let f = fMax; f >= fMin; f--) for (const lines of ways) {
    const m = measure(lines, f), r0 = Math.max(rIn, (m.h / 2 + pad) / sa);
    if (r0 + m.w <= rOut) { const lo = r0 + m.w / 2, hi = rOut - m.w / 2, p = o.rPref == null ? lo : o.rPref; return { f, lines, rc: Math.max(lo, Math.min(hi, p)) }; }
  }
  return null;
}
/** Text rotation (radians) for a radial label whose centre sits at canvas angle a (0 = right, y down): along the radius, never upside down. */
export function radialTurn(a) { return Math.cos(a) >= -1e-9 ? a : a + Math.PI; }
/** Legend chip words a host may pass for a tier shape (T4 QA 2: never print them as text); -> the shape key, or '' for a real character. */
const SHAPE_WORDS = { tri: 'top', triangle: 'top', top: 'top', 'triangle-up': 'top', dot: 'mid', mid: 'mid', pale: 'low', low: 'low', gold: 'gold' };
export function legendShape(ch) { return SHAPE_WORDS[String(ch == null ? '' : ch).trim().toLowerCase()] || ''; }
/** A Scout-style card on a ring row ({grade|g, name|n, focus|ic}) -> {grade, name (6 letters, then a dot), focus} or null. Unknown fields are ignored. */
export function cardOf(row) {
  const c = row && row.card; if (!c || typeof c !== 'object') return null;
  const grade = String(c.grade != null ? c.grade : c.g != null ? c.g : '').trim(), full = String(c.name != null ? c.name : c.n != null ? c.n : '').trim(), focus = String(c.focus != null ? c.focus : c.ic != null ? c.ic : c.icon != null ? c.icon : '').trim().toLowerCase();
  return { grade, name: Array.from(full).length > 7 ? Array.from(full).slice(0, 6).join('') + '.' : full, focus };
}
/** Legend rows: the given rows, then one per under-7% slice and per slice in `narrow` (its label did not fit, so it prints one character). One row per meaning. */
export function legendWith(ring, narrow, given) {
  const rows = legendRows((Array.isArray(ring) ? ring : []).map((r, i) => (narrow && narrow[i] && r ? { ...r, w: 0 } : r)));
  const out = [], seen = new Set(), g = Array.isArray(given) ? given : [], gch = new Set(g.map((r) => String(r.ch)));
  for (const r of [...g, ...rows.filter((r) => !gch.has(String(r.ch)))]) { const k = String(r.ch) + '\u0000' + String(r.text); if (seen.has(k)) continue; seen.add(k); out.push(r); } // a host row wins over the automatic row for the same character
  return out;
}

/* ---- T8 helper A: Boost chip text, tier key row, short names ("Maxi..") for names that do not fit a slice. Pure. ---- */
/** Boost chip words: a multiplier unit ('x') prints value then x with a plus ("Hot Streak +0.667x"); any other unit prints as before ("Booster +1"). */
export function boostText(word, plus, by) {
  const n = String(by == null || by === '' ? 1 : by).replace(/^\+/, ''), p = typeof plus === 'string' && plus ? plus : '+';
  return /^[x\u00d7]$/i.test(p) ? word + ' +' + n + 'x' : word + ' ' + p + n;
}
/** Tier key rows [{ch, text}] (shape + word per tier) for the tiers a ring uses; ch is a shape word legendShape() draws. A host legend that already has shape rows replaces it. */
export function tierKeyRows(ring, given) {
  if (Array.isArray(given) && given.some((r) => r && legendShape(r.ch))) return [];
  const rows = Array.isArray(ring) ? ring.filter(Boolean) : [], has = (t) => rows.some((r) => !r.gold && r.tier === t), out = [];
  if (has('top')) out.push(Object.freeze({ ch: 'tri', text: 'high' }));
  if (has('mid')) out.push(Object.freeze({ ch: 'dot', text: 'middle' }));
  if (has('low')) out.push(Object.freeze({ ch: 'pale', text: 'lowest' }));
  if (rows.some((r) => r.gold)) out.push(Object.freeze({ ch: 'gold', text: 'gold' }));
  return out;
}
const NAME_VAL = /^(.*\S)\s+([+\-\u2212]?\d[\d.,]*\s*%?)$/;
/** "Maximilian +5%" -> {name:'Maximilian', val:'+5%'}; no trailing number -> {name:text, val:''}. */
export function splitNameValue(text) { const t = String(text == null ? '' : text).trim(), m = NAME_VAL.exec(t); return m ? { name: m[1], val: m[2] } : { name: t, val: '' }; }
/** Fewest letters (>= 3, <= the name) that tell each name apart from every other different name by its first letters (case blind). */
export function uniquePrefixLens(names, min) {
  const ns = (names || []).map((n) => Array.from(String(n == null ? '' : n).trim().toLowerCase())), lo = min == null ? 3 : min;
  return ns.map((a, i) => { let k = Math.min(lo, a.length); for (; k < a.length; k++) { if (!ns.some((b, j) => j !== i && b.join('') !== a.join('') && b.slice(0, k).join('') === a.slice(0, k).join(''))) break; } return k; });
}
/** Short forms of a slice name, longest first, all upright one-liners that end in ".." ("Maxi.. +5%", then "Maxi.." without the value). Never fewer than minK letters (default 3). */
export function shortNameForms(text, minK) {
  const { name, val } = splitNameValue(text), cs = Array.from(name), lo = Math.max(3, minK || 3), out = [];
  for (const withVal of val ? [true, false] : [false]) for (let k = cs.length - 1; k >= lo; k--) out.push(cs.slice(0, k).join('').replace(/[\s\-]+$/, '') + '..' + (withVal ? ' ' + val : ''));
  return out;
}
