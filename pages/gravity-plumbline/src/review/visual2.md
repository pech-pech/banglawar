# Visual review 2b (rebuilt index.html 21:36; playwright 2x, 475x638 + 344x882, touch)
Shots: /home/user/repo/pages/gravity-plumbline/src/review/shots2/ (<WxH>-menu, seed-overlay, room1-start, room1-midflip, tuning, tut-room2-gate, tut-room3-crusher, shaft-room{1,3,5}, after-death, complete, fuzz-end)

## Passes
Whole room visible above the strip on both viewports in all rooms checked (tutorial 1-3, Shaft 1/3/5). Exit ring, spikes, gates, crusher track readable. Canvas text >= 14 px everywhere. Canvas buttons Sound/Copy/Path 56x56; DOM Start/Cancel 112x56; menu items 312-320x64; Menu/Reset buttons visible 120+ px wide. Path dots now clear (475x638-room1-midflip.png). Fuzz 90 s per viewport across menu/tutorial/shaft/daily/tuning (702 and 649 actions): 0 console errors, 0 page errors, 0 NaN.

## Defects
D1 (med) 475x638 menu: subtitle "Flip gravity. Reach the exit." touches the first button (~2 px gap). Shot 475x638-menu.png. (344x882 fine, 100 px offset vs 79.)
 Fix A: in menuLayout start y at i.t + 104 (min 24 px below subtitle baseline 74+i.t). Fix B: move subtitle to i.t+62 / shrink title to 32.
D2 (med) 344x882 HUD: stats/title run under the Sound button: "deaths" clipped ("death:"), "Stepping Ston", "Charge Bankir" cut. Shots 344x882-room1-start.png, shaft-room3.png, tut-room2-gate.png.
 Fix A: drop room name to its own line / ellipsis-measure it against btn left edge (btn.x - 8). Fix B: on narrow views move Sound into a 2nd button row or make it a 40 px icon inside the 56 px hit area.
D3 (med) Teach banner covers the top of the room (a dark bar over wall/ceiling and any top-edge hazard; at 344x882 it hides ~100 px of room top, and room 2 start). Shots 475x638-room1-start.png, 344x882-room1-start.png.
 Fix A: reserve the banner height in the camera top inset (fit room under HUD + banner). Fix B: show the banner for 3 s then fade, or put it in the empty zone just above the strip.
D4 (low) 475x638: "seed N 60 fps" footer overlaps the room bottom wall (grey on dark, clipped). Shots 475x638-room1-start.png, shaft-room5.png.
 Fix A: draw it only in the strip area (y > 0.6H) or move to top HUD. Fix B: hide fps/seed during play unless Path/debug on.
D5 (low) Tuning panel: translucent panel lets the teach banner and room ghost through, title "Tuning" collides with banner text. Shot 475x638-tuning.png.
 Fix A: opaque panel fill. Fix B: hide the banner while the panel is open.
D6 (low) Complete screen: translucent overlay lets room/HUD ghost through behind medal text; "Medal / New best / Best..." stack is tight (14-16 px lines). Menu button sits on room spikes. Shot 475x638-complete.png.
 Fix A: opaque PAPER fill. Fix B: dim only 85% and drop the HUD under the overlay.
D7 (low) Tutorial room 2 bottom-right spike renders as one long flat red wedge (stretched triangle), reads as a glitch. Shot 344x882-tut-room2-gate.png.
 Fix A: tile spike triangles at fixed pitch along the long axis. Fix B: clamp spike drawing aspect to 1:1.
D8 (info) Death trail not captured: scripted random swipes in Shaft room 1 did not die in 12 tries (344x882-after-death.png shows trail-free alive state). Not verified.
