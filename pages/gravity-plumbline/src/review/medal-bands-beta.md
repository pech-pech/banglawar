# Medal bands (beta)

Source of truth: `PL.meta.bandsFor(n)` in `src/parts/meta.js`.

| Shaft | Top medal | Gold | Silver | Bronze |
|---|---|---|---|---|
| 5 rooms | 55 s (and 8 flips or fewer) | 75 s | 105 s | 170 s |
| 7 rooms | 75 s (and 12 flips or fewer) | 105 s | 150 s | 240 s |

Other lengths (Tweak only) scale the 7-room row by n/7.

## Where the numbers come from
- Bot run: `jitter-bot.js`, 60 seeds per room, all 18 live rooms, plan run (+-40 ms, 3% wrong key). Median clear per room 0.93 s to 5.84 s.
- Summed over 400 seeded shafts after the room-mix fix: 5 rooms median 6.3 s (p10 5.5, p90 9.3); 7 rooms median 9.8 s (p10 9.1, p90 14.9).
- Base = bot total + 4 s reading time per room (an assumption): 26.3 s and 37.8 s.
- Bands are about 2.0x, 2.75x, 4x and 6.3x of that base. For 7 rooms this lands on the numbers the game already had, so they stay. The 5-room row used to be 5/7 of the 7-room row (53.6 / 75 / 107 / 171 s); it is now its own row.

## Limits
- Bot time is not human time. No child has played this build. The 4 s per room and the multipliers are guesses.
- Deaths cost time and the bot run counts first-try clears only.
- Rule: medals are recomputed from stored seconds, so bands may be loosened after a playtest, never tightened.
