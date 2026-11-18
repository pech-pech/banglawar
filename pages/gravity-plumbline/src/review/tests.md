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
## e2e.js (exit 1)
```
ok   344x882 swipe in strip flips gravity to right (g=1)
ok   344x882 swipe in top 60% does NOT flip (g 2->2)
ok   344x882 tap dives (diveCd=46)
ok   344x882 600ms hold restarts room (t 70->18)
ok   344x882 Copy button 56x56 (56x56)
FAIL 344x882 report determinism line present, not FAIL (no room cleared by test, so 'determinism OK' literal needs a cleared room: false)
ok   344x882 report contains input log
ok   344x882 report has WebGPU line
ok   344x882 no console errors 
ok   475x638 swipe in strip flips gravity to right (g=1)
ok   475x638 swipe in top 60% does NOT flip (g 2->2)
ok   475x638 tap dives (diveCd=46)
ok   475x638 600ms hold restarts room (t 72->18)
ok   475x638 Copy button 56x56 (56x56)
FAIL 475x638 report determinism line present, not FAIL (no room cleared by test, so 'determinism OK' literal needs a cleared room: false)
ok   475x638 report contains input log
ok   475x638 report has WebGPU line
ok   475x638 no console errors 
2 FAILED
```
