# Burn Window POLISH contract (2026-11-19). Read this + src/CONTRACT.md + ONLY your named file(s).
Goal: one PR polishing pages/gravity-burn-window/: (1) feel+juice, (2) look (free assets, code-drawn only, no paid art), (3) content+balance.
Fold first 475x638 / 344x882. Seeded RNG only (BW.sim.mulberry32). Reduced motion: no shake/particles. Touch targets >= 56 px. localStorage in try/catch.
## File ownership (edit ONLY your file; others are read-only for you)
- game.js: feel maker. Owns shake, particles state, burn feedback, HUD feel, tuning of numbers in game.js.
- audio.js: audio maker. Richer synth cues. Keep API: init, hum, burn, dock, crash, tick, mute, suspend. Peak < 0.9, voice cap 12.
- gen.js + sim.js: balance maker (Opus). Fix generator throws (~7% of tries), add sector variety, widen skill gap. Keep sim determinism, step/predict API, tests green (tests/physics.test.js).
- render.js: look maker, starts AFTER M picks look. Draws G.fx.
## G.fx contract (game.js writes, render.js reads, world coords)
G.fx = { shake:{x,y} (CSS px offset game.js already applies to canvas translate), parts:[{x,y,vx,vy,life,max,kind:'flame'|'spark'|'dock'|'crash'|'dust',size}], flash:0..1, trail:[{x,y,a}] (craft trail, newest last), burnPulse:0..1 }.
render.draw must tolerate G.fx undefined.
## Output rule
Write the file, run `node --check` on it, reply 5 lines + path. Do not run the full test suite (lead does). No web search, no extra skills, no folder scan.
