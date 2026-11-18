#!/bin/bash
# Runs sim tests, then e2e (waits up to 10 min for index.html). Writes failures to ../review/tests.md
D="$(cd "$(dirname "$0")" && pwd)"; P="$D/../.."; OUT="$D/../review/tests.md"; mkdir -p "$D/../review" /tmp/pl-shots
cd "$D"
S=$(node sim.test.js 2>&1); SR=$?
for i in $(seq 1 300); do [ -f "$P/index.html" ] && break; sleep 2; done
E=$(node e2e.js 2>&1); ER=$?
{ echo "# Test results"; echo; echo "## sim.test.js (exit $SR)"; echo '```'; echo "$S"; echo '```'; echo "## e2e.js (exit $ER)"; echo '```'; echo "$E"; echo '```'; } > "$OUT"
echo "$S"; echo "$E"
[ $SR -eq 0 ] && [ $ER -eq 0 ]
