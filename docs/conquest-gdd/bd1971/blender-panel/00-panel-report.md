# Blender panel: supervisor report (expert 6)

Date 2026-10-04. Inputs read as data: expert files 01 to 05 in this folder, `art-src/bd1971-pilot/README.md` (plus `EXPERT-NOTES.md`, `blender/pilot_tiles.py`, `blender/pilot_rig.py` by grep), banglawar `18-world-view-scores.md`, `19-blender-pilot-plan.md`, `05-theme-pack-spec.md` section 8.3, and the user skill `blender-team/SKILL.md`. Nothing downloaded, installed, committed or spent; no pilot file edited. Two probe scripts ran headless in the session scratchpad only.
Tags: **VERIFIED** = I ran it or read the source today. **UNVERIFIED** = taken from an expert file without re-checking.

## 0. Verdict in six lines
1. The panel agrees on the cause of the low pilot look score: faceted 20-face crowns plus a left-side sun and toon banding; R8a is smooth clay under top-front soft light.
2. The rework round needs **zero downloads and zero installs**: every recommended fix uses Blender 5.2.2 as installed (bmesh, EEVEE, Cycles, numpy, OIIO).
3. Two expert proposals break policy and are rejected: Depth Anything V2 Base/Large/Giant (CC-BY-NC) and any HDRI/photo texture in a shipped render (theme rule 2, no photographs; plus the pilot audit bans image textures).
4. The biggest conflict is not technical: plan 19 says "faceted, no smooth shading, crown 20 to 80 faces" and "rework = parameters only, no new tools". The fixes need an owner amendment of that clause.
5. SSIM against the concept is not a gate (both 04 and 05 measured why); gate on the look statistics of 04 and the geometry checks of 05, and keep the owner's four scores as the decision.
6. Open-asset packs are a later, separate decision: they collide with the theme pack's credits line "All pictures and text are original" and bring content risks (flags, statues).

## 1. Claims I verified myself

| # | Claim (expert) | How | Result |
|---|---|---|---|
| V1 | Icosphere subdivisions 1/2/3/4 give 20/80/320/1280 faces in 5.2 (03) | headless probe | **VERIFIED**: 20, 80, 320, 1280 on 5.2.2 LTS |
| V2 | Bundled Python has numpy and OpenImageIO; no PIL, cv2, scipy, skimage (05, README) | import probe | **VERIFIED** |
| V3 | `scene.node_tree` gone, `scene.compositing_node_group` present (01, 04) | hasattr probe | **VERIFIED** |
| V4 | EEVEE `use_soft_shadows`, `use_gtao`, `gtao_distance`, `use_bloom` removed; `use_raytracing`, `use_fast_gi`, `fast_gi_method` exist (04) | hasattr probe | **VERIFIED** |
| V5 | Engine id is `BLENDER_EEVEE`, not `BLENDER_EEVEE_NEXT` (01); Cycles and Workbench usable under `--factory-startup`; `cycles.seed` exists (04) | set-engine probe | **VERIFIED** (`BLENDER_EEVEE_NEXT` raises TypeError) |
| V6 | Metaball crown is deterministic in one process (03) | built twice | **VERIFIED**: 1010 faces, same vertex hash both times |
| V7 | Pilot check `crown_faces_20_to_80` exists; DETAIL=1 gives 4 x 20 = 80 faces (03) | read `pilot_tiles.py` lines 25, 232, 356 | **VERIFIED** |
| V8 | Pilot's smooth-variant sun sits left of the camera (04) | read `pilot_rig.py` line 77: azimuth minus 50 degrees, shadowless | **VERIFIED** |
| V9 | Plan 19 asks for faceted, no smooth shading, crown 20 to 80 faces; rework round = "profile, palette or recipe parameters only, no new tools" | read 19 lines 69, 112, 116 | **VERIFIED** |
| V10 | Content rules binding for any art method: no real insignia or flags, no red cross/crescent/crystal, no photographs or faces, no civilians or destroyed villages, equal art quality for both sides | read 05-theme-pack-spec section 8.3 | **VERIFIED** |
| V12 | Principled input is `Specular IOR Level` (no `Specular`); `Mesh.use_auto_smooth` gone; a new Color Ramp already has stops at 0 and 1 (04) | third probe | **VERIFIED** |
| V11 | The pilot's own scores (overall 2 to 3, lighting 2, viewpoint 5 at 2:1; hybrid 3) | grep of 18 | **NOT in 18.** They exist only in the skill file and expert 04's text. Colour score is not recorded anywhere I found. Fix: record them in 18 (step R1) |

Not re-checked (kept UNVERIFIED): 04's Cycles timings, the OKLab snap numbers (1% moved, SSIM 0.996), OIDN actually running, Cycles cross-process determinism; 01's extension pages; 02's licence pages (read through a summariser, re-read before any download).

## 2. Licence and content-rule check of every recommendation

Policy: CC0/public domain; CC-BY with an attribution file; permissive or GPL code as local tools only, never shipped. Content: theme pack 8.3 (rules 1 to 4 binding).

| Recommendation (expert) | Licence | Content | Ruling |
|---|---|---|---|
| Scripted CLI pipeline, audits, hash gates (01) | Blender GPL, tool only | n/a | **OK, adopt** |
| Blender MCP for inspection only (01) | already in session | n/a | **OK**; never build production sprites through it |
| Sprite Sheet Maker 5.3.1 (01, trial) | GPL-3.0+, tool | its pixelation resamples off-palette | **OK as tool, later round only**; plan 19 forbids new tools in the rework round |
| Sequenced Bake, PAWS Bakery, Ucupaint, retopo set, NodeSync, Blender Git, commercial sprite tools, second MCP, bpy wheel (01, skip) | GPL / paid / unread | n/a | **Agree: skip**. Paid items would also need a purchase yes |
| Poly Haven, ambientCG (02) | CC0 | photo-derived HDRIs and textures: rule 2 (no photographs) and the audit ban on image textures | **Colour reference only, read by eye. No HDRI or texture in any render.** 04's world-colour rig makes HDRIs unnecessary |
| Kenney Nature Kit (02) | CC0 | listing includes "statues" (may be figures) | **Hold**; if ever downloaded, delete statues and anything figurative |
| Kenney Watercraft Kit (02) | CC0 | flags and sails as parts; warship shapes | **Hold**; delete flags; reject warship hulls (integral) |
| Quaternius Stylized Nature MegaKit Standard (02) | CC0 (Pro/Source are purchases) | trees only | **Hold**; free tier only without a purchase yes |
| KayKit Medieval Builder (02) | CC0, name-your-price | medieval buildings off-theme | **Hold**; free option only |
| Sketchfab CC0/CC-BY single assets (02) | OK if the label is true | high people/logo/text risk; label is a claim, not proof | **Hold**; needs an owner login (I cannot create or use accounts) |
| Blender Studio CC BY 4.0 (02) | CC-BY: attribution | members-only download | **Hold**; owner's account, attribution line needed |
| BlenderKit Royalty Free, OGA-BY, CC-BY-SA/NC/ND, GPL art (02) | outside policy | n/a | **Reject** (02 already says so) |
| Every open asset in a shipped picture (02) | CC0/CC-BY | theme string `credits.licence` says "All pictures and text are original to this project" (picture half PROVISIONAL) | **Conflict, owner decision** (Q6). Until then: no third-party mesh in shipped pictures |
| Procedural recipes: SDF crown, metaball, voxel remesh, tea hill, paddy, thatch, bamboo, boat, cart, terrain (03) | own code | object names must use role words, never species or forbidden tokens ("crossbar" fails, "thwart" passes); cart has **no animal** in 3D (the ox exception covers only the banner pictogram, 18 end) | **OK** |
| Geometry-node crown (03) | own code | node names scanned by the audit | **OK but not in the rework round** (01: 5.2 changed GN access; bmesh is equal and simpler) |
| Cycles, EEVEE soft, toon ramp, compositor grade (04) | built-in | n/a | **OK**; compositor only for owner experiments |
| fSpy (05) | GPL desktop app | n/a | **Skip**: useless for orthographic art (05's own finding) |
| SAM / SAM 2, GroundingDINO (05) | licence UNVERIFIED | n/a | **Quarantine** until the licence file is read; not needed now |
| Depth Anything V2 Small (05) | Apache-2.0 (read by 05) | n/a | OK as tool, not needed now |
| Depth Anything V2 Base/Large/Giant (05) | **CC-BY-NC-4.0** | n/a | **Reject**: non-commercial |
| Apple Depth Pro (05) | custom licence, terms unread | n/a | **Quarantine** |
| Marigold normals (05) | Apache-2.0 | n/a | OK as tool, not needed now |
| LPIPS / DISTS (05) | BSD-style, needs PyTorch install | n/a | **Skip** for now (an install; owner-facing only) |
| Banner card generator (05) | own code | no text on banners; sickle and lantern pictograms flagged for a Bangladeshi reviewer (20-banner-content-check) | **OK** with the reviewer flag carried |

Content checks that apply to the whole round: field hospital shows no cross or crescent; HQ shows no flag; no people, faces, weapons, lettering; a lost base is a dismantled camp, never a destroyed village; **[S-6] equal quality**: the AI-side structures (camp, fortified post, cantonment gate) get the same recipes and face budgets as the player's, in the same round.

## 3. Conflicts between experts, and my resolution

| # | Conflict | Resolution |
|---|---|---|
| C1 | Crown faces: 03 says 300 to 1500 (s1) and 1200 to 1500 (s12) and also "320 shows corners"; pilot check is 20 to 80; plan 19 says faceted and no smooth shading | Replace `crown_faces_20_to_80` with **`crown_faces_1000_to_1600`** (SDF crown at subdivisions 4 = 1280, metaball about 1000 to 1500, both inside). Smooth shading on crowns and hills only; structures stay flat. **Needs the owner's amendment of plan 19 section 3.2** (Q1), because R8a, the settled anchor, is not faceted (EXPERT-NOTES s0.1) |
| C2 | 04 says icosphere subdivisions 3 makes "a clean clay ball"; 03 saw corners at 320 faces | At 64 px a crown is about 25 px and 320 faces may pass, but the owner scores the x2 review picture. Use subdivisions 4: cost is negligible (03: 0.02 s) |
| C3 | Crown recipe: SDF smooth union (03 pick), metaball, voxel remesh, GN noise | **SDF crown** is default (no modifier, no depsgraph, k = 0.07R to 0.10R). Metaball is the fallback. No GN, no remesh in the rework round |
| C4 | SSIM: the skill lists SSIM in the compare loop; 05 shows raw SSIM is dominated by 2 to 4 px shifts (0.69 at 4 px); 04 says SSIM against R8a is meaningless (different layout) | **No SSIM gate against a concept.** SSIM is used only for same-layout pairs (snap before/after at least 0.99, engine regression, supersample check). Blurred-luma SSIM (sigma about 8 px at compare size) is a logged trend only |
| C5 | Soft light (04: Cycles, graded) vs palette-exact (pilot toon ramp, plan 19 palette lock) | Two products per render: **graded master** for review, and **palette-snapped ship copy** (OKLab nearest over palette x the existing five `FACET_FACTORS`, no new tones without approval). Gate: moved pixels over 0.05 OKLab at most 2%. The owner scores the snapped copy, since it is what ships |
| C6 | Engine: 01 trusts Workbench/EEVEE (proven pixel-identical); 04 wants Cycles for the final look; Cycles cross-process determinism is UNVERIFIED | Iterate in EEVEE soft (ray tracing on, or AO does nothing: 04). Cycles (CPU, 64 samples, seed 0, no animated seed) becomes the delivered engine **only if** two separate processes give the same PNG hash; otherwise EEVEE soft is final. Cycles is built in, so it is not a "new tool", but it is a new variant: Q2 |
| C7 | Sun direction: pilot left-side sun (azimuth minus 50) vs 04's camera-aligned sun (elevation 70, world grey 0.5) | **Adopt 04**: measured left/right 1.12 to 1.03 versus R8a 0.96 |
| C8 | Palette: 04 wants +0.09 luma and +0.08 saturation; 05 k-means gives a different 12-colour set; plan 19 palette was sampled from R8a | Measure first (R2), change only if the gap persists after the light fix. A palette change is an owner approval (Q4) |
| C9 | Light-mode vocabulary: 05's spec has `flat_bands`, `toon_soft`, `soft_overcast`; 04 adds Cycles | Add `cycles_soft`. The spec's `render.engine` must match `light.mode` |
| C10 | Thresholds: 04 proposes look thresholds; 05 proposes IoU 0.85/0.6 and 1 px drift, both UNVERIFIED | Run 05's calibration (noise floors) on R8a and the existing pilot renders before any threshold gates a round. Until then all numbers are logged, not enforced |
| C11 | Open assets: 02 recommends approving four packs now; 02 and 03 also say 60 to 80% must be modelled anyway | **Defer all downloads**. The rework round is all procedural. Open assets wait for Q6 |

## 4. Roadmap for the Blender rework round

Constraint from plan 19 step 9: one rework round, parameters only, no new tools. Items R3 to R5 go beyond "parameters" and need the owner's yes (Q1, Q2) first.

| Step | What | Owner | Gate |
|---|---|---|---|
| R0 | Owner decisions Q1 to Q5 through the question window | main session | answers recorded |
| R1 | Record the pilot's scores (four categories, per variant) in 18; fill the missing colour score | main session | 18 updated |
| R2 | Baseline: run 04's metrics and 05's noise-floor calibration on R8a crops and the existing pilot renders (scratch copies, no pilot edits) | experts 4 and 5 | numbers in `metrics.json` |
| R3 | Light rig: camera-aligned sun, elevation 70, world grey 0.5; EEVEE soft with ray tracing; Cycles variant behind the hash test | expert 4 | left/right within 0.96 plus or minus 0.06; bottom/top 0.64 plus or minus 0.08 |
| R4 | Crowns: SDF crown, subdivisions 4, 5 to 7 lobes, k 0.07R to 0.10R; audit check renamed `crown_faces_1000_to_1600` | expert 3 | builds twice with the same hash; width at least 1.1 x height |
| R5 | Tea hill heightfield with row ridges; bamboo radius at least 0.03 m; boat and cart scale-ups; thatch gables; the same budgets for the AI-side structures | expert 3 | every visible feature at least 2 px at W=64; [S-6] parity |
| R6 | Output: graded master plus palette-snapped copy; moved-pixel report | expert 4 | at most 2% moved |
| R7 | Determinism: pixel hash twice in two processes for each engine used | expert 1 | equal hashes |
| R8 | Audit: content names, footprint, no image textures, key distance | expert 1 + supervisor | `pilot_audit` exit 0 on good, 1 on bad |
| R9 | Palette lift only if R2/R3 show a gap and Q4 is yes | expert 4 | hue and luma histogram overlap at least 0.80 |
| R10 | `report.json`: Blender version, spec, script and output hashes, metrics block, face counts | expert 1 | file present |
| R11 | Owner scores the snapped scene against R8a | owner | plan 19 pass: no category under 4, overall at least 4 |

**Download/install approvals for this round: none.** Separate approval items for later rounds, only if the owner asks for them (each is its own yes, with file name, source and size stated at the time):

| Item | Source | Licence | Size | Risk |
|---|---|---|---|---|
| A1 Sprite Sheet Maker 5.3.1 (animation round) | extensions.blender.org | GPL-3.0+, tool | UNVERIFIED | Python with user rights; declared permissions none, not a sandbox; install from a hashed zip into a throwaway profile |
| A2 Kenney Nature Kit | kenney.nl / opengameart.org | CC0 | about 10.5 MB (listing, UNVERIFIED) | statues may be figures; credits-line conflict (Q6) |
| A3 Kenney Watercraft Kit | kenney.nl | CC0 | UNVERIFIED | flags as parts; warship hulls |
| A4 Quaternius Stylized Nature MegaKit (Standard, free) | quaternius.com / itch.io | CC0 | not stated | generic trees, low |
| A5 KayKit Medieval Builder (free option) | kaylousberg.itch.io | CC0 | 14 MB | off-theme; low |
| A6 Git LFS | git-lfs.github.com | MIT | UNVERIFIED | only if `.blend` history is wanted; not recommended |
| A7 ML tools (SAM 2, Depth Anything V2 Small, Marigold) | GitHub / Hugging Face | Apache-2.0 (SAM 2 UNVERIFIED) | several GB with PyTorch (UNVERIFIED) | new Python environment; models trained on photos mislead on clay art (05); not recommended |

## 5. Standing team definition

| # | Expert | Remit | Inputs | Output (one file each) |
|---|---|---|---|---|
| 1 | Pipeline and tooling | headless CLI runs, audits, hash gates, report.json, Blender MCP for inspection, add-on vetting | spec JSON, pilot rig and audit, Blender release notes | `01-*.md`; gate scripts in scratch |
| 2 | Open assets and licensing | sources, licence records, provenance hashes, content screening of third-party files | owner's licence policy, theme pack 8.3, `ASSET_LICENSING.md` | `02-*.md`; one licence record per asset |
| 3 | Procedural modelling | bmesh recipes, face budgets, determinism, minimum feature size | spec objects and ratios, R8a measurements | `03-*.md`; builders that return mesh data |
| 4 | Lighting and look | light rig, engine, materials, grade, palette snap, look metrics | palette JSON, R8a crops, renders | `04-*.md`; `metrics.json` look block |
| 5 | Concept to spec | camera fit, grid, ratios, palette extraction, compare-and-correct loop, calibration | concept picture (measurement only, never a texture), renders | `05-*.md`; `<id>.spec.json` per iteration |
| 6 | Supervisor | licence and content check, conflict resolution, independent verification of at least five claims, roadmap, approvals list, skill update | all of the above | `00-panel-report.md`, `skill-update.md` |

Run procedure:
1. Main session offers the team through the question window: scope, round goal, spend (normally zero), downloads (normally none), panel size.
2. Experts 1 to 5 run in parallel in the background on a faster model, one output file each, no commits, no downloads, no installs, scratchpad only, pilot files read-only.
3. Supervisor runs after them, verifies claims headless, writes the report and the skill update.
4. Main session asks the owner each approval as its own item; builds only after the yes; reports.
5. After the owner scores, append the scores and lessons to 18 and to the skill.

Acceptance criteria tied to the owner's four scores (automatic numbers are pre-gates that must pass before the owner is asked; the owner's score decides):

| Owner score | Automatic pre-gate |
|---|---|
| Viewpoint | tile diamond ratio within 5% of the chosen profile (2:1 or 1.7:1); camera drift under 1 px at compare size after calibration |
| Colour | hue histogram overlap and luma histogram overlap at least 0.80 vs R8a crops; mean saturation within 0.05; palette distance under the accepted OKLab bound; moved pixels at most 2% |
| Lighting | interior gradient at most 1.5 x R8a; crown bottom/top 0.64 plus or minus 0.08; left/right 0.96 plus or minus 0.06; mean luma within 0.04 |
| Overall | audit clean; pixel hash stable; every piece's class nameable at game size (supervisor look); size ratios within the spec's min to max |
| Pass | plan 19: no category under 4 for at least one variant, overall at least 4 |

## 6. Open questions for the owner
1. **Amend plan 19 section 3.2?** Smooth-shaded crowns and hills (structures stay flat), crown budget 1000 to 1600 faces, replacing "faceted, no smooth shading, 20 to 80 faces". Without this the rework round cannot fix the look.
2. **Is Cycles allowed** in the rework round (built in, not a new tool), subject to the two-process hash test?
3. **Which copy ships:** the palette-snapped copy (recommended) or the graded master?
4. **Palette lift** of about +0.09 luma and +0.08 saturation if the light fix does not close the gap?
5. **Projection:** keep 2:1 (scored viewpoint 5) or try 1.7:1 (closer to R5c's measured ratio)?
6. **Open assets and the credits line:** the theme string says all pictures are original. Keep fully procedural (recommended), or allow modified CC0 bases with a credits entry?
7. **"Blender Lab" tooling:** expert 1 found no official product with that name. Is it a local tool, an add-on, or the Blender MCP already in this session?
8. **Animation:** are walk or idle cycles needed this round? (Decides whether A1 is ever asked.)
9. **Pilot scores:** please confirm the four scores per variant (the colour score is missing) so they can be written into 18.
10. **Photographic lighting:** may a CC0 HDRI light a render when it never appears in the picture, or does "no photographs" exclude it? (Panel advice: not needed; do not use.)


## Addendum (2026-10-04, owner answers after this report)
Q6 answered: the credits line is removed and open assets are allowed in prototypes (each download still a window approval). Q7 answered by the owner pointing at https://www.blender.org/lab/: it is Blender's innovation space; the MCP Server there is the add-on already in this session. Q8 answered: animation is needed (A1 Sprite Sheet Maker is back in scope). Q1 to Q4 answered earlier (plan amended, Cycles behind the hash test, snapped copy ships, 2:1 kept); palette lift not requested; shapes rework waits for the owner's yes. Q9: pilot scores are now recorded in 18-world-view-scores.md (A flat 2/5/3/2, B smooth 3/5/3/2). Q10: HDRI not used.
