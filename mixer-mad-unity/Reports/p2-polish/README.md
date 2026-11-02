# P2 polish pass: results (2026-11-02)

The 11 ranked fixes from `Reports/p2-mac/GAMEUP-REVIEW.md` section 6 were done by six parallel workstreams (lighting, level & camera, HUD, FX & living world, driver/outline/drum, tools), merged, then fixed again on the merged build. The shared brief is in `BRIEF.md`. Analytics are off (`submitAnalytics: 0`).

All checks below ran on the final merged build (Mac, 1920x1200 = Honor Pad 16:10, and 1520x1266 = the Fold's 2176x1812 landscape aspect, which a 1440-high display cannot open at full size).

- Edit-mode tests: 88/88 pass. Python self-checks: still metrics 9/9, crash analyzer 2/2.
- Stills: 54/54 written at each aspect (`final/stills-*`, 960 px JPEG copies; the metrics were measured on the full-size PNGs).
- Crash repro, Calm off and Calm on: 21 teleports each, camera_ok 0 failures, FX 25/25 teleports clean (no particle or tyre-track streak).

## What changed, per fix

1. **Un-wash the frame (lighting).** Root cause found on the merged build: the URP renderer asset had no `postProcessData`, so URP switched off all post-processing (tonemapping, grade, bloom, DoF) in every camera. Fixed in the asset and in `ProjectSetup`, with a test. Then: fog density per weather (clear 0.006, snow 0.0085, blizzard 0.022), snow albedo about 0.85, darker ambient, post exposure +0.4 EV with Neutral tonemapping, contrast 12, saturation 14.
2. **Ground everything (lighting).** Sun behind and to the side so shadows fall onto the road top, shadow distance 55 m with cascades on the lane, soft shadows on High, a shadowless fill from the camera side, contact shadows at each wheel (and a body blob on Low).
3. **Fences and props on slopes (level).** `FencePlanner`: rails post to post on the ground, broken at cliffs, fence 7 m behind the lane so it never crosses the truck. Boulders sink 20%, trunks and the cabin sit on the lowest ground.
4. **Cut face and reframe (level).** Layered cut face (snow overhang, navy line, 4 strata, pebbles, icicles), smoothed back hill (no step walls), camera target lifted so the cut face is about 28% of the frame (was 44%).
5. **HUD (hud).** M's glossy kit art, 9-sliced on all four edges, Fill Center on, no gradient over the art, 3:1 contrast checked.
6. **FX pack (fx).** Wheel spray, landing puffs, exhaust (short puff at the stack), tyre tracks, cab beacon, night headlamps, gold finish sparkle; all cleared on teleport, all halved and calmed in Calm motion.
7. **Driver readable (driver).** Pupils were inside the eyes (fixed), head 1.3x, face inside the window, clearer glass, the woo arm waves out of the window (still in Calm motion).
8. **Outline, rim, drum (driver).** Weighted normals end the stipple, outline hull pushed back to end depth ties, rim blends instead of clipping, smooth drum with two spiral fins.
9. **Finish camera (level).** The truck stays inside 92% of the frame at any aspect, slow arc and push-in; Calm motion gets one still pose by a cut.
10. **Living world and the stills set (fx, tools).** Chimney smoke, roof snow, birds, a snow plough and a ski lift behind the lane. `-mmStills <dir> -mmStillsSet full` shoots every scenario and one on/off pair per effect on a truly frozen frame (`ReviewClock`).
11. **Benchmark (tools).** Warm-up pass, seeded preset order, every effect measured off and on, GPU time reported as `n/a` when the driver gives no reading.

Also found and fixed on the merged build: after an R restart at speed the camera cut at the fast-drive zoom and drifted 3 m (now lands on the settled framing); the crash analyzer counted the next restart's cut as a glide (fixed, with a self-check).

## Numbers

White clip in the play band (share of pixels flat white, limit 15%):

| still | before (p2-mac) | 16:10 | Fold |
|---|---|---|---|
| start | 59% | 0.6% | 0.2% |
| mid drive | 56% | 0.8% | 1.1% |
| jump | 47-59% | 0.9% | 1.2% |
| crash | - | 0.4% | 0.3% |
| finish | 34% | 1.1% | 2.1% |
| dawn / dusk / night | - | 0.2 / 0.2 / 0.2% | 0.2 / 0.2 / 0.2% |
| blizzard | 33% | 0.0% | 0.0% |
| frozen lake | - | 0.4% | 0.4% |
| calm jump / calm finish | - | 0.5 / 3.9% | 0.6 / 4.9% |

The only still over 15% is `fx_postprocess_off` (15.0-15.1%), the post-off reference, as expected. Shade against lit snow is about 1.5:1 (L-MM-28 floor 1.3). Full columns (contrast, saturation, black level, dark-channel haze) are in `final/stills-*/metrics.csv`.

fps per preset (Mac, uncapped, 40 s each after a warm-up; `final/bench/benchmark-summary.csv`):

| preset | avg ms | fps | 1% low fps | sim ms/step |
|---|---|---|---|---|
| Low | 0.87 | 1155 | 133 | 0.083 |
| Medium | 0.97 | 1035 | 129 | 0.084 |
| High | 1.26 | 792 | 125 | 0.081 |
| Ultra | 2.19 | 457 | 124 | 0.106 |

Per-effect cost on High (`final/bench/benchmark-features.csv`): every effect costs 0.14 ms or less per frame on this Mac; the largest are bloom 0.14 ms and post-processing 0.13 ms. On this machine that is close to the noise, so the tablet needs its own run.

On/off pairs (`final/stills-*/pairs.csv`): post-processing, bloom, DoF, shadows, contact shadows, outline, beacon, headlights, spray, sparkle and living world show a clear change at both aspects.

## Still open

- **SSAO pair shows no change** because the pairs are shot on High and SSAO is Ultra-only. It needs an Ultra pair.
- **Planar reflection pair:** the frozen-lake still shows almost no ice; the ice spot or framing needs a look.
- **Small effects near the line:** tyre tracks (the camera sees the road top almost edge-on), exhaust and landing puff on 16:10, light shafts on the Fold.
- **Falling snow** cannot be judged by a picture diff (two running snow frames always differ); it needs a particle-count check.
- **GPU timing** on this Mac with uncapped frames is sparse; GPU cost per preset needs a frame-capped run, ideally on the tablet.
- **rig_ok 11 per crash run** on R restarts: a known one-frame log-order artifact in the analyzer, unchanged from before the pass.
- **For M:** the look is softer and a little milky now that tonemapping really runs (contrast 0.13-0.14 RMS in day stills); the DELIVERED card still covers the drum at the finish; AGAIN and GARAGE share one plate colour; drum supports now use the body colour and the fins are cream.
