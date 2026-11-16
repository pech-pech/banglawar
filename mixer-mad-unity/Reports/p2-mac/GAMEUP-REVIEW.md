# GameUp revision review: Mixer Mad Unity 6, P2 first playable slice (snowy pass, Mac app), 2026-11-02

Reviewer: pgs-qa-lead (gameup v2.5, PGS edition), run as a sub-agent. This is data, not a decision: the main session merges it, asks the questions and runs steps 6-7.

## Questions for the main session to ask (one at a time, recommended option first)
**Q1 (next step, gameup item 7):** "P2 polish: which fix round?"
- A (rec.) **Core polish, fixes 1-6** (un-wash, grounding, fences, cut face + reframe, HUD, FX pack): about 255-370 agent-min. Closes most of the "showcase" gap. Leaves the driver, outline, finish cam and living world for round 2.
- B **Everything, fixes 1-11**: about 480-680 agent-min, which overruns the P2 estimate (650-850 total). Needs the re-quote.
- C **S-effort fixes only (1, 3, 9)**: about 75-105 agent-min. Fixes the wash and the floating fences. Still not a showcase.
- D Backlog it and go to P3. Costs nothing now, but every later biome inherits the same exposure, shadow and fence bugs.

**Q2 (step 7, learning loop):** the draft MCQ is in step 7 below.

## Evidence used (and not used)
- Read: design doc section 7 overrides, S1 art, S2 rendering, S3 (first part); 4 stills at 1920x1080 (zoomed 3x crops); benchmark-summary.csv; build-report.json; the Unity source (QualityPresets, DayNight, Weather, SnowyPassDecor, RoadBuilder, Hud, DriverView, shaders, URP renderer asset, ProjectSettings); PARITY-REPORT.md; still-v7h-mixer.png; LESSONS.md.
- Measured (Python on the PNGs): luminance range, flat-white clipping share, WCAG contrast at chosen pixels.
- **Not done:** the game was not run (no Mac access). No separate-model judge (this sub-agent has no agent tool, so the visual scores are mine alone, not independent). No throttled or soak perf run. No reduced-motion (Calm) frames. No retro-log for Mixer Mad Unity was found in either folder. No device matrix: project rule P1 (Honor Pad + Fold aspect only) overrides gameup's matrix.

## 1. Scorecard (release-level: this is the first 3D build)
| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Design | 3 | Drive, jump and finish loop works (stills 1-4, parity 205/205). The "showcase / push it to the limit" feeling is not delivered: the look is a clean prototype, not a polished glossy-toy world. |
| 2 | Code | 3 | Sim kept separate (6 isolation tests). URP asset cloned at runtime, per-feature toggles exist. But the preset fields `ssao` and `lightShafts` are never read, and `m_RendererFeatures: []` means no SSAO/outline/contact feature. DoF `gaussianStart` is fixed at 34 m, even though the finish camera focuses at a few metres. |
| 3 | UI | 2 | Empty star sockets are 2.2:1 on the sky (needs 3:1). Gas/brake zones are 1.07:1 on the cut face (invisible). The HUD uses code-drawn flat plates, not M's 4 glossy 9-slice kits (design S5, L-MM-23). On the finish card, BRAKE and GAS stay on screen and the card covers the truck. |
| 4 | UX | 3 | Pause, Calm motion and quality picker are in the pause card. "WOOO!" air text is readable. Calm-motion frames were not captured. |
| 5 | Audio | n/a | No AudioSource in the slice. Audio is P5 scope. |
| 6 | Visuals | 2 | 50-58% of the play band (y 330-700) is flat clipped white (236,236,236). No shadow is visible in any still. The front cut face is one flat brown-grey wall taking 40-45% of the frame. Fence rails float. The truck outline is present, but the light rim is lost on white. Details below. |
| 7 | Kid safety | 3 | No network code, no analytics package. **But `submitAnalytics: 1` in ProjectSettings** (Unity hardware stats). See Blockers. |
| 8 | Performance | 3 | Mac M4 Pro, 1080p: High 1707 fps (GPU 1.01 ms), Ultra 983 fps (GPU 2.28 ms). The game is fast mainly because most showcase effects are missing or invisible. There are no per-feature costs, no throttled run, and no Pad number. Low preset sim 0.090 ms/step vs 0.005 on the others suggests a warm-up outlier. |
| 9 | Tokens | n/a | No token ledger was supplied. |
| 10 | Panel | n/a | No panel ran this phase. |
| 11 | Verification | 3 | Sim parity is excellent (bit-identical, 576-run sweep). Visual verification is thin: 4 stills, one aspect (16:9), all daytime. There are no frames for the frozen lake (planar), dusk/night, blizzard or Calm motion, and no contact test. |
| 12 | Orchestration | n/a | No evidence. Steps 6-7 are pending (main session). |
| 13 | Distribution | 4 | Private Mac .app, 78.2 MB, built in 5.8 s, 0 warnings/errors, offline. The Unity splash is on (Personal licence, expected). |

## 2. Blockers
- **B1 (kid safety, verify):** `ProjectSettings.asset` line 98 has `submitAnalytics: 1`. That is engine hardware-statistics reporting, which breaks the "no network calls" house rule unless M decides otherwise. Set it to 0 if the licence allows. If Personal can't turn it off, the main session asks M. Not verified at runtime.
- No failed composition assertions, because no composition contract exists for the 3D HUD yet. That gap is itself a Verification finding.

## 3. L-UI-1 world-fit checklist (zoomed crops, 3x; coordinates in 1920x1080 still pixels)
1. **Contact**
   - 01 start: the wheels meet the snow lip at y≈580-583. No gap found.
   - 02 mid-drive and 04 finish: **contact can't be verified**. The truck sits white-on-white with no contact shadow (02 wheels around (830,540) and (970,545); 04 front wheel cropped by the frame edge at y 1080).
   - Snow-capped boulders read as floating: 01 (530,410) and (617,368), 03 (1165,537). They are probably on the back slope, but nothing grounds them. Pine trunk bases have no contact shading either.
   - Verdict: **fail on readability**. No object in any still has a visible contact shadow.
2. **Overlap**
   - Fence rails cross the truck silhouette. In 02 at (1045-1145, 465-500), a rail sticks out of the cab front. In 03, rails run behind the wheels at (940-1080, 640-670), with a post between the wheels at (950, 560-690).
   - In 02, a boulder sits on a fence post at (250,490).
   - A grey blurred block (a terrain step wall seen in perspective plus fog) shows at 02 (0-130, 420-640) and 03 (670-710, 560-800), and as a dark smear at 04 (0-560, 700-1000).
   - In 04, the DELIVERED card covers the drum and the pour, which is the moment the finish exists to show.
3. **Art quality**
   - The HUD plates are code-drawn flat colour, not M's glossy kit art.
   - The drum reads lumpy (three bulges) next to the smooth spiral-finned v7h drum. The palette drifts from v7h: yellow chassis with an orange drum and white straps, against v7h's orange/cream cab and cream drum with an orange swirl. That is the "same toys, now 3D" check (S1 acceptance 1), so M's call.
   - A stipple of white dashes runs along the chassis top edge and drum straps (02 crop, around (800-1000, 420-440)): an outline or rim artefact.
4. **Text-plate fit**
   - LOAD, BRAKE, GAS, DELIVERED, AGAIN and GARAGE all sit inside their plates. None found.
   - Side note: empty and full stars differ only by grey vs gold fill (luminance helps, but adding a star glyph is safer).
5. **One finding per object:** see the defects table below.

## 4. Judged against the design (S1/S2 + section 7)
| Design item | P2 status | Evidence |
|---|---|---|
| Shadows (2 cascades High, 3 Ultra, 35 m) | **Not visible** | Shadow distance 35 m against a camera-to-lane distance of 31.7 m leaves 3.3 m behind the lane. The sun's `toSun.z = -0.55` puts the sun on the camera side, so shadows fall behind objects, out of view. On top of that, the ambient equator is #e2ecf8 and the snow clips to white, so lit and shadowed snow both render 236. |
| Bloom | **Invisible** | Threshold 1.0, and nothing in the shot is emissive above 1 (no cab beacon, headlights or gold). |
| Depth of field (finish) | **Not evident** | 04 background pines look sharp. `gaussianStart` is fixed at 34 m and max radius is 1.2. |
| Volumetric fog / light shafts / fog sheets | Fog = exp² haze only | Snow density 0.014 gives 18% haze at the lane (31.7 m), against S1's cap of 10% on the play lane. `lightShafts` is unwired. The mist layer is not visible in the stills. |
| Reflections (icy/planar) | **No evidence** | The frozen lake (x 100-160) is in no still. Planar code exists. |
| Particles | Snowfall only | No wheel snow spray, landing puff, exhaust or tyre-track decals (S2 section 7 lists tracks, max 64). |
| Day-night | **No evidence** | All 4 stills are daytime (12-min cycle). DayNight.cs has 8 keys plus a cabin night light, but no frame shows them. |
| SSAO (Ultra) | **Not built** | The preset flag exists, but the renderer feature list is empty. |
| Living world (S1 snowy pass: ski-lift chairs, distant plough, birds, chimney smoke, roof snow) | **None built** | A grep finds none of them. |
| Outline + rim | Outline yes, rim weak | The navy hull line reads at about 2-3 px (pass). The rim is lost on white, below S1's Y≥0.60 visible rim, and the stipple artefact needs fixing. |
| Ground cut face (S1: lit top lip #e8e0cc, navy top line, matte dirt) | **Flat wall** | RoadBuilder makes the front wall from 2 vertices per row with no strata, texture or lip line. Measured (154,142,137), and it fills 40-45% of the frame. v7h puts the ground line at 72% of screen height with textured dirt; P2 puts it at about 55%. |
| Driver | Small, mostly hat | At drive zoom the head is about 35-40 px, with the face hidden by the hat brim and window frame, so emotions can't be read. The face only reads in the finish close-up. |
| Scale (S1 acceptance 2: truck = 1/6 of screen width) | Pass | Body 305 px / 1920 = 0.16. |
| Washed-out HUD | Partly | The HUD itself isn't fogged, but its sockets and zones fail 3:1 and it sits on a hazed, low-contrast world (p1 luminance 0.14-0.17 in stills 1-3, so blacks are lifted). |

**The showcase gap in one line:** the slice is a correct, fast prototype with the effect switches in place. Most showcase effects are invisible (shadows, bloom, DoF), unbuilt (SSAO, light shafts, gameplay particles, living world) or unproven (planar, day-night). The GPU spends about 1 ms of a 16.7 ms frame on the Mac.

## 5. Defects (for pgs-test-engineer: each one as a failing test first)
| ID | Defect | Test that should fail now |
|---|---|---|
| D1 | Snow clipped to flat white across 50-58% of the play band | Still check: flat near-white (min channel ≥230, spread <8) under 15% of the band |
| D2 | Shadows not visible | Still check: the shadowed road lip next to a wheel is ≥1.3:1 against lit snow. Unit check: `shadowDistance ≥ rig distance + 15 m` |
| D3 | Fog over the play lane above 10% | Unit: exp²(density × 31.7) ≥ 0.90 for Clear and Snow (Blizzard excepted, documented) |
| D4 | Fence slats at constant y on slopes, orphan rail ends, fence crossing the truck | Unit: every post foot and slat end within 0.05 m of `HeightAt`; every run closes with a post; fence z ≥ lane edge + 2 m |
| D5 | Dead preset fields (`ssao`, `lightShafts`) | Reflection test: every `Preset` field is read somewhere outside the table |
| D6 | HUD socket 2.2:1, zones 1.07:1 | Contrast test on the brightest sky key: sockets ≥3:1 |
| D7 | Pedals shown during finish; card covers the truck | Finish state: pedals hidden; the card rect doesn't intersect the truck's screen bounds |
| D8 | DoF start fixed at 34 m | Finish cam: DoF start follows the focus distance |
| D9 | Outline stipple on the chassis top and straps | Visual (crop at 3x), plus smoothed-normal bake check on the FBX |
| D10 | Benchmark warm-up outlier (Low sim 0.090 ms) | Benchmark runs a warm-up pass and a shuffled preset order |

## 6. Ranked fix list for P2 polish (impact per effort; agent-min are estimates ±40%)
| Rank | Fix | Effort | Agent-min |
|---|---|---|---|
| 1 | **Un-wash the frame.** Fog density to ≤10% at the lane (snow about 0.009, or linear fog starting at 40 m). Snow albedo to about 0.85, exposure -0.5 EV. Darken the ambient equator and ground colours so shade reads. Target: under 15% clipped white in the play band; blacks back near the navy line. | S | 25-35 |
| 2 | **Ground everything.** Shadow distance about 50-60 m. Move the sun behind and to the side (`toSun.z` positive) so shadows land on the visible road top and front lip. Add a soft contact/AO blob under each wheel, boulder and post. Acceptance still: a shadow under each wheel. | S-M | 30-45 |
| 3 | **Fence and prop placement.** Rails span post-to-post with both ends sampled and rotated to the slope. Close every run with a post. Move the fence 2-3 m further back so it never crosses the truck. Sink boulders 20% into the snow, and keep them off posts. Add the D4 test. | S | 25-35 |
| 4 | **Cut face and reframe.** Snow overhang lip with a navy top line (S1). Triplanar frozen-soil strata, with pebbles, icicles under the lip, a vertical gradient and AO. Fix the step-wall blur. Reframe so the road sits at about 65-70% of screen height, as v7h does. | M | 45-60 |
| 5 | **HUD to kit art and 3:1.** M's glossy 9-slice kit for the pause button, load bar and sockets. Star sockets as a navy plate with a white ring and a star glyph. Zones either visible at ≥3:1 edge or hidden after the first run. Hide the pedals on finish. Move the DELIVERED card to the top third so the pour stays visible. | M | 40-60 |
| 6 | **Showcase FX pack.** Wheel snow spray, landing puff, exhaust (Shuriken, within the preset budgets). Tyre-track decals (max 64). Emissive cab beacon and headlights, plus gold and sparkle, so bloom has something to catch. Wire SSAO (Ultra) and light shafts. Make the mist sheets visible. One on/off still pair per effect. | L | 90-130 |
| 7 | **Driver visibility.** Head 1.3x, brim raised, bigger and clearer cab window, pupils ≥8 px at 1080p. Arms out of the window for "woo". | M | 30-45 |
| 8 | **Outline, rim and drum.** Fix the stipple (smoothed normals, hull depth offset). Rim to S1 strength on sky-facing edges. Smooth the drum with spiral fins. Palette per M's pick (see S1 acceptance 1). | M | 40-60 |
| 9 | **Finish camera.** Keep the wheels and the pour in frame, DoF start tied to focus, a slow push-in. Calm motion keeps it static. | S | 20-30 |
| 10 | **Living world and evidence stills.** Chimney smoke, birds, distant plough, ski-lift chairs (S1). Stills at dawn, dusk and night, blizzard, the frozen lake, Calm motion, and the 16:10 Pad and Fold aspects. | L | 100-135 |
| 11 | **Perf evidence.** Per-feature toggle CSV, warm-up pass, Low Power mode or 20-min soak on the Mac, and the Pad probe (see proposed lesson). | M | 30-40 |

Core polish (fixes 1-6) is about 255-370 agent-min; all 11 come to about 480-680. Re-quote P3 after this round (design section 4 gate).

## 7. Top 3 process improvements
1. **Stills script covers what the phase promises:** each time of day, each weather, the lake, the finish, Calm motion, and both of M's aspects. Saves a review round, because this review could not score half the effects.
2. **Per-feature cost CSV in the same benchmark run** (S2 section 12 step 3, already designed). Turns "is it worth it" into numbers and saves a profiling pass.
3. **Run the still metrics (clip share, contrast, contact) inside the build script** so the builder sees D1, D2 and D6 before handing off. Saves about 20-30 min per review.

## 8. Token ledger
n/a: no token counts were supplied. Biggest single cost of this review: reading the stills and source (about 20 files).

## 9. Human playtest list (M on the Mac)
- Does the truck feel grounded and heavy once shadows show?
- Is the snow glare comfortable after the un-wash?
- Do the gas/brake zones need a visible hint?
- Is the slow-mo on big air fun or too long?
- Can you read the driver's face while driving?
- Pick: v7h orange/cream palette, or the current yellow/orange?
- Calm motion: is anything still moving that shouldn't?
- Fan noise or heat on the Mac at Ultra over 10 minutes.

## 10. Answer, confidence, caveats
P2 is a solid engineering base: bit-identical sim, clean build, toggles and presets in place. Visually, though, it is about 40% of the "showcase" target. The biggest wins are cheap: un-wash, grounding and fences, together about 80-115 min.
Confidence: high on the measured items (clipping, contrast, fog math, unwired fields, fence code); medium on root causes I inferred from the code without running it (the sun side and why shadows are hidden); low on anything about the Pad. Caveats: no judge, no runtime check, the stills are the only frames.

## Step 6: retro-log entry (draft for the main session)
```
## 2026-11-02 Mixer Mad Unity P2 slice (snowy pass, Mac app): GameUp revision review (pgs-qa-lead)
Evidence: 4 stills 1080p, benchmark CSV, build report, Unity source, parity report. No judge, no runtime, no Pad.
Scores: Design 3, Code 3, UI 2, UX 3, Audio n/a, Visuals 2, Kid safety 3, Perf 3, Verification 3, Distribution 4.
Blocker: submitAnalytics=1 (verify/disable).
Top findings: 50-58% of play band clipped white; no visible shadows (shadowDistance 35 m vs lane at 31.7 m, sun on camera side, near-white ambient); fog 18% over lane (cap 10%); flat cut face fills 40-45% of frame; fence rails float and cross the truck; HUD sockets 2.2:1, zones 1.07:1, no kit art; ssao/lightShafts unwired; bloom has no emitters; no stills of lake/night/blizzard.
Perf: High 1707 fps, Ultra 983 fps on M4 Pro (GPU 1.0 / 2.3 ms): effects underspent on Mac; Pad unknown.
Fix plan: 11 ranked fixes, core 1-6 = 255-370 agent-min; Q1 pending with M.
Lessons: L-MM-28..L-MM-35 auto-added to LESSONS.md; L-MM-36, L-MM-37 proposed.
```

## Step 7: candidate lessons and ONE draft MCQ
Auto-added to `/mnt/project-files/games-lessons/LESSONS.md` under "Added 2026-11-02 (Mixer Mad Unity P2 GameUp)" (low-risk, project rule): L-MM-28 still clipping check; L-MM-29 fog budget at lane distance; L-MM-30 shadow distance from the rig and sun side; L-MM-31 slope-following props with a contact test; L-MM-32 no dead preset fields; L-MM-33 every effect needs an on/off still pair (and bloom needs emitters); L-MM-34 the still set covers the phase's promises and M's aspects; L-MM-35 benchmark warm-up, shuffle and per-feature costs.
Proposed (need M's yes): L-MM-36 Mac Showcase preset; L-MM-37 Pad probe pulled forward. Full text is in LESSONS.md.
For the PGS plugin's gameup copy (main session decides): L-MM-28/29/30/33 generalise to any 3D review and could become a "3D stills" rule in skills/gameup/.

**Draft MCQ (main session asks):** "Fold the 3D-review lessons into the PGS gameup skill?"
- A (rec.) **Fold L-MM-28, 29, 30 and 33** as one "3D stills: clip share, lane fog, contact shadow, effect on/off pairs" rule in gameup Rules. About 10 agent-min, then a plugin zip rebuild and your re-upload.
- B Fold all eight (L-MM-28 to L-MM-35): about 20 agent-min. The skill grows by about 8 lines, and some lessons are Unity-specific.
- C Notes only: keep them in LESSONS.md, don't change the skill. 0 min, but the next 3D review won't load them.
- D None.

## Self-review
- **Went well:** measured instead of eyeballing (clip share, contrast, fog math), and traced each visual symptom to a code line (shadow distance, sun side, fog density, fence placement, empty renderer features).
- **Slowed or went wrong:** I couldn't run the build or spawn a separate-model judge, so the visual scores are not independent. The stills don't cover the lake, night or weather, so several effects are "no evidence" rather than scored. No retro-log for this project was found to read first.
- **Improvements to my role instructions (MCQ-ready):**
  - A "Still metrics script": ship a small clip/contrast/contact script with the role. Benefit: same numbers every review, about 10 min saved.
  - B "Coverage gate before review": refuse to score effects with no still, and send a stills request first. Benefit: no half-empty scorecards.
  - C "Judge fallback": when no agent tool exists, say so at the top and mark the visual scores "single-reviewer". Benefit: clearer confidence for M.

## Status
- Done: review written. 8 lessons auto-added and 2 proposed in LESSONS.md.
- Next: the main session asks Q1 (fix scope), then runs step 6 (retro-log) and step 7 (MCQ). pgs-test-engineer turns D1-D10 into failing tests; pgs-producer plans the fix round.
- Blockers: B1 `submitAnalytics` (verify).
- Feedback for the administrator: please request stills of the lake, night, blizzard and Calm motion, plus the 16:10 aspect, from the builder before the next review.
