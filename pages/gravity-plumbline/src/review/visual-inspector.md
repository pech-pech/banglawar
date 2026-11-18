# Visual QA inspector: gravity-plumbline (initial pass, user-directed)

Shots: /home/user/repo/pages/gravity-plumbline/src/review/shots-vi/ (prefix = viewport width, 475x638 and 344x882, dsf 2).
Viewed in full: menu x2, tutorial rooms 1-3 x2 viewports, shaft rooms 1,3,5,7 (475 only), death x2, complete x2, plus close-ups (344 HUD, 475 gate, 475 bottom strip).
NOT viewed: 344 shaft rooms (captured, not opened), 100/150 ms frames, mid-fall frames, charge pips with 0/1 charge (always saw 2 gold), crumble animation, Best times screen, seed-entry input, tuning panel. Console: only a service-worker error caused by my test server (no MIME type for sw.js); no game errors.
Not tested with a real finger, so thumb coverage is judged from the drawn strip only.

## Defects (ranked)

1. HIGH. 344x882 HUD text collides with the buttons. Title "2/3 Charge Banking" cuts off as "Bankir" and "deaths" is clipped ("death", "deaths" half hidden) behind the Sound button. Shots: 344-tut2-700.png, 344-tut3-700.png, 344-cu-hud.png.
   - A (recommended): shrink or ellipsize the title and drop the stats line to two rows when the width is under about 400 px. Cost: small layout code.
   - B: shrink the three buttons on narrow screens (smaller min width). Cost: smaller touch targets.
   - C: move Sound/Copy/Path to a second row under the stats. Cost: HUD band grows about 40 px.

2. HIGH. The teach banner hides the top of the playfield and hazards. In 475x638 the banner (y about 190-250 px) covers the room's top strip; in tut2 it cuts the top-right spikes (475-tut2-700.png) and in tut3 on 344 it truncates the crusher body at the room top (344-tut3-700.png). On 344 it is also full-width dark and merges with the room wall, so its edge is unclear (344-tut1-700.png).
   - A (recommended): reserve a banner row above the room (shift the room down) so nothing is covered.
   - B: put the banner in the empty band at the bottom of the 344 screen / thumb zone and fade it after 4 s. Cost: the text is nearer the thumbs.
   - C: keep it, but make it translucent and shorter (one line). Cost: still hides about 40 px of room.

3. MEDIUM. The debug footer "seed N  60 fps" is drawn on top of the room's bottom wall at 475x638 and is clipped to "seed 1 ...". Shots: 475-cu-bottom.png and every 475 play shot. On 344 it sits in free space and reads fine.
   - A (recommended): hide the fps/seed footer unless the tuning panel is open.
   - B: move it above the bottom wall inside the HUD band.
   - C: draw it with a cream chip so the clipping is gone.

4. MEDIUM. At 344x882 the room fills only the upper 70% of the screen. About 330 px at the bottom is blank except the hint text, so the room is smaller than it could be (344-tut1-700.png). At 475x638 the room fills the screen but the thumb-strip tint covers the lower 40% and darkens the exit and spikes in shaft 3, 5 and 7 (475-shaft3-800.png), still readable.
   - A (recommended): scale the room to the available height on tall screens (keep aspect ratio, cap by width).
   - B: leave the blank area as the thumb zone and say so in the hint. Cost: smaller room, tiny hazards.
   - C: lighten the thumb tint to about half. Cost: weaker thumb-zone cue.

5. MEDIUM. Spikes overlap the exit ring in shaft room 3: the right-wall spike column ends on the ring's top-right (475-shaft3-800.png). The ring also sits half-cut by the floor in every room, so the ring reads as a half circle.
   - A (recommended): keep 1 cell clear of spikes around the exit in the generator.
   - B: draw the exit ring fully above the floor with a small stand. Cost: tweak of the exit y.
   - C: leave the overlap. Cost: unfair-looking death near the goal.

6. MEDIUM. Gate arrows are weak. The one-way gate is a thin gold bar with one small dark triangle at the centre (475-cu-gate.png); the crumbling ledge and the dashed "ghost" gate look the same family, and the dashed grey one has no arrow at all. A new player cannot tell which way a gate lets them through.
   - A (recommended): repeat 3-4 chevrons along the gate, in the direction of passage.
   - B: tint the gate edge on the open side only. Cost: subtler.
   - C: keep the single triangle but make it bigger. Cost: still one cue.

7. LOW. Crushers use mid-slate (about #3b4252) with a 1 px ink outline, close to the black walls and not hazard red. The danger reading comes from the dotted rail only (475-shaft5-800.png, 475-shaft7-800.png).
   - A (recommended): add a red edge or red teeth strip on the underside.
   - B: darker fill plus hazard stripes. Cost: more draw code.
   - C: leave it. Cost: players may think it is a platform.

8. LOW. Inconsistent strokes: HUD buttons 3 px ink, the player's ring 2 px gold, exit ring 3 px ink plus 2 px gold, gate bar 2 px, crusher 1 px, grid lines about 1 px. The complete-screen Menu button is a rounded white-outlined pill while all other buttons are square outlined (475-complete2.png).
   - A (recommended): set one stroke width (2 px) for world items and 3 px for buttons; square Menu button.
   - B: only fix the Menu button. Cost: low.
   - C: leave it.

9. LOW. Complete screen is semi-transparent, so the ghosted HUD, teach banner and a ghost platform edge show through the stats ("Medal: PLUMB" over the ghost ledge, 475-complete2.png). "New best!" and "tap to continue" use hazard red.
   - A (recommended): fade the play layer to the background colour (opaque) behind the stats.
   - B: use a different accent (gold or ink) for "New best" and "tap to continue". Cost: none.
   - C: leave it.

10. LOW. Menu at 475x638: the subtitle "Flip gravity. Reach the exit." touches the top of the first button (no gap), and the button column is narrower than at 344 so the large empty area below the list wastes the space (475-menu.png). 344 menu is fine.
   - A (recommended): add about 16 px between subtitle and buttons.
   - B: leave it.

11. LOW. Charge pips are the only state indicator and both are the same gold with ink outline; I only saw the full state. If an empty pip is not clearly different when I did not test it, that is a risk (not verified).
   - A (recommended): the maker supplies a 0/1/2 charge close-up for me to check on the targeted recheck.

## Lessons for the main session to log (QA-xxx)
- Check the HUD text width against button rects at the narrowest viewport (344).
- The teach banner and footer must live outside the room rect.
- Hazards must keep a clear cell around the exit.

## Self-review
Went well: all required states reached; death and complete forced via PL_TEST state edits. Slowed: death via natural play never fired, so I teleported the ball. I did not open the 344 shaft shots or the 0/1 charge pips. Improvements: (1) Option: "Add pre-built state recipes" - a per-game list of ways to force death, win and 0 charges; benefit: faster, complete coverage. (2) Option: "Require a read of all captures" - a rule to open every capture before reporting; benefit: no unviewed states.

## Status
Done: initial pass. Next: the user picks fixes, then a targeted recheck. Blockers: none. Feedback: service worker needs correct MIME on any test server, not a game bug.

QA inspector: initial pass, user-directed (24 states, 8 close-ups viewed)
