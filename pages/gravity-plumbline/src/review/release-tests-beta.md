# Release tests, Starfall beta (2026-11-19). Nothing committed, no src/parts edits.
NODE_PATH=/opt/node22/lib/node_modules; build: python3 src/inline.py (index.html 0.39 MB).

| Test | Result |
|---|---|
| src/test/*.test.js (12 files) | all exit 0: assets, audio OK, core-fix 7, core-live 18, input 15, meta, shaft, sim, slice-core 7, tweak 18, uikit 10035 checks 0 fail, vfx 15 |
| e2e.js | 130 passed, 0 failed |
| flow-shots.js | 54 PNG, no overlaps, no target < 56 px |
| pwa-offline.js (new) | 21 passed, 0 failed |
| determinism.js (new) | 26 passed, 0 failed (solutions via shaft-check beam search, about 45 s) |
| soak.js (new) | 18 passed, 0 failed |

## PWA
SW activates; cache has all 25 files; sw.js asset list == assets/ on disk; manifest name/short_name/start_url/display fullscreen, icons 192, 512, 512 maskable, pixel sizes match. Offline reload: 0 requests reached the server, art shows, no chip, no errors. Deleting hero-idle.webp from the cache then offline: chip "ART: fallback" drawn (missing heroIdle), still plays, one expected "Failed to load resource" console line.

## Soak (headless software canvas, not device numbers)
| Viewport | Time | Heap 30 s -> max | Max frame gap | Particles max / peak / cap |
|---|---|---|---|---|
| 475x638 | 180 s, 797 taps, 20 forced room clears | 3.3 -> 3.9 MB (+0.6) | 267 ms | 88 / 98 / 160 |
| 344x882 | 60 s | 3.3 -> 3.8 (+0.5) | 300 ms | 89 / 112 / 160 |
| 816x568 | 60 s | 3.3 -> 3.5 (+0.2) | 850 ms | 140 / 147 / 160 |
No page or console errors, no NaN. Auto quality governor ended at "off" in all three (slow software render), so the cap check ran against the highest cap seen (160).

## Determinism
Seed 4242, 5 rooms played through the UI with real inputs: report says determinism OK; Copy report button text; Node replay from the report's input log wins every room, 568 ticks == UI; same seed twice gives the same report core. Tweak changed (non-sim): DEV chip on, newBest false, no best written, report "tuned: YES"; Reset all clears DEV; untuned control saves a best. Newer-version saves (all four plumbline.* keys at v 99) byte-identical after play, setting toggle, tweak set, preset save, and a direct recordRun.

## Bugs found
None in the game. Two defects in my first drafts of the tests were fixed (default-valued Tweak, chip drawn only in play).
Observations (low): (1) 816x568 max frame gap 850 ms under software rendering, close to the 1 s limit; check on a real device. (2) Missing-art offline fetch logs one console error (expected, from sw.js:30 `r || fetch(...)`); a `.catch(() => Response.error())` there would silence nothing visible, so optional.

## Not verifiable headless
Real device frame rate and heap, true airplane-mode install and Add to Home Screen, SW update flow across versions, audio output, haptics, touch feel on the Fold, safe-area insets.
Note: vfx.js and others changed during the run (stats() moved from line 804 to 817); results are for the build at run time.
