#!/usr/bin/env bash
# Runs the Unity tests of the map slice in batch mode and prints the summary.
#   conquest/tools/unity/run_tests.sh EditMode|PlayMode [path-to-Unity-binary] [test-filter, e.g. MapSliceSmokeTests]
# PlayMode needs a graphics device (it renders), so -nographics is NOT passed. No other Unity instance may have the
# project open. Results: $TMPDIR/conquest-<platform>-results.xml and the log $TMPDIR/conquest-<platform>.log.
set -u
PLATFORM="${1:-EditMode}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$(cd "$HERE/../../unity" && pwd)"
UNITY="${2:-${UNITY_BIN:-/Applications/Unity/Hub/Editor/6000.6.3f1/Unity.app/Contents/MacOS/Unity}}"
FILTER="${3:-}"
OUT="${TMPDIR:-/tmp}"
LOG="$OUT/conquest-$PLATFORM.log"
XML="$OUT/conquest-$PLATFORM-results.xml"
rm -f "$XML" "$LOG"
EXTRA=()
[ -n "$FILTER" ] && EXTRA=(-testFilter "$FILTER")
"$UNITY" -batchmode -projectPath "$PROJECT" -runTests -testPlatform "$PLATFORM" -testResults "$XML" -logFile "$LOG" ${EXTRA[@]+"${EXTRA[@]}"}
STATUS=$?
if [ -f "$XML" ]; then
  python3 - "$XML" <<'PY'
import sys, xml.etree.ElementTree as ET
r = ET.parse(sys.argv[1]).getroot()
print({k: r.get(k) for k in ("total", "passed", "failed", "skipped", "result", "duration")})
for case in r.iter("test-case"):
    if case.get("result") not in ("Passed",):
        msg = case.find("failure/message")
        print(case.get("result"), case.get("fullname"), (msg.text or "").strip()[:300] if msg is not None else "")
        st = case.find("failure/stack-trace")
        if st is not None:
            print("   ", "\n    ".join([l for l in (st.text or "").splitlines() if "Conquest" in l][:4]))
PY
else
  echo "run_tests: no result file (exit $STATUS); see $LOG" >&2
fi
exit "$STATUS"
