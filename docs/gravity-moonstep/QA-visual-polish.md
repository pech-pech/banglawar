# Moonstep visual QA (initial pass, read-only)

Viewed in full (688px-wide 2x renders): title, play-idle, play-midair, play-midair-late, play-charging-assist, body-spin, body-crumble, body-repel, over-gold, over-none, medals, howto, pause, settings, records-attempts, plus 475x638 play-midair and over-moon. Also viewed look/ink.png.
NOT viewed: the other 475x638 twins, title-firstrun, over-bronze/silver/natural, records-best/attempts-direct, settings-reset-confirm, and ui/*.png refs other than ink. No tight 2x crops were cut. I judged from the 2x full-frame renders. Tap sizes are estimated from pixels, not measured in the DOM.

## Defects, ranked

1. HIGH, quick. Results copy is wrong. "Every medal earned. The moon is yours." shows on No-medal (60 m), Gold and Moon screens. It looks like a hard-coded or stale line.
   - A. Show it only for Moon (recommended).
   - B. Swap in a per-medal line ("Next: Silver at 400 m").
   - C. Remove the line.
2. HIGH, quick. "Replay: FAIL" in red on every results screen (over-none, over-gold, over-moon). It reads as a bug or debug text to a player.
   - A. Hide it unless a debug flag is set (recommended).
   - B. Reword it to "Replay verified" on pass and hide it on fail.
   - C. Move it into the Copy report text only.
3. HIGH, time-consuming. The landing marker (silver ring, per howto step 2) never appears in any play shot, including charging-assist. Only the dotted arc shows. The how-to promises the ring.
   - A. Draw the ring at the predicted landing point while aiming (recommended).
   - B. Reword the how-to to match the build.
   - C. Add an arc-end dot only.
4. HIGH, time-consuming. Thumb zone and look mismatch. The ink design has a ring thumb-pad at the bottom of the ink (hold/aim/release). The build leaves the bottom ink empty (play-idle: 60% black void). The "hold · aim · release" hint floats at mid-screen over planets, with a glow smear and low contrast (body-spin/crumble/repel). In charging and late-midair it collides with the "Tide rising" pill.
   - A. Pin the hint and a thumb-pad ring inside the ink, and move the pill above the ink line (recommended).
   - B. Only fix the hint position and the pill overlap (quick).
   - C. Hide the hint after the first launch.
5. MED, time-consuming. Camera and scale don't match ink.png. Planets are about 2x the ink reference's size, and each field shows only 1-3 moons. HUD text (next-medal line, progress bar, chain) is drawn over planets, so the "next · Bronze" line has art behind it. The ink ref shows a small "1,284 m + medal chip II + Silver" pill and nothing else.
   - A. Zoom out about 30% and add a cream scrim behind the HUD (recommended).
   - B. Scrim only (quick).
   - C. Strip the HUD to the ink pill and move the rest to pause.
6. MED, quick. The "NEW BEST" stamp overlaps the "Previous 40 m on this seed" line on every results screen. The large gap between the card and the buttons is dead space.
   - A. Add 12px margin below the stamp and pull the buttons up (recommended).
   - B. Move the stamp to the card's top-right corner.
7. MED, quick. Crumble and spin cues are weak. Spin shows gold ticks only (readable). The crumble crack and dashed ring appear only on a planet at the screen edge (body-crumble, left). The crumble countdown is not visible. The repel red ring and ticks are clear.
   - A. Thicken the crack lines and add a shrinking ring or a shake (recommended).
   - B. Tint crumble planets warm-grey.
8. MED, quick. Tap targets under 56 css px (estimated): the seed chip "qa1" and "Replay" chip on results (44 px; ignore if not interactive), the Attempts tabs (about 50 px), and the title settings button and top-left back/close buttons (about 55 px). The pause "Retry seed" wraps to two lines.
   - A. Min-size 56px on all buttons and shorten the label to "Retry" (recommended).
   - B. Fix only the interactive items.
9. LOW, quick. Title: the tagline "A CLIMB BY MOONLIGHT" runs into the settings button (8px gap). The "How to play" dashed button is low contrast.
   - A. Add a right margin to the tagline and darken the dashed border (recommended).
   - B. Move settings out of the title row.
10. LOW, quick. The HUD "Tide rising" pill is red text on cream. It is readable, but it jumps and sits over the ink edge at 25 m. Thumb zone: the pill and hint fight (see 4). The pause card has a large empty centre. Fine to leave.
11. LOW, quick. Copy hygiene. The hyphen in "Swallowed by the tide - the ink" should be an em dash. The attempt list repeats "tide" on every row, which carries no information.
    - A. Fix the dash; drop the pill when every row has it (recommended).

## On-model verdict
Paper, ink outlines, the pearl, the gold ring, moon hatching and the medal seals match the ink look. Medals, howto, settings and records screens are clean, with no text clipping seen. Main gaps are items 3-5.

## Self-review
- Went well: found real copy and state bugs fast from full views.
- Slowed or wrong: no 2x crops were cut, and 25+ of the 46 files were not opened, to stay within the time box.
- Improvement: add an automated tap-target measurement step (DOM bounding boxes) so sizes are measured, not estimated.

## Status
Done. Next: the main session asks the user for choices on 1-5 first. No blockers.

QA inspector: initial pass, user-directed (17 states, 0 close-ups viewed)
