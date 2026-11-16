#!/usr/bin/env bash
# Full review still set (L-MM-33/34) at M's two aspects, one app at a time, then the metrics.
#   tools/stills_all.sh <out-folder> [app-path] [quality 0-3]
# Writes <out>/pad_16x10 (1920x1200, Honor Pad) and <out>/fold_landscape (the Fold's 2176x1812 landscape aspect,
# run at 1520x1266 because a 1440-high display clamps a 1812-high window to 2176x1377), each with every scenario
# still, the fx_<flag>_on/off pairs, stills.csv, metrics.csv and pairs.csv. Exit code 1 if any run or check fails.
set -u
OUT="${1:?usage: stills_all.sh <out-folder> [app-path] [quality]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${2:-$HERE/../Unity/Builds/macOS/MixerMad.app}"
QUALITY="${3:-2}"
BIN="$APP/Contents/MacOS/Mixer Mad 3D"
[ -x "$BIN" ] || { echo "no app binary at $BIN (build it first)"; exit 2; }
if pgrep -f "$BIN" >/dev/null; then echo "this Mixer Mad app is already running; close it first"; exit 2; fi

status=0
run_aspect() {   # name width height
  local dir="$OUT/$1"
  mkdir -p "$dir"
  echo "== $1 ($2x$3): stills into $dir"
  "$BIN" -ApplePersistenceIgnoreState YES -mmStills "$dir" -mmStillsSet full -mmStillsQuality "$QUALITY" \
    -screen-fullscreen 0 -screen-width "$2" -screen-height "$3" -logFile "$dir/app.log"
  local code=$?
  grep "stills set done" "$dir/app.log" || echo "(no done line in $dir/app.log)"
  # the window can be clamped by the display: the stills must keep the requested aspect (within 1%)
  python3 - "$dir/stills.csv" "$2" "$3" <<'PY' || status=1
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1]))) if len(sys.argv) > 1 else []
want = int(sys.argv[2]) / int(sys.argv[3])
bad = sorted({r['screen'] for r in rows if abs(int(r['screen'].split('x')[0]) / int(r['screen'].split('x')[1]) / want - 1) > 0.01})
if not rows or bad:
    print('ASPECT FAIL: wanted %.4f, got %s' % (want, ' '.join(bad) or 'no stills')); sys.exit(1)
print('aspect ok: %s' % rows[0]['screen'])
PY
  [ "$code" -eq 0 ] || { echo "app exit code $code for $1"; status=1; }
  python3 "$HERE/still_metrics.py" "$dir" --csv "$dir/metrics.csv" || status=1
  python3 "$HERE/still_metrics.py" "$dir" --pairs --pairs-csv "$dir/pairs.csv" || status=1
}

run_aspect pad_16x10 1920 1200
run_aspect fold_landscape 1520 1266   # 2176x1812 aspect (1.2009) that fits a 1440-high display
echo "done, status $status: $OUT"
exit $status
