#!/usr/bin/env bash
# Renders the map polish candidates (C1, C2, C3 per decision) at 1280x720, 1920x1080 and 1080x1920, writes
# conquest/unity/Screenshots/polish/*.png, one contact sheet per decision (sheet-*.png, rows C1..C3, columns the three
# sizes, no text) and numbers.jsonl, then turns the numbers into NUMBERS.md. Needs a graphics device (not -nographics);
# no other Unity instance may have the project open. About a minute.
#   conquest/tools/unity/polish_capture.sh [path-to-Unity-binary]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/run_tests.sh" PlayMode "${1:-}" PolishCaptureTests
STATUS=$?
python3 "$HERE/polish_table.py" "$HERE/../../unity/Screenshots/polish/numbers.jsonl" > "$HERE/../../unity/Screenshots/polish/NUMBERS.md" || STATUS=1
echo "polish_capture: exit $STATUS (pictures and NUMBERS.md in conquest/unity/Screenshots/polish)"
exit "$STATUS"
