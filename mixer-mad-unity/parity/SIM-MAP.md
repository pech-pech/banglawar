# SIM-MAP: Mixer Mad v7h drive simulation (for the C# port)

Source: `mixer-mad-v7h.html` (2870 lines; copy in `parity/oracle/`, unmodified). The sim is plain global JS in the 6th `<script>` (lines 1590-2870). Line numbers below refer to that file. Everything here was read from the code and checked by running it headless; items marked VERIFIED were confirmed by a command, the rest are read-from-code.

Ground truth files that go with this map:
- `oracle/geometry.json` - per vehicle (and the 4 mixer skins): the 6 body points in local space, wheel radii r4/r5, `topY`, and the full `probes` list (x, y, top flag) that `vehGeom()` builds from the embedded sprite manifest. The C# port does NOT need the sprite data: load this table.
- `oracle/levels.json` - per (vehicle, level): `pts` (the ground polyline), flagX, edgeX, minY, zones, rocks, checkpoint, initial props. Use it as data; compare your own `buildLevel` against it as a separate test (see Portability below).
- `traces/*.json.gz` + `traces/INDEX.json` - the recordings.

## 0. Headline traps (read first)

1. **Math.hypot is not sqrt(x*x+y*y).** VERIFIED: over 2,000,000 random pairs, V8's `Math.hypot(a,b)` differs from `Math.Sqrt(a*a+b*b)` in the last bit 40% of the time. The constraint solver calls `Math.hypot` 14 times x 8 iterations x every step, so naive C# will drift by ~1e-16 per op and will not hold T1 (1e-9 over 240 steps) reliably on chaotic contacts. Use this exact emulation (VERIFIED bit-identical to `Math.hypot` over the same 2M pairs, `tools/hypot_test.js`):
   ```csharp
   static double Hypot(double a, double b) {          // V8 two-argument Math.hypot
     a = Math.Abs(a); b = Math.Abs(b); double mx = Math.Max(a, b); if (mx == 0) return 0;
     double sum = 0, comp = 0;
     foreach (var v in new[]{a, b}) { double n = v / mx; double s = n * n - comp; double p = sum + s; comp = (p - sum) - s; sum = p; }
     return Math.Sqrt(sum) * mx; }
   ```
   (Unroll the loop in the real port, no allocation.) Every `Math.hypot` in the sim path must go through it: step() constraints (line 1874), step() chassis up vector (1847), probeBody (1684), nearest() distances (1813, 1821), stepProps (2643-2644, wheel overlap and body-edge length), truckPose/others. Also the `||1e-9` guard is applied AFTER hypot (`Math.hypot(dx,dy)||1e-9`).
2. **Use `double` everywhere**, same operation order, no fused multiply-add (`Math.FusedMultiplyAdd` / compiler contraction must not appear; on .NET set nothing special, just do not use FMA; avoid `float`). Keep expression association exactly as written (e.g. `(d-c.len)/d*c.k`, `dx*diff*sa`, `-p.im` forms).
3. **Fixed step is exactly DT = 1/120** (double `1.0/120`). `tick(dt)` accumulates, but with dt==DT it runs exactly one `step()` per tick (VERIFIED: 100 ticks -> 100 step() calls). The Unity side must call `Step()` once per 1/120 s tick and never pass real frame time into the sim. The browser `frame()` clamps dt to 0.05 and runs up to 8 steps per frame; that is the only frame-time dependence and the oracle bypasses it by calling `tick(DT)` directly.
4. **The sim has state that survives `startLevel()`**: `propBudget` (line 2627, starts 1.5, never reset), `acc`, `exT`, `fx`. To get a clean run the oracle uses a fresh page per run, so `propBudget` starts at 1.5. The C# port should start `propBudget = 1.5` per run and not carry it between levels in tests.
5. **Randomness**: the sim itself is deterministic. `Math.random` appears only in cosmetic particles in the sim path (see section 9) EXCEPT one place that changes physics: `combo3.skin = floor(Math.random()*4)` at line 2138 picks the mixer body sprite (`mixer_skin1..4`), and the four skins have DIFFERENT collider/wheel geometry (VERIFIED: `skinSame:false`). The oracle pins `combo3.skin` and records it in every trace's `meta.skin`; geometry for all four is in `geometry.json`.
6. **Post-crash quirk**: after `crash()` inside `step()` the rest of the `if(state==='drive')` block still runs (levelT, snow, checkpoint, finish test). If the truck is past `L.flagX` in the same step, `state` is overwritten with `'stopping'` and the crash is counted but not followed by a reset. Port line for line and keep this.
7. **Wheel-order dependence**: in the drive loop wheel 4 is processed first and its force is applied to ALL six points' `px,py` before wheel 5 computes `v`. So wheel 5's `v` already includes wheel 4's push. Do not "vectorise" this.
8. **`w.c` used by the drive code is the contact left by the PREVIOUS step** (contacts are cleared later, after the drive/torque code, at line 1872). `grounded` is therefore one step stale.

## 1. Constants and tables

| Name | Value | Line |
|---|---|---|
| `G` | 15 (gravity magnitude, m/s^2, applied as `-G*DT*DT` to y each step) | 1598 |
| `DT` | `1/120` | 1598 |
| `ITER` | 8 solver iterations | 1598 |
| `WHEEL_R` | 0.5 | 1605 |
| `LOCAL` | 6 local points `[[-1.9,0.1],[2.0,0.1],[2.1,1.9],[-2.1,2.0],[-1.3,-0.65],[1.35,-0.65]]` (corners 0 rear-bottom, 1 front-bottom, 2 front-top, 3 rear-top; wheels 4 rear, 5 front). Only used if sprite geometry is missing; in the shipped file `geo` is always present, so use `geometry.json` pts. | 1648 |
| `PHYS` | per vehicle `{acc,maxV,air,tol,gt?,w[6]}`, below | 1650-1657 |
| `LEVELS` | 8 specs of `['flat'|'bumps'|'hill'|'slope'|'jump', ...]` | 1608-1617 |
| `LEVEL_WX` | `['clear','rain','snow','slime','dirty','rain','slime','snow']` (weather by level index) | 1618 |
| `WXGRIP` | `{clear:1, rain:0.7, snow:0.8, slime:1, dirty:0.75}` | 2609 |
| zone grip | `{mud:0.7, puddle:0.85, slush:0.8, sticky:1.4}` (default 1), `gripK(z)=WXGRIP[wx()]*zoneGrip` | 2610 |
| `VINFO.crevice` | true for mixer, dump, dozer (adds a gap after the finish); `maxV`/`acc` in VINFO are UNUSED by the sim (PHYS wins) | 2425-2432 |

PHYS (`phys()` = `PHYS[vehicle]||PHYS.mixer`):

| vehicle | acc | maxV | air | tol | gt | w[0..5] |
|---|---|---|---|---|---|---|
| mixer | 16 | 13 | 9 | 0.55 | - | 1.15,1,1,1.2,1,1 |
| digger | 18 | 10.5 | 8.5 | 0.7 | - | 1.5,1.5,1,1,1,1 |
| dump | 18 | 15 | 10 | 0.5 | - | 1.3,1,1,1,1,1 |
| dozer | 23 | 9 | 5.5 | 0.8 | - | 1,1.7,1,1,1,1 |
| crane | 16 | 12 | 8 | 0.5 | 0.35 | 1,1,1.4,1.4,1,1 |
| roller | 15 | 10 | 9 | 0.75 | - | 1,1.9,1,1,1,1 |

`gt` defaults to 1 (`phys().gt||1`).

## 2. Globals the drive sim reads or writes

`P` (6 points `{x,y,px,py,r,c,im,nc}`), `C` (14 constraints `{a,b,len,k}`), `wheelAng[2]`, `state` (`'drive'|'stopping'|'parked'|'crashed'` in the drive phase), `crashT`, `finishT`, `crashWait`, `levelT`, `snow`, `airT`, `landT`, `wheelie`, `wheelT`, `load`, `roofHit`, `bodyHit`, `lastProbe`, `geo`, `L` (level), `levelIdx`, `vehicle`, `mode`, `combo`, `cp`, `run {t,brake,crashes}`, `input {gas,brake}`, `props[]`, `propBudget`, `acc`, `spillT` (cosmetic), `dailyCur`/`dailyKeyForce`. The only input fields the drive sim reads are `input.gas` and `input.brake` (`input.kg/kb/tg/tb` are the keyboard/touch sources that `syncInput()` collapses into gas/brake). `holding()` reads `input.gas` but only in the post-finish pour animation.

Point fields: `x,y` current, `px,py` previous (Verlet), `r` collision radius (wheels `geo.r4/r5`, corners 0.06 but corners have `nc=true` so they never collide with the ground), `im` inverse mass, `c` = last contact `{pen,nx,ny,m?}` or null, `nc` = no-collide flag (corners 0..3 when `geo` exists).

## 3. Session / level setup (what the recorder starts from)

- `startLevel(i)` (1800-1804): `levelIdx=i%nLevels()` (classic/load: 8; yard: 2; daily: 1). Builds `L=buildLevel(LEVELS[i])` (uses `VINFO[vehicle].crevice` and `combo`), `run={t:0,brake:false,crashes:0}`, picks checkpoint (levelIdx>=1 and not yard): scan `x=flagX*0.42; x<flagX*0.62; x+=0.5`, `sl=|groundY(x+2.5)-groundY(x-2.5)|`, keep strictly smaller `sl`, `cp={x:best.x,hit:false,load:100}`. Then `makeWeather()` then `resetTruck()`.
- `buildLevel(spec)` (1625-1643): polyline starting `[[-30,0],[0,0]]`. Pieces: flat (one point), bumps (`n=s[3]*8` points, cosine bumps `s[2]*(1-cos(2*pi*t))/2`, `t=i/8`), hill (20 points, same cosine, returns to y), slope (12 points, half-cosine ramp, y changes), jump (10 points `y+s[2]*t*t`, then a vertical drop of `s[3]` via a point at `x+0.05`). End: `flagX=x+3`, platform 12 m, `edgeX`, gap 5.5 wide x 3.6 deep if `VINFO.crevice && !combo`, then 25 m of flat. `minY` = min y over all points. The generated `pts` are in `levels.json`.
- `groundY(x)` (1644): linear scan, first segment with `p[i][0]>=x`, linear interpolate, returns 0 if beyond the end.
- `resetTruck(fromCp)` (1746-1761): spawn x `sx=5` (or `cp.x` when `fromCp && cp.hit`), `sy=groundY(sx)+1.2`; `load=atCp?cp.load:100`; `geo=vehGeom(vehicle)`; `P[i]={x:sx+l[0], y:sy+l[1], px=x, py=y, r, c:null}` with `r = i>=4 ? (i===4?geo.r4:geo.r5) : 0.06`, `nc=true` for i<4. Constraints: for 0<=i<j<4 -> `link(i,j,1)` in order (0,1),(0,2),(0,3),(1,2),(1,3),(2,3); then for w in 4,5, for i in 0..3 -> `link(w,i,0.45)` (so 14 constraints, order matters). `len` = initial distance via `Math.hypot`. Then: `snow=0; levelT=0; wheelie=false; wheelT=0; landT=-9;` rocks `hit=false`; movers reset; `applyMass()`; `spawnProps()`; `fin=null; wheelAng=[0,0]; state='drive'; crashT=0; finishT=0; anim=null; airT=0; ...`. NOT reset: `propBudget`, `run`, `cp` (except `cp.hit=false` when `!fromCp`), `acc`.
- `applyMass()` (1660): `p.im = 1/(w[i]*((i===2||i===3)?1+snow*0.8:1))`.

## 4. tick() and the main loop (2804-2818)

```
tick(dt):                                   // oracle always passes dt = DT
  if paused return                          // never true headless (VERIFIED paused=false)
  updFx(dt)                                 // cosmetic particles, shake, squash, wipe: no effect on P
  if state=='crashed': crashWait -= dt; if crashWait<=0: resetTruck(true)   // falls through to the next lines in the SAME tick
  if state=='drive': run.t += dt; if input.brake: run.brake = true
  if mode=='yard' && state in (drive,action,crashed,stopping): yardT += dt
  if toy / dig / fin / (pour|done && anim) : post-finish animations, not sim
  else if state=='action': (yard only) updAction, then step loop
  else if state != 'crashed': acc += dt; n=0; while acc>=DT && n<8: step(); acc-=DT; n++; if n==8: acc=0
```
- With dt==DT exactly: `acc=0+DT`, `acc>=DT` true, one `step()`, `acc-=DT` -> exactly 0. One step per tick. While `state=='crashed'` there are NO steps (the world is frozen) and `crashWait` counts down from `0.7` by `dt` each tick (float subtraction: replicate with doubles; the reset happens on the tick where `crashWait<=0`, and `step()` then runs in that same tick).
- `crash()` (1915): `run.crashes++`, `state='crashed'`, `crashWait=0.7`. Everything else is cosmetic.
- **Par/yard timer**: `run.t` and `yardT` are sim time (`+= dt` in tick). The plan's warning is about the C# side: never use `Time.time`/`Time.deltaTime`; add `DT` per step.
- `run.t` only advances while `state=='drive'` (not while `stopping` or `crashed`).
- The finish: `state` becomes `'stopping'` when `cx>L.flagX`; then `'parked'` after `finishT>0.4 && |P0.x-P0.px|/DT < 0.3` and `onParked()` (2540) switches into the finale (toy/dig/pour). The oracle treats the run as **passed when state leaves {drive, stopping, crashed}** (same as sweep.js) and records both the `stopping` step and the `parked` step.

## 5. step() (1840-1902), exact order

1. `gas = state=='drive' && input.gas`, `brake = state=='drive' && input.brake`.
2. **Integrate** every point (index 0..5): `vx=(x-px)*0.999; vy=(y-py)*0.999; px=x; py=y; x+=vx; y+=vy-G*DT*DT`. (Linear damping 0.999/step; gravity `-G*DT*DT` on y only.)
3. If `state=='stopping'`: `p.px = p.x-(p.x-p.px)*0.96` for all points (x velocity x0.96; y untouched). This is a brake after the flag.
4. If `brake`: `yardBrakeAssist()` (returns immediately unless `mode=='yard'`).
5. Chassis frame: `ax=P1.x-P0.x; ay=P1.y-P0.y; al=hypot(ax,ay); ux=-ay/al; uy=ax/al` (note: NO `||1` guard here; `ux,uy` is the chassis "up" and is also used later for the flip test and the torque).
6. **Drive**, `grounded=false`; `for wi of [4,5]`: `w=P[wi]; if(!w.c) continue; grounded=true;`
   - `tx=w.c.ny; ty=-w.c.nx` (forward tangent), `v=((w.x-w.px)*tx+(w.y-w.py)*ty)/DT`.
   - `z=zoneAt(w.x)` (first zone with `x0<=x<=x1`, else null); `ph=phys()`; `vmax=ph.maxV*(1-0.15*snow)`.
   - `a=0`; `if(gas && v<vmax) a=ph.acc`; `if(brake) a = v>0.5 ? -26 : ((v>-7 && min(P0.x,P3.x)>0.5) ? -11 : 0)`; `if(!gas&&!brake) a=-sign(v)*min(|v|/DT, 1.2*gripK(z))`.
   - Grip limit: `gl=(gas?ph.acc+3:26)*gripK(z); a=max(-gl,min(gl,a))`.
   - Zone drag: `zz=z && L.zones.find(q=>w.x>=q.x0&&w.x<=q.x1)`; `ease = zz ? min(1,(w.x-zz.x0)/1.5,(zz.x1-w.x)/1.5+0.3) : 1`; `drag = {puddle:5, mud:3+3.5*min(1,levelT/40), slush:8, sticky:0}[z] (else 0) * ease`; `if(drag) a -= sign(v)*min(|v|/DT, drag)`. (Math.sign(0)=0.)
   - `if(z=='sticky'){ w.px += w.c.nx*7*DT*DT; w.py += w.c.ny*7*DT*DT; }`
   - Rocks (dirty weather): for each `r` in `L.rocks`, `if(!r.hit && |w.x-r.x|<0.35){ r.hit=true; w.py -= 2.6*DT; }`.
   - Apply to ALL six points: `q.px -= tx*a*0.5*DT*DT; q.py -= ty*a*0.5*DT*DT` (so each grounded wheel adds `a/2`; both grounded = `a`).
   - (Lines 1862/1863 also call `Math.random`/`shake`/`AM.play`: cosmetic only.)
7. **Torque**: `omega = (((P1.x-P1.px)-(P0.x-P0.px))*ux + ((P1.y-P1.py)-(P0.y-P0.py))*uy)/DT/al`. `tq = gas?1:0; if(brake) tq=-1`. If `tq`: `strength = grounded ? 0.8*(ph.gt||1) : ph.air; if(tq*omega<4.5){ k=tq*strength*DT*DT; for i in [1,2]: P[i].px-=ux*k; P[i].py-=uy*k; for i in [0,3]: P[i].px+=ux*k; P[i].py+=uy*k; }`. (gas = nose up, brake = nose down; stronger in the air.)
8. Clear contacts: `p.c=null` for all; `roofHit=false; bodyHit=false`.
9. **Constraint/collision loop**, `for it in 0..ITER-1` (8 iterations):
   - for each `c` in `C` in order: `a=P[c.a], b=P[c.b]; dx=b.x-a.x; dy=b.y-a.y; d=hypot(dx,dy)||1e-9; diff=(d-c.len)/d*c.k; sa=a.im/(a.im+b.im); sb=1-sa; a.x+=dx*diff*sa; a.y+=dy*diff*sa; b.x-=dx*diff*sb; b.y-=dy*diff*sb`. (Positions only; `px,py` untouched.)
   - for each point with `!p.nc`: `collide(p)` (wheels 4 and 5 only when `geo` exists).
   - `if(geo && it>=ITER-3) probeBody()` (iterations 5, 6, 7).
10. `stepProps()` (2634-2652), then yard movers (`L.movers` empty in classic).
11. Left wall: `for p: if(p.x<-1.5){ p.x=-1.5; if(p.px<p.x) p.px=p.x; }`.
12. Start-wall slow-down: `mx=min(P0.x,P3.x); if(mx<3){ k = mx<0.2 ? 0 : max(0.85,mx/3); for p: if(p.x<p.px) p.px = p.x-(p.x-p.px)*k; }`.
13. `wheelAng[k] -= (w.x-w.px)/WHEEL_R` for k=0,1 (rendering only, but cheap to record).
14. `juiceStep(grounded,gas,ux,uy)` (1904-1914): sim-relevant parts only: `if(!grounded) airT+=DT; else { if(airT>0.25) landT=levelT; if(airT>0.25 && vy<-2){ ...cosmetic...; if(snow>0.15){ snow=0; applyMass(); } if(isLoad() && -vy>6.5) spill((-vy-6.5)*6); } airT=0; }` with `vy=((P0.y-P0.py)+(P1.y-P1.py))/2/DT`. Everything else (dust, smoke, squash, shake, AM.play, `Math.random`) is cosmetic. NOTE: `airT=0` runs on every grounded step; on an ungrounded step `airT+=DT` and `airT` is not zeroed.
15. **Crash and state logic** (only `if(state=='drive')`):
    - `upsideDown = uy < -0.2` (uy from step 5, i.e. before the constraints); `tipped = |atan2(P1.y-P0.y, P1.x-P0.x)| > 1.2` (current positions).
    - `if( (geo?roofHit:(P2.c||P3.c)) || upsideDown ) crashT+=DT; else if( tipped && ((geo?bodyHit:(P0.c||P1.c)) || P4.c || P5.c) ) crashT+=DT*0.4; else crashT=max(0,crashT-DT*2)`.
    - `if(P0.y < L.minY-15) crash('Fell off!')`; else-if `L.kills...` (yard only); else-if `crashT>ph.tol` -> `crash(upsideDown?'Flipped!':'Roof hit!')`.
    - then, regardless of a crash this step: `levelT+=DT`; `if(wx()=='snow'){ snow=min(1,snow+DT*0.035); if((levelT*120|0)%60===0) applyMass(); }` (the `|0` truncation of the accumulated double is exact-behaviour-critical: replicate `(int)(levelT*120)` with `levelT` accumulated as `levelT += DT` in double).
    - `cx=(P0.x+P1.x)/2`; yard stops (skip); checkpoint: `if(cp && !cp.hit && cx>cp.x){ cp.hit=true; cp.load=load; }`.
    - Load mode only (`mode=='load'` and vehicle in mixer/dump/crane): wheelie detection with `rel=|ang-slope|` -> `spill(10)`; changes `load` only, not physics.
    - `if(cx>L.flagX){ state='stopping'; finishT=0; }`.
    - `else if(state=='stopping')`: `finishT+=DT; v=|P0.x-P0.px|/DT; if(finishT>0.4 && v<0.3){ state='parked'; onParked(); }`.

## 6. Contact and friction rules

- `nearest(p)` (1807-1829): returns the deepest penetration among (a) solid yard movers (skip in classic) and (b) every ground segment `L.pts[i-1]..L.pts[i]`. A segment is skipped if its x-extent is outside `[p.x-p.r-0.5, p.x+p.r+0.5]`. Closest point on segment: `t=clamp(((p.x-a0)*ex+(p.y-a1)*ey)/l2,0,1)` with `l2=ex*ex+ey*ey||1e-9`; `d=hypot(dx,dy)`; skip if `d>=p.r`; normal `=(dx,dy)/d` if `d>1e-6` else `(-ey,ex)/ln`; `pen=p.r-d`. Keeps the first segment with strictly greater `pen` (`!best || pen>best.pen`).
- `collide(p)` (1830-1837): move out by `n*pen`; `vx=p.x-p.px, vy=p.y-p.py` (AFTER the push), `vn=v.n`; if `vn<0`: wheels (`p.r>0.3`) on a `'bouncy'` zone with `vn<-0.5*DT`: `out=max(-vn*0.85, 6*DT); p.px+=nx*(vn+out); p.py+=ny*(vn+out)`; otherwise `p.px+=nx*vn; p.py+=ny*vn` (kills the inward normal velocity; no restitution, **no tangential friction in the collider**). `p.c=best`. Traction/friction exists only through the wheel-drive code in step() (section 5, item 6): coast deceleration `1.2*gripK`, brake `-26/-11`, drive `acc`, grip cap `gl`, zone drag.
- `probeBody()` (1683-1696): body "skid" collisions for the 4 corner points through the sprite probes (list in `geometry.json`). Frame: `(ux,uy)=(P1-P0)/al` (here with `||1` guard), `(vx,vy)=(-uy,ux)`; origin `o=mid(P0,P1) - v*0.1`; `mv`=mean displacement of P0 and P1 (used as probe `px,py`). Each probe world pos `= o + lx*u + ly*v`, probe radius 0.04 through `nearest`. On hit: `bodyHit=true`; for `top` probes with `b.n.v < -0.4` -> `roofHit=true`; non-top probes with `b.ny>0.1`: replace by an up-normal push `pen=min(pen/ny,0.2), n=(0,1)`. Distribute to corners with bilinear weights `s=clamp((lx-x0)/(x1-x0))` (x0,x1 = geo pts[0].x, pts[1].x), `t=clamp((ly-0.1)/(topY-0.1))`, `w=[(1-s)(1-t), s(1-t), s*t, (1-s)*t]`, `ss=sum w^2`; for i<4: `k=w[i]/ss*pen`; shift BOTH `x,y` and `px,py` by `n*k`; then `vn` of that corner; if `vn<0`: `f=min(1,w[i]*2); px+=nx*vn*f; py+=ny*vn*f`.
- `truckPose()` (2123): `x=cx+sin(a)*0.1`, `y=cy-cos(a)*0.1`, `ang=a=atan2(P1-P0)` (post-finish states return the animation pose instead). Used by bots (`ang`) and by `spill`.
- `truckX()` (2737) = `(P0.x+P1.x)/2`.

## 7. Zones, weather, props

- `wx()` (1621): classic/load: `LEVEL_WX[levelIdx%8]`; yard: `'clear'`; daily: from `dailySpec()`.
- `makeWeather()` (2617-2627), seed `levelIdx*31+7`, uses `flatSpots(n,len,seed,minGap,pad)` (2612) and `seeded()` (mulberry32). Rain: 2 mud (len 5) + up to 3 puddles (len 2.5, filtered to be >8 m from any mud). Slime: scan from x=12 for slopes (`sl>0.25` -> sticky len 5, max 3, skip 10) or flat spots (`|sl|<0.05 && hash(x+seed)<0.3` -> bouncy len 2.5, max 3, skip 12). Dirty: 3 slush (len 6) + rocks (one per slush at `x+2+hash(x)*2`, plus 2 more at flat spots). Snow: no zones, `snow` ramps (0.035/s) and adds mass to the roof corners (`1+snow*0.8`) and lowers vmax; resets on a hard landing. Zones are sorted by `x0`. All results are in `levels.json`; `hash(n)=frac(sin(n*127.1+311.7)*43758.5453)`.
- `spawnProps()` (2628-2633), seed `levelIdx*17+3`: up to 8 props (cone/barrel/pipe, kind from `floor(hash(x*3.3+seed)*3)`, sizes r 0.36/0.42/0.35, mass 0.3/0.6/0.9) on flat spots; in snow also up to 8 `lump` props. Initial values in `levels.json`; per-sample prop state is recorded in the traces.
- `stepProps()` (2634-2652): only if `props.length`; `propBudget=min(1.5,propBudget+3*DT)`; for each alive prop within 30 m of the truck: Verlet with damping 0.995, gravity, `collide(b)` (shared ground collider; `b.c` damping `px+=(x-px)*0.02`), rotation, then wheel/body-polygon overlap against the truck, and a push-back that can nudge the truck (`dv=min(0.3,b.m/6*(-vn),propBudget)`). Props do influence the truck, so they are part of the parity state (and `lump` props break when hit at `-vn>4`). It uses `Math.random` only inside the lump-break dust (cosmetic).

## 8. Level start, checkpoints, retry

Crash -> 0.7 s freeze = exactly 84 ticks (VERIFIED in 7/7 crash resets in `mixer_L1_t0.8-none`) freeze -> `resetTruck(true)`: back at the last hit checkpoint (`cp.x`, `load=cp.load`) or at `x=5`. Rocks un-hit, `levelT=0`, `snow=0`. The crash counter (`run.crashes`) is NOT reset. The oracle gives up after 8 crashes or 120 sim seconds (same as sweep.js).

## 9. Nondeterminism and frame-time dependence audit

Sources searched: `Math.random`, `Date`, `performance.now`, `seeded(`, `requestAnimationFrame`. Findings:

| Source | Lines | Affects physics? |
|---|---|---|
| `Math.random` in dust/smoke/chunk/confetti particles inside `step`, `juiceStep`, `crash`, `spill`, `stepProps`, `confetti`, `render` shake | 1862, 1907-1913, 1915, 1991-1996, 2277, 2647, ... | No. Cosmetic only, the particles are never read by the sim. |
| `Math.random` in audio synthesis (`AM`) | 159-294 | No |
| `combo3 = {skin,sky,kit}` from `Math.random` at load | 2138 | **YES for the mixer**: skin picks the collider/wheel geometry. Pinned by the oracle, recorded in `meta.skin`. |
| `chosen` vehicle (roster) from `Math.random` | 2831, 2850, 2852 | No (menu only; the oracle sets `vehicle` directly) |
| `Math.random` in finale code (`updateDig`, `startAction`, pour particles, fossil pick 2070-2071) | 1949, 2070, 2105-2108, 2569-2588, 2735 | No (post-finish), not recorded |
| Seeded RNG `seeded(seed)` = mulberry32 (line 1772) | `flatSpots` (2614), `dailyGen` (1798), view code 933/1382/1419 | Deterministic from `levelIdx`/date key; outputs captured in `levels.json`. |
| `RNG = seeded(1)` / `seeded(1234+...)` at lines 450, 1510 | inside the finish-toys IIFE (`window.FT`) | No (post-finish toys) |
| Daily Dig seed: `todayKey()` uses `new Date()` (1771), hashed with FNV-1a-style `h=imul(h^c,16777619)`, rerolled with `seed+n` | 1771-1799 | Only in `mode=='daily'`. The oracle pins the key via `__game.dailyKey` setter and records it. |
| `performance.now()` | 299 (audio throttling), 2794, 2804 (`last`) | Only the browser `frame()` loop (`dt=min(0.05,(now-last)/1000)`). The oracle bypasses `frame()`: `requestAnimationFrame` is stubbed and `tick(DT)` is called directly. |
| `hash(n)` = frac(sin(...)*43758.5453) | 2145 | Deterministic but sensitive to the platform `sin` (see below). |

PRNG replacement in the oracle: because the sim path needs no `Math.random`, the recorder replaces `Math.random` with mulberry32 seeded from a recorded seed (`meta.seed`, default 20261102) via `addInitScript`, so every run (including the cosmetic particles) is reproducible. The exact code is stored in every trace as `meta.prngSource`; it is byte-identical to the game's own `seeded()`:
```js
function mulberry32(seed){ let t=seed>>>0; return ()=>{ t+=0x6D2B79F5; let r=Math.imul(t^t>>>15,1|t); r^=r+Math.imul(r^r>>>7,61|r); return ((r^r>>>14)>>>0)/4294967296; }; }
```
C# port: `uint t = seed; ... t += 0x6D2B79F5u; uint r = Imul(t ^ (t >> 15), 1 | t); r ^= r + Imul(r ^ (r >> 7), 61 | r); return ((r ^ (r >> 14)) / 4294967296.0)` with wrapping `unchecked` 32-bit multiply (`Math.imul` = low 32 bits).

## 10. Portability notes for transcendental math

Sim-path functions: `Math.hypot` (see section 0), `Math.sqrt`, `Math.atan2` (tipped test, truckPose, wheelie), `Math.sin/cos` (level generation, hash, mover animation), `Math.abs/min/max/sign/floor`, `Math.imul`. `sqrt`, `abs`, `min/max`, `floor` are exact in every runtime. `sin/cos/atan2` are libm-dependent: V8 uses its fdlibm port, .NET calls the OS C runtime, so results can differ in the last bit. Impact: (1) `buildLevel`'s ground polyline and `hash()`-driven zone/prop positions can differ at ~1e-16 relative (hash's `*43758.5453` magnifies to ~1e-11); fix by loading `levels.json` as data for T1 and testing the generator separately with a 1e-9 tolerance. (2) `atan2` only feeds thresholds (`tipped`, wheelie), so a last-bit difference matters only at the threshold.

## 11. Verified facts (commands run)

- 100 `tick(DT)` calls -> 100 `step()` calls (probe). Over all 202 traces there is not one tick where `step()` ran a number of times other than 1 (0 while `crashed`): the `stepcount` event list is empty in every trace.
- Crash freeze = 84 ticks; the reset tick also performs a `step()` (crashed -> drive at tick k+84, `run.t` advances 1 tick).
- `paused` is false and `acc` is 0 after load. No page errors in any run.
- V8 `Math.hypot` == Kahan emulation (2M pairs), != naive sqrt (40% of pairs).
- Determinism: see `determinism-result.json` (record twice in two browser launches + replay from the stored input string).
- Not covered by the traces (out of scope for the plan's drive parity): Contraption Yard (movers, `action` state), Combo (carved hole), finale/toys. `record.js` already drives `mode:'load'` and `mode:'daily'`; yard/combo would need extra input fields (`input.kg`) and are not recorded.

## 12. What the oracle records (summary; schema in `RECORDING-FORMAT.md`)

Per step: input bits. Per sampled step (every step 0..240, then every 12): all 6 points `x,y,px,py,c` (contact flag, normal, pen) plus `im`, `wheelAng`, `state`, `crashT`, `finishT`, `levelT`, `snow`, `airT`, `landT`, `wheelie`, `wheelT`, `roofHit`, `bodyHit`, `load`, `run.t/crashes`, `propBudget`, `cp.hit`, prop states, rock hit flags. Events: crash (step, x, reason), state changes, checkpoint, finish. Outcome: pass/fail, finish sim time, crash count.
