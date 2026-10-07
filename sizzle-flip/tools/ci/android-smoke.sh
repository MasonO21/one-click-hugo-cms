#!/usr/bin/env bash
# Installs the self-test build (node tools/build.mjs --smoke) on the running Android emulator, starts it, takes the
# screenshots the self-test asks for and collects its results from logcat. Run from sizzle-flip/.
set -u
OUT=${OUT:-smoke-out}; mkdir -p "$OUT"
PKG=com.sizzleflip.game
APK=android/app/build/outputs/apk/debug/app-debug.apk
adb wait-for-device
adb shell getprop ro.build.version.release | sed 's/^/Android /'
adb shell dumpsys webviewupdate | grep -m1 'Current WebView package' || true
adb install -r "$APK" || { echo "::error::install failed"; exit 1; }
adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT=$!
adb shell am start -W -n "$PKG/.MainActivity"
end=$((SECONDS + 480))
while [ $SECONDS -lt $end ]; do
  for name in $(grep -o 'SMOKE SHOT [0-9a-z-]*' "$OUT/logcat.txt" | awk '{print $3}'); do
    [ -s "$OUT/$name.png" ] || adb exec-out screencap -p > "$OUT/$name.png"
  done
  grep -q 'SMOKE DONE' "$OUT/logcat.txt" && break
  if ! adb shell pidof "$PKG" > /dev/null; then echo "::error::the app is not running any more"; break; fi
  sleep 1
done
sleep 2; kill $LOGCAT 2>/dev/null
echo "----- self-test -----"
grep -o 'SMOKE .*' "$OUT/logcat.txt" | grep -v 'SMOKE SHOT'
grep -o 'SMOKE .*' "$OUT/logcat.txt" | grep -v 'SMOKE SHOT' > "$OUT/results.txt"
echo "---------------------"
if grep -E 'FATAL EXCEPTION|AndroidRuntime: FATAL' "$OUT/logcat.txt"; then echo "::error::the app crashed"; grep -A30 'FATAL EXCEPTION' "$OUT/logcat.txt" | head -60; exit 1; fi
grep -iE 'chromium.*(Uncaught|ERROR:)|Capacitor/Console.*(Error|error)' "$OUT/logcat.txt" | head -20 || true
grep -qE 'SMOKE DONE pass=[0-9]+ fail=0' "$OUT/logcat.txt" || { echo "::error::self-test did not pass"; exit 1; }
echo "self-test passed"
