#!/usr/bin/env bash
# Installs the self-test build on an iPhone Simulator, starts it, takes the screenshots the self-test asks for and
# collects its results from the app's console output. Run from sizzle-flip/ after the Debug simulator build.
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
: > "$OUT/console.txt"
# a pseudo-terminal keeps the app's output line-buffered (redirected to a file, Swift holds it back until exit)
xcrun simctl launch --console-pty --terminate-running-process "$UDID" "$BUNDLE" > "$OUT/console.txt" 2>&1 &
LAUNCH=$!
sleep 3
end=$((SECONDS + 480))
while [ $SECONDS -lt $end ]; do
  for name in $(grep -o 'SMOKE SHOT [0-9a-z-]*' "$OUT/console.txt" | awk '{print $3}'); do
    [ -s "$OUT/$name.png" ] || xcrun simctl io "$UDID" screenshot "$OUT/$name.png" > /dev/null 2>&1
  done
  grep -q 'SMOKE DONE' "$OUT/console.txt" && break
  if ! xcrun simctl spawn "$UDID" launchctl list | grep -q "UIKitApplication:$BUNDLE"; then echo "::error::the app is not running any more"; break; fi
  sleep 1
done
kill $LAUNCH 2>/dev/null
echo "----- self-test -----"
grep -o 'SMOKE .*' "$OUT/console.txt" | grep -v 'SMOKE SHOT' | tee "$OUT/results.txt"
echo "---------------------"
find ~/Library/Logs/DiagnosticReports -name 'App*' -newer "$OUT/console.txt" -exec cp {} "$OUT/" \; 2>/dev/null
if ls "$OUT"/App*.ips > /dev/null 2>&1; then echo "::error::the app crashed"; head -80 "$OUT"/App*.ips; exit 1; fi
grep -E '\[error\]' "$OUT/console.txt" | head -20 || true
grep -qE 'SMOKE DONE pass=[0-9]+ fail=0' "$OUT/console.txt" || { echo "::error::self-test did not pass"; tail -40 "$OUT/console.txt"; exit 1; }
echo "self-test passed"
