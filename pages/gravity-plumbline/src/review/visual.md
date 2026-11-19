# Visual review 2 (playwright, 2x DPR, 475x638 + 344x882 touch)
Shots: /home/user/repo/pages/gravity-plumbline/src/review/shots/ (`<WxH>-room{1,2,3}-start|midfall`, `-death`, `-complete`).
Note: the first index.html (20:35) had a doubled `<script><script>` and did not run at all; fixed by rebuild at 20:36. All below is on the rebuilt file.

## Fuzz (60 s per viewport, mixed taps/swipes/holds in strip)
443 and 424 actions: 0 console errors, 0 page errors, 0 NaN in PL_TEST.getState() x/y/vx/vy. PASS.
Passes: buttons Copy/Path ~58x58 CSS px (>=56); HUD text legible; bob visible, above strip in all shots; complete screen legible; death shows red bob + empty pips.

## D1 (high) 475x638: room does not fit; hazards/exit hidden behind the control strip
Shots: 475x638-room1-start.png, 475x638-room2-start.png, 475x638-room3-midfall.png. Room is zoomed to ~2x width; room 1 bottom spikes and gap are under the strip or off-screen; room 3 exit sits under the strip; right-side spikes hit the screen edge. Player cannot see where a flip lands.
Fix A: cap base scale so the room's full 500 px height fits in the top 60% minus HUD at rest (scale = min(W/336, 0.6H/500...)), zooming only out.
Fix B: keep scale but aim look-ahead/cy toward the hazard/exit below bob when at rest (rest camera at room centre).

## D2 (med) 475x638 and 344x882: HUD overlaps play area
Shots: 475x638-room1-start.png (HUD panel 0-120 css px covers room top and walls, teach text runs behind translucent gradient), 475x638-room3-midfall.png (path dots and crusher track under HUD).
Fix A: reserve a HUD band (top ~120 px) outside the play area in camUpdate (shift cy/viewport top).
Fix B: make HUD panel opaque and clamp bob/room top below it.

## D3 (med) 344x882: teach text truncated ("Flip mid-fall: your speed t...")
Shots: 344x882-room1-start.png, 344x882-room3-start.png. Key lesson hint is cut off, buttons take the right 40%.
Fix A: wrap teach text to 2 lines below the stats row. Fix B: move buttons to their own row or shorten teach strings to <=28 chars.

## D4 (low) 344x882 start: room edge cropped on the right before camera settles
Shots: 344x882-room1-start-100ms.png vs -start.png. Right wall/exit off-screen for first frames of each room; at rest the room is not centred.
Fix A: snap camera on room load (no smoothing first 0.3 s). Fix B: init camera at the room centre scale-fit.

## D5 (low) path line readable only when bob is moving fast
Shot: 475x638-room3-midfall.png. Dots are ~3 px, 0.8 s path ends mid-air and low contrast against the grid; at rest no path/plumb context.
Fix A: dotted line width 3-4 px with darker outline and a landing marker. Fix B: draw path as dashed 2 px line plus end cross.

## D6 (low) bottom hint text overlaps rooms
Shot: 475x638-room1-start.png: "swipe = flip tap = dive" drawn over solid walls (grey on dark, clipped by room geometry). Fix A: hint on opaque strip chip. Fix B: hide after first flip.
