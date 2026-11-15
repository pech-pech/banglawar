#!/usr/bin/env bash
# GUARD loop: a round every ~5 min until END (epoch secs) or the tree is quiet for 15 min. e2e (~10 min) on the first and the last round only.
# Usage: tools/guard/guard-loop.sh <liveRoot> <mainRoot> <baseline.json> <workDir> <GUARD.md> <endEpoch>
LIVE=$1; MAIN=$2; BASE=$3; WORK=$4; MD=$5; END=$6
G=$(dirname "$0")
LASTCHG=$(date +%s); R=0
while :; do
  R=$((R+1)); T=$(date +%s)
  if (( R == 1 )); then E=""; else E="--no-e2e"; fi
  node "$G/guard-round.mjs" "$LIVE" "$MAIN" "$BASE" "$WORK" "$MD" $E
  grep -q '"quiet":false' "$WORK/last-round.json" && LASTCHG=$T
  NOW=$(date +%s)
  if (( NOW + 600 >= END )) || (( NOW - LASTCHG >= 15*60 )); then
    node "$G/guard-round.mjs" "$LIVE" "$MAIN" "$BASE" "$WORK" "$MD"
    echo "guard loop done after $((R+1)) rounds"; break
  fi
  W=$(( 300 - (NOW - T) )); (( W > 0 )) && sleep $W
done
