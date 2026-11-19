/* Bot balance harness. Run: node tests/bots.js [seeds=200] [--jobs N] [--src dir] [--out file] [--tide 1]
   -> writes docs/gravity-moonstep/BOT-REPORT.md. Seeds are split across worker processes (default 4); results are
   identical to a single-process run because every run depends only on seed + bot kind. */
'use strict';
var path = require('path'), fs = require('fs'), cp = require('child_process');
function arg(name, def) { var i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
var SRC = path.resolve(arg('src', path.join(__dirname, '..', 'src')));
var M = require(path.join(SRC, 'engine.js'));
global.Moonstep = M; global.MoonGen = require(path.join(SRC, 'gen.js'));
var C = M.C, DT = C.DT, CAP_S = +arg('cap', 420), MAXT = CAP_S * 120;
var NSEEDS = +(process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : 200);
var TIDE = +arg('tide', 1);
var BANDS = M.BANDS || [[150, 'Bronze'], [400, 'Silver'], [800, 'Gold'], [1500, 'Moon']];

function body(s, id) { for (var i = 0; i < s.bodies.length; i++) if (s.bodies[i].id === id) return s.bodies[i]; return null; }

// Search for a plan {k: ticks to hold, gain}. lagTicks: look-ahead for reaction time.
function plan(s, lag) {
  var r = s.runner, b = body(s, r.body); if (!b) return null;
  var cr = b.kind === 'crumble' ? b.rem : b.r, rr = cr + C.RUNNER_R;
  var om = (r.dir * r.vt / cr) + (b.spin || 0);
  var fake = { runner: { x: 0, y: 0, vx: 0, vy: 0, mode: 'rim', body: r.body, theta: 0, dir: r.dir, vt: r.vt, sinceLand: 0 }, bodies: s.bodies, owner: s.owner };
  var best = null, maxK = Math.round(C.CHARGE_MAX / DT);
  for (var k = 1; k <= maxK; k += 4) {
    var th = r.theta + om * DT * (k + lag);
    var f = fake.runner;
    f.theta = th; f.x = b.x + rr * Math.cos(th); f.y = b.y + rr * Math.sin(th);
    f.sinceLand = r.sinceLand + (k + lag) * DT;
    var res = M.predict(fake, k * DT, 360);
    if (res.landId < 0 || res.landId === b.id) continue;
    var t = body(s, res.landId); if (!t || t.kind === 'repel') continue;
    var gain = b.y - t.y;
    if (gain < 15) continue;
    // prefer higher gain; mild bias to shorter waits
    var score = gain - k * 0.3;
    if (!best || score > best.score) best = { k: k, gain: gain, score: score };
  }
  return best;
}

function valid(s) {
  var r = s.runner, b = body(s, r.body), res = M.predict(s, r.charge, 500);
  if (res.landId < 0 || res.landId === r.body) return false;
  var t = body(s, res.landId);
  return !!(t && t.kind !== 'repel' && b && b.y - t.y >= 15);
}

function mkBot(kind, seed) {
  var rnd = M.rng(M.hashSeed('bot' + kind + seed));
  var st = { plan: null, start: 0, release: 0, body: -1 };
  var skilled = function (s, n, human) {
    var r = s.runner;
    if (r.mode !== 'rim') { st.plan = null; return false; }
    if (st.plan && st.body !== r.body) st.plan = null;
    if (!st.plan && !r.charging && n % 4 === 0) {
      var lag = human ? 22 : 0;
      var p = plan(s, lag);
      if (p) {
        var delay = 0, k = p.k;
        if (human) {
          delay = Math.round((120 + rnd() * 130) / 1000 / DT);
          if (rnd() < 0.2) { // mistake: wrong timing or wrong charge
            if (rnd() < 0.5) delay += Math.round((60 + rnd() * 240) / 1000 / DT);
            else k = Math.max(1, Math.min(54, k + Math.round((rnd() - 0.5) * 36)));
          }
        }
        st.sloppy = human && k !== p.k; st.plan = p; st.body = r.body; st.start = n + delay; st.release = n + delay + k;
      }
    }
    if (st.plan) {
      if (n >= st.release && r.charging) {
        // closed loop: release only when the real state still predicts a higher landing (human mistakes skip the check)
        if (st.sloppy || valid(s) || n > st.release + 140) { st.plan = null; return false; }
        return true;
      }
      return n >= st.start;
    }
    return false;
  };
  return function (s, n) {
    switch (kind) {
      case 'idle': return { down: false };
      case 'naive': return { down: (n % 90) < 40 };
      case 'rote': { var m = n % 200; return { down: m < 20 || (m >= 80 && m < 128) }; }
      case 'skilled': return { down: skilled(s, n, false) };
      case 'human': return { down: skilled(s, n, true) };
    }
  };
}

function run(seed, kind) {
  var s = M.newRun(seed, { tideScale: TIDE }), pol = mkBot(kind, seed), n = 0;
  while (!s.over && n < MAXT) { M.tick(s, pol(s, n)); n++; }
  if (!s.over) s.cause = s.cause || 'timeout';
  return s;
}
function pct(a, p) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; }

// ---- worker mode: node bots.js --worker kind from to  -> JSON lines on stdout ----
if (arg('worker')) {
  var wk = arg('worker'), from = +process.argv[process.argv.indexOf('--worker') + 2], to = +process.argv[process.argv.indexOf('--worker') + 3];
  var outRows = [];
  for (var wi = from; wi < to; wi++) {
    var ws = run('B' + wi, wk), rp = M.report(ws);
    outRows.push({ i: wi, h: rp.height, j: rp.jumps, bc: rp.bestChain, c: ws.cause, ah: rp.aimedHit, at: rp.aimedTotal, sec: rp.seconds });
  }
  process.stdout.write(JSON.stringify(outRows));
  return;
}

var kinds = String(arg('kinds', 'idle,naive,rote,skilled,human')).split(','), t0 = Date.now();
var JOBS = +arg('jobs', Math.max(1, Math.min(4, require('os').cpus().length)));
var CHUNK = Math.max(1, Math.ceil(NSEEDS / (JOBS * 3)));
var queue = [], res = {};
kinds.forEach(function (k) { res[k] = []; var heavy = k === 'skilled' || k === 'human';
  var ch = heavy ? CHUNK : NSEEDS; for (var a = 0; a < NSEEDS; a += ch) queue.push([k, a, Math.min(NSEEDS, a + ch)]); });
// heavy jobs first so the tail is short
queue.sort(function (a, b) { return (b[0] === 'skilled' || b[0] === 'human') - (a[0] === 'skilled' || a[0] === 'human'); });
var active = 0;
function pump() {
  while (active < JOBS && queue.length) {
    var job = queue.shift(); active++;
    (function (job) {
      var args = [__filename, String(NSEEDS), '--src', SRC, '--tide', String(TIDE), '--cap', String(CAP_S), '--worker', job[0], String(job[1]), String(job[2])];
      cp.execFile(process.execPath, args, { maxBuffer: 1 << 26 }, function (err, out) {
        if (err) { console.error(err); process.exit(1); }
        res[job[0]] = res[job[0]].concat(JSON.parse(out)); active--;
        if (!queue.length && !active) finish(); else pump();
      });
    })(job);
  }
}
pump();

function finish() {
var rows = [];
kinds.forEach(function (kind) {
  var list = res[kind].sort(function (a, b) { return a.i - b.i; });
  var H = [], J = [], BC = [], cause = { tide: 0, lost: 0, timeout: 0 }, ah = 0, at = 0, sec = [], med = BANDS.map(function () { return 0; });
  list.forEach(function (x) {
    H.push(x.h); J.push(x.j); BC.push(x.bc); sec.push(x.sec); cause[x.c] = (cause[x.c] || 0) + 1; ah += x.ah; at += x.at;
    BANDS.forEach(function (b, k) { if (x.h >= b[0]) med[k]++; });
  });
  rows.push({ kind: kind, H: H, J: J, BC: BC, cause: cause, ah: ah, at: at, med: med, sec: sec });
  console.log(kind, 'median', pct(H, .5), 'p90', pct(H, .9));
});
console.log('elapsed', (Date.now() - t0) / 1000 + 's');
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(res));

var f1 = function (x) { return (100 * x / NSEEDS).toFixed(0) + '%'; };
var md = '# Moonstep bot report\n\nGenerated by `tests/bots.js` (' + NSEEDS + ' seeds B0..B' + (NSEEDS - 1) + ', cap ' + CAP_S + ' s sim = ' + MAXT + ' ticks, tideScale ' + TIDE + ', tide cap ' + C.TIDE_MAX + ' px/s, range ' + C.RANGE_K + 'r).\n\n';
md += '| bot | height med | p10 | p90 | tide | lost | cap | jumps med | best chain med (max) | aimed hit / total | ' + BANDS.map(function (b) { return b[1] + ' ' + b[0]; }).join(' | ') + ' |\n|---|---|---|---|---|---|---|---|---|---|' + BANDS.map(function () { return '---|'; }).join('') + '\n';
rows.forEach(function (r) {
  md += '| ' + r.kind + ' | ' + pct(r.H, .5) + ' | ' + pct(r.H, .1) + ' | ' + pct(r.H, .9) + ' | ' + f1(r.cause.tide) + ' | ' + f1(r.cause.lost) + ' | ' + f1(r.cause.timeout || 0) +
    ' | ' + pct(r.J, .5) + ' | ' + pct(r.BC, .5) + ' (' + Math.max.apply(null, r.BC) + ') | ' + r.ah + ' / ' + r.at + ' (' + (r.at ? (100 * r.ah / r.at).toFixed(0) : '-') + '%) | ' +
    r.med.map(f1).join(' | ') + ' |\n';
});
md += '\nBots: idle = never presses; naive = hold 40 of every 90 ticks; rote = fixed pattern (20 on, 60 off, 48 on, 72 off); skilled = every 4th rim tick searches charges 1..54 ticks (step 4) with `Moonstep.predict` and holds the one landing on the highest non-repel body at least 15 px above; human = skilled with 120-250 ms reaction delay (planned with a 22-tick lead) and 20% mistakes (extra delay 60-300 ms or charge error up to +-18 ticks).\n';
var out = arg('out', path.join(__dirname, '..', '..', '..', 'docs', 'gravity-moonstep', 'BOT-REPORT.md'));
fs.writeFileSync(out, md); console.log(md);
}
