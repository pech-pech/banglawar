# Join slice B (UI flow): Starfall beta, 2026-11-19
Choices marked "admin default". Nothing committed.

## What changed
| File | Change |
|---|---|
| src/inline.py | Part order: core rooms tpl1 tpl2 camera tweak input assets light vfx skin? draw meta audio music-data music strings uikit screens ui (skin only when parts/skin.js exists; it does not today). theme-color #232a5c. Prints the part list. |
| src/shell.html | Title "Starfall"; night background; duplicate theme-color removed (inline.py adds one). |
| sw.js | VERSION 'pl-beta-1'; caches index, manifest, 3 icons and all 20 files in assets/, each with its own cache.add inside Promise.allSettled. |
| manifest.webmanifest | name/short_name "Starfall" (working name), theme #232a5c, background #151a3d. |
| src/parts/ui.js | Rewritten: screen machine, PL.Screens draw/layout/hit for every screen, settings, Tweak screen, audio + VFX wiring, Copy report, PL_TEST. Old long-press tuning panel, T key, DOM Menu/Reset buttons, seed overlay and HUD Copy/Path/Sound buttons removed. |
| src/test/e2e.js | Rewritten: whole journey (121 checks). |
| src/test/flow-shots.js | New: 18 screens x 3 viewports at DSF 2, plus a live-layout overlap check. |

Glue fixes outside my files:
- screens.js: `PL.Screens.padRects` is now the runtime swap point. ui.js points it at PL.Input.layout, which also supplies Retry, Pause and the teach slot. `opts.roomRect` takes the camera's fitted room rect. New `chips` rect sits under the HUD strip, so DEV/ART no longer collide with HUD text (CHECK #10). New `quality` ("Picture") settings row. Tweak rows support `kind` head/btns/slider. New `rowButtons()` helper. Tweak draw passes scroll. On the narrow Skip slot (344 wide) the label is the first word only. Shaft-pick tile text is wider, so "Same rooms for everyone today" fits.
- strings.js: settings.quality "Picture" + qualityOpts Auto/High/Low; dev strings for the Tweak screen (Reset all, Copy report, Save preset, Copy code, Paste code, toasts, prompts).

## Flow (admin defaults)
- **Cover:** "Tap to start" shows on every cold start, so audio can unlock. First run goes into the tutorial; later runs go to the menu. Skip is always shown in the tutorial. Finishing or skipping the tutorial sets settings.tutorialDone.
- **Menu:** key art plus a code-drawn title. Play opens the shaft pick. Practice replays the 3 tutorial rooms, with no best. Settings.
- **Shaft pick:**
  - Short is 5 rooms and Long is 7 rooms. Each run uses a fresh seed; `?seed=` forces one.
  - Daily is 5 rooms with the date seed.
  - Bests are keyed `short:0:5`, `long:0:7` and `daily:<date>:5`, so each length keeps its own best across seeds.
- **Death:**
  - The killer is found from the cause: nearest spike, current crusher rect, or a room edge strip. It gets a coral outline for 900 ms, drawn on the first frame.
  - The cause tag shows for 1.7 s. It shows only the icon after the same cause 3 times in a row.
  - Control comes back after core RESPAWN_T (0.3 s).
- **Room clear:** a card inside the room with time vs the best run's room time. It moves on after 1.2 s (counted in sim ticks) or on any tap or key after 0.2 s. A star wipe opens the next room.
- **Complete:** the medal comes from meta; plumb is shown as gold. Medal sting, Again or Menu. Tuned runs say "not saved".
- **Pause:** about -6 dB duck. A hidden tab pauses the climb. Leave asks to confirm.
- **Settings:** stored in `plumbline.settings.v1` through PL.store, so a newer v is never overwritten. Hand and vibration stay in PL.Input's own key. The old `plumbline.mute` key is migrated.
- **Gains:** music = Settings slider x AUD_MUSIC_GAIN; sounds = slider x SFX_GAIN.
- **Picture:** Auto/High/Low sets hud.quality. draw.js's FX_QUALITY tweak (above 0) overrides it. I did not add a second quality tweak.
- **Tweak screen:**
  - Groups from PL.Tweak, collapsed until tapped; sliders show a "*" when changed.
  - Row 1: Reset all and Copy report. Row 2: Save preset, Copy code and Paste code.
  - One row per preset, with Load (the name) and Delete.
  - Name entry and paste use a token-styled DOM overlay.
- **DEV badge** shows when PL.Tweak.isDirty(). The run stays tuned until it ends, so it is never saved.
- **ART: fallback chip** shows whenever PL.Assets.missing() is non-empty after loading. It is always visible, per the build ticket.
- **Audio:**
  - Unlock happens on the first pointerdown or keydown.
  - Music: cover none; menu and pick play menu; settings from the menu play settings; tutorial and practice play tutorial; shaft rooms play tier1-3 from the template tier.
  - Pad keys play padUp/Right/Down/Left. A key pressed at 0 moves plays noCharge, so the 30-40-30 buzz is not cut short.
  - The room-clear sting comes from the core 'win' event through audio.onEvents.
- **Tweak ids added:** AUD_MUSIC_ON, AUD_MUSIC_GAIN, SFX_GAIN, AUD_DUCK_DB, AUD_XFADE_S, AUD_PITCH_VAR and VFX_SHAKE (PL.Vfx.setShakeScale).
  - VFX_BLOOM, VFX_PARTICLES and VFX_AURORA register only if vfx.js exposes setBloom, setParticleScale or setAuroraSpeed. It does not today, so they are not in the build.
- **Draw contract:**
  - draw.js (join-skin) owns PL.Vfx init/resize/setRoom/update, and gets hud.events (all sim events this frame), hud.quality and hud.reduced. It draws the paper HUD only when hud.legacyHud is set.
  - ui.js calls Vfx.wipe/drawOverlay/setShakeScale and PL.drawPad. PL.drawPad draws the PL.Screens HUD and pad from PL.Input.view().

## Tests (2026-11-19 ~18:00)
| Test | Result |
|---|---|
| src/test/*.test.js | 12 files, all exit 0: assets 14, audio OK, core-fix 7, core-live 18, input 15, meta 7, shaft 12, sim 6, slice-core 7, tweak 18, uikit 10056 checks 0 fail, vfx 15. sim.test failed at my start ("different seeds differ": buildRooms ignores seed, rooms agent area) and passes now after their edit. |
| e2e.js | 121 passed, 0 failed (344x882 and 475x638 full journey; settings downgrade guard; ART chip with a blocked hero file; 816x568 smoke). |
| flow-shots.js | 54 PNG at src/review/shots-beta/flow-*.png; live-layout check found no overlaps and no target under 56 px. |
Shots viewed as contact sheets. Fixed after viewing: the 344 Skip label was cut off; the Daily subtitle was cut off; the play HUD showed faintly through Settings when opened from Pause (extra scrim added).

## Not done / not verified
- Bloom, particle and aurora-speed Tweak ids need setters in vfx.js.
- No streak, perfect-room star or 5-death nudge (SHOULD list).
- The tutorial teach shows for the whole room; it is not hidden after she acts.
- No real phone, finger, sound or vibration test. Audio was not heard; only the calls are checked.
- Service-worker install and offline mode were not exercised in a browser.
- Medal bands are untouched.
- e2e reads the tutorial room 1 solution from the sim, so it keeps working when the rooms agent changes the room.

## Self-review
- Went well: draw.js landed mid-task with a clean play-field-only contract. I moved Vfx ownership to it instead of updating Vfx twice.
- Slowed me: I copied my backups into the shared scratchpad root and may have overwritten another agent's same-named scratch files (ui.js, e2e.js, inline.py, sw.js and others). They now live in a join-ui/ subfolder.
- Improvement options:
  - (a) "Own scratch subfolder": always write to scratchpad/<role>-<topic>/. Benefit: no clobbering between parallel agents.
  - (b) "Contract file first": parallel slices write a 5-line hud/Vfx contract before coding. Benefit: no double ownership.
  - (c) "Shot sheet step": contact sheets per viewport are built into flow-shots. Benefit: faster visual QA.

## Status
- Done: build plus slice B wiring; tests green.
- Next: the lead merges, runs VQA on shots-beta/flow-*, and does the finger test on the Fold.
- Blockers: none.
- Feedback: VFX setters for bloom, particles and aurora belong to the vfx owner.
