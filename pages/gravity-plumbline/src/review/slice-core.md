# Review: slice core.js (wall-ride + coyote)

Tests: sim.test.js 6/6, core-fix.test.js 7/7, slice-core.test.js 7/7 all pass. core.js not edited.

## Verdict: no blocking exploits.

Checked and OK
- Infinite charges by hugging a wall: rideUsed persists across flips (doFlip does not clear it), only cleared on a real landing (core.js:152). One refill per solid key per airborne period, capped at CHARGES (:209). Landing already refills fully, so a ride never beats a landing.
- Coyote double free flip: doFlip clears coyote (:91) and dive clears it (:103), so flip->flip, flip->dive and dive->flip cost a charge on the second action. Flip/dive clear grounded first, so `was && !hit.ground` (:149) never grants coyote after them. Window is 7 inputs-ticks (0.058 s), matches the test.
- Determinism: rideT, coyote, rideUsed are integers or strings. No new floats (airT is a pre-existing float). Probe 0.05 px offset is applied then restored (:196, :203) with no residue.
- Hash (:222): rideT, rideKey, rideUsed joined by '|', coyote are all included. Keys like 'w3' are unambiguous. Complete.
- Gates: excluded from ride (:198), so a solid gate never grants a charge. Crushers and crumbles do count, with stable keys ('k'+i, 'c'+i).

Findings (minor, optional)
1. core.js:98 / :209 buffer x ride. A pending flip made at 0 charges is not consumed when a ride refills a charge, so the player must tap again (pending expires after 10 ticks anyway). Fix: in wallRide after `s.charges++`, `if (s.pending) { const p = s.pending; s.pending = null; s.charges--; doFlip(s, p.dir); }` only if p.age is within the buffer. Skip it if you want ride to stay a pure refill.
2. core.js:194-201 probe order. When touching two solids (wall + ceiling), only the lowest k is tracked, so the other is never counted that tick. Harmless, deterministic. Note for room design: a room that makes the player brush two faces gets one refill per face only after rideKey switches, and rideT restarts on a key change (:205).
3. core.js:149 coyote also fires when ground vanishes under the bob (crumble collapse, crusher retreat, gate). That is probably wanted. It is not in the contract text ("walking off a ledge"), so it is a tuning side effect.
4. Possible long-wall farming: a column of N stacked wall rects gives up to N refills per airborne period, since keys are per rect. Each rect needs about 30 ticks of contact, so at CAP (700 px/s) a rect must be at least about 175 px tall. Check room walls are not segmented that finely. No current room does this that I saw, but I did not audit rooms.js.
5. Test gap: slice-core.test.js has no test of ride + flip in a loop (charges never exceed CHARGES, ride count per airborne period equals distinct solids) and none of coyote followed by pending-buffer landing. Suggest adding both.
