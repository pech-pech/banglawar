# Review: parts/ui.js (slice), checked against CONTRACT.md only
Reviewed ui.js at 25396 bytes (mtime 20:44:30). Line numbers refer to that version. ui.js was not edited.

## Verified OK
- recordRun is called only from finishRun (L150-164). finishRun runs once per run, because `complete` makes simTick return at L114.
- Tuned runs are flagged. runTuned is set at newRun (L62), on tuneTap (L340) and per tick (L125), and passed to recordRun (L156). newBest is also gated on !runTuned (L158).
- Death trail: the ring buffer holds 240 samples (L124), is passed to hud.trail for 1.2 s (L136, L482), and is reset per attempt (L73).
- Mute is read, written and applied inside try/catch (L47-48, L244).
- The audio.init call is wrapped in try/catch.
- The seed overlay uses no prompt() or alert(). Input is digit-stripped (L318), maxLength 9, and parseInt|0 is safe.
- Overlays (including the Copy fallback) block the canvas (L190, L239).
- Copy report has every contract field: mode, seed, template ids, tuned values, medal/best, UA, viewport/dpr, fps, per-attempt log, 2nd-vs-1st, wall-ride count per room, determinism line, input log, and the WebGPU line.

## Bugs (highest first)
1. **HIGH: the sim keeps running in the menu scene (L113, L462).**
   - `frame` calls simTick regardless of `scene`. newRun() runs at boot (L489) and toMenu() does not stop the sim.
   - If the player presses M or holds back during the 0.5 s winDelay, or just after the last room clears, finishRun fires while in the menu. That calls recordRun for an abandoned run (a phantom medal/best) and shows the DOM Menu button on top of the start menu (L163 setMenuBtn(true)).
   - Fix: at the top of simTick use `if (scene !== 'play' || complete) return;`. In frame, only run the accumulator loop when scene==='play', and set acc=0 otherwise.
2. **HIGH: run time includes the win delay (L123).**
   - totalTicks++ runs every tick, including the 60 winDelay ticks (L140/144) after each room. That adds 0.5 s per room, or 3.5 s on a 7-room shaft. Medal bands and best times are skewed, and the displayed time no longer matches the sum of attempt ticks.
   - Fix: `if (!state.won && !cur.result) totalTicks++`. Counting the respawn ticks is fine.
3. **HIGH: Ctrl/Cmd+R and similar are hijacked (L260-277).**
   - There is no modifier check, so Ctrl+R restarts the room and calls preventDefault, which blocks browser reload. Cmd+M, Ctrl+T and Alt+T are caught the same way.
   - Fix: add `if (e.ctrlKey || e.metaKey || e.altKey) return;` at the top of the keydown handler.
4. **MED: the key '3' types a "3" into the seed box (L266, L328).**
   - menuAct('seed') focuses the input inside the keydown handler, and the same key press then inserts the character.
   - Fix: call `e.preventDefault()` for keys 1-3 in the menu branch (L266). Alternatively, focus inside setTimeout(0).
5. **MED: the seed overlay is fragile with the phone keyboard (L313, L328, L18).**
   - justify-content:center plus inset:0 puts the input behind the iOS keyboard, because the layout viewport does not shrink there.
   - On Android, the resize at L18 reallocates the canvas on every keyboard open and close.
   - On iOS, input.focus() runs from pointerup (L228). That may not count as a gesture, so the keyboard may not open.
   - Fix: align the overlay to the top (justify-content:flex-start; padding-top:max(16px,10vh)). Size it from visualViewport.height, or simply use 100dvh. Skip resize() while `overlay` is set. Call focus from a click-type handler or add a visible tap-to-focus. Also add an inline error line.
6. **MED: the "Enter digits" toast is invisible (L320).** It is drawn by draw.js, and the overlay covers the canvas. Fix: set an error text node inside the overlay and add a red border to the input.
7. **MED: tap-to-restart on the complete screen can fire from a stray tap (L197-199, L234).**
   - The 500 ms guard is checked only on pointerup. A press started at 480 ms and released at 520 ms restarts the run, so a player spamming taps at the win skips the medal screen.
   - Fix: at pointerdown set `cg` only if `nowMs() - completeAt > 500`. Otherwise ignore the press.
8. **MED: audio unlock on iOS (L189).** pointerdown may not unlock WebAudio on iOS Safari; touchend/click do. Fix: also call PL.audio.init() in pointerup and in the Menu/seed buttons. I did not read audio.js, so verify that init() is idempotent and calls ctx.resume() when the context is suspended.
9. **MED: the determinism line can give a false FAIL after tuning (L366).** PL.replay uses the live PL.C, so a room cleared before the player changed G, CAP or CHARGES will MISMATCH. Fix: snapshot the C values per cleared room and temporarily restore them for the replay, or print "determinism: SKIPPED (tuned)" when runTuned.
10. **LOW: tuning panel behaviour (L194, L333-342, L44).**
    - The sim keeps running with the panel open, so the bob can die while the player is editing. Pause simTick while tuningOpen.
    - While the panel is open, Copy, Path and Snd taps are swallowed by the `tuningOpen` early return, so the player cannot Copy the tuned report without closing it. Check btnAt before tuneTap.
    - There is no reset-to-defaults. C values persist across runs and the menu, so every later run stays flagged tuned until reload. Add a Reset row or button.
    - CHARGES changes only apply from the next landing.
11. **LOW: hold-restart during winDelay (L357 with L74).** restartRoom -> startAttempt zeroes winDelay (L74). The room is replayed and the run never advances, and `cleared[]` keeps the old win. Fix: in updateHold, skip the hold-restart if `cur.result==='win'`. The other option is to ignore hold-restart while winDelay>0.
12. **LOW: PL_TEST.room() after complete (L505).** It clears `complete` through gotoRoom but leaves the Menu button visible. Call setMenuBtn(false) in gotoRoom.
13. **LOW: stale trail (L136, L482).** trailPts persists 1.2 s across a restart or room change. Clear trailPts in gotoRoom and restartRoom when the cause is not a death.
14. **LOW: the hold-to-menu ring is hidden under the first 250 ms (L350).** That is fine. However, after complete the ring path runs via cg, so "tap to continue" text from draw.js and tap-to-restart agree. Medal 'none' on tuned runs: L158 shows r.medal, which may be a medal that was not saved. Show "tuned, not saved" on the complete screen (set c.tuned, which is already in c at L151, so draw.js only needs to read it).

## Input routing notes (no change needed)
- Order of routing in pointerdown: overlay -> menu -> top-left tuning long-press -> tuning taps -> HUD buttons -> complete -> play gesture (y>=0.6H). This matches the contract.
- Multi-touch: the second finger is ignored while g is set. A stale g is cleared after 3 s.
- blur/visibilitychange clear gestures. Inputs are dropped while dead, won or after a result (L116).
- The top-right buttons may overlap the top-left tuning zone (x<140) on a narrow phone. They sit at about x>=150 on a 344 px width, so this is safe by about 10 px.
