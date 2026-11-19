# Slice review: meta.js and audio.js

Scope: CONTRACT.md SLICE sections for meta.js and audio.js, against `src/parts/meta.js` (52 lines) and `src/parts/audio.js` (61 lines). Sources were not edited.

## Tests run
- `node src/test/meta.test.js`: 7/7 pass (bands n=7 and n=3, never-downgrade, tuned not saved, dailySeed, corrupt JSON, no localStorage).
- `node src/test/audio.test.js`: pass ("audio.test OK").

## Checklist
- localStorage try/catch everywhere: OK. load (L25-31), save (L32), reset (L50) are all wrapped.
- No downgrade of saved best: OK. recordRun (L38-49) only writes on higher rank, or equal rank with fewer ticks.
- Tuned flag: OK. `run.tuned` returns before any write (L42).
- Band maths: OK. n=7 gives factor 1. n=3 gives 3/7, matching the "scale by n/7" contract. flipStar uses the same factor.
- dailySeed uses local date getters (L21-22): OK.
- Audio gain <= 0.15: OK. Master gain is MAXG=0.15 (L5, L14, L58). Per-blip gain is clamped to 1, so the output peak is at most 0.15.
- Muted respected: OK. blip (L25), onEvents (L50) and master gain (L58) all honour it.
- No throws without AudioContext: OK. Ctor() guard (L10, L19), try around constructor (L12-15), try around each blip (L26-33).

## Findings

1. audio.js L50 (medium, autoplay policy): `onEvents` calls `ensure()`, which constructs an AudioContext. ui.js L127 calls onEvents on every step batch, so if no pointerdown has happened yet the context is created outside a user gesture.
   Fix: change L50 to `if (muted || !events || !events.length || !ctx) return;`. Context creation then happens only in `init()`, which ui.js calls from pointerdown (L189, L263).

2. audio.js L21 (low): `c.resume()` returns a Promise. A rejection is unhandled.
   Fix: `var p = c.resume(); if (p && p.catch) p.catch(function () {});`

3. meta.js L43-44 (low): if a stored best has no `medal` field, `RANK[prev.medal]` is undefined. Every comparison is then false, so that key can never be saved again.
   Fix: `const pr = prev ? (RANK[prev.medal] || 0) : -1;` and compare `RANK[medal] > pr`, or `RANK[medal] === pr && ticks < prev.ticks`.

4. meta.js L46-47 (info): if `save()` fails (quota or blocked storage) recordRun still returns `isBest: true`. The UI then shows "new best" for a run that was not persisted.
   Fix (optional): have save return a boolean and set `isBest` from it.

## Not covered by the existing tests
- onEvents before init() (finding 1).
- A stored best without a medal field (finding 3).
- Failing save (finding 4).
