// ui.js: Starfall game flow (join-beta slice B). Owns the DOM canvas, the loop, the screen machine, pointer + key
// routing, settings, the Tweak screen, audio/VFX wiring and the Copy report. Pixels: draw.js draws the play field
// (PL.draw), PL.Screens (screens.js + uikit.js) draws every HUD, pad, card and menu; text from PL.Strings only.
// Journey: firstOpen ("Tap to start", unlocks audio) -> tutorial on first run (Skip shown) / menu -> shaftPick
// (Short 5 / Long 7 / Daily 5, own bests) -> play (death tag + killer outline, room clear card, star wipe) ->
// shaftComplete (medal) ; Pause (Resume / Retry room / Settings / Leave + confirm) ; Settings -> Tweak.
// Contract with draw.js (PL.draw(ctx, view, frame, state, hud)): draw.js draws the play field only (its paper HUD runs
// only with hud.legacyHud). draw.js owns PL.Vfx init/resize/setRoom/update (fed hud.events = all sim events this
// frame), quality (hud.quality) and reduced motion (hud.reduced). ui.js calls PL.Vfx.wipe/fire/drawOverlay/setShakeScale.
const PL = (globalThis.PL = globalThis.PL || {});
(function () {
  'use strict';
  const BUILD = 'starfall-beta-3 (2026-11-20)';
  const C = PL.C, U = PL.UI, SC = PL.Screens, S = PL.Strings.player, SD = PL.Strings.dev, TW = PL.Tweak;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const DIRN = ['up', 'right', 'down', 'left'];
  const nowMs = () => performance.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- one source of pad rects: PL.Screens asks PL.Input.layout (camera.js uses the same box) ----------
  if (PL.Input && PL.Input.layout && SC) {
    SC.padRects = function (w, h, left) {
      const L = PL.Input.layout(w, h, { hand: left ? 'left' : 'right' });
      return { box: L.box, up: L.keys[0], right: L.keys[1], down: L.keys[2], left: L.keys[3], dive: L.dive,
        retry: L.retry, pause: L.pause, teach: L.teach, mode: L.mode };
    };
  }

  // ---------- settings (versioned key, never downgraded) ----------
  const SKEY = 'plumbline.settings.v1', SVER = 1;
  const settings = { music: 1, sounds: 1, mute: false, motion: false, textIdx: 0, qualityIdx: 0, tutorialDone: false };
  let settingsRO = false;
  (function loadSettings() {
    const st = PL.store;
    const r = st ? st.load(SKEY, SVER) : { data: null, readOnly: false };
    settingsRO = !!r.readOnly;
    const d = r.data;
    if (d) {
      if (typeof d.music === 'number') settings.music = clamp(d.music, 0, 1);
      if (typeof d.sounds === 'number') settings.sounds = clamp(d.sounds, 0, 1);
      for (const k of ['mute', 'motion', 'tutorialDone']) if (typeof d[k] === 'boolean') settings[k] = d[k];
      if (d.textIdx === 0 || d.textIdx === 1 || d.textIdx === 2) settings.textIdx = d.textIdx;
      if (d.qualityIdx === 0 || d.qualityIdx === 1 || d.qualityIdx === 2) settings.qualityIdx = d.qualityIdx;
    } else {
      // migrate from the alpha build: old mute key, and a saved tutorial best means the tutorial was played
      try { settings.mute = localStorage.getItem('plumbline.mute') === '1'; } catch (_) {}
      try { const o = JSON.parse(localStorage.getItem('plumbline.v1') || '{}'); settings.tutorialDone = Object.keys(o || {}).some((k) => /^tutorial:/.test(k)); } catch (_) {}
    }
  })();
  function saveSettings() { if (PL.store && !settingsRO) PL.store.save(SKEY, SVER, Object.assign({}, settings)); }
  const TEXT_SCALE = [1, 1.15, 1.3], QUALITY = ['auto', 'full', 'lite'];
  const reducedNow = () => settings.motion || !!(mq && mq.matches);

  // ---------- Tweak ids owned by this slice: audio + visual (defaults from the audio plan / vfx.js) ----------
  if (TW) {
    const reg = (id, d) => { if (!TW.has(id)) TW.register(id, d); };
    reg('AUD_MUSIC_ON', { group: 'Audio', label: 'Music on (1/0)', def: 1, min: 0, max: 1, step: 1 });
    reg('AUD_MUSIC_GAIN', { group: 'Audio', label: 'Music gain', def: 0.5, min: 0, max: 1, step: 0.05 });
    reg('SFX_GAIN', { group: 'Audio', label: 'Sound gain', def: 0.8, min: 0, max: 1, step: 0.05 });
    reg('AUD_DUCK_DB', { group: 'Audio', label: 'Music duck dB', def: 8, min: 0, max: 18, step: 1 });
    reg('AUD_XFADE_S', { group: 'Audio', label: 'Music crossfade s', def: 1.5, min: 0.2, max: 4, step: 0.1 });
    reg('AUD_PITCH_VAR', { group: 'Audio', label: 'Sound pitch spread', def: 0.04, min: 0, max: 0.06, step: 0.01 });
    // quality override is draw.js's FX_QUALITY (group Look, 0 = follow the player's Picture setting); not duplicated here
    reg('VFX_SHAKE', { group: 'Visual', label: 'Shake amount', def: 1, min: 0, max: 1, step: 0.1 });
    // registered only when vfx.js grows the setter (no dead sliders)
    const V = PL.Vfx || {};
    if (typeof V.setBloom === 'function') reg('VFX_BLOOM', { group: 'Visual', label: 'Bloom', def: 1, min: 0, max: 1, step: 0.1 });
    if (typeof V.setParticleScale === 'function') reg('VFX_PARTICLES', { group: 'Visual', label: 'Particles', def: 1, min: 0, max: 1, step: 0.1 });
    if (typeof V.setAuroraSpeed === 'function') reg('VFX_AURORA', { group: 'Visual', label: 'Aurora speed', def: 1, min: 0, max: 3, step: 0.1 });
  }
  const tw = (id, d) => { const v = TW && TW.get(id); return v === undefined ? d : v; };

  // ---------- audio + vfx application ----------
  let musicOnNow = null, moment = undefined;
  function applyAudio() {
    const A = PL.audio; if (!A) return;
    try {
      A.setMuted(settings.mute);
      const on = tw('AUD_MUSIC_ON', 1) >= 1;
      if (on !== musicOnNow) { musicOnNow = on; A.setMusicOn(on); if (on && moment) { const m = moment; moment = undefined; setMusic(m); } }
      A.setMusicGain(settings.music * tw('AUD_MUSIC_GAIN', 0.5));
      A.setSfxGain(settings.sounds * tw('SFX_GAIN', 0.8));
      if (A.setDuckDb) A.setDuckDb(tw('AUD_DUCK_DB', 8));
      if (A.setPitchVar) A.setPitchVar(tw('AUD_PITCH_VAR', 0.04));
      if (PL.music && PL.music.setXfade) PL.music.setXfade(tw('AUD_XFADE_S', 1.5));
      if (A.setVibration) A.setVibration(PL.Input ? PL.Input.getVibrate() : true);
    } catch (_) {}
  }
  // quality + reduced motion reach PL.Vfx through draw.js (hud.quality / hud.reduced; draw.js owns init/update/setRoom)
  const vfxQuality = () => { const f = tw('FX_QUALITY', 0) | 0; return f > 0 ? ['auto', 'full', 'lite', 'off'][Math.min(3, f)] : QUALITY[settings.qualityIdx]; };
  function applyVfx() {
    const V = PL.Vfx; if (!V) return;
    try {
      if (V.setShakeScale) V.setShakeScale(tw('VFX_SHAKE', 1));
      if (V.setBloom) V.setBloom(tw('VFX_BLOOM', 1));
      if (V.setParticleScale) V.setParticleScale(tw('VFX_PARTICLES', 1));
      if (V.setAuroraSpeed) V.setAuroraSpeed(tw('VFX_AURORA', 1));
    } catch (_) {}
  }
  function setMusic(m) {
    if (m === moment) return;
    moment = m;
    if (PL.audio && PL.audio.playMusic) { try { PL.audio.playMusic(m); } catch (_) {} }
  }
  function sfx(name) { if (PL.audio && PL.audio.onEvents) { try { PL.audio.onEvents([name], state || {}); } catch (_) {} } }
  function unlockAudio() { if (PL.audio && PL.audio.unlock) { try { PL.audio.unlock(); } catch (_) {} } }
  if (TW && TW.onChange) TW.onChange((id) => { if (/^(AUD_|SFX_)/.test(id)) applyAudio(); if (/^(VFX_|FX_)/.test(id)) applyVfx(); });
  if (mq && mq.addEventListener) mq.addEventListener('change', applyVfx);

  // ---------- viewport ----------
  const view = { W: 0, H: 0, dpr: 1, inset: { t: 0, b: 0, l: 0, r: 0 } };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const vfxReady = !!PL.Vfx; // draw.js calls PL.Vfx.init lazily; wipe/fire/drawOverlay are no-ops until then
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // Fold: cap 2 (PL.Vfx.dprFor rule for full quality)
    const W = Math.max(1, Math.round(window.innerWidth)), H = Math.max(1, Math.round(window.innerHeight));
    const cs = getComputedStyle(probe);
    view.W = W; view.H = H; view.dpr = dpr;
    view.inset = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  let domOverlay = null;
  const resizeSafe = () => { if (!domOverlay) resize(); };
  window.addEventListener('resize', resizeSafe);
  window.addEventListener('orientationchange', resizeSafe);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeSafe);
  resize();
  applyAudio(); applyVfx();

  // ---------- art ----------
  let artDone = false;
  if (PL.Assets && PL.Assets.load) { try { PL.Assets.load().then(() => { artDone = true; }, () => { artDone = true; }); } catch (_) { artDone = true; } }
  const artMissing = () => { try { return artDone && PL.Assets ? PL.Assets.missing() : []; } catch (_) { return []; } };

  // ---------- run state ----------
  let urlSeed = null;
  { const m = /[?&]seed=(-?\d+)/.exec(location.search); if (m) urlSeed = parseInt(m[1], 10) | 0; }
  let scr = 'firstOpen';       // firstOpen menu shaftPick play pause settings tweak shaftComplete confirm
  let settingsFrom = 'menu', pauseConfirm = false, pickSel = 0;
  let mode = 'tutorial', seed = 1, rooms = null, roomIdx = 0, state = null, cam = null, cur = null;
  let attempts = [], cleared = [], inputLog = [], queue = [], totalTicks = 0, deaths = 0, flipsTotal = 0, runTuned = false;
  let clearInfo = null, complete = null, death = null, causeRun = { kind: '', n: 0 }, retryAt = -1e9, frameEvents = [];
  let trailBuf = [], fx = [], toast = null, lastFrame = null;
  let wiping = false, wipeGuard = 0, pops = [], popMoves = -1; // room wipe lock (input + sim paused), screen-space ripples/sparks/confetti
  let pipPop = 0; // 0 = idle; 0.001 when a move pip is gained, then grows to 1 over 0.22 s and returns to 0 (vm.pop)
  let tutP = {}, roomDeaths = {}, aidRooms = {}, nudge = false, nudgeAt = 0, nudgeShown = {}; // teach progress, 5-death nudge, per-room aim arc
  let fpsFrames = 0, fpsSecs = 0;
  const avgFps = () => (fpsSecs > 0 ? fpsFrames / fpsSecs : 0);
  const curFlips = () => flipsTotal + (cur && !cur.result && state ? state.flips : 0);
  const isTut = () => mode === 'tutorial' || mode === 'practice';
  const MODES = { short: 5, long: 7, daily: 5, tutorial: 3, practice: 3 };
  function dailySeed() { return PL.meta && PL.meta.dailySeed ? PL.meta.dailySeed() : 20261119; }
  function bestKey(m) { const n = MODES[m]; return PL.meta ? PL.meta.keyFor(m, m === 'daily' ? dailySeed() : 0, n) : m; }
  function freshSeed() { return urlSeed != null ? urlSeed : ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) % 1000000000; }
  function tierOf(room) {
    if (!room) return 1;
    if (room.tier) return room.tier;
    const t = (PL.TEMPLATES || []).find((q) => q.id === room.templateId);
    return t && t.tier ? t.tier : 1;
  }
  function showToast(text, kind, ms) { toast = { text, kind: kind || 'info', until: nowMs() + (ms || 1800) }; }

  function newRun() {
    const n0 = MODES[mode] || 5, nTw = tw('SHAFT_N', 0) | 0, n = !isTut() && nTw > 0 ? nTw : n0;
    rooms = isTut() ? PL.buildRooms(seed) : PL.buildShaft(seed, n);
    runTuned = !!(TW && TW.isDirty('sim'));
    roomIdx = 0; attempts = []; cleared = []; inputLog = []; queue = []; totalTicks = 0; deaths = 0; flipsTotal = 0;
    complete = null; clearInfo = null; death = null; causeRun = { kind: '', n: 0 }; fx = []; trailBuf = [];
    tutP = {}; roomDeaths = {}; aidRooms = {}; nudge = false; nudgeAt = 0; nudgeShown = {};
    if (PL.Input) PL.Input.clear();
    startAttempt();
  }
  function startAttempt() {
    state = PL.newState(rooms[roomIdx]);
    const n = attempts.filter((a) => a.room === roomIdx + 1).length + 1;
    cur = { room: roomIdx + 1, attempt: n, ticks: 0, result: null, flips: 0, landSpeeds: [], log: [], rides: 0, cause: '', snap: state.K && state.K.snap };
    trailBuf = []; queue = []; clearInfo = null; popMoves = -1; pipPop = 0;
    cam = PL.camNew();
    if (scr === 'play') setMusic(isTut() ? 'tutorial' : 'tier' + clamp(tierOf(rooms[roomIdx]), 1, 3));
  }
  function finishAttempt(result) {
    if (!cur || cur.result) return;
    cur.result = result; cur.ticks = state.t; cur.flips = state.flips;
    if (result === 'death') cur.cause = state.cause || '?';
    attempts.push(cur); flipsTotal += state.flips;
  }
  function retryRoom() {
    if (scr !== 'play' || clearInfo || complete || wiping) return;
    retryAt = nowMs(); finishAttempt('restart'); startAttempt();
  }
  function startMode(m, s) {
    mode = MODES[m] ? m : 'short';
    seed = s != null ? s | 0 : mode === 'daily' ? dailySeed() : isTut() ? 1 : freshSeed();
    scr = 'play'; pauseConfirm = false; wiping = false; pops = [];
    newRun();
    setMusic(isTut() ? 'tutorial' : 'tier' + clamp(tierOf(rooms[0]), 1, 3));
    if (PL.Vfx && PL.Vfx.wipe && vfxReady && !reducedNow()) { try { PL.Vfx.wipe('open'); } catch (_) {} }
  }
  function go(name) {
    scr = name; pauseConfirm = false; nudge = false; nudgeAt = 0; press = null; drag = null; wiping = false; if (name !== 'pause') pops = [];
    if (PL.Input) PL.Input.clear();
    if (name === 'menu' || name === 'shaftPick') setMusic('menu');
    else if (name === 'settings' || name === 'tweak') { if (settingsFrom === 'menu') setMusic('settings'); }
    else if (name === 'firstOpen') setMusic(null);
  }
  function toMenu() { complete = null; clearInfo = null; go('menu'); }
  function goPause() {
    if (scr !== 'play' || complete || wiping) return;
    scr = 'pause'; pauseConfirm = false; if (PL.Input) PL.Input.clear();
    if (PL.audio && PL.audio.duck) { try { PL.audio.duck(0.5, 3600, 0.2); } catch (_) {} } // about -6 dB while paused
  }
  function resume() {
    scr = 'play'; pauseConfirm = false; nudge = false; acc = 0;
    if (PL.audio && PL.audio.duck) { try { PL.audio.duck(1, 0, 0.15); } catch (_) {} }
  }
  function openSettings(from) { settingsFrom = from; settingsScroll = 0; go('settings'); }

  // ---------- death: cause tag + killer outline ----------
  const CAUSE = { spike: 'spikes', crush: 'crusher', crumble: 'crystal', crystal: 'crystal', edge: 'edge', gate: 'slow', slow: 'slow' };
  function distRect(x, y, r) { const dx = Math.max(r[0] - x, 0, x - (r[0] + r[2])), dy = Math.max(r[1] - y, 0, y - (r[1] + r[3])); return Math.hypot(dx, dy); }
  function nearest(list, x, y) { let b = null, bd = 1e9; for (const r of list) { const d = distRect(x, y, r); if (d < bd) { bd = d; b = r; } } return b; }
  function killerOf(s) {
    const room = s.room, c = s.cause;
    if (c === 'spike') return nearest((room.spikes || []).map((q) => q.r), s.x, s.y);
    if (c === 'crush') {
      const cr = (room.crushers || []).map((q) => (PL.crusherRect ? PL.crusherRect(q, s.t, s.K) : q.r));
      return nearest(cr.length ? cr : room.walls || [], s.x, s.y);
    }
    if (c === 'edge') {
      const W = room.w || 336, H = room.h || 500;
      if (s.x < 0) return [0, 0, 12, H]; if (s.x > W) return [W - 12, 0, 12, H];
      if (s.y < 0) return [0, 0, W, 12]; return [0, H - 12, W, 12];
    }
    return null;
  }
  function onDeath() {
    deaths++; finishAttempt('death');
    roomDeaths[roomIdx] = (roomDeaths[roomIdx] || 0) + 1;
    if (!isTut() && roomDeaths[roomIdx] >= 5 && !aidRooms[roomIdx] && !nudgeShown[roomIdx]) { nudgeShown[roomIdx] = true; nudgeAt = nowMs() + 1800; } // offer once per room
    const kind = CAUSE[state.cause] || 'edge';
    causeRun = causeRun.kind === kind ? { kind, n: causeRun.n + 1 } : { kind, n: 1 };
    death = { at: nowMs(), drawnAt: 0, kind, text: S.death[kind], iconOnly: causeRun.n >= 3, killer: killerOf(state), x: state.x, y: state.y, trail: trailBuf.slice() };
    if (PL.Input && PL.Input.haptic && PL.Input.getVibrate()) { /* audio.js buzzes 25 ms on the death event */ }
  }

  // ---------- room clear / complete ----------
  const CLEAR_TICKS = Math.round(1.2 / C.DT); // auto-advance cap 1.2 s (sim ticks, so tests are deterministic)
  function bestRun() { try { return PL.meta && !isTut() ? PL.meta.getBest(bestKey(mode)) : null; } catch (_) { return null; } }
  function onWin() {
    finishAttempt('win');
    cleared[roomIdx] = { log: cur.log.slice(), hash: PL.hash(state), ticks: state.t, snap: cur.snap };
    const b = bestRun(), bs = b && Array.isArray(b.rooms) ? b.rooms[roomIdx] : null, tS = state.t * C.DT;
    clearInfo = { t: 0, time: tS, best: bs, isNew: bs != null && tS < bs - 1e-9 && !runTuned };
  }
  function canWipe() { return !!(PL.Vfx && PL.Vfx.wipe && PL.Vfx.wipeState && vfxReady && !reducedNow()); }
  function nextRoom() { roomIdx++; startAttempt(); }
  // star wipe close -> swap room -> open. Input + sim are locked for the whole wipe (so the run clock does not tick); a guard timer frees them if Vfx never reports back.
  function advance(instant) {
    if (!clearInfo || wiping) return;
    if (roomIdx + 1 >= rooms.length) { clearInfo = null; finishRun(); return; }
    if (instant || !canWipe()) { nextRoom(); return; }
    wiping = true; wipeGuard = nowMs() + 900; if (PL.Input) PL.Input.clear();
    const done = () => { wiping = false; };
    try {
      PL.Vfx.wipe('close', () => {
        try { nextRoom(); PL.Vfx.wipe('open', done); } catch (_) { done(); }
      });
    } catch (_) { wiping = false; nextRoom(); }
  }
  function finishRun() {
    if (isTut()) {
      settings.tutorialDone = true; saveSettings();
      complete = null; toMenu(); return;
    }
    const tuned = runTuned || !!(TW && TW.isDirty('sim'));
    const c = { timeS: totalTicks * C.DT, flips: flipsTotal, deaths, mode, seed, nRooms: rooms.length, tuned, medal: 'none', newBest: false, best: null, at: nowMs(), roomS: [] };
    if (PL.meta) {
      try {
        c.roomS = PL.meta.roomSummary(attempts, rooms.length).map((x) => x.clearS || 0);
        const r = PL.meta.recordRun(bestKey(mode), { ticks: totalTicks, flips: flipsTotal, deaths, tuned, rooms: c.roomS });
        if (r) { c.medal = r.medal || 'none'; c.newBest = !!r.isBest && !tuned; c.flipStar = !!r.flipStar; if (r.best) c.best = r.best; }
      } catch (_) {}
    }
    complete = c; scr = 'shaftComplete'; pops = []; confetti();
    const st = { plumb: 'plumb', gold: 'gold', silver: 'silver', bronze: 'bronze' }[c.medal] || 'complete';
    if (PL.audio && PL.audio.sting) { try { PL.audio.sting(st); } catch (_) {} }
  }

  // ---------- sim ----------
  function simTick() { try { simTickInner(); } catch (e) { fail(e); } }
  function simTickInner() {
    if (scr !== 'play' || complete || !state || wiping) return;
    if (clearInfo) { if (++clearInfo.t >= CLEAR_TICKS) advance(); return; }
    const counting = !state.won && !cur.result;
    let inputs = queue.splice(0);
    if (state.dead > 0 || state.won || cur.result) inputs = [];
    for (const i of inputs) {
      const e = { tick: state.t, k: i.k }; if (i.k === 'flip') e.dir = i.dir;
      cur.log.push(e);
      inputLog.push({ room: cur.room, attempt: cur.attempt, tick: e.tick, k: e.k, dir: e.dir });
    }
    PL.step(state, inputs);
    if (popMoves >= 0 && state.charges < popMoves) pipSpark(state.charges, state.K ? state.K.CHARGES : C.CHARGES);
    if (popMoves >= 0 && state.charges > popMoves && !reducedNow()) pipPop = 0.001;
    popMoves = state.charges;
    if (counting) totalTicks++;
    trailBuf.push({ x: state.x, y: state.y }); if (trailBuf.length > 240) trailBuf.shift();
    if (!runTuned && TW && TW.isDirty('sim')) runTuned = true;
    const ev = state.events || [];
    if (ev.length) for (const e of ev) frameEvents.push(e);
    if (PL.audio && PL.audio.onEvents) { try { PL.audio.onEvents(ev, state); } catch (_) {} }
    for (const e of ev) {
      if (e === 'land') { cur.landSpeeds.push(Math.round(state.lastLandSpeed || 0)); if (!reducedNow()) fx.push({ x: state.x, y: state.y, age: 0 }); }
      else if (e === 'ride') cur.rides++;
      else if (e === 'dive' && isTut()) (tutP[roomIdx] = tutP[roomIdx] || {}).dived = true;
      else if (e === 'death' && !cur.result) onDeath();
      else if (e === 'win' && !cur.result) onWin();
    }
    if (cur.result === 'death' && state.dead <= 0) startAttempt(); // control back after RESPAWN_T (0.3 s)
  }

  // ---------- input (pad via PL.Input; everything else via PL.Screens.hit) ----------
  function padEmpty() { return !!(state && state.charges <= 0 && !state.grounded && !(state.coyote > 0)); }
  function qFlip(dir) {
    sfx(padEmpty() && state.g !== dir ? 'noCharge' : 'pad' + ['Up', 'Right', 'Down', 'Left'][dir]);
    queue.push({ k: 'flip', dir }); ripple(['up', 'right', 'down', 'left'][dir]);
  }
  function qDive() { queue.push({ k: 'dive' }); ripple('dive'); }
  if (PL.Input) PL.Input.attach({
    flip: qFlip, dive: qDive, restart: retryRoom, pause: () => { if (PL.ui && typeof PL.ui.onPause === 'function') PL.ui.onPause(); },
    state: () => state, view: () => view, now: nowMs,
    active: () => scr === 'play' && !complete && !clearInfo && !wiping && !domOverlay && !!state
  });

  const leftHand = () => !!(PL.Input && PL.Input.getHand() === 'left');
  let settingsScroll = 0, tweakScroll = 0, tweakOpen = {}, press = null, drag = null, confirmKind = null;
  function playName() { if (isTut()) return 'tutorial'; return 'play'; }
  function layoutFor(name) {
    const rr = lastFrame && lastFrame.roomRect;
    return SC.layout(view.W, view.H, leftHand(), { scroll: name === 'tweak' ? tweakScroll : settingsScroll, tweakRows: tweakRowsCache.length || 6, roomRect: rr,
      clearRows: clearInfo ? { best: clearInfo.best != null, isNew: !!clearInfo.isNew } : undefined });
  }
  // which PL.Screens screen takes taps now
  function hitScreen() {
    if (scr === 'pause') return pauseConfirm || nudge ? 'confirm' : 'pause';
    if (scr === 'confirm') return 'confirm';
    if (scr === 'play') return playName();
    return scr;
  }
  function maxScroll(name) {
    const L = SC.layout(view.W, view.H, false, { scroll: 0, tweakRows: tweakRowsCache.length || 6 })[name], list = L.rects.list;
    const n = name === 'tweak' ? tweakRowsCache.length : L.rowIds ? L.rowIds.length : SC.layout(view.W, view.H, false).settings.rowIds.length;
    return Math.max(0, n * 66 - list.h + 8);
  }

  // slider value from a pointer x inside a row's control zone
  function sliderFrac(row, x) { const p = SC.rowParts(row, 'slider').control, x0 = p.x + 14, x1 = p.x + p.w - 14; return clamp((x - x0) / (x1 - x0), 0, 1); }
  function inControl(row, x) { const p = SC.rowParts(row, 'slider').control; return x >= p.x - 8; }

  function setSettingSlider(id, f) { settings[id] = Math.round(f * 20) / 20; applyAudio(); }
  function setTweakSlider(rowIdx, f) {
    const row = tweakRowsCache[rowIdx]; if (!row || row.kind !== 'slider') return;
    if (row.id === '@mirror') { if (PL.Input) PL.Input.setHand(f >= 0.5 ? 'left' : 'right'); rebuildTweakRows(); return; } // player setting, same value as Settings, never DEV-dirty
    const d = TW.def(row.id); if (!d) return;
    if (d.list) TW.set(row.id, d.list[Math.round(f * (d.list.length - 1))]);
    else TW.set(row.id, d.min + f * (d.max - d.min));
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); unlockAudio();
    if (problem) { problem = null; errRun = 0; try { clearAll(); state = null; complete = null; clearInfo = null; go('menu'); } catch (_) {} return; }
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (domOverlay) return;
    const x = e.clientX, y = e.clientY;
    if (scr === 'play') {
      if (complete) return;
      if (wiping) return;
      if (clearInfo) { if (clearInfo.t > 24) advance(); return; } // any tap moves on (after 0.2 s)
      if (PL.Input && PL.Input.down(x, y, e.pointerId)) return;
      const L = layoutFor(playName());
      if (SC.hit(L, playName(), x, y) === 'skip' && isTut()) { press = { id: e.pointerId, tgt: 'skip', x, y, scr: 'play' }; }
      return;
    }
    const name = hitScreen(), L = layoutFor(name), tgt = SC.hit(L, name, x, y);
    press = { id: e.pointerId, tgt, x, y, y0: y, scr: name, scroll0: name === 'tweak' ? tweakScroll : settingsScroll, moved: false };
    // sliders start dragging on touch-down
    if (name === 'settings' && (tgt === 'music' || tgt === 'sounds') && inControl(L.settings.rects[tgt], x)) {
      drag = { id: e.pointerId, kind: 'set', key: tgt }; setSettingSlider(tgt, sliderFrac(L.settings.rects[tgt], x)); press = null;
    } else if (name === 'tweak' && tgt && /^t\d+$/.test(tgt)) {
      const i = +tgt.slice(1), row = tweakRowsCache[i];
      if (row && row.kind === 'slider' && inControl(L.tweak.rects[tgt], x)) { drag = { id: e.pointerId, kind: 'tw', key: tgt, i }; setTweakSlider(i, sliderFrac(L.tweak.rects[tgt], x)); press = null; }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const x = e.clientX, y = e.clientY;
    if (drag && drag.id === e.pointerId) {
      const name = drag.kind === 'set' ? 'settings' : 'tweak', L = layoutFor(name), row = L[name].rects[drag.key];
      if (!row) return;
      if (drag.kind === 'set') setSettingSlider(drag.key, sliderFrac(row, x)); else setTweakSlider(drag.i, sliderFrac(row, x));
      return;
    }
    if (press && press.id === e.pointerId && (press.scr === 'settings' || press.scr === 'tweak')) {
      const dy = y - press.y0;
      if (Math.abs(dy) > 10) press.moved = true;
      if (press.moved) {
        const v = clamp(press.scroll0 - dy, 0, maxScroll(press.scr));
        if (press.scr === 'tweak') tweakScroll = v; else settingsScroll = v;
      }
    }
  });
  function endPointer(e, cancel) {
    if (PL.Input) { if (cancel) PL.Input.cancel(e.pointerId); else PL.Input.up(e.pointerId); }
    if (drag && drag.id === e.pointerId) { drag = null; return; }
    const p = press; if (!p || p.id !== e.pointerId) return;
    press = null;
    if (cancel || p.moved || !p.tgt) return;
    const L = layoutFor(p.scr), tgt = p.scr === 'play' ? SC.hit(L, playName(), e.clientX, e.clientY) : SC.hit(L, p.scr, e.clientX, e.clientY);
    if (tgt !== p.tgt) return;
    act(p.scr, tgt, e.clientX, e.clientY, L);
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  // a pointer that is lost (capture dropped, leaves the page) must never leave a pad key lit
  const lost = (e) => { if (PL.Input && PL.Input.cancel) PL.Input.cancel(e.pointerId); if (drag && drag.id === e.pointerId) drag = null; if (press && press.id === e.pointerId && press.scr === 'play') press = null; };
  canvas.addEventListener('lostpointercapture', lost); canvas.addEventListener('pointerleave', lost);
  function clearAll() { press = null; drag = null; if (PL.Input) PL.Input.clear(); }
  window.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearAll(); if (scr === 'play' && !clearInfo) goPause(); } });

  function act(name, tgt, x, y, L) {
    sfx('ui');
    if (name === 'firstOpen') { startJourney(); return; }
    if (name === 'tutorial' || name === 'play') { if (tgt === 'skip') { settings.tutorialDone = true; saveSettings(); toMenu(); } return; }
    if (name === 'menu') {
      if (tgt === 'play') go('shaftPick');
      else if (tgt === 'practice') startMode('practice');
      else if (tgt === 'settings') openSettings('menu');
      return;
    }
    if (name === 'shaftPick') {
      if (tgt === 'back') go('menu');
      else if (/^tile\d$/.test(tgt)) pickSel = +tgt.slice(4);
      else if (tgt === 'play') startMode(['short', 'long', 'daily'][pickSel]);
      return;
    }
    if (name === 'pause') {
      if (tgt === 'resume') resume();
      else if (tgt === 'retry') { resume(); retryRoom(); }
      else if (tgt === 'settings') openSettings('pause');
      else if (tgt === 'leave') pauseConfirm = true;
      return;
    }
    if (name === 'confirm') {
      if (scr === 'pause' && nudge) { if (tgt === 'stay') { aidRooms[roomIdx] = true; sfx('ui'); } resume(); return; }
      if (scr === 'pause') { if (tgt === 'stay') pauseConfirm = false; else if (tgt === 'leave') { resume(); finishAttempt('abandoned'); toMenu(); } return; }
      if (confirmKind === 'reset') { if (tgt === 'leave') { if (PL.meta) PL.meta.reset(); showToast(S.settings.erase); } go('settings'); }
      return;
    }
    if (name === 'shaftComplete') {
      if (tgt === 'again') startMode(mode, mode === 'daily' ? dailySeed() : undefined);
      else if (tgt === 'menu') toMenu();
      return;
    }
    if (name === 'settings') {
      const row = L.settings.rects[tgt];
      if (tgt === 'back') { if (settingsFrom === 'pause') { scr = 'pause'; pauseConfirm = false; } else go('menu'); return; }
      if (tgt === 'mute') settings.mute = !settings.mute;
      else if (tgt === 'vibration') { if (PL.Input) PL.Input.setVibrate(!PL.Input.getVibrate()); }
      else if (tgt === 'motion') { settings.motion = !settings.motion; applyVfx(); }
      else if (tgt === 'hand') { if (PL.Input) PL.Input.setHand(leftHand() ? 'right' : 'left'); }
      else if (tgt === 'textSize' || tgt === 'quality') {
        const key = tgt === 'textSize' ? 'textIdx' : 'qualityIdx', ctl = SC.rowParts(row, 'seg').control;
        settings[key] = x >= ctl.x ? clamp(Math.floor((x - ctl.x) / (ctl.w / 3)), 0, 2) : (settings[key] + 1) % 3;
        if (tgt === 'quality') applyVfx();
      } else if (tgt === 'music' || tgt === 'sounds') { /* label tap: no change (slider handles drags) */ }
      else if (tgt === 'reset') { confirmKind = 'reset'; scr = 'confirm'; return; }
      else if (tgt === 'tweak') { tweakScroll = 0; scr = 'tweak'; return; }
      saveSettings(); applyAudio();
      return;
    }
    if (name === 'tweak') {
      if (tgt === 'back') { scr = 'settings'; return; }
      if (!/^t\d+$/.test(tgt)) return;
      const row = tweakRowsCache[+tgt.slice(1)]; if (!row) return;
      if (row.kind === 'head') { tweakOpen[row.group] = !tweakOpen[row.group]; rebuildTweakRows(); return; }
      if (row.kind === 'btns') {
        const rr = L.tweak.rects[tgt], bs = SC.rowButtons(rr, row.btns.length, row.btns.map((b) => b.weight || 1));
        const j = bs.findIndex((b) => x >= b.x && x < b.x + b.w); if (j >= 0) tweakAction(row.btns[j].id);
      }
    }
  }
  function startJourney() {
    unlockAudio(); applyAudio();
    if (!settings.tutorialDone) startMode('tutorial', 1); else go('menu');
  }

  // ---------- Tweak screen ----------
  let tweakRowsCache = [];
  function fmtVal(d, v) {
    if (d.list) return String(v);
    const dec = d.step > 0 && d.step < 1 ? Math.min(3, String(d.step).split('.')[1].length) : 0;
    return (+v).toFixed(dec);
  }
  function rebuildTweakRows() {
    const rows = [];
    rows.push({ kind: 'btns', btns: [{ id: 'copyReport', label: SD.copyReport, kind: 'primary' }, { id: 'savePreset', label: SD.savePreset }] });
    rows.push({ kind: 'btns', btns: [{ id: 'resetAll', label: SD.resetAll }, { id: 'copyCode', label: SD.copyCode }, { id: 'pasteCode', label: SD.pasteCode }] });
    if (TW) {
      for (const p of TW.listPresets()) rows.push({ kind: 'btns', btns: [{ id: 'load:' + p.name, label: p.name, weight: 2 }, { id: 'del:' + p.name, label: SD.del, kind: 'danger', weight: 1 }] });
      const diff = TW.diff();
      for (const g of TW.groups()) {
        const nd = g.ids.filter((id) => id in diff).length;
        rows.push({ kind: 'head', group: g.group, open: !!tweakOpen[g.group], label: g.group + (nd ? '  (' + nd + ' changed)' : '') });
        if (tweakOpen[g.group] && g.group === 'Pad' && PL.Input) { const lh = leftHand(); rows.push({ kind: 'slider', id: '@mirror', label: SD.mirror, valueText: SD.handNames[lh ? 1 : 0], value: lh ? 1 : 0, dirty: false }); }
        if (tweakOpen[g.group]) for (const id of g.ids) {
          const d = TW.def(id), v = TW.get(id);
          const f = d.list ? d.list.indexOf(v) / Math.max(1, d.list.length - 1) : (v - d.min) / ((d.max - d.min) || 1);
          rows.push({ kind: 'slider', id, label: d.label, valueText: (id === 'PAD_SIDE' ? SD.sideNames[v] : fmtVal(d, v)) + (id in diff ? ' *' : ''), value: f, dirty: id in diff });
        }
      }
    }
    tweakRowsCache = rows;
    tweakScroll = clamp(tweakScroll, 0, maxScroll('tweak'));
  }
  if (TW && TW.onChange) TW.onChange(() => { if (scr === 'tweak') rebuildTweakRows(); });
  function tweakAction(id) {
    if (id === 'resetAll') { TW.resetAll(); showToast(SD.resetDone); }
    else if (id === 'copyReport') copyText(buildReport());
    else if (id === 'copyCode') copyText(TW.exportCode());
    else if (id === 'pasteCode') askText(SD.pastePrompt, '', true, (code) => { const n = TW.importCode(code); showToast(n < 0 ? SD.codeBad : SD.codeApplied, n < 0 ? 'error' : 'info'); rebuildTweakRows(); });
    else if (id === 'savePreset') askText(SD.namePrompt, 'Preset ' + (TW.listPresets().length + 1), false, (nm) => { const r = TW.savePresetR(nm); showToast(r.ok ? SD.saved : r.reason === 'blank' ? SD.blankName : r.reason === 'full' ? SD.full : SD.storageProblem, r.ok ? 'info' : 'error'); rebuildTweakRows(); });
    else if (id.indexOf('load:') === 0) { if (TW.loadPreset(id.slice(5))) showToast(SD.loaded); }
    else if (id.indexOf('del:') === 0) { const r = TW.deletePresetR(id.slice(4)); showToast(r.ok ? SD.deleted : r.reason === 'storage' ? SD.storageProblem : SD.blankName, r.ok ? 'info' : 'error'); }
    rebuildTweakRows();
  }

  // ---------- DOM text overlay (text entry / paste / manual copy only), styled with tokens ----------
  function closeDom() { if (domOverlay) { if (domOverlay._cleanup) domOverlay._cleanup(); domOverlay.remove(); domOverlay = null; } resize(); }
  function domShell() {
    closeDom();
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100dvh;z-index:99;background:' + U.alpha(U.C.night, 0.94) +
      ';display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:max(16px,6vh) 16px 16px;box-sizing:border-box;color:' + U.C.cream + ';font:600 16px ' + U.T.stack;
    const vv = window.visualViewport;
    if (vv) { const fit = () => { o.style.top = vv.offsetTop + 'px'; o.style.height = vv.height + 'px'; }; fit(); vv.addEventListener('resize', fit); o._cleanup = () => vv.removeEventListener('resize', fit); }
    document.body.appendChild(o); domOverlay = o; return o;
  }
  function domBtn(label, primary, f) {
    const b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'flex:1;min-height:56px;border-radius:16px;font:700 16px ' + U.T.stack + ';border:3px solid ' + U.C.cream + ';background:' + (primary ? U.C.brass : U.C.cream) + ';color:' + U.C.ink;
    b.addEventListener('click', f); return b;
  }
  function askText(title, init, multi, cb) {
    const o = domShell(), lab = document.createElement('div'); lab.textContent = title;
    const inp = document.createElement(multi ? 'textarea' : 'input');
    inp.value = init || ''; if (!multi) { inp.type = 'text'; inp.maxLength = (TW && TW.NAME_MAX) || 24; }
    inp.style.cssText = 'font:16px monospace;padding:12px;min-height:' + (multi ? 120 : 56) + 'px;box-sizing:border-box;border-radius:12px;border:2px solid ' + U.C.brass;
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px';
    const ok = () => { const v = inp.value; closeDom(); cb(v); };
    row.appendChild(domBtn(SD.ok, true, ok)); row.appendChild(domBtn(SD.cancel, false, closeDom));
    if (!multi) inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ok(); });
    o.appendChild(lab); o.appendChild(inp); o.appendChild(row); inp.focus();
  }
  function showManual(text) {
    const o = domShell(), ta = document.createElement('textarea'); ta.value = text; ta.readOnly = true;
    ta.style.cssText = 'flex:1;font:14px monospace;box-sizing:border-box';
    ta.addEventListener('focus', () => { try { ta.select(); } catch (_) {} });
    o.appendChild(ta); o.appendChild(domBtn(SD.close, true, closeDom)); ta.focus();
  }
  function copyText(text) {
    const fallback = () => {
      let ok = false;
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;font-size:16px';
        document.body.appendChild(ta); ta.focus(); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (_) { ok = false; }
      if (ok) showToast(SD.copied); else { showToast(SD.copyFailed, 'error'); showManual(text); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => showToast(SD.copied), fallback);
      else fallback();
    } catch (_) { fallback(); }
  }

  // ---------- keys ----------
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    unlockAudio();
    const k = e.key;
    if (domOverlay) { if (k === 'Escape') closeDom(); return; }
    const enter = k === 'Enter' || k === ' ';
    let used = true;
    if (scr === 'firstOpen') { if (enter) startJourney(); else used = false; }
    else if (scr === 'play') {
      if (complete || wiping) used = false;
      else if (clearInfo) advance();
      else if (k === 'Escape' || k === 'p' || k === 'P') goPause();
      else if (!(PL.Input && PL.Input.key(k))) used = false;
    } else if (scr === 'pause') { if (nudge && (k === 'Escape' || enter)) { if (enter) aidRooms[roomIdx] = true; resume(); } else if (k === 'Escape' || enter) { if (pauseConfirm) pauseConfirm = false; else resume(); } else used = false; }
    else if (scr === 'menu') { if (enter) go('shaftPick'); else used = false; }
    else if (scr === 'shaftPick') {
      if (enter) startMode(['short', 'long', 'daily'][pickSel]);
      else if (k === 'Escape') go('menu');
      else if (k === 'ArrowDown' || k === 'ArrowUp') pickSel = (pickSel + (k === 'ArrowDown' ? 1 : 2)) % 3;
      else used = false;
    } else if (scr === 'shaftComplete') { if (enter) startMode(mode, mode === 'daily' ? dailySeed() : undefined); else if (k === 'Escape') toMenu(); else used = false; }
    else if (scr === 'settings') { if (k === 'Escape') { if (settingsFrom === 'pause') scr = 'pause'; else go('menu'); } else used = false; }
    else if (scr === 'tweak') { if (k === 'Escape') scr = 'settings'; else used = false; }
    else if (scr === 'confirm') { if (k === 'Escape') go('settings'); else used = false; }
    else used = false;
    if (used) e.preventDefault();
  });

  // ---------- report ----------
  function replayCheck() {
    const lines = []; let ok = true, any = false;
    for (let i = 0; i < cleared.length; i++) {
      const c = cleared[i]; if (!c) continue; any = true;
      let r; try { r = PL.replay(rooms[i], c.log, c.snap); } catch (e) { r = { hash: 'ERR ' + e.message }; }
      const same = r.hash === c.hash; if (!same) ok = false;
      lines.push('  room ' + (i + 1) + ': ' + (same ? 'match' : 'MISMATCH') + ' (' + c.log.length + ' inputs, ' + c.ticks + ' ticks)');
    }
    return { ok, any, lines };
  }
  const fmtS = (t) => t.toFixed(2) + 's';
  function buildReport() {
    const L = [], tuned = runTuned || !!(TW && TW.isDirty('sim'));
    L.push('STARFALL REPORT (working name; plumbline build)');
    L.push('mode: ' + mode + '  rooms: ' + (rooms ? rooms.length : 0) + '  screen: ' + scr);
    L.push('seed: ' + seed);
    L.push('templates: ' + (rooms || []).map((r) => (r.templateId || r.name) + (r.mirrored ? 'm' : '')).join(','));
    L.push('tuned: ' + (tuned ? 'YES (not saved as best) ' : 'no ') + (TW ? TW.reportLine(true) : ''));
    if (complete) L.push('result: medal ' + complete.medal + (complete.flipStar ? ' +flipstar' : '') + '  newBest ' + complete.newBest +
      (complete.best ? '  best ' + (complete.best.ticks * C.DT).toFixed(2) + 's/' + complete.best.flips + ' flips/' + complete.best.medal : ''));
    L.push('build: ' + BUILD + '  pgs: ' + (window.PGS_BUILD || 'none'));
    L.push('UA: ' + navigator.userAgent);
    L.push('viewport: ' + view.W + 'x' + view.H + ' dpr ' + view.dpr + ' inset t' + view.inset.t + ' b' + view.inset.b);
    L.push('avg fps: ' + avgFps().toFixed(1) + (PL.Vfx && PL.Vfx.stats ? '  vfx ' + (() => { try { const s = PL.Vfx.stats(); return s.quality + (s.auto ? ' auto' : '') + (s.reduced ? ' reduced' : ''); } catch (_) { return '?'; } })() : ''));
    L.push('settings: music ' + settings.music + ' sounds ' + settings.sounds + ' mute ' + settings.mute + ' lessMotion ' + settings.motion + ' text ' + TEXT_SCALE[settings.textIdx] + ' picture ' + QUALITY[settings.qualityIdx]);
    L.push('art missing: ' + (artMissing().join(',') || 'none'));
    L.push('run time: ' + fmtS(totalTicks * C.DT) + ' (' + totalTicks + ' ticks)  flips ' + curFlips() + '  deaths ' + deaths + (complete ? '  RUN COMPLETE' : '  in progress'));
    L.push('WebGPU output: NOT seen (canvas 2D)');
    if (PL.Input) L.push('controls: ' + PL.Input.scheme + '  hand ' + PL.Input.getHand() + '  vibrate ' + (PL.Input.getVibrate() ? 'on' : 'off'));
    L.push('');
    L.push('attempts [room, attempt, ticks, result, cause, flips, landSpeeds, inputTicks]:');
    const all = attempts.concat(cur && !cur.result && !complete && state ? [Object.assign({}, cur, { ticks: state.t, flips: state.flips, result: 'in-progress' })] : []);
    for (const a of all) L.push('  ' + JSON.stringify({ room: a.room, attempt: a.attempt, ticks: a.ticks, s: +(a.ticks * C.DT).toFixed(2), result: a.result, cause: a.cause || undefined, flips: a.flips, landSpeeds: a.landSpeeds, rides: a.rides || 0, inputTicks: (a.log || []).map((x) => x.tick) }));
    if (rooms && PL.meta && PL.meta.reportLines) for (const l of PL.meta.reportLines(all, rooms.length)) L.push(l);
    L.push('');
    const rc = replayCheck();
    L.push('determinism check (replay of cleared rooms):');
    for (const l of rc.lines) L.push(l);
    L.push((!rc.any ? 'determinism: no cleared rooms yet' : rc.ok ? 'determinism OK' : 'determinism FAIL') + (tuned ? ' (tuned, replayed with attempt snapshots)' : ''));
    L.push('');
    L.push('input log (room, attempt, tick, k, dir):');
    for (const i of inputLog) L.push('  ' + i.room + ' ' + i.attempt + ' ' + i.tick + ' ' + i.k + (i.k === 'flip' ? ' ' + DIRN[i.dir] : ''));
    return L.join('\n');
  }

  // ---------- drawing ----------
  const fmtClock = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
  const fmtTotal = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s - m * 60); return m + ':' + (r < 10 ? '0' : '') + r; };
  function toScreen(fr, x, y) { return { x: (x - fr.cx) * fr.scale + view.W / 2, y: (y - fr.cy) * fr.scale + view.H / 2 }; }
  function roomRectOf(fr) {
    if (fr.roomRect) return fr.roomRect;
    const a = toScreen(fr, 0, 0), b = toScreen(fr, state.room.w || 336, state.room.h || 500), top = fr.hudTop || 84;
    const x0 = clamp(a.x, 0, view.W), x1 = clamp(b.x, 0, view.W), y0 = clamp(a.y, top, view.H), y1 = clamp(b.y, top, view.H);
    return { x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(40, y1 - y0) };
  }
  function drawBackdrop(kind) {
    const W = view.W, H = view.H, g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, U.C.night); g.addColorStop(0.55, U.C.dusk); g.addColorStop(1, U.C.plum);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const img = PL.Assets && PL.Assets.get ? PL.Assets.get(W > H ? 'bgLandscape' : 'bgPortrait') : null;
    if (img) { coverImage(img, { x: 0, y: 0, w: W, h: H }); U.scrim(ctx, W, H, kind === 'dim' ? 0.55 : 0.3); }
    else { ctx.save(); ctx.fillStyle = U.alpha(U.C.cream, 0.6); for (let i = 0; i < 60; i++) ctx.fillRect((i * 97.3) % W, (i * 53.1) % (H * 0.6), 2, 2); ctx.restore(); }
  }
  function coverImage(img, r) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return;
    const s = Math.max(r.w / iw, r.h / ih), w = iw * s, h = ih * s;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) * 0.35, w, h); ctx.restore();
  }
  // Key art composition (720x1280 source: star centre ~(420,890), star bottom y~1035, flame head ~y560 to the upper left,
  // empty dark dome in the top ~250 px). f {bottom, top, t, reduced}: cover-fit, then slide the art so the star's bottom edge
  // lands on f.bottom (clear of the buttons); whatever is left above is the title zone, whatever is left below fades to night.
  // 8 colours along the art's bottom row and right column (darkened toward night); null if the canvas is tainted
  let edgeCache = null;
  function edgeColors(img) {
    if (edgeCache && edgeCache.img === img) return edgeCache.v;
    let v = null;
    try {
      const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8; const x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data, px = (i, j) => { const o = (j * 8 + i) * 4, m = 0.5, n = [21, 26, 61]; return 'rgb(' + [0, 1, 2].map((q) => Math.round(d[o + q] * m + n[q] * (1 - m))).join(',') + ')'; };
      v = { bottom: [], right: [] }; for (let i = 0; i < 8; i++) { v.bottom.push(px(i, 7)); v.right.push(px(7, i)); }
    } catch (_) { v = null; }
    edgeCache = { img, v }; return v;
  }
  const ART = { w: 720, h: 1280, fx: 330, starBottom: 1040, sx: 420, sy: 890 };
  function drawKeyArt(c, r, f) {
    f = f || {};
    const img = PL.Assets && PL.Assets.get ? PL.Assets.get('keyart') : null;
    if (img) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (iw && ih) {
        const k = Math.max(r.w / iw, r.h / ih), t = f.t || 0, breathe = f.reduced ? 1 : 1.01 + 0.01 * Math.sin(t * 0.55), sk = iw / ART.w;
        const bottom = f.bottom == null ? r.y + r.h : f.bottom;
        const x0 = Math.max(0, Math.min(iw - r.w / k, ART.fx * sk - r.w / (2 * k)));
        const oy = Math.min(0, bottom - r.y - ART.starBottom * sk * k); // art top offset (<= 0): never leaves a gap above
        const px = r.x - x0 * k, py = r.y + oy;
        c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
        c.fillStyle = U.C.night; c.fillRect(r.x, r.y, r.w, r.h);
        const ax = px + ART.sx * sk * k, ay = py + ART.sy * sk * k; // breathe about the star
        c.translate(ax, ay); c.scale(breathe, breathe); c.translate(-ax, -ay);
        c.drawImage(img, px, py, iw * k, ih * k); c.restore();
        // extend the art with colours sampled from its own edge (no flat bands): below it (portrait) and right of it (landscape panel)
        const E = edgeColors(img), vb = ay + (py + ih * k - ay) * breathe, rx = ax + (px + iw * k - ax) * breathe; // art bottom / right edge after breathing
        c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
        if (E && vb < r.y + r.h) for (let i = 0; i < 8; i++) { const x0 = r.x + i * r.w / 8, g2 = c.createLinearGradient(0, vb - 2, 0, r.y + r.h);
          g2.addColorStop(0, E.bottom[i]); g2.addColorStop(1, U.alpha(U.C.night, 1)); c.fillStyle = g2; c.fillRect(x0 - 0.5, vb - 2, r.w / 8 + 1, r.y + r.h - vb + 2); }
        c.restore();
        c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
        const g = c.createLinearGradient(0, r.y, 0, r.y + r.h), top = f.top == null ? r.y : f.top;
        g.addColorStop(0, U.alpha(U.C.night, 0.78)); g.addColorStop(Math.max(0.01, Math.min(0.5, (top + 40 - r.y) / r.h)), U.alpha(U.C.night, 0));
        const fs = Math.min(0.99, Math.max(0.2, (bottom - r.y + 6) / r.h)); g.addColorStop(fs, U.alpha(U.C.night, 0));
        g.addColorStop(Math.min(1, fs + Math.max(0.04, 70 / r.h)), U.alpha(U.C.night, 0.94)); g.addColorStop(1, U.alpha(U.C.night, 0.96));
        c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h); c.restore();
        if (r.w < view.W * 0.9) { // landscape panel: seam fade, then the rest of the screen filled from the art's right edge colours
          // one vertical gradient through the 8 sampled colours (no per-band rects: those drew hard horizontal stripes), then a horizontal fade to night
          const x1 = r.x + r.w, sw = 80, ex = view.W, gv = c.createLinearGradient(0, r.y, 0, r.y + r.h);
          for (let i = 0; i < 8; i++) gv.addColorStop((i + 0.5) / 8, E ? E.right[i] : U.C.night);
          c.fillStyle = gv; c.fillRect(x1 - 0.5, r.y, ex - x1 + 0.5, r.h);
          const g4 = c.createLinearGradient(x1, 0, ex, 0); g4.addColorStop(0, U.alpha(U.C.night, 0)); g4.addColorStop(1, U.alpha(U.C.night, 1)); c.fillStyle = g4; c.fillRect(x1 - 0.5, r.y, ex - x1 + 0.5, r.h);
          c.fillStyle = gv; c.save(); const sl = 40; for (let i = 0; i < sl; i++) { c.globalAlpha = (i + 1) / sl; c.fillRect(x1 - sw + i * 2, r.y, 2, r.h); } /* exact 2 px slices: no overlap, so no hairlines */ c.restore(); // seam fade over the art
        }
        c.restore(); return;
      }
    }
    // code fallback: dusk sky, aurora band, hero star
    const t = nowMs() / 1000;
    c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    const g = c.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, U.C.night); g.addColorStop(0.6, U.C.dusk); g.addColorStop(1, U.C.plum); c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    c.globalAlpha = 0.25; c.fillStyle = U.C.teal; c.beginPath(); c.ellipse(r.x + r.w * 0.5, r.y + r.h * 0.3 + Math.sin(t * 0.3) * 6, r.w * 0.7, r.h * 0.06, -0.2, 0, 7); c.fill();
    c.globalAlpha = 1; U.starPath(c, r.x + r.w / 2, r.y + r.h * 0.45 + Math.sin(t * 2) * 4, Math.min(r.w, r.h) * 0.09, Math.min(r.w, r.h) * 0.04); c.fillStyle = U.C.brass; c.fill();
    c.restore();
  }
  function chipVm() {
    const miss = artMissing().length > 0;
    return { reduced: reducedNow(), devTuned: !!(TW && TW.isDirty()), artFallback: miss, tweakOn: miss, inset: view.inset, textScale: TEXT_SCALE[settings.textIdx] };
  }
  // Teach hint: shows the first line until she does the taught action, then the next line for ~3 s (or until she lands in
  // room 2), then nothing. Progress is kept per room, so a retry never brings a finished hint back.
  function teachHint() {
    const T = S.tutorial, p = (tutP[roomIdx] = tutP[roomIdx] || {}), s = state, now = nowMs();
    const A = [[T.t1a, T.t1b], [T.t2a, T.t2b], [T.t3a, T.t3b]][roomIdx]; if (!A) return null;
    if (roomIdx === 1 && padEmpty() && !p.end) return { lines: [T.t2zero], alpha: 1 };
    if (!p.done) {
      const did = roomIdx === 0 ? s.flips >= 1 : roomIdx === 1 ? s.flips >= 2 : !!p.dived;
      if (did) { p.done = true; p.at = now; } else return { lines: [A[0]], alpha: clamp((now - (p.first = p.first || now)) / 250, 0, 1) };
    }
    if (p.end) return null;
    const age = (now - p.at) / 1000;
    if (age > 3 || (roomIdx === 1 && s.grounded && age > 0.8)) { p.end = true; return null; }
    return { lines: [A[1]], alpha: Math.min(clamp(age / 0.2, 0, 1), clamp((3 - age) / 0.4, 0, 1)) };
  }
  function playVm(fr, t) {
    const pm = PL.Input ? PL.Input.view() : { pressed: {}, shake: null };
    const s = state, keyName = (k) => (k[0] === 'k' ? DIRN[+k[1]] : k);
    let pressed = null; for (const k in pm.pressed) pressed = keyName(k);
    if (!pressed && pm.shake) pressed = keyName(pm.shake.id);
    const air = !s.grounded && !(s.coyote > 0), h = toScreen(fr, s.x, s.y);
    const vm = Object.assign(chipVm(), {
      leftHand: leftHand(), roomRect: roomRectOf(fr), room: roomIdx + 1, rooms: rooms.length, time: fmtClock(totalTicks * C.DT),
      moves: s.charges, maxMoves: s.K ? s.K.CHARGES : C.CHARGES, air, lit: DIRN[s.g], pressed,
      cooldown: s.K && s.K.DIVE_CD_TICKS ? clamp(s.diveCd / s.K.DIVE_CD_TICKS, 0, 1) : 0,
      retrySpin: clamp((nowMs() - retryAt) / 200, 0, 1) < 1 ? clamp((nowMs() - retryAt) / 200, 0, 1) : 0, hero: h,
      showSkip: isTut(), pop: pipPop, padHaz: { room: s.room, W: view.W, H: view.H, cx: fr.cx, cy: fr.cy, scale: fr.scale }
    });
    if (toast && nowMs() < toast.until) vm.toast = { text: toast.text, kind: toast.kind };
    if (isTut()) { const h = teachHint(); if (h) vm.teach = h; }
    return vm;
  }
  // ---------- screen-space juice (own layer, drawn above the HUD, below the Vfx wipe): pad ripple, pip sparks, medal confetti ----------
  // ---------- screen-space juice (own layer, drawn above the HUD, below the Vfx wipe): pad ripple, pip sparks, medal confetti ----------
  // Fallback 2D particles for when PL.Vfx makes none (see vfxFire). Skipped in reduced motion. Capped at 80.
  function popRect(name) { try { const L = layoutFor('play').play; return L && L.rects && L.rects[name]; } catch (_) { return null; } }
  // PL.Vfx.fire(name,{x,y}) (screen px; names ripple / pipSpend / medal). Vfx contract: these three add particles in full, lite and reduced
  // and 0 only when quality is OFF. Returns true when Vfx made particles; the local 2D fallback below draws only when it did not, i.e. quality OFF
  // (or the vfx build does not have the names yet: the guard keeps a missing function from ever throwing). Reduced motion: addPop still skips it.
  const vfxSeen = {}; // names that have produced particles at least once (so they exist in this vfx build)
  function vfxFire(name, x, y) {
    const V = PL.Vfx; if (!vfxReady || !V || typeof V.fire !== 'function' || typeof V.stats !== 'function') return false;
    try {
      const n0 = V.stats().particles; V.fire(name, { x, y }); const st = V.stats();
      if (st.particles > n0) { vfxSeen[name] = true; return true; }
      // a full pool evicts an old particle for the new one (count does not rise): once a name has proven it exists, trust it unless quality is OFF
      return !!vfxSeen[name] && st.quality !== 'off';
    } catch (_) { return false; }
  }
  function addPop(o) { if (reducedNow() || pops.length > 80) return; pops.push(o); }
  function ripple(name) { const r = popRect(name); if (r && !vfxFire('ripple', r.x + r.w / 2, r.y + r.h / 2)) addPop({ k: 'ripple', x: r.x + r.w / 2, y: r.y + r.h / 2, r0: Math.min(r.w, r.h) * 0.3, r1: Math.min(r.w, r.h) * 0.95, age: 0, life: 0.35 }); }
  function pipSpark(left, max) {
    const r = popRect('pips'); if (!r) return;
    const x = r.x + r.w * (Math.max(0, left) + 0.5) / Math.max(1, max), y = r.y + r.h / 2;
    if (vfxFire('pipSpend', x, y)) return;
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.3, v = 50 + (i % 3) * 25; addPop({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.45, s: 3 + (i % 2) * 2 }); }
  }
  function confetti() {
    if (reducedNow()) return;
    const L0 = layoutFor('shaftComplete').shaftComplete, m0 = L0 && L0.rects && L0.rects.medal;
    if (m0 && vfxFire('medal', m0.x + m0.w / 2, m0.y + m0.h / 2)) return;
    const cols = [U.C.brass, U.C.teal, U.C.coral, U.C.cream];
    for (let i = 0; i < 46; i++) { const x = view.W * (0.1 + 0.8 * ((i * 37) % 46) / 46), side = i % 2 ? 1 : -1;
      addPop({ k: 'conf', x, y: -10 - (i % 7) * 14, vx: side * (20 + (i * 13) % 50), vy: 120 + (i * 29) % 140, rot: i, vr: side * (3 + i % 4), age: 0, life: 1.8 + (i % 5) * 0.12, col: cols[i % 4], s: 5 + i % 4 }); }
    const L = layoutFor('shaftComplete').shaftComplete, m = L && L.rects && L.rects.medal;
    if (m) for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; addPop({ k: 'star', x: m.x + m.w / 2, y: m.y + m.h / 2, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, age: 0, life: 0.8, s: 9 }); }
  }
  function stepPops(dt) {
    if (!(dt > 0)) return;
    for (const q of pops) { q.age += dt; if (q.vx != null) { q.x += q.vx * dt; q.y += q.vy * dt; if (q.k === 'conf') { q.vy += 90 * dt; q.rot += q.vr * dt; } else { q.vx *= 0.94; q.vy *= 0.94; } } }
    pops = pops.filter((q) => q.age < q.life);
  }
  function drawPops(c) {
    if (!pops.length) return;
    c.save();
    for (const q of pops) {
      const k = q.age / q.life;
      if (q.k === 'ripple') { c.globalAlpha = 0.7 * (1 - k); c.lineWidth = 3; c.strokeStyle = U.C.teal; c.beginPath(); c.arc(q.x, q.y, q.r0 + (q.r1 - q.r0) * k, 0, 6.283); c.stroke(); }
      else if (q.k === 'spark') { c.globalAlpha = 1 - k; c.fillStyle = U.C.brass; c.beginPath(); c.arc(q.x, q.y, q.s * (1 - 0.5 * k), 0, 6.283); c.fill(); }
      else if (q.k === 'star') { c.globalAlpha = 1 - k; c.fillStyle = U.C.brass; U.starPath(c, q.x, q.y, q.s * (1 + k), q.s * 0.45 * (1 + k)); c.fill(); }
      else if (q.k === 'conf') { c.globalAlpha = Math.min(1, (1 - k) * 2); c.fillStyle = q.col; c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.scale(1, Math.abs(Math.sin(q.rot * 1.7)) * 0.8 + 0.2); c.fillRect(-q.s / 2, -q.s, q.s, q.s * 2); c.restore(); }
    }
    c.restore();
  }

  // PL.drawPad: HUD + arrow pad + Retry/Pause + teach + chips, all PL.UI components fed by PL.Input.view()
  PL.drawPad = function (c, v, padModel, hud) {
    const vm = hud && hud.vm; if (!vm) return;
    SC.draw[hud.screenName || 'play'](c, v.W, v.H, vm, nowMs() / 1000);
  };
  function drawKiller(fr) {
    if (!death || !death.killer) return;
    const age = nowMs() - death.at; if (age > 900) return;
    if (!death.drawnAt) death.drawnAt = nowMs();
    const k = death.killer, a = toScreen(fr, k[0], k[1]), b = toScreen(fr, k[0] + k[2], k[1] + k[3]);
    const pulse = reducedNow() ? 1 : 0.65 + 0.35 * Math.sin(age / 60);
    ctx.save(); ctx.globalAlpha = age > 700 ? (900 - age) / 200 : 1;
    ctx.lineWidth = 3; ctx.strokeStyle = U.alpha(U.C.coral, pulse); U.rr(ctx, a.x - 3, a.y - 3, b.x - a.x + 6, b.y - a.y + 6, 4); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = U.alpha(U.C.cream, 0.8 * pulse); U.rr(ctx, a.x - 6, a.y - 6, b.x - a.x + 12, b.y - a.y + 12, 6); ctx.stroke();
    ctx.restore();
  }
  // over = an overlay (pause, nudge, medal, settings from pause) sits on top: field only, 85% dusk scrim, no pad / HUD pills
  function renderPlay(dt, live, over) {
    const W = view.W, H = view.H;
    if (pipPop > 0) { pipPop += dt / 0.22; if (pipPop >= 1) pipPop = 0; }
    const fr = PL.camUpdate(cam, state, view, live ? dt : 0);
    lastFrame = fr;
    for (const f of fx) f.age += live ? dt : 0;
    fx = fx.filter((f) => f.age < 0.6);
    const hud = {
      chrome: 'ui', events: live ? frameEvents.slice() : [], reduced: reducedNow(), quality: vfxQuality(),
      roomIdx, roomN: roomIdx + 1, roomName: rooms[roomIdx].name, nRooms: rooms.length, roomTotal: rooms.length, mode, seed,
      timeS: totalTicks * C.DT, flips: curFlips(), deaths, attempt: cur ? cur.attempt : 1, roomAgeS: state.t * C.DT,
      pathOn: isTut() || !!aidRooms[roomIdx], aimArc: isTut() || !!aidRooms[roomIdx], fx, fps: avgFps(), hideHint: true, muted: settings.mute, ring: 0,
      trail: death && nowMs() - death.at < 1200 ? death.trail : null,
      deathCause: state.dead > 0 ? state.cause : '', killer: death && nowMs() - death.at < 900 ? death.killer : null,
      pad: PL.Input ? PL.Input.view() : null, completeScreen: null, tuning: null, toast: null, teach: null
    };
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    try { PL.draw(ctx, view, fr, state, hud); } catch (e) { ctx.fillStyle = U.C.dusk; ctx.fillRect(0, 0, W, H); if (!renderPlay.warned) { renderPlay.warned = 1; console.warn('draw', e); } }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (over) { // over === 'bare': the caller (Settings from Pause) draws the shared scrim itself
      if (over !== 'bare') U.overlayScrim(ctx, W, H);
      if (vfxReady && PL.Vfx && PL.Vfx.drawOverlay) { try { PL.Vfx.drawOverlay(ctx, fr); } catch (_) {} }
      frameEvents.length = 0; return null;
    }
    drawKiller(fr);
    const t = nowMs() / 1000, vm = playVm(fr, t);
    let name = playName();
    const deathAge = death ? nowMs() - death.at : 1e9;
    if (clearInfo) name = 'roomClear';
    else if (deathAge < 1700) name = 'death';
    if (name === 'death') {
      const hp = toScreen(fr, death.x, death.y);
      vm.cause = { kind: death.kind, text: death.text, age: deathAge, iconOnly: death.iconOnly, x: hp.x, y: hp.y };
      vm.showSkip = isTut();
    }
    if (name === 'roomClear') {
      const ci = clearInfo;
      vm.time = fmtClock(ci.time); vm.best = ci.best != null ? fmtClock(ci.best) : null; vm.isNewBest = ci.isNew;
    }
    hud.vm = vm; hud.screenName = name;
    if (name === 'roomClear') { U.overlayScrim(ctx, W, H); vm.noHud = true; } // no pad / HUD pills through the card
    if (name === 'death' && isTut()) { // tutorial keeps teach + Skip under the tag
      SC.draw.tutorial(ctx, W, H, vm, t);
      const L = SC.layout(W, H, vm.leftHand, { roomRect: vm.roomRect }).death, c0 = vm.cause, rm = L.rects.room, tw2 = c0.iconOnly ? 44 : 220;
      const x = Math.max(rm.x + 6 + tw2 / 2, Math.min(rm.x + rm.w - 6 - tw2 / 2, c0.x)), y = Math.max(rm.y + 24, Math.min(rm.y + rm.h - 24, c0.y - 44));
      U.causeTag(ctx, { x: x - tw2 / 2, y: y - 18, w: tw2, h: 36 }, { kind: c0.kind, text: c0.text, age: c0.age, iconOnly: c0.iconOnly }, t);
    } else PL.drawPad(ctx, view, hud.pad, hud);
    stepPops(live ? dt : 0); drawPops(ctx);
    if (vfxReady && PL.Vfx && PL.Vfx.drawOverlay) { try { PL.Vfx.drawOverlay(ctx, fr); } catch (_) {} }
    frameEvents.length = 0;
    return vm;
  }

  // ---------- loop ----------
  let last = 0, acc = 0, lastScr = '';
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt <= 0) return;
    if (dt > 0.25) dt = 0.25; else { fpsFrames++; fpsSecs += dt; }
    if (wiping && nowMs() > wipeGuard) wiping = false;
    const live = scr === 'play' && !domOverlay;
    acc += dt;
    let n = 0;
    if (!live) acc = 0;
    else while (acc >= C.DT && n < 5) { simTick(); acc -= C.DT; n++; }
    if (acc > C.DT) acc = 0;
    if (scr !== lastScr) { lastScr = scr; if (scr === 'tweak') rebuildTweakRows(); }
    if (nudgeAt && scr === 'play' && !clearInfo && !complete && !domOverlay && nowMs() >= nudgeAt) { nudgeAt = 0; goPause(); nudge = true; }
    render(dt, live);
  }
  // render / sim errors: count them; after 3 in a row show a visible chip instead of a silent flat screen (tap = back to the menu)
  let breakRender = false, errRun = 0, errTotal = 0, errWarned = false, problem = null;
  function fail(e) { errRun++; errTotal++; if (!errWarned) { errWarned = true; console.warn('Starfall error', e); } }
  function drawProblem() {
    try {
      const W = view.W, H = view.H, cw = Math.min(W - 24, 320), r = { x: Math.round((W - cw) / 2), y: Math.round(H / 2 - 40), w: cw, h: 80 };
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); U.scrim(ctx, W, H, 0.9);
      U.button(ctx, r, { label: S.problem.text, kind: 'primary', vw: W }, 0); problem = r;
    } catch (_) { problem = { x: 0, y: 0, w: view.W, h: view.H }; }
  }
  function render(dt, live) {
    try { renderInner(dt, live); errRun = 0; problem = null; } catch (e) { fail(e); }
    if (errRun >= 3) drawProblem();
  }
  function renderInner(dt, live) {
    if (breakRender) throw new Error('test break');
    const W = view.W, H = view.H, t = nowMs() / 1000, base = chipVm(), sca = TEXT_SCALE[settings.textIdx];
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const pr = (n) => (press && press.tgt === n ? n : null);
    const under = () => { if (state && rooms && (settingsFrom === 'pause' || scr === 'pause' || scr === 'shaftComplete')) { renderPlay(0, false, 'bare'); } else drawBackdrop('dim'); };
    if (scr === 'play' && state) { renderPlay(dt, live); }
    else if (scr === 'firstOpen') { drawBackdrop(); SC.draw.firstOpen(ctx, W, H, Object.assign({}, base, { drawArt: drawKeyArt, pressed: pr('start') }), t); }
    else if (scr === 'menu') { drawBackdrop(); SC.draw.menu(ctx, W, H, Object.assign({}, base, { drawArt: drawKeyArt, pressed: press && press.tgt }), t); }
    else if (scr === 'shaftPick') {
      drawBackdrop('dim');
      const best = ['short', 'long', 'daily'].map((m) => { let b = null; try { b = PL.meta && PL.meta.getBest(bestKey(m)); } catch (_) {} return b ? { time: fmtTotal(b.ticks * C.DT), tier: b.medal === 'plumb' ? 'gold' : b.medal } : null; });
      SC.draw.shaftPick(ctx, W, H, Object.assign({}, base, { selected: pickSel, best, dailyNote: true, pressed: press && press.tgt }), t);
    } else if (scr === 'pause' && nudge) { renderPlay(0, false, true); SC.draw.confirm(ctx, W, H, { text: S.nudge.msg, no: S.nudge.show, yes: S.nudge.no, danger: false, pressed: press && press.tgt, textScale: sca }, t); }
    else if (scr === 'pause') { renderPlay(0, false, true); SC.draw.pause(ctx, W, H, Object.assign({}, base, { confirm: pauseConfirm, pressed: press && press.tgt, leftHand: leftHand() }), t); }
    else if (scr === 'shaftComplete' && complete) {
      renderPlay(0, false, true);
      const c = complete, age = reducedNow() ? 99 : Math.max(0, (nowMs() - c.at) / 1000);
      SC.draw.shaftComplete(ctx, W, H, Object.assign({}, base, { tier: c.medal === 'plumb' ? 'gold' : c.medal, isNew: c.newBest, total: fmtClock(c.timeS), totalS: c.timeS, fmt: fmtClock, age,
        roomTimes: c.roomS.map((x) => fmtClock(x)), tuned: c.tuned, pressed: press && press.tgt, focus: 'again' }), t);
      stepPops(Math.min(dt, 0.05)); drawPops(ctx);
      if (vfxReady && PL.Vfx && PL.Vfx.drawOverlay) { try { PL.Vfx.drawOverlay(ctx, lastFrame); } catch (_) {} }
    } else if (scr === 'settings' || scr === 'tweak' || scr === 'confirm') {
      under();
      const values = { music: settings.music, sounds: settings.sounds, mute: settings.mute, vibration: PL.Input ? PL.Input.getVibrate() : true, left: leftHand(), motion: settings.motion, textIdx: settings.textIdx, qualityIdx: settings.qualityIdx };
      if (scr === 'tweak') SC.draw.tweak(ctx, W, H, Object.assign({}, base, { rows: tweakRowsCache, scroll: tweakScroll, pressed: press && press.tgt, drag: drag && drag.key }), t);
      else SC.draw.settings(ctx, W, H, Object.assign({}, base, { values, scroll: settingsScroll, pressed: press && press.tgt, drag: drag && drag.key }), t);
      if (scr === 'confirm') { U.scrim(ctx, W, H, 0.6); SC.draw.confirm(ctx, W, H, { text: S.settings.eraseQ, no: S.settings.keep, yes: S.settings.erase, danger: true, pressed: press && press.tgt, textScale: sca }, t); }
      if (toast && nowMs() < toast.until) { const tw2 = Math.min(W - 24, 320); U.toast(ctx, { x: (W - tw2) / 2, y: H - 120, w: tw2, h: 40 }, { text: toast.text, kind: toast.kind, vw: W }, t); }
      if (scr === 'settings' && base.devTuned) U.devBadge(ctx, { x: W - 64, y: 24, w: 56, h: 24 }, {}, t);
    } else { drawBackdrop(); }
  }

  requestAnimationFrame(frame);

  // ---------- test hook ----------
  function screenName() {
    if (scr === 'play') { if (clearInfo) return 'roomClear'; if (death && nowMs() - death.at < 1700) return 'death'; return playName(); }
    if (scr === 'pause' && pauseConfirm) return 'pauseConfirm';
    return scr;
  }
  window.PL_TEST = {
    breakRender: (on) => { breakRender = !!on; },
    errRun: () => errRun,
    getState: () => state,
    screen: screenName,
    scene: () => (scr === 'play' ? 'play' : scr === 'menu' ? 'menu' : scr),
    sceneName: () => (complete ? 'complete' : scr === 'play' ? 'play' : scr),
    // current PL.Screens layout for the screen that takes taps (rects in CSS px)
    rects: () => { const n = hitScreen(), L = layoutFor(n); return { name: n, rects: L[n] ? L[n].rects : null, targets: L[n] ? L[n].targets : [] }; },
    layout: (name) => layoutFor(name)[name],
    setSeed: (n) => { urlSeed = n | 0; startMode('tutorial', 1); },
    startMode: (m, s) => startMode(m === 'seed' ? 'short' : m, s),
    go: (n) => { if (n === 'settings') settingsFrom = scr === 'pause' ? 'pause' : 'menu'; if (n === 'pause') goPause(); else if (n === 'tweak') { scr = 'tweak'; rebuildTweakRows(); } else go(n); },
    menu: () => toMenu(),
    kill: (cause) => { if (scr === 'play' && !complete && state && !state.dead && !state.won) { state.dead = state.K.DEAD_TICKS || Math.round(C.RESPAWN_T / C.DT); state.cause = cause || 'spike'; frameEvents.push('death'); onDeath(); return true; } return false; },
    deathInfo: () => (death ? { kind: death.kind, text: death.text, killer: death.killer, at: death.at, drawnAt: death.drawnAt, iconOnly: death.iconOnly } : null),
    inject: (arr) => { for (const i of (arr || [])) { if (!i) continue; if (i.k === 'dive') queue.push({ k: 'dive' }); else if (i.k === 'flip' && Number.isInteger(i.dir) && i.dir >= 0 && i.dir <= 3) queue.push({ k: 'flip', dir: i.dir }); } },
    room: (n) => { scr = 'play'; complete = null; clearInfo = null; finishAttempt('abandoned'); roomIdx = clamp((n | 0) - 1, 0, rooms.length - 1); startAttempt(); },
    tick: (n) => { for (let i = 0; i < (n || 1); i++) simTick(); },
    winRoom: () => { if (scr !== 'play' || !state || clearInfo) return false; state.x = state.room.exit.x; state.y = state.room.exit.y; for (let i = 0; i < 3 && !clearInfo; i++) simTick(); return !!clearInfo; },
    advance: () => advance(true),
    advanceWipe: () => advance(),
    wiping: () => wiping,
    pops: () => pops.length,
    pipPop: () => pipPop,
    juice: () => pops.length + (PL.Vfx && PL.Vfx.stats ? (PL.Vfx.stats().particles || 0) : 0),
    report: buildReport,
    attempts: () => attempts.slice(),
    inputLog: () => inputLog.slice(),
    getRunStats: () => ({ totalTicks, roomsCleared: cleared.filter(Boolean).length, tuned: runTuned || !!(TW && TW.isDirty('sim')), mode, seed, rooms: rooms ? rooms.length : 0 }),
    pad: () => (PL.Input ? PL.Input.view() : null),
    isComplete: () => !!complete,
    aid: () => Object.assign({}, aidRooms),
    nudging: () => nudge,
    complete: () => (complete ? Object.assign({}, complete) : null),
    settings: () => Object.assign({}, settings, { hand: PL.Input && PL.Input.getHand(), vibrate: PL.Input && PL.Input.getVibrate() }),
    tweakRows: () => tweakRowsCache.map((r, i) => ({ i, kind: r.kind, id: r.id, group: r.group, label: r.label, btns: r.btns && r.btns.map((b) => b.id), weights: r.btns && r.btns.map((b) => b.weight || 1) })),
    setScroll: (v) => { if (scr === 'tweak') tweakScroll = clamp(v, 0, maxScroll('tweak')); else settingsScroll = clamp(v, 0, maxScroll('settings')); },
    music: () => moment,
    chips: () => chipVm(),
    roomRect: () => (lastFrame ? roomRectOf(lastFrame) : null)
  };
  PL.ui = Object.assign(PL.ui || {}, { buildReport, retryRoom, onPause: goPause, go, startMode, screen: screenName });
})();
