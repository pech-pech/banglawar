# Burn Window Build changes: Bundle A + install (bw-0.2.2, PR #82)

- Stars per sector match run medals: Gold >= 75% par/fuel = 3, Silver >= 55% = 2, docked = 1. Run end shows total / 24.
- Fast retry, 150x64 RETRY on the failed panel (1 s stray-tap lock kept), Closest approach line with best, CLOSE PASS near-miss tag.
- 344 px layout: stars shrink, chip no longer touches the title, Closest line stays on one line, run-end rule shortened.
- Android install: manifest id/scope/start_url `/banglawar/gravity-burn-window/`, display standalone, portrait, brass theme colour, 192/512 + maskable icons, categories games. SW v bw-0.2.2 with fetch handler, scope is the game folder only. Headless Chrome: 0 manifest errors, 0 installability errors.
- Tweak menu (project rule): Settings > Tweak. Sliders for thrust, fuel rate, fuel, gate radius, dock speed, crash pad, min throttle, planet GM x3 (50%..200%). DEV badge when any value differs. Save preset slots (save/load/delete), copy/paste preset code. Copy report includes `tweaks`. Values apply on sector reload; defaults change nothing (determinism baseline passes).
- Tests: physics, stars 8/8, audio, determinism-bundle-a, bots, e2e.js ALL PASS; e2e-bundle-a timing and overlap checks fixed.
- Gaps: WebGPU output NOT seen (Canvas2D); sound not heard by ear; real Fold not tested; review #6-8 (sector 1 difficulty, early-fail) left for M.

COST: 0 art credits; lead Sonnet 5.5 plus 3 Sonnet makers/QA (tweak menu, test fixes, final visual QA).
Lessons applied: checklist 5 (Fold cover first, 56 px targets), 11 (one QA pass), 13 (WebGPU line, reduced motion), 15 (saves try/catch), 18 (lead briefs, helpers edit).
