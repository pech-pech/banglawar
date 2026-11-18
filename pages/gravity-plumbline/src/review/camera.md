# Camera review (checker)
Read only CONTRACT.md; camera.js treated as black box.

## Results
- test/camera-test.js: PASS (210024/210024). Sight ahead at 700 px/s toward strip (down): 344x882 0.43 s play-area / 1.13 s screen; 475x638 0.14 s play-area / 0.51 s screen.
- test/camera-check2.js (independent: fake state, vy ramps 0->700 at 1500 px/s^2, falls 20->488 down and 480->12 up, 60 fps, 344x882 and 475x638):
  - bob on screen: PASS. Never in bottom 40% strip (bob bottom edge max 475 of 529 on 344x882, 340 of 383 on 475x638): PASS. Scale within [W/480, W/336]: PASS.
  - Camera jitter <= 6 px/frame: FAIL. Metric = frame-to-frame change of camera's screen-space step (px/frame^2).

## Defect 1 (real): camera reverses against the bob mid-fall, then snaps
475x638, falling down, frames 28-34: camera cy MOVES BACKWARD (cy 270.8 -> 253.0, -3 px/frame) while the bob moves +11.7 px/frame, then at f35 jumps +12.6 px/frame. Step change 16.4 px/frame (limit 6). Same on 344x882 going up (8.1 px, repeating every 9 frames = an oscillation, f27/36/45/54) and 475x638 going up (15.9 px). Pattern looks like two targets fighting: look-ahead/zoom-out target vs the "bob at or above 55% of H" hard clamp, or the scale shrinking (1.17 -> 1.10) shifting the clamp each frame so the clamp engages/disengages.
Fix: (a) compute the target cy from the FINAL scale for this frame (scale first, then look-ahead, then 55% constraint) so the constraint is not evaluated against last frame's scale; (b) apply the 55% bob constraint as a smooth soft-limit on the target (e.g. min(target, bobY - k) with continuous blend) and NOT as a post-smoothing hard overwrite of cy; (c) low-pass the zoom (scale) with a slower critically damped constant than position so scale does not move >0.012/frame; (d) as a last resort clamp the per-frame camera step change: |step_n - step_{n-1}| <= 5/scale.
Verify: node test/camera-check2.js must print camera-check2 OK (V=1 is not needed).

## Defect 2 (design, not a failure): 475x638 play-area sight ahead only 0.14 s toward the strip at cap
Screen-wise 0.51 s but the safe play area (above 60% H) leaves 0.14 s. Contract says 0.35 s look-ahead on this aspect; at cap speed the 55% rule prevents it. Options: push the bob-line from 55% toward 45% only while velocity points down and speed > 400 (that is what the look-ahead should do anyway), or document 0.14 s as the accepted figure in the camera.js header.

## Notes
- check2 uses a made-up state (room w/h, x,y,vx,vy,g,t); if camUpdate reads other state fields the numbers could differ slightly in the real game.
