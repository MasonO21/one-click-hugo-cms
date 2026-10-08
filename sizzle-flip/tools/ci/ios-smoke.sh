#!/usr/bin/env bash
# Installs the self-test build on an iPhone Simulator, starts it, collects the self-test's results from the app's
# console output and turns a screen recording into the screenshots the self-test asks for ("SMOKE SHOT <name> <ms>").
# (A simulator screenshot can take up to a minute on a CI Mac, longer than each step lasts, so the frames are pulled
# from the recording at the times the self-test reports instead.) Run from sizzle-flip/ after the Debug simulator build.
set -u
OUT=${OUT:-smoke-out}; mkdir -p "$OUT"
BUNDLE=com.sizzleflip.game
APP=$(find build/Build/Products/Debug-iphonesimulator -maxdepth 1 -name '*.app' | head -1)
[ -n "$APP" ] || { echo "::error::no simulator build found"; exit 1; }
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys, re
d = json.load(sys.stdin)["devices"]
ios = [(tuple(int(n) for n in re.findall(r"\d+", k)), x) for k, v in d.items() if ".iOS-" in k for x in v if x["name"].startswith("iPhone")]
ios.sort(key=lambda t: (t[0], "Pro" in t[1]["name"]))
print(ios[-1][1]["udid"])')
xcrun simctl list devices | grep "$UDID"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b > /dev/null
xcrun simctl install "$UDID" "$APP" || { echo "::error::install failed"; exit 1; }

# record the screen for the whole run
xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$OUT/run.mov" > "$OUT/record.log" 2>&1 &
REC=$!
for i in $(seq 1 40); do grep -qi "recording started" "$OUT/record.log" && break; sleep 0.5; done
REC_START=$(python3 -c 'import time; print(time.time())')

# a pseudo-terminal (and NSUnbufferedIO) keep the app's output flowing; redirected to a file, Swift holds it back
: > "$OUT/console.txt"
SIMCTL_CHILD_NSUnbufferedIO=YES xcrun simctl launch --console-pty --terminate-running-process "$UDID" "$BUNDLE" > "$OUT/console.txt" 2>&1 &
LAUNCH=$!
# Is the app still running? `simctl launch --console-pty` stays attached until the app exits, and launchd lists it.
# On a busy CI Mac a single launchd query can fail or come back without the app for a moment, so only three misses
# in a row count (and a failed query is not a miss): one bad answer used to end the run, and stopping the run kills
# the app it was watching.
alive() {
  kill -0 "$LAUNCH" 2>/dev/null || return 1
  local list
  list=$(xcrun simctl spawn "$UDID" launchctl list 2>/dev/null) || return 0
  echo "$list" | grep -q "UIKitApplication:$BUNDLE"
}
end=$((SECONDS + 600)); misses=0
while [ $SECONDS -lt $end ]; do
  grep -q 'SMOKE DONE' "$OUT/console.txt" && break
  if alive; then misses=0; else misses=$((misses + 1)); fi
  if [ $misses -ge 3 ]; then
    echo "::error::the app is not running any more"
    kill -0 "$LAUNCH" 2>/dev/null && echo "(simctl launch is still attached)" || echo "(simctl launch has exited)"
    xcrun simctl spawn "$UDID" launchctl list 2>&1 | grep -iE "sizzle|UIKitApplication" | head -5
    # why iOS ended it (watchdog, memory, crash), from the simulator's own log
    xcrun simctl spawn "$UDID" log show --last 2m --style compact \
      --predicate 'eventMessage CONTAINS[c] "sizzleflip" AND (process == "runningboardd" OR process == "SpringBoard" OR process == "launchd")' 2>/dev/null \
      | grep -iE "terminat|kill|exit|watchdog|jetsam|crash|reason" | tail -25
    break
  fi
  sleep 2
done
sleep 1
kill -INT $REC 2>/dev/null; wait $REC 2>/dev/null
kill $LAUNCH 2>/dev/null

echo "----- self-test -----"
grep -o 'SMOKE .*' "$OUT/console.txt" | grep -v 'SMOKE SHOT' | tee "$OUT/results.txt"
echo "---------------------"

# screenshots: the recorded frame 1 s after each SHOT marker (the self-test holds each screen for 2.5 s)
if command -v ffmpeg > /dev/null && [ -s "$OUT/run.mov" ]; then
  grep -o 'SMOKE SHOT [0-9a-z-]* [0-9]*' "$OUT/console.txt" | while read -r _ _ name ms; do
    t=$(python3 -c "print(max(0, $ms / 1000 - $REC_START + 1.0))")
    ffmpeg -loglevel error -ss "$t" -i "$OUT/run.mov" -frames:v 1 -y "$OUT/$name.png" < /dev/null && echo "screenshot $name at ${t}s"
  done
  rm -f "$OUT/run.mov"
else
  echo "no ffmpeg or no recording: screenshots skipped"; cat "$OUT/record.log"
fi

find ~/Library/Logs/DiagnosticReports -name 'App*' -newer "$OUT/record.log" -exec cp {} "$OUT/" \; 2>/dev/null
if ls "$OUT"/App*.ips > /dev/null 2>&1; then echo "::error::the app crashed"; head -80 "$OUT"/App*.ips; exit 1; fi
grep -E '\[error\]' "$OUT/console.txt" | head -20 || true
grep -qE 'SMOKE DONE pass=[0-9]+ fail=0' "$OUT/console.txt" || { echo "::error::self-test did not pass"; tail -40 "$OUT/console.txt"; exit 1; }
echo "self-test passed"
