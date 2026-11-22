# AUDIO CONTRACT (Trivia Duel, build td-audio-1). Read this + your own slice only.
Plain JS ES2020 classic scripts, no modules, no libs, no network except the one local mp3. Every file starts
`var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));`
and ends `if (typeof module !== 'undefined') module.exports = <export>;`. Never throw: wrap audio in try/catch, silent on failure.
Own seeded rng inside audio (mulberry32), never Math.random, never touches game rng. Everything is a guess tuned by ear later: label levels `[guess]`.
Script order added to inline.py after `ui-end.js`: `audio-core.js, audio-sfx.js, audio-music.js, audio-glue.js` (before desktop.js).
Music pick C (M): menu = Canon in D (code), duel = Beethoven 5 mvt I mp3 `audio/bgm-beethoven5.mp3` (PD, Musopen, 1.4 MB, loop seam inside), stings = Ode win / Twinkle, SFX = new small synth set.
Fallback if mp3 fails to load/decode: duel music = code-made `mountain` from audio-music.js.

## audio-core.js -> `TD.audio`
```
TD.audio = {
  unlock()                       // create/resume AudioContext inside a user gesture; idempotent; hooks visibilitychange (suspend hidden, resume visible)
  core() -> null | { ctx, sfxBus, musicBus, noise(): AudioBuffer (1 s white), rnd(): float, live(): bool }
  setLevels(cfg)                 // reads cfg.musicVol 0..1, cfg.sfxVol 0..1, cfg.musicOn 0|1, cfg.sfxOn 0|1, cfg.duckDb (dB); smooth ramps 60 ms; safe before unlock (stored, applied at unlock)
  registerCue(name, pri, dur, fn)// pri 1 (drop first) .. 3 (never dropped); dur seconds (voice lifetime); fn(c, t, opts) with c = core(), t = ctx time; fn schedules nodes and returns array of started nodes (for stealing) or nothing
  play(name, opts)               // plays cue; no-op if locked/muted/unknown (unknown increments TD.audio.missing); voice cap 8, steal oldest lowest-pri; same cue min gap 40 ms; opts passed to fn
  duck(level, holdSec, relSec)   // music bus gain to level (0..1 of current) for holdSec then back over relSec
  bgm(mode)                      // 'menu' | 'duel' | null. menu -> TD.music.play('canon'); duel -> bgmFile('duel','audio/bgm-beethoven5.mp3') else fallback TD.music.play('mountain'); null -> stop. Crossfade 0.8 s. Same mode twice = no restart. Remembers wanted mode if called before unlock and starts at unlock.
  bgmFile(id, url)               // fetch + decodeAudioData once (cache decoded buffer), loop BufferSource -> musicBus; returns Promise<bool>
  stopBgm(fadeSec)               // stops file and TD.music
  state() -> { unlocked, mode, missing, voices, musicVol, sfxVol, musicOn, sfxOn, fileLoaded }
  missing: 0
}
```
Master chain: sources -> sfxBus | musicBus -> master -> DynamicsCompressor (safety limiter) -> destination. Master 0.8 [guess]. musicBus default gain = musicVol*musicOn.
Defaults [guess]: musicVol 0.5, sfxVol 0.8, duckDb 8.

## audio-sfx.js (registers cues on TD.audio.registerCue at load; if TD.audio absent at load, no-op)
Names + priority + dur + sound (own synth, short, kid-safe, no harsh highs above ~4 kHz, peak <= 0.3):
`tap`(3,0.06) soft click; `select`(3,0.1) answer pressed, wood-tick; `qstart`(2,0.35) rising page-flip whoosh + soft chime;
`correct`(3,0.5) two-note bright bell up (C6->G6); `wrong`(3,0.4) low soft thud + short descending minor second;
`timeout`(3,0.5) hollow low gong-ish sine decay; `tick`(1,0.08) quiet clock tick (opts.urgent -> higher + louder);
`rivalSeal`(1,0.2) small wax-seal stamp (noise burst + low sine); `wager`(2,0.5) rising shimmer; `wagerX2`(3,0.5) shimmer + sparkle arpeggio;
`vs`(2,0.8) two-hit drum hit + rising sweep (round start); `win`(3,1.6) fanfare arpeggio C-E-G-C (no sample, triangle+sine);
`lose`(3,1.2) gentle descending 3 notes minor; `draw`(3,1.0) two neutral held notes; `pointsUp`(1,0.2) tiny coin blip (opts.big pitch up).
Also export `TD.sfx = { names: [...] }` listing all 14 names.

## audio-music.js -> `TD.music`
```
TD.music = { play(id), stop(fadeSec), sting(id), ids: ['canon','mountain'], stings: ['win','lose','draw','medal'], isPlaying(), current() }
```
Live look-ahead sequencer on the audio clock (25 ms timer, 120 ms look-ahead), routed to TD.audio.core().musicBus. Port the note data + parser idea from
`pages/gravity-plumbline/src/parts/music-data.js` + `music.js` (read-only reference, own re-write allowed; tunes are public domain, arrangements own).
- `canon`: Canon in D 8-bar melody + bass, 66 bpm [guess], loops forever, soft sine/triangle pad+pluck, calm.
- `mountain`: Grieg first phrase B C# D E F# D F#, loop with tempo ramp 100->150 over 8 bars then hold, soft plucked saw lowpassed (fallback duel music).
- stings (one-shot, duck music via TD.audio.duck(0.3, len, 0.5)): `win` = Ode to Joy 8 bars at 200 bpm with ritard (~10 s) but cap at first 4 bars if opts short; `lose` = first 4 notes of Gymnopedie-like descending minor (own, ~3 s); `draw` = Twinkle first line 2 s; `medal` = Twinkle 2 lines 192 bpm.
- Every piece must be provenance-listed in a header comment (composer, death year, own arrangement).
- `play(id)` while another is playing: crossfade 0.8 s. Must work with a fake ctx in node (see tests).

## audio-glue.js (no new DOM except one button; loaded last)
1. Edit `engine.js` DEFAULTS: add `musicVol: 0.5, sfxVol: 0.8, musicOn: 1, sfxOn: 1, duckDb: 8` (tweak.js renders rows from DEFAULTS automatically). Bump `TD.BUILD = 'td-audio-1'`.
2. On first `pointerdown|touchend|click|keydown` (capture, once): `TD.audio.unlock(); TD.audio.setLevels(TD.tweak.cfg); TD.audio.bgm(wanted)`.
3. Screen watcher: MutationObserver on `#app` subtree class changes. Active screen id -> mode: `scr-home|scr-settings|scr-vs` -> 'menu' (vs also plays `vs` once on entry); `scr-duel|scr-wager` -> 'duel'; `scr-result` -> stopBgm(0.4) then sting by `TD.ui` result (read `TD.tweak.lastState.result` 'win'|'loss'|'draw' -> TD.music.sting('win'|'lose'|'draw') + cue `win|lose|draw`).
4. Wrap (monkey patch, keep original call + return) `TD.ui.renderQuestion` -> cue `qstart`; `TD.ui.renderReveal(st, info)` -> `info.pos < 0 ? timeout : info.pRight ? correct : wrong`, plus `pointsUp` if info.pPts>0 (opts.big if pPts>=70); `TD.ui.renderRivalAnswered` -> `rivalSeal`; `TD.ui.renderTimer(frac, secLeft)` -> `tick` when floor(secLeft) changes and secLeft<=5 (opts.urgent when <=2); `TD.ui.renderWager` -> `wager` once per entry; #btn-x2 click -> `wagerX2`.
5. Delegated capture click on `.btn, .btn-ans, .btn-topic, .swatch, button`: cue `tap` (answer buttons `.btn-ans` -> `select`). Skip if target inside the audio button.
6. Floating mute button `#btn-audio` (fixed, top-right, 44x44 min, text 🔊/🔇 via textContent, aria-label "Sound on/off"): toggles `musicOn` and `sfxOn` together through `TD.tweak.set`. Inject its own <style>. Must not overlap `#dev-badge` (place left of it / below safe area).
7. Wrap `TD.tweak.set` so every change calls `TD.audio.setLevels(TD.tweak.cfg)` and refreshes the button icon.
8. `TD.audioGlue = { version: 'td-audio-1', attach() }`; auto attach on DOMContentLoaded (browser only). Also `?mute=1` query param disables audio (for e2e/tests).
Also edits: `inline.py` SCRIPTS list; `sw.js` VERSION 'td-audio-1' + add './audio/bgm-beethoven5.mp3' to CORE (allSettled already). `index.html` is rebuilt by `python3 src/inline.py` by the integrator only.

## test/audio.test.js (node, no deps)
Fake AudioContext (createGain/Oscillator/BufferSource/BiquadFilter/DynamicsCompressor/StereoPanner stubs recording calls; currentTime counter; decodeAudioData resolves a 1 s buffer). Tests: unlock idempotent; setLevels clamps; every one of 14 cue names registered and plays without throw and without increasing `missing`; voice cap 8 holds; unknown cue -> missing+1; mute (musicOn 0/sfxOn 0) schedules nothing; bgm('menu') starts canon, bgm('duel') loads mp3 via stubbed fetch else falls back to mountain; stings do not throw; audio works when `TD.audio.core()` is null (before unlock). Run: `node pages/trivia-duel/src/test/audio.test.js`; exit code non-zero on fail, prints "audio tests: N passed".
