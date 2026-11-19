# Review: parts/core.js vs CONTRACT.md (rules 1-10 + API)

Verified OK: API surface (C, DIRS, newState, step, hash, replay, solids) present; no Math.random/Date (Math.sin only, deterministic enough); semi-implicit Euler; per-axis cap 700/900 applied after dive; drag only off-gravity axis after airT>0.3; flip never touches v; same-dir flip ignored; charges 2 and refill on landing; dive cost/cooldown/boost; crumble 42 ticks then st=2 permanently; spike box shrunk 3 px; exit radius 18; respawn 36 ticks; no spawn-time tunnelling possible (max step 900/120=7.5 px < 22 px collider, so any positive-size rect is detected).
Grounded on all 4 gravity dirs: OK. moveAxis uses gsign=DIRS[g][ax]; g=0 -> y axis sign -1, g=1 -> x +1, g=2 -> y +1, g=3 -> x -1; the other axis has gsign 0 so never grounds. Side/ceiling hit bounces 0.15 correctly.

## HIGH

1. L52-54 (moveAxis push-out side chosen by bob velocity sign) -> bob teleports THROUGH a crusher (and any moving solid) that sweeps into it from the side opposite its velocity. Ex: g=down, bob falling (vy>0), crusher descending onto it from above: sign=+1 so bob is placed at lo-H, i.e. on top of the crusher, jumping up through its full thickness; no death. Also v is already modified by an earlier solid in the same loop (L60/63), and v==0 falls back to centre compare.
   Fix: choose side by minimum penetration (valid for static solids since step 7.5 < 22):
   `const pPos=(c+H)-lo, pNeg=(lo+len)-(c-H); const sign = pPos<pNeg?1:pPos>pNeg?-1:(v>=0?1:-1);` Keep the rest. Then a crusher closing on a grounded bob pushes it into the floor and L140 kills it (>1 px).

2. L30-33 + L138 (gate solidity is re-evaluated from live velocity, and after the move) -> two failures:
   a) Bob inside a gate rect while decelerating (e.g. enters upward at 130 with gravity down, v drops <120 mid-gate) turns the gate solid under it: pushed out/ejected or killed by L140.
   b) L138 rebuilds solids AFTER movement/bounce zeroed velocity: bob passing through a gate that is adjacent to a wall/ledge (v zeroed on landing past the gate) is counted as overlapping a now-solid gate -> instant death.
   Fix: (i) in buildSolids skip a gate if the bob box currently overlaps it (latch: `if (overlaps(s,g.r)) continue;` when using pre-move position, i.e. test with the position at tick start) OR store `s.gateOpen[i]` set when v.dir>=GATE_V at entry and cleared when no overlap. (ii) In the L138 crush check, exclude gates entirely (`o.gate` flag) or reuse the `solids` array built at L118 instead of rebuilding. Gates should only block entry; death by gate crush is not in rule 8's spirit.

## MEDIUM

3. L74 flip validation: `inp.dir` undefined/NaN/non-integer passes (undefined<0 and >3 are false) and sets s.g=undefined -> NaN physics. Fix: `if (!Number.isInteger(inp.dir) || inp.dir<0 || inp.dir>3 || inp.dir===s.g) return;` Same for pending (L77) which is covered by the same guard.

4. L68-70/L75 doFlip leaves s.grounded true for the remainder of the tick -> a second flip/dive input in the same tick is also free (double flip while "grounded", dive after flip free). Fix: in doFlip set `s.grounded=false`. Check friction L103 then simply skips for that tick (acceptable).

5. L98 pending expiry uses float accumulation (age+=1/120, expire if >0.08) -> effective window 9 ticks (0.075 s) not 0.08 s, and fragile. Fix: store age in ticks: `age++` ; expire when `age > Math.round(C.BUFFER/DT)` (10 ticks) or `>= 10`; pick and document. Same applies to diveCd/diveBoost (L96-97): use integer tick counters, otherwise cooldown lands at 59/60 ticks depending on rounding.

## LOW

6. L163-166 hash omits grounded, airT, diveCd, diveBoost, pending, lastLandSpeed -> a replay divergence in those would not be detected until position drifts. Fix: append `s.grounded?1:0, s.diveCd, s.diveBoost, s.airT, s.pending?s.pending.dir+':'+s.pending.age:'-'`.

7. L125-130 on tick 1 newState.grounded=false so spawn emits a 'land' event and a dust burst, lastLandSpeed=12.5 pollutes the report's landSpeeds[]. Fix: init `grounded:true` in newState when room.start sits on a ledge, or ui ignores a 'land' at t==0.

8. L131-135 crumble timer is set then decremented in the same tick: effective 41 ticks (0.342 s). Fix: set `timer=CRUMBLE_TICKS+1` or run the decrement loop before the trigger loop.

9. L29 unused `const d = DIRS[0]`; L37 PL.solids evaluates gates with pre-gravity velocity while step uses post-gravity (small mismatch for UI/tests). Fix: delete L29; document or compute post-gravity.

10. L20 Math.sin cross-engine bit-exactness not guaranteed (V8 vs JSC). Only matters if replays are compared across browsers; fix by using a 2400/DT-entry precomputed table built with a polynomial, or accept.

11. L150 out-of-bounds kill margin 40 px is unreachable with border walls; harmless safety net.
