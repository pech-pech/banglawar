#!/usr/bin/env bash
# GUARD loop: a round every ~5 min until 75 min or the tree is quiet for 15 min; e2e every 3rd round and on the last.
# Usage: tools/guard/guard-loop.sh <liveRoot> <mainRoot> <baseline.json> <workDir> <GUARD.md>
LIVE=$1; MAIN=$2; BASE=$3; WORK=$4; MD=$5
G=$(dirname "$0")
START=$(date +%s); LASTCHG=$START; R=0
while :; do
  R=$((R+1)); T=$(date +%s)
  if (( R % 3 == 1 )); then E=""; else E="--no-e2e"; fi
  node "$G/guard-round.mjs" "$LIVE" "$MAIN" "$BASE" "$WORK" "$MD" $E
  grep -q '"quiet":false' "$WORK/last-round.json" && LASTCHG=$T
  NOW=$(date +%s)
  if (( NOW - START >= 75*60 )) || (( NOW - LASTCHG >= 15*60 )); then
    [[ -n "$E" ]] && node "$G/guard-round.mjs" "$LIVE" "$MAIN" "$BASE" "$WORK" "$MD"
    echo "guard loop done after $R rounds, $(( (NOW-START)/60 )) min"; break
  fi
  W=$(( 300 - (NOW - T) )); (( W > 0 )) && sleep $W
done
