"""Check a -mmCrashRepro run's fx.csv (written by FxProbe): no FX may outlive a teleport.

Usage: python3 fx_analyze.py <folder with fx.csv>
Per teleport (crash respawn or R restart), over the first 0.5 s after it:
  particles   the oldest live truck particle is never older than the time since the teleport (+1 frame),
              so no spray, puff, exhaust or sparkle from the crash spot survives the cut
  tracks      the longest tyre-track segment stays under 1.5 m (no strip from the crash spot to the respawn)
Also over the whole run: the longest track segment ever (a streak would show here), and peak live particles.
Exit code 1 on any FAIL.
"""
import csv, sys

FRAME_SLACK = 1.0 / 30.0     # one frame at 30 fps: particles born on the teleport frame
TRACK_MAX = 1.5

def main(folder):
    rows = list(csv.DictReader(open(folder + '/fx.csv')))
    for r in rows:
        for k in ('t', 'since_teleport', 'oldest_age', 'longest_track'): r[k] = float(r[k])
        for k in ('teleports', 'live', 'track_segments', 'frame'): r[k] = int(r[k])
    fails = 0; checked = 0
    teleports = sorted({r['teleports'] for r in rows if r['teleports'] > 0})
    for n in teleports:
        after = [r for r in rows if r['teleports'] == n and r['since_teleport'] <= 0.5]
        if not after: continue
        checked += 1
        worst_age = max(r['oldest_age'] - r['since_teleport'] for r in after)
        worst_track = max(r['longest_track'] for r in after)
        ok_p = worst_age <= FRAME_SLACK
        ok_t = worst_track < TRACK_MAX
        if not (ok_p and ok_t): fails += 1
        print(f"teleport {n:2d} t={after[0]['t']:7.2f}s  particles {'PASS' if ok_p else 'FAIL'} (oldest - since = {worst_age:+.3f} s)"
              f"  tracks {'PASS' if ok_t else 'FAIL'} (longest {worst_track:.2f} m)  live@first={after[0]['live']}")
    longest = max(r['longest_track'] for r in rows)
    peak = max(r['live'] for r in rows)
    print(f"teleports checked {checked}, failed {fails}; longest track segment in the run {longest:.2f} m; peak live FX particles {peak}")
    if longest >= TRACK_MAX: fails += 1; print("FAIL: a long track segment (streak) appeared")
    print("RESULT", "PASS" if fails == 0 and checked > 0 else "FAIL")
    return 0 if fails == 0 and checked > 0 else 1

if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
