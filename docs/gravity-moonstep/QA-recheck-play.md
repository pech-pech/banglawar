# QA recheck, gameplay group (read-only)

Viewed at 2x: play-charging-assist, play-idle, play-midair, play-midair-late, body-crumble, body-spin, body-repel (all 344x882); play-charging-assist and body-crumble at 475x638. Did not view the other 475x638 shots (play-idle, play-midair, play-midair-late, spin, repel).

## Prior items
- 3 Landing ring: PARTLY FIXED. A small dashed ring now sits at the arc end (charging-assist, both sizes), plus an amber ring on the ball. It is faint and small, not the silver ring the how-to describes.
- 4 Thumb zone and tide pill: PARTLY FIXED. The thumb-pad ring and hint are pinned in the ink, and the pill sits above the ink line in idle, charging and midair-late. NOT FIXED when the ink is off screen (spin, crumble, repel, midair): the pad ring and "hold · aim · release" fade to pale blue on cream and are barely legible, and the ring overlaps a planet. The Tide pill also floats over planets there (spin, crumble, repel, 475 crumble).
- 5 Scale and HUD scrim: PARTLY FIXED. A cream scrim now sits under the HUD, but planets are still large (about 1.5x the ink reference) and a planet still shows behind the "next · Bronze" line and progress bar (play-idle, play-midair).
- 7 Crumble cue: FIXED, with one gap. The crack lines are thick, the dashed red ring is clear and the planet is easy to spot. The countdown is still not visible. Spin ticks and the repel ring are fine.

## New defects
N1 (MED, quick). The Tide pill and thumb hint overlap planets in the off-screen-ink states.
- A. Put the pill on a fixed cream chip with a stronger scrim and pin it to the top HUD (recommended).
- B. Fade the pill out when the ink is more than 200 px below.
- C. Leave as is.

N2 (LOW, quick). The off-screen thumb hint is unreadable.
- A. Draw the hint dark with a cream halo when it is over cream (recommended).
- B. Hide the hint after the first launch.

N3 (LOW, quick). The landing ring is too faint.
- A. Raise the ring to 2px, silver, about 1.5x larger, and pulse it (recommended).
- B. Reword the how-to to "dotted ring".

QA inspector: initial pass, user-directed (7 states, 9 close-ups viewed)

## Self-review
Went well: each shot was viewed directly. Slowed: I skipped five of the 475x638 shots. Improvement: option "view both sizes only for states that differ", which saves time.

## Status
Done. Next: the main session asks the user about N1 to N3 and the partly fixed items 3, 4 and 5. No blockers.
