# Group C notes (results, best-by-seed, attempts, medal sheet)
Screens (344x882, dpr2 PNG each): results-none/bronze/silver/gold/moon, best-by-seed, attempts, medal-sheet. Pure HTML+CSS; wobble via inline SVG filter #wob, grain via inline data-URI SVG.
Variables: medal thresholds are CSS vars --t-bronze/--t-silver/--t-gold/--t-moon on :root (rendered through .t-* classes). Moon band 1,500 is a placeholder.
Components
- .frame: paper card, 2px ink + 1px inner line, wobbly.
- .btn (min 56px, pill) primary = ink fill (Retry same seed); secondary = paper. Focus = silver halo.
- .seal 34-96px: none (dashed), bronze I, silver II, gold III, moon (crescent). Halo --h for earned/best.
- .stamp "New best" (vermilion, rotated; animates only if motion allowed).
- .bar next-medal progress (hatched ink), .chip (seed code, Replay OK/FAIL), .tag tide/lost, .row (56px+, dotted rule), .tab (44px).
Results layout: eyebrow "Run over"; card = seal, medal name, height, dotted rule, cause line, new-best stamp + "Previous N m on this seed" OR "Best on this seed N m", next-medal progress ("N m to go") or "Every medal earned. The moon is yours."; chips row; lower third: Retry same seed (primary), New seed + Copy report, All results.
Cause copy: tide = "Swallowed by the tide - the ink rose past you."; lost = "Lost in space - you drifted out of every pull." (vermilion).
Replay: OK green / FAIL vermilion (shown in results-none as example of FAIL).
Best-by-seed: tabs (Best by seed | Attempts), rows = seal, best height, seed code, attempt count, daily label; top row highlighted; tap replays seed; primary "Play daily seed" in lower third.
Attempts: 20 rows, newest first: index, seal, height, seed, age, tide/lost tag; list scrolls in frame (max 640px); Copy report below.
Medal sheet: 4 rows (seal, name, status line, threshold), best medal highlighted with halo; "Back to results" primary. Locked state class .seal.locked available.
Reduced motion: only the stamp animates, gated by prefers-reduced-motion:no-preference.
Not done: dedicated 475x638 renders (CSS has a small-height media rule only); generator at scratchpad, edit HTML directly.
