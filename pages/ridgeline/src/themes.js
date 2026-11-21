// Ridgeline themes: data only. Look rules live in games-design/ridgeline/THEMES.md.
// Every theme fills every key. Colours are 0xRRGGBB; uiAccent is a CSS hex string.

export const DEFAULT_THEME = 'dune';

export const THEME_ORDER = ['snow', 'candy', 'jurassic', 'blocky', 'cloud', 'ink', 'dune', 'geode'];

export const THEMES = {
  snow: {
    name: 'Ridgeline',
    sky: 0xcfe6f5,
    fogDensity: 1.0,
    groundLow: 0xdcebf7, groundHigh: 0xffffff,
    bank: 0xa9c4dc,
    rock: 0x2b3440, treeTrunk: 0x5a4030, treeLeaf: 0x1f5c3a,
    gate: 0xe85d00, gateNext: 0xc2185b,
    sled: 0xd81e3a, sledGlow: 0x35e0ff, boostFlare: 0xfff2a8,
    sun: 0xfff4e0, sunIntensity: 1.1, hemiSky: 0xdff1ff, hemiGround: 0x8fa3b8, hemiIntensity: 0.7,
    treeShape: 'cone',
    rockShape: 'boulder',
    terrainStep: 0,
    flatShading: true,
    outline: false,
    particles: 'snow',
    uiAccent: '#ff8a3d'
  },

  candy: {
    name: 'Sugar Summit',
    sky: 0xffd9ec,
    fogDensity: 0.9,
    groundLow: 0xffc2dd, groundHigh: 0xfff0f6,
    bank: 0x8fe0cf,
    rock: 0x4a1259, treeTrunk: 0xfff7e8, treeLeaf: 0x1fa890,
    gate: 0xd94100, gateNext: 0xb8002e,
    sled: 0x1557d6, sledGlow: 0xffe600, boostFlare: 0xffffff,
    sun: 0xfff0e6, sunIntensity: 1.0, hemiSky: 0xffe6f2, hemiGround: 0xd98ab0, hemiIntensity: 0.85,
    treeShape: 'lollipop',
    rockShape: 'gumdrop',
    terrainStep: 0,
    flatShading: false,
    outline: false,
    particles: 'sprinkles',
    uiAccent: '#ff5fa8'
  },

  jurassic: {
    name: 'Fern Caldera',
    sky: 0xe8c9a0,
    fogDensity: 1.4,
    groundLow: 0x3f5a2a, groundHigh: 0x5f7333,
    bank: 0x2a3d1f,
    rock: 0xf6efd9, treeTrunk: 0x4a3524, treeLeaf: 0x1e4d2b,
    gate: 0xffa51f, gateNext: 0xfff04a,
    sled: 0x39e6ff, sledGlow: 0xff4fd8, boostFlare: 0xffd27a,
    sun: 0xffc98a, sunIntensity: 1.2, hemiSky: 0xf2d6ac, hemiGround: 0x3a2c1c, hemiIntensity: 0.6,
    treeShape: 'fern',
    rockShape: 'bone',
    terrainStep: 0,
    flatShading: true,
    outline: false,
    particles: 'spores',
    uiAccent: '#ffb347'
  },

  blocky: {
    name: 'Block Peak',
    sky: 0xf4b98a,
    fogDensity: 0.8,
    groundLow: 0xe9d8a6, groundHigh: 0xf7edc9,
    bank: 0x2a9d8f,
    rock: 0x3d1e4f, treeTrunk: 0x264653, treeLeaf: 0xe76f51,
    gate: 0xd9480f, gateNext: 0xc2006b,
    sled: 0x1d3fd8, sledGlow: 0x7dffb0, boostFlare: 0xfff3b0,
    sun: 0xffe2b8, sunIntensity: 1.15, hemiSky: 0xffd9b0, hemiGround: 0x7a5a6a, hemiIntensity: 0.7,
    treeShape: 'cube',
    rockShape: 'cube',
    terrainStep: 1,
    flatShading: true,
    outline: false,
    particles: 'none',
    uiAccent: '#2ec4b6'
  },

  cloud: {
    name: 'Cloudcrest',
    sky: 0x7fb8f0,
    fogDensity: 1.6,
    groundLow: 0xe8f1ff, groundHigh: 0xffffff,
    bank: 0x9cbdee,
    rock: 0x39415e, treeTrunk: 0xd7e3f7, treeLeaf: 0xffb3d1,
    gate: 0xe85d00, gateNext: 0xc81d11,
    sled: 0xc2185b, sledGlow: 0xffe14a, boostFlare: 0xffffff,
    sun: 0xfffbe8, sunIntensity: 1.0, hemiSky: 0xcfe6ff, hemiGround: 0x9db8e0, hemiIntensity: 0.9,
    treeShape: 'puff',
    rockShape: 'cloud',
    terrainStep: 0,
    flatShading: false,
    outline: false,
    particles: 'mist',
    uiAccent: '#8fd0ff'
  },

  ink: {
    name: 'Inkfall',
    sky: 0xf2ead8,
    fogDensity: 1.2,
    groundLow: 0xe6dcc4, groundHigh: 0xf7f1e1,
    bank: 0xb5a885,
    rock: 0x111111, treeTrunk: 0x4a4a46, treeLeaf: 0x7a7a72,
    gate: 0xd9480f, gateNext: 0xc81d11,
    sled: 0x1b3a8c, sledGlow: 0xe8590c, boostFlare: 0x111111,
    sun: 0xffffff, sunIntensity: 0.8, hemiSky: 0xffffff, hemiGround: 0xd8ceb8, hemiIntensity: 1.0,
    treeShape: 'brush',
    rockShape: 'blot',
    terrainStep: 0,
    flatShading: true,
    outline: true,
    particles: 'ink',
    uiAccent: '#f2ead8'
  },

  dune: {
    name: 'Sunset Dunes',
    sky: 0xffb070,
    fogDensity: 1.0,
    groundLow: 0x000000, groundHigh: 0xffffff, // soft look reads vertex red as hollow-to-crest height
    bank: 0x5c2e62,
    rock: 0x160d22, treeTrunk: 0x4a2a5a, treeLeaf: 0x4a2a5a,
    // gateNext colours the gate the player must hit next (render.js isNext): it takes the brightest cool tone
    gate: 0x8f9bff, gateNext: 0x3dfff0,
    sled: 0xf6efff, sledGlow: 0xffd27a, boostFlare: 0xffb050,
    sun: 0xffc890, sunIntensity: 1.0, hemiSky: 0x6b3f8f, hemiGround: 0xffb070, hemiIntensity: 0.9,
    treeShape: 'windharp',
    rockShape: 'boulder',
    terrainStep: 0,
    flatShading: true,
    outline: false,
    particles: 'dust',
    uiAccent: '#ff9a5c'
  },

  geode: {
    name: 'Night Geode',
    sky: 0x120a2a,
    fogDensity: 1.1,
    groundLow: 0x1c1440, groundHigh: 0x2e2466,
    bank: 0x0d0820,
    rock: 0xbff6ff, treeTrunk: 0x1a1a3a, treeLeaf: 0x5b3fc4,
    gate: 0xff8a1f, gateNext: 0xffe45c,
    sled: 0xb6ff3a, sledGlow: 0x38ffd0, boostFlare: 0xffffff,
    sun: 0xcfd8ff, sunIntensity: 0.9, hemiSky: 0x8f7bff, hemiGround: 0x241a4a, hemiIntensity: 1.0,
    treeShape: 'crystal',
    rockShape: 'crystal',
    terrainStep: 0,
    flatShading: true,
    outline: false,
    particles: 'embers',
    uiAccent: '#b6ff3a'
  }
};
