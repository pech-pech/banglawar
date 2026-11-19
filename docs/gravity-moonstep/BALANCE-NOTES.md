# Moonstep balance notes (slice C, 2026-11-19)
All values are **admin defaults**. M delegated them and can change any of them. Engine VERSION goes from 1 to 2, so v1 replays and hashes do not verify on v2.

## Final numbers
| knob | v1 | v2 (admin default) |
|---|---|---|
| Medal bands `Moonstep.BANDS` | Bronze 150 / Silver 400 / Gold 800 / Moon 1500 | **Bronze 150 / Silver 1000 / Gold 3800 / Moon 6000** |
| Tide cap `C.TIDE_MAX` | 60 px/s | **75 px/s** (reached at t=265 s; 22 + 0.2 t unchanged) |
| Tide start `C.TIDE_START` | y=+260 | **+360** (about 4.5 s more grace at the start) |
| `replay()` default maxTicks | 240 s | **3600 s** (v1: any run over 4 min failed Verify replay) |
| Start body + bodies below 150 m | R = 4r | **R = 5r** (an early mis-hop is recaptured instead of "lost") |
| Gap below 150 m | 90..230 | **90..190**, widening to full by 300 m |
| Early bodies 1-4 angle | +-70 deg of up | **+-40 deg; body 1 up-right** (the side the runner starts running toward) |
| Rest body | - | **still, r 85-95, every 150 m** (every 150-300 m past 1000 m) |
| Cluster | - | **2 small bodies (r 36-52) in a sideways chain**; share 0 -> 14% from 80 m to 380 m |
| Long hop | - | **dist 230-300 onto a big still/spin body (r 72-90)**; share 0 -> 10% from 200 m to 600 m |
| Deep ramp 1000 -> 3000 m | flat after 800 m | **max r 90 -> 72, gaps +50 px, repel share 15% -> 22%** |
| Reach check | ignored repels | **probe includes live repels between bodies; detour on the far side, else the repel is retired (dead, still off-screen)** |

Bug found: the v1 reach check ignored repels, so a repel could wall off the only route up. Example: seed B73 got stuck on body 8 until the tide arrived. Fixing this was the biggest change, because these soft-locks were what limited skilled runs. Every body passes the repel-aware reach check: 3566 of 3566 bodies, 20 seeds, up to 3000 m. The unit test requires at least 99%.
The four kinds are unchanged (still, spin, crumble, repel), so draw.js needs no change. A body may carry `pat: 'rest'|'cluster'|'long'`. A retired repel has `dead:true, retired:true`.

## Bot rows
- **Before:** v1 code, 200 seeds, 240 s cap.
- **After:** v2 code, 420 s cap. Skilled and human used 80 seeds, because the lead asked for a fast finish. Idle, naive and rote used 100 seeds.
- Each version's own bands are applied.

| bot | ver | height med | p10 | p90 | tide | lost | cap | jumps med | Bronze | Silver | Gold | Moon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| idle | v1 | 8 | 8 | 8 | 100% | 0% | 0% | 0 | 0% | 0% | 0% | 0% |
| idle | v2 | 8 | 8 | 8 | 100% | 0% | 0% | 0 | 0% | 0% | 0% | 0% |
| naive | v1 | 58 | 17 | 121 | 32% | 69% | 0% | 5 | 5% | 0% | 0% | 0% |
| naive | v2 | 45 | 9 | 135 | 53% | 47% | 0% | 6 | 7% | 0% | 0% | 0% |
| rote | v1 | 49 | 13 | 115 | 33% | 68% | 0% | 5 | 6% | 0% | 0% | 0% |
| rote | v2 | 44 | 11 | 132 | 35% | 65% | 0% | 5 | 7% | 0% | 0% | 0% |
| skilled | v1 | 738 | 342 | 1789 | 55% | 23% | 23% | 19 | 99% | 83% | 44% | 16% |
| skilled | v2 | 2402 | 544 | 4326 | 11% | 75% | 14% | 64 | 99% | 81% | **18%** | **4%** |
| human | v1 | 460 | 84 | 1072 | 39% | 56% | 6% | 13 | 86% | 58% | 20% | 5% |
| human | v2 | 649 | 196 | 1738 | 10% | 90% | 0% | 23 | **90%** | 29% | 0% | 0% |

Targets on the 80-seed run:
- Skilled Moon at or below 5%: met (4%).
- Skilled Gold 15-25%: met (18%).
- Human Bronze at least 90%: met at exactly 90%, so it can slip.

## Caveats for the lead
- game.js keeps its own `BANDS` copy (150/400/800/1500) for the HUD "next medal" line. Switch it to `Moonstep.BANDS`, or the HUD and the game-over medal will disagree.
- The skilled bot is an oracle: it uses the exact predict. With the soft-locks gone it outruns the 75 px/s tide, so its runs end in "lost" mistakes, and 14% reach the 420 s cap. Moon 6000 therefore means "within 7 minutes" for a perfect bot. By the human bot's numbers, people get Silver at best. If M wants Gold within reach of people, lower Gold (human p90 = 1738 m) and accept skilled Gold above 25%.
- Human Bronze sits at exactly 90% on 80 seeds. Re-run 200 seeds with `node tests/bots.js 200` (about 15 min on 4 cores) before shipping. That run also rewrites BOT-REPORT.md, which this pass left on the v1 numbers.
- tests/bots.js now runs seeds in parallel worker processes. Options: `--kinds --cap --tide --src --out --json`.
