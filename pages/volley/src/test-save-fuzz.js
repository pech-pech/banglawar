// Save rules test (F0 #8, 08 section 4): 1,000 seeded broken saves must never throw and must always end in a valid state,
// plus the named cases (lower-version key, higher-version key, blocked storage, kill mid-write, settings key, samples).
// Run: node src/test-save-fuzz.js [count=1000] [seed=1]
var path = require('path');
['data-stages', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'meta', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function(f){ require(path.join(__dirname, 'parts', f + '.js')); });
var V = globalThis.V, M = V.Meta, KEY = M.KEY, SKEY = M.SETTINGS_KEY, fails = 0, n = 0;
function ok(name, c, got){ n++; if (!c) { fails++; if (fails < 40) console.log('FAIL', name, got === undefined ? '' : String(JSON.stringify(got)).slice(0, 300)); } }
function mock(){ var d = {}; return { d:d, getItem:function(k){ return k in d ? d[k] : null; }, setItem:function(k, v){ d[k] = String(v); }, removeItem:function(k){ delete d[k]; } }; }
function valid(s){ return !!M.validate(JSON.parse(JSON.stringify(s))); }

ok('key is versioned, game prefix', KEY === 'volley.save.v2' && M.VERSION === 2, KEY);
ok('settings key is separate', SKEY === 'volley.settings.v1' && SKEY !== KEY);

// ---------- seeded generator ----------
var seed = (+process.argv[3] || 1) >>> 0;
function rnd(){ seed = (seed + 0x6D2B79F5) >>> 0; var t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function ri(a, b){ return a + Math.floor(rnd() * (b - a + 1)); }
function pick(a){ return a[Math.floor(rnd() * a.length)]; }
function base(){
  var s = M.SAMPLES[pick(M.SAMPLE_NAMES)]();
  for (var i = 0, k = ri(0, 20); i < k; i++) s.runs.push({ t:1.7e12 + i, stage:ri(0, 10), win:rnd() < 0.3, kills:ri(0, 40), credits:ri(0, 400), dur:+(rnd() * 300).toFixed(1) });
  return s;
}
var JUNK = [null, undefined, NaN, Infinity, -Infinity, -1, 1e300, -1e300, 0.5, 1e9 + 1, '', 'x', '12', true, false, [], {}, [1, 2], { a:1 },
  'E-99', '__proto__', 'x'.repeat(5000), 2.5, -0, 7, 99];
function paths(o, at, out){ out.push(at); if (o && typeof o === 'object') for (var k in o) paths(o[k], at.concat([k]), out); return out; }
function setAt(o, p, v){ var c = o; for (var i = 0; i < p.length - 1; i++) c = c[p[i]]; if (v === undefined) delete c[p[p.length - 1]]; else c[p[p.length - 1]] = v; }
function mutate(){
  var s = base(), kind = ri(0, 9), txt;
  if (kind === 0) { txt = JSON.stringify(s); return { txt:txt.slice(0, ri(0, txt.length - 1)), kind:'cut short' }; }
  if (kind === 1) { var ps = paths(s, [], []).slice(1), p = pick(ps); setAt(s, p, pick(JUNK)); return { txt:JSON.stringify(s), kind:'wrong type/range at ' + p.join('.') }; }
  if (kind === 2) { var ps2 = paths(s, [], []).slice(1); setAt(s, pick(ps2), undefined); return { txt:JSON.stringify(s), kind:'missing field' }; }
  if (kind === 3) { s.codex.seen[pick(['E-99', 'B-77', 'zz', '', 'toString', 'constructor'])] = true; return { txt:JSON.stringify(s), kind:'unknown codex id' }; }
  if (kind === 4) { s[pick(['relics', 'gear', 'x', 'constructor'])] = pick(JUNK); return { txt:JSON.stringify(s), kind:'unknown field' }; }
  if (kind === 5) { s.runs = []; for (var i = 0; i < ri(21, 400); i++) s.runs.push({ t:i, stage:1, win:false, kills:0, credits:0, dur:1 }); return { txt:JSON.stringify(s), kind:'oversized run log' }; }
  if (kind === 6) { var big = JSON.stringify(s); return { txt:big.slice(0, -1) + ',"pad":"' + 'y'.repeat(ri(70000, 200000)) + '"}', kind:'oversized text' }; }
  if (kind === 7) { return { txt:pick(['', 'null', '0', '"s"', '[]', '{}', 'true', '{"v":2}', '{"__proto__":{"credits":5}}', '\u0000￿', '{{{', 'undefined', '[{"v":2}]']), kind:'junk text' }; }
  if (kind === 8) { s.v = pick([0, 1, '2', 2.0001, -2, null, 'v2']); return { txt:JSON.stringify(s), kind:'wrong version' }; }
  // kind 9: several mutations at once
  for (var j = 0, m = ri(2, 6); j < m; j++) { var ps3 = paths(s, [], []).slice(1); if (!ps3.length) break; try { setAt(s, pick(ps3), pick(JUNK)); } catch (e) {} }
  return { txt:JSON.stringify(s), kind:'multi' };
}

// ---------- 1,000 broken saves ----------
var COUNT = +process.argv[2] || 1000, threw = 0, invalidEnd = 0, accepted = 0, byKind = {};
for (var i = 0; i < COUNT; i++) {
  var c = mutate(), st = mock(); st.d[KEY] = c.txt;
  var tag = c.kind.split(' at ')[0]; byKind[tag] = (byKind[tag] || 0) + 1;
  try {
    M.load({ storage:st });
    if (!valid(M.state)) { invalidEnd++; if (invalidEnd < 5) console.log('invalid end state after', c.kind, c.txt.slice(0, 200)); }
    if (!M.resetSignal) accepted++;
    // play on: buy, award, save, reload: still valid, and what was written re-validates
    M.state.credits = Math.min(M.TUNING.CREDITS_MAX, M.state.credits + 5000); M.buy('rifle'); M.buyRandom('cond');
    M.award({ win:rnd() < 0.5, stage:ri(-5, 2000), credits:pick([10, -3, NaN, 1e12, '7']), kills:pick([1, -1, NaN]), t:pick([12.34, -1, NaN, 1e20]), seen:['E-01', 'E-99', 'B-01'] });
    if (!valid(M.state)) { invalidEnd++; if (invalidEnd < 5) console.log('invalid after play', c.kind, JSON.stringify(M.state).slice(0, 200)); }
    var w = st.d[KEY];
    if (!M.readOnly && !(w && M.validate(JSON.parse(w)))) { invalidEnd++; if (invalidEnd < 5) console.log('written save does not validate', c.kind); }
    M.load({ storage:st }); if (!valid(M.state)) invalidEnd++;
  } catch (e) { threw++; if (threw < 5) console.log('THREW on', c.kind, e && e.stack); }
}
ok(COUNT + ' broken saves: no throw', threw === 0, threw);
ok(COUNT + ' broken saves: always a valid state', invalidEnd === 0, invalidEnd);
console.log('fuzz: ' + COUNT + ' saves, ' + accepted + ' still valid after the mutation (accepted), ' + (COUNT - accepted) + ' reset; kinds ' + JSON.stringify(byKind));

// ---------- valid saves are kept exactly ----------
M.SAMPLE_NAMES.forEach(function(nm){
  var s = M.SAMPLES[nm](); ok('sample ' + nm + ' validates', valid(s));
  var st = mock(); st.d[KEY] = JSON.stringify(s); M.load({ storage:st });
  ok('sample ' + nm + ' round trips unchanged, no reset signal', JSON.stringify(M.state) === JSON.stringify(s) && M.resetSignal === '', [M.resetSignal, M.state]);
});
ok('sample mid = design numbers', (function(){ M.loadSample('mid', { save:false }); return M.state.credits === 12480 && M.state.rifle.lvl === 8 && M.nextPrice('cond') === 2250 && M.state.schematics === 86; })());
ok('sample all = everything maxed', (function(){ M.loadSample('all', { save:false }); return M.nextPrice('cond') === null && M.cost('rifle') === null && Object.keys(M.state.codex.seen).length === 6; })());
var sm = mock(); M.load({ storage:sm, fresh:true }); M.loadSample('all');
ok('loadSample saves by default', M.validate(JSON.parse(sm.d[KEY])).rifle.lvl === 10);
M.loadSample('fresh'); ok('loadSample fresh = reset, saved', JSON.parse(sm.d[KEY]).credits === 0 && M.state.rifle.lvl === 1);
ok('loadSample unknown name -> null', M.loadSample('zz') === null && M.loadSample('__proto__') === null);

// ---------- version keys ----------
var lo = mock(); lo.d['volley.save.v1'] = JSON.stringify({ v:1, credits:5000 }); lo.d['other.game'] = 'keep';
M.load({ storage:lo });
ok('lower-version key: deleted on boot', !('volley.save.v1' in lo.d) && lo.d['other.game'] === 'keep', Object.keys(lo.d));
ok('lower-version key: fresh start with the reset line', M.state.credits === 0 && M.resetSignal === 'old-version' && M.note === 'Progress was reset by this update.', M.note);
M.load({ storage:lo }); ok('reset line shows once (next boot is quiet)', M.resetSignal === '' && M.note === '');
var hi = mock(), hiTxt = JSON.stringify({ v:3, credits:1, future:true }); hi.d['volley.save.v3'] = hiTxt;
hi.d[KEY] = JSON.stringify(M.SAMPLES.mid());
M.load({ storage:hi });
ok('higher-version key: never touched, play read-only', hi.d['volley.save.v3'] === hiTxt && M.readOnly === true && M.state.credits === 12480);
ok('higher-version key: own key not written', (M.state.credits = 1, M.save() === false) && JSON.parse(hi.d[KEY]).credits === 12480);
var hv = mock(); hv.d[KEY] = JSON.stringify({ v:5, credits:77, rifle:{ lvl:3 }, cond:{ hp:2, atk:0, rate:0 }, gear:[1] }); var hvTxt = hv.d[KEY];
M.load({ storage:hv });
ok('newer payload in our key: read-only, shown best-effort, never rewritten', M.readOnly && M.state.credits === 77 && valid(M.state) && (M.buy('rifle'), M.save() === false) && hv.d[KEY] === hvTxt);
ok('explicit reset replaces a newer payload', M.reset() === true && JSON.parse(hv.d[KEY]).v === 2 && !M.readOnly);
var lk = { d:{}, length:0, key:function(i){ return Object.keys(this.d)[i]; }, getItem:function(k){ return k in this.d ? this.d[k] : null; }, setItem:function(k, v){ this.d[k] = String(v); this.length = Object.keys(this.d).length; }, removeItem:function(k){ delete this.d[k]; this.length = Object.keys(this.d).length; } };
lk.setItem('volley.save.v0', 'x'); lk.setItem('volley.save.v1', 'y'); lk.setItem('volley.save.v9', 'z'); lk.setItem('volley.settings.v1', '{"haptics":false}');
M.load({ storage:lk });
ok('localStorage-like store: v0, v1 deleted; v9 and settings kept', !('volley.save.v0' in lk.d) && !('volley.save.v1' in lk.d) && lk.d['volley.save.v9'] === 'z' && 'volley.settings.v1' in lk.d && M.readOnly, Object.keys(lk.d));

// ---------- blocked storage, kill mid-write ----------
var bad = { getItem:function(){ throw new Error('blocked'); }, setItem:function(){ throw new Error('blocked'); }, removeItem:function(){ throw new Error('blocked'); } };
var t1 = null; try { M.load({ storage:bad }); } catch (e) { t1 = e; }
ok('blocked storage: load does not throw, plays from memory with one line', !t1 && valid(M.state) && M.storageOk === false && M.note === M.BLOCKED_LINE, M.note);
ok('blocked storage: buy and save work in memory, save() false', (M.state.credits = 300, M.buy('rifle')) && M.save() === false && M.state.rifle.lvl === 2);
ok('blocked storage: settings fall back to defaults, no throw', M.settings().haptics === true && M.setSetting('haptics', false) === false);
var full = mock(); M.load({ storage:full, fresh:true }); M.loadSample('mid'); var good = full.d[KEY];
full.setItem = function(k, v){ full.d[k] = String(v).slice(0, 37); throw new Error('killed'); };   // the write is cut off part way
var t2 = null; try { M.state.credits = 99999; M.buy('rifle'); } catch (e) { t2 = e; }
ok('kill mid-write: no throw', !t2);
full.setItem = function(k, v){ full.d[k] = String(v); };
M.load({ storage:full });
ok('kill mid-write: next boot resets cleanly with the line', valid(M.state) && M.state.credits === 0 && M.resetSignal === 'corrupt' && M.note === M.RESET_LINE, [M.resetSignal, good.length]);

// ---------- settings key ----------
var ss = mock(); ss.d[SKEY] = JSON.stringify({ haptics:false, audio:{ v:1, master:0.4, muted:true } });
M.load({ storage:ss, fresh:true }); V.TUNE.HAPTICS = true; M.load({ storage:ss });
ok('settings read from their own key and applied', M.settings().haptics === false && V.TUNE.HAPTICS === false);
M.setSetting('haptics', true);
ok('setSetting keeps the audio sub-object (agent C owns it)', (function(){ var o = JSON.parse(ss.d[SKEY]); return o.haptics === true && o.audio.master === 0.4 && o.audio.muted === true; })());
ok('setSetting rejects unknown keys and wrong types', M.setSetting('zz', 1) === false && M.setSetting('haptics', 'no') === false);
M.reset(); ok('reset keeps settings', JSON.parse(ss.d[SKEY]).haptics === true && JSON.parse(ss.d[SKEY]).audio.master === 0.4);
ok('progress save holds no settings', !('settings' in JSON.parse(ss.d[KEY])));
['{bad', '[]', '"x"', '{"haptics":"yes"}', 'null'].forEach(function(t){ ss.d[SKEY] = t; var e = null; try { M.load({ storage:ss }); } catch (x) { e = x; }
  ok('bad settings ' + t + ' -> defaults, progress kept', !e && M.settings().haptics === true && M.resetSignal === ''); });
ok('progress wipe leaves settings', (function(){ var w = mock(); w.d[SKEY] = '{"haptics":false}'; w.d[KEY] = '{oops'; M.load({ storage:w }); return M.resetSignal === 'corrupt' && M.settings().haptics === false; })());

// ---------- reset is one call ----------
var r1 = mock(); M.load({ storage:r1, fresh:true }); M.loadSample('all'); var ev = 0, un = M.onChange(function(){ ev++; });
ok('M.reset(): one call, fresh, written, one notify', M.reset() === true && ev === 1 && JSON.stringify(JSON.parse(r1.d[KEY])) === JSON.stringify(M.SAMPLES.fresh()));
un();

console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
