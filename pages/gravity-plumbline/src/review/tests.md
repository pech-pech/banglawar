# Test results

## sim.test.js (exit 0)
```
ok   same seed -> deep-equal rooms
ok   different seeds differ somewhere
ok   100 scripted runs per room give identical hash
ok   replay(log) equals live hash
ok   speed never exceeds 700 (900 during dive boost)
ok   flip does not change v (only gravity of next tick applies)
all passed
```
## e2e.js (exit 0)
```
ok   344x882 boots to menu
ok   344x882 menu buttons >= 56px and on screen (312x64 312x64 312x64 312x64)
ok   344x882 Tutorial reachable by tap
ok   344x882 swipe in strip flips gravity (g=1)
ok   344x882 swipe in top 60% does NOT flip
ok   344x882 tap dives (diveCd=42)
ok   344x882 room 1 cleared with real inputs (flip1@0, dive@1, flip2@20)
ok   344x882 report after cleared room 1 has 'determinism OK'
ok   344x882 complete screen reached
ok   344x882 report has medal line (result: medal plumb +flipstar  newBest true  best 3.20s/2 flips/plumb)
ok   344x882 Copy button 56x56
ok   344x882 Copy click yields report with input log
ok   344x882 report WebGPU line
ok   344x882 Daily reachable
ok   344x882 Seed overlay opens with input
ok   344x882 seed input digits only (got '42')
ok   344x882 overlay buttons >= 56px tall (Start:56,Cancel:56)
ok   344x882 Seed overlay Start begins run
ok   344x882 no dialogs ()
ok   344x882 no console errors 
ok   344x882 long-press top-left opens tuning panel
ok   344x882 tuning tap marks run tuned
ok   344x882 tuned run completes
ok   344x882 tuned run NOT saved to localStorage best (null)
ok   344x882 untuned clear saves best ({"tutorial:1:3":{"ticks":384,"flips":2,"medal":"plumb"}})
ok   344x882 best shown on next load (Tutorial: 3.20s, 2 flips, plumb )
ok   344x882 mute toggle writes localStorage (null->1)
ok   344x882 mute persists after reload (HUD shows Muted)
ok   344x882 no console errors (C) 
ok   475x638 boots to menu
ok   475x638 menu buttons >= 56px and on screen (320x64 320x64 320x64 320x64)
ok   475x638 Tutorial reachable by tap
ok   475x638 swipe in strip flips gravity (g=1)
ok   475x638 swipe in top 60% does NOT flip
ok   475x638 tap dives (diveCd=41)
ok   475x638 room 1 cleared with real inputs (flip1@0, dive@1, flip2@20)
ok   475x638 report after cleared room 1 has 'determinism OK'
ok   475x638 complete screen reached
ok   475x638 report has medal line (result: medal plumb +flipstar  newBest true  best 3.20s/2 flips/plumb)
ok   475x638 Copy button 56x56
ok   475x638 Copy click yields report with input log
ok   475x638 report WebGPU line
ok   475x638 Daily reachable
ok   475x638 Seed overlay opens with input
ok   475x638 seed input digits only (got '42')
ok   475x638 overlay buttons >= 56px tall (Start:56,Cancel:56)
ok   475x638 Seed overlay Start begins run
ok   475x638 no dialogs ()
ok   475x638 no console errors 
ok   475x638 long-press top-left opens tuning panel
ok   475x638 tuning tap marks run tuned
ok   475x638 tuned run completes
ok   475x638 tuned run NOT saved to localStorage best (null)
ok   475x638 untuned clear saves best ({"tutorial:1:3":{"ticks":384,"flips":2,"medal":"plumb"}})
ok   475x638 best shown on next load (Tutorial: 3.20s, 2 flips, plumb )
ok   475x638 mute toggle writes localStorage (null->1)
ok   475x638 mute persists after reload (HUD shows Muted)
ok   475x638 no console errors (C) 
all passed
```
