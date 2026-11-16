# Games project: lessons file

Every new thread reads this before starting work. It holds lessons from each self-review, plus proposed changes and whether M has approved them.
Process (M, 2026-10-28): a self-review runs after each delivery to M. Lessons go here and into project memory. Changes are PROPOSED to M and applied only after M says yes. Sources: M's corrections and interjections, timing per stage, and what M approved, ignored or overrode.
Detailed reviews: reviews-2026-10-28/ (R-research.md, R-glowmoth.md, R-pocketisle.md).

## Standing rules already in force (do not re-ask)
- Saiyan mode with max parallel agents, always.
- Art spend locked until M types `unlock art`. Quote before ANY credit spend (vidIQ included). Ask before installs.
- No video renders. Deliver the playable HTML plus a few stills.
- HTML first. Only then ask about an APK.
- M tests manually. No device matrices; just keep the aspect ratio of the devices M names (Honor Pad landscape, Fold).
- ~5-minute core-gameplay prototype for every new concept, before anything else.
- Time estimate every 2 min in build threads. Coordinator checks in every 5 min and pushes to expedite.
- "atc" = "anything else I should consider?". Answer with a tappable choice card (lettered, multi-select, plus "Something else"). Always, in every thread.
- Pocket Isle and later games: no age bias. Make it fun and give it real challenge.

## Lessons from 2026-10-28 (first review)
| # | Lesson | Evidence | Conf. |
|---|---|---|---|
| L1 | Recommendations missed M's taste about half the time. M leans toward more player control and challenge, "all" for free items, "none" for paid ones, leaner teams, and one concept at a time. | Glowmoth: 11 of 22 cards overridden. Pocket Isle: 12 of 23. Skills tiers: A/B/D all, C none. "forget the age bias" 12:34 | 0.85 |
| L2 | Admin defaults got passed off as M's wishes. "No failure, no timers" for age 6+ was never said by M, but every brief inherited it, and a pivot followed. | BRIEF.md 09:20 vs M's "6+. Web and mobile" 07:54 | 0.85 |
| L3 | Device matrices wasted about 96 min (100 emulated stills on 10 screens). M owns 2 devices and tests by hand. | 12:27-14:04 audit; rule at 14:58 | 0.9 |
| L4 | Silence makes M chase. 40 min with no update led to "status?" and "speed it up"; a 13-min gap came after GO. Threads that update their ETA don't get chased. | 08:21-09:01; 15:06-15:19; music thread | 0.9 |
| L5 | Estimates were in human days, but work runs in agent minutes. "~1 day" took ~45 min; "20-30 min" took 8. | Concept thread 08:05-09:10 | 0.85 |
| L6 | Nothing playable came early. M wants to feel the loop first (5-min rule at 15:20), and after GO wants the new mechanic fast. v5 took 42 min. | "anyway to expedite?" 14:58 | 0.85 |
| L7 | Questions came fragmented. About 11 petal decisions over 68 min, with scope (PWA/APK) asked last. A numbered sheet answered as "1A 2C" is much faster. Mockups on visual cards get a pick within 3 min. | Petal thread; coordinator sheet 15:23; 11:41 | 0.8 |
| L8 | Teams were too big for the value used. 8 roles wrote ~1,130 lines, merged to 51. Music: 13 files merged to 97 lines. Most of the work came from 2-3 roles. | R-research, R-pocketisle | 0.8 |
| L9 | Unneeded cards cost round trips: free cloud npm install (yes in 10 s), "launch now?" (answered "Not now", then a new brief), "what next?" (ignored). | Concept thread 07:54, 08:19 | 0.8 |
| L10 | A missing environment check blocked music for about 2 h 26 min (Claude Code version, manual `claude update`). | Glowmoth audio 09:16-12:xx | 0.75 |
| L11 | Reviewers silently changed M's exact spec ("0/4" counter became dots; lost petals floated back up). That cost a re-ask. | Petal review | 0.75 |
| L12 | A plan written early and then parked was half overturned when work resumed 3 h later. | Pocket Isle 09:21 plan, restart 12:31 | 0.7 |
| L13 | Credits were spent without a quote first (about 50 vidIQ credits). | Skills thread 06:21 | 0.9 |
| L14 | What worked: research done in parallel in 4-8 min, 5-card bursts answered in 2-5 min, v1 playable 16 min after the ask, the fix loop running 9-17 min after M steered, and the spend gates held. | All threads | 0.85 |

## Approved improvements (M said yes 2026-10-28 15:34 UTC): follow these as rules
- P1 APPROVED: every build plan covers only the devices M names, plus an aspect-ratio check. No stills matrix, and no fps claims from software GL.
- P2 APPROVED: recommendations follow M's taste profile (more control and challenge; "all" for free items, "none" for paid ones; one concept at a time). Label every assumption that M did not state as "admin default".
- P3 APPROVED: one numbered kickoff sheet per concept or feature, answered like "1A 2C". It covers who plays, difficulty with a reference game, devices and orientation, and HTML/PWA/APK scope. Attach mockups to visual questions.
- P4 APPROVED: after GO, ship a playable slice of the new mechanic within 10-15 min. Polish comes after.
- P5 APPROVED (soft): size each team to the task, keep full parallelism, and add no role unless it has a clear output. No fixed role cap.
- P6 APPROVED: post a progress or ETA line every 2 min while building, with no silent gaps. Give estimates in agent minutes, not human days.
- P7 APPROVED (partial): quote every credit spend up front, including vidIQ, OpenArt and any other paid tool. "Ask before installs" stays as it is, cloud npm included.
- P8 APPROVED: check the environment before any install plan (tool versions, MCP connections, manual steps bundled into the first plan).
- P9 APPROVED: build M's exact spec. Offer reviewer changes only as an option, never as the default.
- P10 APPROVED: one thread per concept, named for it. Move the work when the scope changes.

## Proposals pending
(none; the next self-review adds new ones here as PROPOSED)

## Proposed 2026-11-01 (Mixer Mad v6 GameUp)
Source: reviews-2026-11-01/R-mixer-mad-v6.md. Per M's update (2026-11-01): low-risk lessons are added as APPROVED (auto); big ones (scope, cost, M's workflow, spend) stay PROPOSED for M's card.
- L-MM-1 APPROVED (low-risk, auto): no hard-coded ★★★. Every finish action can give 1-2 stars, and a test proves it. Why: in v6, 5 of 6 finishes gave ★★★ for 1-6 taps; only the crane could be failed.
- L-MM-2 APPROVED (low-risk, auto): gameplay timers (crash reset, result delays) run on the sim clock, not `setTimeout`. Why: headless `tick()` tests showed a false crane result; this also lets pause work.
- L-MM-3 APPROVED (low-risk, auto): level checks use a bot policy sweep (a grid of gas/brake thresholds per vehicle and level) and report pass rate per level. One failing bot is a bot finding, not a level finding. Why: "bot can't pass L3" was a coasting dead band; the sweep passed all 18 vehicle-levels and showed a 75/45/30% curve.
- L-MM-4 APPROVED (low-risk, auto): honour `prefers-reduced-motion` from the first build (shake, confetti, bobbing buttons), and never use `force:true` clicks without an elementFromPoint check. Why: v6 ignores reduced motion, and the bobbing Pour button forced `force:true`, which hides real tap bugs.
- L-MM-5 APPROVED (M, 2026-11-01 17:26): a new vehicle ships with its own physics profile (centre of mass, torque vs top speed, tilt, crash tolerance), not only a skin and a finish. Why: v6's 6 vehicles share one body; the mixer and the excavator drive the same. This raises the cost per vehicle.
- L-MM-6 APPROVED (M, 2026-11-01 17:26): when two threads work on one game, the code thread owns the HTML and the art thread delivers a drop-in sprite module against a named build version. Why: the art brief was written while v5→v6 changed the code, so the spec can target old shapes. This changes M's thread workflow.

## Auto-added low-risk lessons (GameUp, Mixer Mad art fit test, 2026-11-01)
- AL-1: Sprite prompts must name the facing direction by where the cab/front sits ("cab at the RIGHT end"), not just "facing right". The first truck came back mirrored.
- AL-2: Ban near-key colours on objects by name (no pink, violet, magenta); give glass an explicit colour. A violet window broke magenta keying (46,500 px).
- AL-3: image2image from a sheet invents extra parts; say "nothing sticks up above X" and list parts to remove. Fixing from the previous output as the reference worked first try.
- AL-4: A single convex hull is not enough for a cab + drum truck; plan 2 convex parts per vehicle.
- AL-5: Run a small paid fit test (2-4 images) before any pack: here 110 credits caught 4 truck defects before ~990 credits of sprites.

## Added 2026-11-01 (Mixer Mad v7a GameUp)
Source: reviews-2026-11-01/R-mixer-mad-v7a.md. Low-risk lessons are APPROVED (auto); big ones stay PROPOSED for M's card.
- L-MM-7 APPROVED (low-risk, auto): penalty rules (spill, damage, fuel) are measured against the terrain under the vehicle, not absolute angles, and ship with a two-sided bot-sweep test (clean runs keep most of it; a real mistake costs). Why: v7a's tilt spill (|pitch| > 35.5°, per second) fires on its own 34-41° hills; 0/162 mixer policies kept ≥90% on L2/L3, and careful slow climbing lost the most.
- L-MM-8 APPROVED (low-risk, auto): any hold-to-fill with lag shows where the fill will settle (a ghost line), and is tested with a 0.25-0.35 s reaction bot: release at the line ≤★★, learned play ★★★. Why: v7a pour lag ≈0.45 s; releasing at the line gave 130% ★ in 12/12 runs.
- L-MM-9 APPROVED (low-risk, auto): a resource cap never acts as an automatic stop near the target; combine resource and skill stars with min(). Why: at 86-95% load, holding Pour until it stopped gave ★★★ with no skill.
- L-MM-10 APPROVED (low-risk, auto): the feedback words match the stars ("Perfect" every time must still reach ★★★). Why: four "Perfect push!" banners gave ★★ (89%).
- L-MM-11 APPROVED (low-risk, auto): every wall or bound is tested by holding into it for 5 s on every vehicle. Why: the new start wall flipped all 6 vehicles ("Roof hit!" at 2.9 s).
- L-MM-12 PROPOSED (big, needs M): M sets a difficulty target per mode (for example "a clean Full Load run keeps ≥90% on L1-L3"), and builders tune to it with the sweep. Why: v7a's Full Load had no target and shipped unwinnable on L2/L3; this sets the mode's difficulty, so it is M's call.

## Added 2026-11-01 (Mixer Mad v7b GameUp)
Source: reviews-2026-11-01/R-mixer-mad-v7b.md. Low-risk lessons are APPROVED (auto); big ones stay PROPOSED for M's card.
- L-MM-13 APPROVED (low-risk, auto): placement helpers report what they placed, and a test asserts the spec'd count of zones, props and lumps per level. Why: v7b's rain level shipped with 0 mud zones (flatSpots found no spot), 2 of 8 snow lumps and 2-6 of 8 props.
- L-MM-14 APPROVED (low-risk, auto): every environment effect ships with a paired on/off sweep (same policy, same geometry) showing the designed change, and any cap is checked against the values it caps. Why: the rain grip cap (26 x 0.7 = 18.2) sat above the gas force of 5 of 6 vehicles, so rain changed time by only +2-7%.
- L-MM-15 APPROVED (low-risk, auto): a rate cap written as "X per T" is built and tested as a sliding window; a bucket of X refilling at X/T allows 2X. Why: the prop cap "1.5 per 0.5 s" measured 3.0.
- L-MM-16 APPROVED (low-risk, auto): drag and slow zones ease in at their edge and sit at least 4 m from bumps, jumps and landings; check crash spots with the zone on vs off. Why: L5 slush right after the bumps took 10 of 10 crane crashes at x≈32.
- L-MM-17 APPROVED (M 18:10, "Mild"): weather target per level = +10-25% time vs clear, bot pass rate within 3 of 18 policies of clear. Why: v7b weather had no target and is mostly cosmetic; this sets how hard each weather is, so it is M's call.

## Added 2026-11-01 (Mixer Mad v7e GameUp)
Source: reviews-2026-11-01/R-mixer-mad-v7e.md. Low-risk lessons are AUTO-ADDED; big ones stay PROPOSED for M's card.
- L-MM-18 AUTO-ADDED (low-risk): every respawn and replay path (crash respawn, Again, Retry) restores level objects that change during a run (falling, breaking, moving), keeping only player progress (a built bridge, a filled hole); test: change each object, crash, then finish. Why: v7e Yard 1 planks stayed gone after a crash or Again, so the pit could not be crossed (8 falls in 40 s).
- L-MM-19 AUTO-ADDED (low-risk): an action that freezes the vehicle must be completable from every spot where it can start (test both edges of the trigger window), or let the player move or cancel. Why: stopping at the near edge of the crane STOP window put the beam out of reach (hook 1.57 m vs 1.75 needed) with the truck frozen.
- L-MM-20 AUTO-ADDED (low-risk): generated or seeded levels (Daily) are bot-swept over at least 60 seeds before shipping, and the generator re-rolls a seed that no policy passes. Why: 15 of 60 Daily Dig dates had 0 of 22 passing policies.
- L-MM-21 AUTO-ADDED (low-risk): par times and badge targets are measured per vehicle and level from the sweep, with a two-sided test (at least one policy makes it, at most half of the clean passes do). Why: par from maxV left the crane 0 under par on 6 of 8 levels while the dozer made it on all 8.
- L-MM-22 DECLINED (M 18:41 chose "Every replay": Daily replays keep giving fragments; current behaviour stays). Original proposal: Daily Dig gives its fossil fragment once per date; replays give stars and badges only. Why: "Play Daily Dig again" gives a new fragment of the same dino each time (3 replays complete it); this sets the reward pace, so it is M's call.

## Added 2026-11-01 (M: "the UI panel did a poor job of identifying issues in the image. help them learn")
- L-UI-1 APPROVED (M asked for it): every screenshot review runs a fixed "world fit" checklist on zoomed crops (2-4x) before any style notes. Check:
  1. Contact: every vehicle, prop and pile touches its ground line. No gap under the wheels or tracks, and no sinking.
  2. Overlap: world objects don't wrongly cover each other, e.g. a dirt mound drawn over a hole, or a prop through a wall.
  3. Art quality: any code-drawn stand-in next to kit art (fossils, icons) is flagged if it reads poorer than the kit.
  4. Text-plate fit: every label sits fully inside its plate or button art, with no stretched or mismatched background boxes.
  5. One finding per object, with a crop and coordinates.
  Why: on the v7f dig screen the panel missed all four issues M saw: the vehicle off the ground, the mound over the hole, a poor fossil, and a scoop label box that didn't fit.
- L-UI-2 APPROVED: a review is not done until it reports for each item of the L-UI-1 checklist, even when the answer is "none found". "Looks polished" with no checklist counts as a failed review.

## Added 2026-11-01 (Mixer Mad v7f GameUp)
Source: reviews-2026-11-01/R-mixer-mad-v7f.md. Low-risk lessons are AUTO-ADDED; big ones stay PROPOSED for M's card.
- L-MM-23 AUTO-ADDED (low-risk): kit-art buttons and panels slice all four edges and draw the art's own centre (`fill`); no gradient box laid over kit art; check with 3x crops of each button at rest and pressed. Why: v7f used top slice 0 plus a gradient padding-box, so every kit button showed a pasted plate with no top rim (Replay: cream on orange).
- L-MM-24 AUTO-ADDED (low-risk): any hole or pit the player sees is cut into the terrain collider (or props are kept out of it), with its rim at ground level. Why: the v7f dig hole is paint only and drawn 0.19 m above the ground, so a cone rests over the opening in both stills.
- L-MM-25 AUTO-ADDED (low-risk): every jump lands on at least 6-8 m of flat before the next climb, with a drop of 3 m or less unless the level is meant to be hard; the sweep reports crash x positions so landing clusters show. Why: v7f L3 crashes cluster at x 40-44 after a 4 m drop onto a 4 m flat into a hill (mixer 1-2/18, roller 3/18).
- L-MM-26 AUTO-ADDED (low-risk): multi-piece sprites (fossils, kits) ship with a layout table so the pieces read as the whole object; a grid placeholder is an L-UI-1 item 3 finding. Why: the v7f Velociraptor showed as 6 loose bones in a 3x2 grid.
- L-MM-27 PROPOSED (big, needs M): a difficulty-curve target for the classic levels (a per-level bot pass-rate band, like L-MM-17 for weather). Why: L3 was "softened" twice with no target and is still harder than L4-L6 for 3 vehicles; this sets how hard the game is, so it is M's call.

## Added 2026-11-02 (Mixer Mad Unity P2 GameUp)
Source: games-design/mixer-mad/2026-11-02-unity-p2-gameup.md. Low-risk lessons are AUTO-ADDED; big ones stay PROPOSED for M's card.
- L-MM-28 AUTO-ADDED (low-risk): every 3D still gets a clipping check: flat near-white (or near-black) pixels are under 15% of the play band, and shade on the main ground reads at least 1.3:1 against lit ground; measured on the PNG, not eyeballed. Why: P2 snowy pass had 50-58% of the play band flat white (236,236,236), so no shadow or form showed.
- L-MM-29 AUTO-ADDED (low-risk): fog and haze are budgeted at the camera-to-lane distance (S1 cap: 10% on the play lane), with a unit test on the fog maths at the rig distance. Why: snow fog exp2 0.014 at 31.7 m gave 18% haze over the truck.
- L-MM-30 AUTO-ADDED (low-risk): shadow distance is set from the camera rig (lane distance plus the depth that must show shadows), and the key light sits so shadows fall on surfaces the camera sees; a contact shadow under each wheel is a P-phase acceptance still. Why: shadowDistance 35 m vs lane at 31.7 m and a camera-side sun left nothing grounded.
- L-MM-31 AUTO-ADDED (low-risk): procedural props on slopes are placed per span (both ends sampled, rotated to the slope, a closing post on every run) and kept at least 2 m behind the lane edge; a test asserts every foot within 0.05 m of the ground. Why: P2 fence rails sat at constant height, floated with orphan ends, and crossed the truck in 3 of 4 stills.
- L-MM-32 AUTO-ADDED (low-risk): every quality-preset field is consumed by code; a test fails on a field nothing reads. Why: Ultra listed SSAO and light shafts, but no code applied them and the URP renderer feature list was empty.
- L-MM-33 AUTO-ADDED (low-risk): each showcase effect is proven by an on/off still pair, and bloom needs HDR emitters above its threshold in the shot (lamps, beacons, gold). Why: P2 bloom (threshold 1.0) had nothing to catch, and no still proved shadows, DoF, planar or day-night.
- L-MM-34 AUTO-ADDED (low-risk): the review still set covers what the phase promises (each time of day, each weather, special surfaces, the finish, Calm motion) at M's two aspects (Honor Pad 16:10, Fold); still not a device matrix (P1). Why: P2 promised day-night, blizzard and icy reflections; the 4 stills were all daytime 16:9.
- L-MM-35 AUTO-ADDED (low-risk): benchmarks run a warm-up pass, shuffle the preset order, and log per-feature toggle costs (S2 profiling step 3), not only per-preset totals. Why: Low showed sim 0.090 ms/step vs 0.005 on the others (first-run warm-up), and no feature costs were recorded.
- L-MM-36 PROPOSED (big, needs M): add a Mac-only "Showcase" preset above Ultra (supersampling, planar and soft shadows every frame, VFX Graph particles, contact shadows, heavier fog volumes) that spends a real GPU budget on the Mac (target about 8-12 ms), while the Pad presets keep High = 60 fps. Why: the M4 Pro ran Ultra at 983 fps (GPU 2.28 ms), so the Mac app showcase used about a tenth of its frame; this changes scope and cost (about +60-120 agent-min).
- L-MM-37 PROPOSED (big, needs M): pull a Honor Pad test APK fps probe forward from P6 to right after the P2 polish round (needs the Android module install ask). Why: Mac numbers don't transfer; a rough scaling (GPU 1.0 ms at 1.3 MP, about 2x the pixels on the Pad, an estimated 8-12x weaker GPU) puts Pad High near or over its 14.5 ms budget before the missing effects are added; this changes the phase plan and needs an install.
