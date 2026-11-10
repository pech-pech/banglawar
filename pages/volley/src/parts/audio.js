(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Four synth sounds (fire, hit, hurt, door/levelup). L-HB-1/L-HB-2: unlock on first pointerdown (capture) and keydown,
// suspend while hidden or paused, voice cap with headroom for important sounds, own RNG stream (never the sim's).
var ctx = null, master = null, noiseBuf = null, paused = false, voices = 0, played = 0, dropped = 0;
var CAP = 16, LOW_CAP = 10;                      // low-priority sounds (fire, hit) stop at 10, leaving 6 for hurt/door/levelup
var PRIO = { fire: 0, hit: 0, kill: 1, hurt: 2, door: 2, levelup: 2 };
var rs = 0x5eed1234;
function rnd(){ rs |= 0; rs = rs + 0x6D2B79F5 | 0; var t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function on(){ return !V.TUNE || V.TUNE.SOUND !== false; }

function make(){
  if (ctx) return ctx;
  var AC = G.AudioContext || G.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  build(ctx);
  return ctx;
}
function build(c){
  var comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.12;
  master = c.createGain(); master.gain.value = 0.55;
  master.connect(comp); comp.connect(c.destination);
  var n = Math.floor(c.sampleRate * 0.25); noiseBuf = c.createBuffer(1, n, c.sampleRate);
  var d = noiseBuf.getChannelData(0); var save = rs; rs = 0x0badf00d;
  for (var i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  rs = save;
}
function unlock(){
  var c = make(); if (!c) return;
  if (c.state === 'suspended' && !paused && !(G.document && document.hidden)) c.resume().catch(function(){});
}
function voice(node, end){ voices++; played++; node.onended = function(){ voices = Math.max(0, voices - 1); }; }

function env(c, g, t, a, peak, dur){ g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }

var SND = {
  fire: function(c, t, o){
    var os = c.createOscillator(), g = c.createGain(), f = 880 + rnd() * 120;
    os.type = 'square'; os.frequency.setValueAtTime(f, t); os.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.07);
    env(c, g, t, 0.003, 0.09, 0.08); os.connect(g); g.connect(o); os.start(t); os.stop(t + 0.09); return os;
  },
  hit: function(c, t, o, big){
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; s.playbackRate.value = 0.8 + rnd() * 0.4;
    f.type = 'lowpass'; f.frequency.value = big ? 1400 : 2200;
    env(c, g, t, 0.002, big ? 0.45 : 0.28, big ? 0.22 : 0.1); s.connect(f); f.connect(g); g.connect(o);
    s.start(t, rnd() * 0.1, 0.25); s.stop(t + (big ? 0.24 : 0.12));
    var th = c.createOscillator(), tg = c.createGain(); th.type = 'sine';
    th.frequency.setValueAtTime(big ? 120 : 170, t); th.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    env(c, tg, t, 0.002, big ? 0.5 : 0.25, 0.14); th.connect(tg); tg.connect(o); th.start(t); th.stop(t + 0.15);
    return s;
  },
  hurt: function(c, t, o){
    var os = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    os.type = 'sawtooth'; os.frequency.setValueAtTime(240, t); os.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    f.type = 'lowpass'; f.frequency.value = 1200;
    env(c, g, t, 0.004, 0.5, 0.28); os.connect(f); f.connect(g); g.connect(o); os.start(t); os.stop(t + 0.3); return os;
  },
  door: function(c, t, o, lv){
    var notes = lv ? [523, 659, 784, 1047] : [392, 523, 659], last = null;
    for (var i = 0; i < notes.length; i++) {
      var os = c.createOscillator(), g = c.createGain(), ti = t + i * 0.075;
      os.type = 'triangle'; os.frequency.value = notes[i];
      env(c, g, ti, 0.005, 0.3, 0.22); os.connect(g); g.connect(o); os.start(ti); os.stop(ti + 0.24); last = os;
    }
    return last;
  }
};

function play(name, opt){
  if (!on() || !ctx || !master) return false;
  var p = PRIO[name] || 0;
  if (voices >= CAP || (p === 0 && voices >= LOW_CAP)) { dropped++; return false; }
  // Scheduled even while suspended (L-HB-1): it sounds once resume() lands instead of being dropped.
  var t = ctx.currentTime + 0.005, n;
  if (name === 'fire') n = SND.fire(ctx, t, master);
  else if (name === 'hit') n = SND.hit(ctx, t, master, false);
  else if (name === 'kill') n = SND.hit(ctx, t, master, true);
  else if (name === 'hurt') n = SND.hurt(ctx, t, master);
  else if (name === 'door') n = SND.door(ctx, t, master, false);
  else if (name === 'levelup') n = SND.door(ctx, t, master, true);
  if (!n) return false;
  voice(n); return true;
}

if (G.addEventListener) {
  G.addEventListener('pointerdown', unlock, true);
  G.addEventListener('keydown', unlock, true);
  if (G.document) document.addEventListener('visibilitychange', function(){
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(function(){});
    else if (!paused) ctx.resume().catch(function(){});
  });
}

V.Audio = {
  play: play,
  unlock: unlock,
  seed: function(s){ rs = ((s | 0) ^ 0x5eed1234) | 0; },
  // Game pause: stay suspended until the game resumes.
  setPaused: function(p){
    paused = !!p; if (!ctx) return;
    if (paused) ctx.suspend().catch(function(){}); else if (!(G.document && document.hidden)) ctx.resume().catch(function(){});
  },
  // For tests (OfflineAudioContext burst render, L-HB-2 item 5).
  renderBurst: function(spec){
    var OAC = G.OfflineAudioContext; if (!OAC) return Promise.resolve(null);
    var c = new OAC(1, 44100 * 1, 44100), sv = { ctx: ctx, master: master, noiseBuf: noiseBuf, voices: voices };
    build(c); var m = master; var t = 0.01;
    (spec || ['hurt', 'levelup', 'kill', 'kill', 'kill']).forEach(function(nm, i){
      if (nm === 'fire') SND.fire(c, t, m); else if (nm === 'hit') SND.hit(c, t, m, false); else if (nm === 'kill') SND.hit(c, t, m, true);
      else if (nm === 'hurt') SND.hurt(c, t, m); else SND.door(c, t, m, nm === 'levelup');
    });
    master = sv.master; noiseBuf = sv.noiseBuf;
    return c.startRendering().then(function(b){ var d = b.getChannelData(0), pk = 0; for (var i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); return pk; });
  },
  get state(){ return ctx ? ctx.state : 'none'; },
  get voices(){ return voices; },
  get played(){ return played; },
  get dropped(){ return dropped; },
  CAP: CAP
};
})();
