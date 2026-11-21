// Ridgeline look C "Cut-Paper Pop": data only. LOOK_BASE = snow; THEME_LOOKS = per-theme overrides in the same key shapes.
// Source: sandbox-C/render.js LOOK_C + THEME-LOOK-DATA.md "C:" blocks. Contract: build/CONTRACT-C.md (slice L1).
// Rules: scenery colours sit 60+ RGB units from each theme's rock / gate / gateNext; dark ground (jurassic, geode) gets no
// tint lighter than groundHigh. lookFor() is a SHALLOW merge: a theme overrides a nested object whole, never one field of it.

export const LOOK_BASE = {
  name: 'Cut-Paper Pop', paper: true,
  // t = elevation / 90 deg. 4 hard bands (equal t on two stops = seam), compressed because portrait framing sees about 0-25 deg of sky.
  sky: [[0, '#fbf0d9'], [0.025, '#fbf0d9'], [0.025, '#a9d2ee'], [0.05, '#a9d2ee'], [0.05, '#6fa3e0'], [0.075, '#6fa3e0'], [0.075, '#3b6fc4'], [1, '#3b6fc4']],
  sun: { dir: [0.02, -0.03, 0.99], color: '#fff8e1', size: 10, ringColor: '#bcdcf6', rings: [{ deg: 16, alpha: 0.50 }, { deg: 22, alpha: 0.32 }] },
  ranges: [
    { paper: true, seed: 11, r: 270, dy: -52, base: -70, peak: 60, top: '#8fb4dc', edge: '#ffffff', edgeH: 1.0 },
    { paper: true, seed: 23, r: 250, dy: -50, base: -70, peak: 40, top: '#6d94c8', edge: '#ffffff', edgeH: 1.0 },
    { paper: true, seed: 37, r: 230, dy: -48, base: -70, peak: 24, top: '#5d84bc', edge: '#ffffff', edgeH: 1.0 },
  ],
  // C light pack: ONE sun. light.dir points toward the sun (matches sun.dir azimuth); drives ground / bank two-tone, toon lights and cast shadows.
  light: { dir: [0.3, 0.42, 0.86], color: '#fff0d0' },
  litTint: '#fdfaf0', groundShade: null, // warm lit paper, cool shade seams on drift lee sides
  shadow: { col: '#86a7da', len: 1.5 },                                  // flat projected paper shadows (trees, rocks, gates, sled)
  rim: { col: '#fff3cf', w: 0.78, minSun: 0.15 },                         // hard rim strip on sled, trees, gates
  midRange: { seed: 61, r: 165, dy: -47, base: -70, peak: 18, edge: '#ffffff', par: 0.7, k: 0.9 },
  clouds: { n: 7, lit: '#ffffff', shade: '#cfe0f2', elMin: 0.004, elMax: 0.026 },
  fogColor: '#e9f1f6', fogMul: 0.6, fogSteps: 4,
  shadeTint: '#c3d8ee', bandMul: 1, edgeBlend: 0.001,
  bankLit: '#f1f2ee', bankShade: '#92b4e4', litThreshold: 0.3,
  contour: { every: 1.5, frac: 0.12, dark: 0.04 },
  // A "Paper ground": hard drift layers (tones cycle), shadow strip on the lower layer, lit lip on each cut, carved edge groove
  ground: { period: 1.1, tones: ['#ffffff', '#f0f6fc', '#e4eff9'], seam: '#9dbde3', lip: '#ffffff', key: '#7a9fd0', tufts: 1, groove: { col: '#a3c0e4', w: 0.14 } },
  poles: { w: 0.07, h: 1.3, col: '#24406e', band: '#ffffff', bandH: 0.25, every: 20, pennant: true, cols: ['#1f6fd0', '#ffffff'] },
  blob: { col: '#8fb0dc', alpha: 0.6, edge: 0.92, off: [0.27, 0.13], tree: 1.2, rock: 1.3, foot: 0.5, sledW: 1.7, sledL: 3.0 },
  stripe: null,
  gate: { chevrons: false, pulse: 0, pennants: true },
  flakes: { n: 90, size: 0.3, nLow: 45 },
  streaks: { n: 8, minSpeed: 24, nLow: 10, taper: true, w: 0.09, len: 5 },
  trail: '#3b6fc4', trailCore: '#35e0ff', trailAlt: '#ffffff', chunky: true, trailInterval: 1 / 100, spray: '#ffffff',
  outline: '#33456b', rockOutline: '#2a3d66', rockColor: 0x2a2e34,
  suit: '#24406e', suitC: '#3a68b8', wing: '#f4f7fb',
  outlineK: 1.08, rockK: 1.16, sledScale: 1.15, sledOutline: 0.055, helm: 1.5, hullRough: 0.5,
  sledC: null, // null = theme sled / sledGlow
  vignette: 'radial-gradient(ellipse at 50% 45%, rgba(36,64,110,0) 55%, rgba(36,64,110,0.10) 100%)',
  hudCss: true,
};

// ---- builders (keep every theme in the tuned LOOK_BASE geometry; only colours and flags change) ----
// horizon -> zenith, same seam heights as snow so all 4 bands stay in the portrait frame
const bands = (c0, c1, c2, c3) => [[0, c0], [0.025, c0], [0.025, c1], [0.05, c1], [0.05, c2], [0.075, c2], [0.075, c3], [1, c3]];
const sun = (color, ringColor) => ({ ...LOOK_BASE.sun, color, ringColor });
// far, mid, near tops + paper-cut edge colour; flags = { stepped:true } (blocky) or { brush:true } (ink)
const ranges = (tops, edge, flags) => LOOK_BASE.ranges.map((r, i) => ({ ...r, top: tops[i], edge, ...(flags || {}) }));
const poles = (col, trim) => ({ ...LOOK_BASE.poles, col, band: trim, cols: [col, trim] });
const blob = (col, alpha) => ({ ...LOOK_BASE.blob, col, alpha });
const vig = (r, g, b, a) => `radial-gradient(ellipse at 50% 45%, rgba(${r},${g},${b},0) 55%, rgba(${r},${g},${b},${a.toFixed(2)}) 100%)`;

export const THEME_LOOKS = {
  snow: {},

  // Sugar Summit: gumdrops the only dark shapes; banks mint in both tones; teal poles; red/orange on gates only.
  candy: {
    sky: bands('#fff6da', '#ffd3e8', '#f3a8d6', '#b48ae0'),
    sun: sun('#fffbe6', '#ffe9f4'),
    ranges: ranges(['#f0a6cc', '#d77fb5', '#c0629f'], '#ffffff'),
    fogColor: '#fff6da',
    bankLit: '#8fe0cf', bankShade: '#63cdb6',
    poles: poles('#0f7f70', '#ffffff'),
    blob: blob('#c77aa6', 0.6),
    trail: '#ffffff', trailCore: '#ffe600', spray: '#ffffff',
    outline: '#8a3a78', rockOutline: '#b06aa0', rockColor: null,
    suitC: '#0e5f6e', wing: '#fff7e8',
    vignette: vig(138, 47, 102, 0.10),
  },

  // Fern Caldera (DARK ground): pale amber haze kept; bones stay the lightest course objects; plain ridges.
  // If M picks dusk: swap sky stop 0 + fogColor to '#8a6a4a'.
  jurassic: {
    sky: bands('#ecca94', '#d8b486', '#b3977f', '#77808a'),
    sun: sun('#ffd596', '#f0cf96'),
    ranges: ranges(['#8f9a66', '#5f7044', '#45562f'], '#c9cf9c'),
    fogColor: '#ecca94',
    bankLit: '#2a3d1f', bankShade: '#223218',
    poles: poles('#b0b3e0', '#2a3d1f'),
    blob: blob('#152010', 0.7),
    trail: '#c4dc9c', trailCore: '#ff4fd8', spray: '#c4dc9c',
    outline: '#1c2a14', rockOutline: '#8a7a52', rockColor: null,
    suitC: '#2f6f8f', wing: '#a8ecf5',
    vignette: vig(28, 20, 8, 0.10),
  },

  // Block Peak: stepped mesas, flat colour per face; plum cubes darkest on cream.
  blocky: {
    sky: bands('#fff0c9', '#f9c08f', '#e59a8d', '#8a86c9'),
    sun: sun('#fff5d6', '#ffe2b4'),
    ranges: ranges(['#dc9f84', '#b8736a', '#9a5a5c'], '#fff6dc', { stepped: true }),
    fogColor: '#fff0c9',
    contour: { every: 1.5, frac: 0.12, dark: 0 }, // QA fix1: stepped terrain already bands the sand; no contour lines on top
    bankLit: '#2a9d8f', bankShade: '#1e8478',
    poles: poles('#2f5f73', '#ffffff'),
    blob: blob('#b8a878', 0.45),
    trail: '#fff8e6', trailCore: '#7dffb0', spray: '#fff8e6',
    outline: '#17525e', rockOutline: '#8a6a9a', rockColor: null,
    suitC: '#1f6f7a', wing: '#fff8e6',
    vignette: vig(90, 42, 58, 0.10),
  },

  // Cloudcrest: ranges are pale cloud banks, never slate; hazards the one dark value.
  cloud: {
    sky: bands('#fdf2dc', '#b9daf6', '#74aef0', '#3a74d0'),
    sun: sun('#fff8e1', '#d6e9fb'),
    ranges: ranges(['#d9e8ff', '#b3cdf6', '#a3c2f4'], '#ffffff'),
    fogColor: '#fdf2dc', fogMul: 0.3, // QA fix1: theme fog is 1.6x, so thin it until the next gate reads
    flakes: { n: 12, nLow: 6 }, // fewer mist puffs (size left to the theme)
    bankLit: '#9cbdee', bankShade: '#8fb4f0',
    poles: poles('#2f6fd0', '#ffffff'),
    blob: blob('#6f8fc8', 0.6),
    trail: '#ffffff', trailCore: '#ffe14a', spray: '#ffffff',
    outline: '#2f4f9a', rockOutline: '#7f9fe0', rockColor: null,
    suitC: '#0f6f7f', wing: '#fffbe8',
    vignette: vig(27, 58, 122, 0.10),
  },

  // Inkfall point of difference under C: brush-edge ranges, grey-wash keylines (not black), only hazards pure black,
  // red on gates only (no red / orange / blue in sky, sun or trail), sled glow moved off orange to ink-blue via sledC.
  ink: { trailW: 0.13,
    sky: bands('#f7f1e1', '#f4eddb', '#efe7d2', '#e9e0c8'),
    sun: sun('#ddd2b6', '#ebe2ca'),
    ranges: ranges(['#d9d3c2', '#c6c0ae', '#b1ab99'], '#f7f1e1', { brush: true }),
    fogColor: '#f7f1e1',
    flakes: { n: 40, size: 0.08, nLow: 20 }, // QA fix1: few tiny specks, not smudges
    bankLit: '#cdc2a2', bankShade: '#bbb08f',
    poles: poles('#5f5f58', '#f7f1e1'),
    blob: blob('#6f6a5c', 0.6),
    trail: '#d6cdb4', trailCore: '#8f8a7c', spray: '#b8b2a0',
    outline: '#77736a', rockOutline: '#8f8c84', rockColor: null,
    suitC: '#55554f', wing: '#f7f1e1',
    sledC: { sled: 0x1b3a8c, glow: 0x4f7fe0 },
    vignette: vig(58, 52, 38, 0.10),
  },

  // Longlight Haze (sunset dunes, look type 2): soft:true switches on the smooth-gradient pipeline (see render.js SOFT).
  // Sun dead ahead and low; everything backlit; cool colours belong to the gates only.
  dune: { soft: { lit: '#ffb070', shade: '#8a4a72', bank: '#5c2e62', bankRim: '#ff9a5c', haze: '#ffb070', rim: 0.85, ripple: 0.07, hollow: 0.28 },
    name: 'Longlight Haze',
    // 5 un-doubled stops (smooth). t = elevation / 90 deg
    sky: [[0, '#ffd27a'], [0.03, '#ff9a5c'], [0.07, '#e0607a'], [0.14, '#6b3f8f'], [1, '#3a2f6a']],
    sun: { dir: [0, -0.02, 1], color: '#fff6d8', size: 12, glow: 58, glowAlpha: 0.42, soft: true, ringColor: '#ffc46a', rings: [{ deg: 14, alpha: 0.35 }, { deg: 26, alpha: 0.15 }] },
    // far / mid / near tops; each fades to the haze colour at its base; crest rim = thin warm glow
    ranges: [
      { dune: true, seed: 11, r: 270, dy: -16, base: -70, peak: 22, top: '#e88a6a', fade: '#ffb070', rim: '#ffd89a', rimH: 0.6, fadeH: 30, towers: 7, soften: 0.55 },
      { dune: true, seed: 23, r: 250, dy: -32, base: -70, peak: 34, top: '#a8527a', fade: '#ffb070', rim: '#ffcf8a', rimH: 0.8, fadeH: 26 },
      { dune: true, seed: 37, r: 230, dy: -44, base: -70, peak: 38, top: '#5a2f66', fade: '#ffb070', rim: '#ffcf8a', rimH: 0.7, fadeH: 22 },
    ],
    midRange: null,
    light: { dir: [0, 0.12, 0.99], color: '#ffc890' },
    litTint: '#ffffff', groundShade: null,
    shadow: { col: '#5c2e62', len: 2.6, soft: true, alpha: 0.62 },
    rim: { col: '#ffcf8a', w: 0.72, minSun: 0.05 },
    clouds: { streak: true, n: 3, seed: 7, lit: '#ffb070', shade: '#e0607a', elMin: 0.17, elMax: 0.3 },
    fogColor: '#ffb070', fogMul: 0.6, fogSteps: 0,
    bankLit: '#ff9a5c', bankShade: '#5c2e62',
    contour: { every: 1.5, frac: 0.12, dark: 0 },
    ground: null, tufts: 0,
    poles: { w: 0.07, h: 1.5, col: '#3a2350', band: '#ff9a5c', bandH: 0.25, every: 20, pennant: true, cols: ['#ff9a5c', '#ffd27a'] },
    blob: null,
    gate: { chevrons: false, pulse: 0.5, pennants: true },
    flakes: { n: 40, size: 0.16, nLow: 20 },
    streaks: { n: 6, minSpeed: 24, nLow: 6, taper: true, w: 0.07, len: 5, col: '#ffe2a8' },
    trail: '#ffd27a', trailTo: '#e0607a', trailCore: '#ffd890', chunky: false, trailW: 0.2, trailInterval: 1 / 55, spray: '#ffe2a8',
    outline: '#160d22', rockOutline: '#160d22', rockColor: null,
    suitC: '#ff5a4a', scarf: '#ff5a4a', wing: '#fff3dc',
    outlineK: 1, rockK: 1, sledScale: 1.15, sledOutline: 0, helm: 1.5, hullRough: 0.7,
    hudCss: { bg: '#fff3dc', ink: '#3a2f6a', accent: '#c8452f', knob: '#ff5a4a' },
    vignette: vig(58, 30, 70, 0.30),
  },

  // Night Geode (DARK ground): the "sun" is a violet moon; ranges, caps, poles, trail violet and dimmer than the ice hazards.
  geode: {
    sky: bands('#33206e', '#22155a', '#160c3c', '#0b0620'),
    sun: { ...sun('#8f7ad6', '#4a3a9a'), dir: [-0.2, -0.05, 0.98], size: 7 }, // QA fix1: dimmer, smaller moon moved off the gate line
    ranges: ranges(['#3d2c8a', '#281a60', '#1c1248'], '#6a54c8'),
    fogColor: '#33206e',
    bankLit: '#0d0820', bankShade: '#080414',
    poles: poles('#8a6cf0', '#1c1440'),
    blob: blob('#04020c', 0.7),
    trail: '#c4b0ff', trailCore: '#38ffd0', spray: '#a996ff',
    outline: '#0b0620', rockOutline: '#6a54c8', rockColor: null,
    suitC: '#6f63b0', wing: '#b9a4ff',
    vignette: vig(0, 0, 8, 0.10),
  },
};

export function lookFor(themeId) { return { ...LOOK_BASE, ...(THEME_LOOKS[themeId] || {}) }; }
