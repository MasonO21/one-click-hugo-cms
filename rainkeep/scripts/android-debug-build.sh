#!/usr/bin/env bash
# Build Rainkeep-debug.apk: a debug-signed Android build testers can sideload (NATIVE.md, "Android test build").
#
#   scripts/android-debug-build.sh            # from the rainkeep/ folder; needs JDK 21, Node 20+, python3 + Pillow
#   RK_ANDROID_WORK=/somewhere scripts/android-debug-build.sh
#
# Everything it downloads or generates (the Android SDK, Gradle's cache, the Capacitor project, the APK) goes in a
# work folder outside the repo, ~/.rainkeep-android by default (about 3 GB). Set ANDROID_HOME to use an SDK you
# already have, JAVA_HOME for a particular JDK, RK_MAVEN_MIRROR=1 where repo.maven.apache.org refuses you (429).
#
# Steps: copy the repo's rainkeep/ folder into app-src/ (minus node_modules, www, android, ios, server),
# npm install, build www/, `cap sync android` (adding the android project if it's missing), stamp
# versionName/versionCode from DATA.version in data.js, generate Rainkeep's launcher icon and splash
# (android-res.py, Python + Pillow), `gradlew assembleDebug`, copy the APK out (+ icon-check.png).
# The repo itself is only read, never written.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${RAINKEEP_SRC:-$(cd "$HERE/.." && pwd)}"
W="${RK_ANDROID_WORK:-$HOME/.rainkeep-android}"
mkdir -p "$W"
APP="$W/app-src"
OUT="$W/Rainkeep-debug.apk"
SDK="${ANDROID_HOME:-$W/sdk}"
case "$(uname -s)" in Darwin) CT_OS=mac ;; *) CT_OS=linux ;; esac
CMDLINE_TOOLS_ZIP="commandlinetools-$CT_OS-14742923_latest.zip"   # cmdline-tools 20.0 (classic sdkmanager)

export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
if [ -z "${JAVA_HOME:-}" ]; then
  JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java || echo /usr/bin/java)")")")"
fi
export JAVA_HOME
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$W/gradle-home}"
export PATH="$JAVA_HOME/bin:$PATH"

START=$(date +%s)
step() { printf '\n== %s (%ss)\n' "$*" "$(( $(date +%s) - START ))"; }

[ -f "$REPO/index.html" ] && [ -f "$REPO/package.json" ] || { echo "rebuild: no Rainkeep game at $REPO" >&2; exit 1; }
[ -x "$JAVA_HOME/bin/java" ] || { echo "rebuild: JAVA_HOME=$JAVA_HOME has no java (need JDK 21)" >&2; exit 1; }

# ---- 1. fresh copy of the game files -------------------------------------------------------------
step "Copying $REPO -> app-src"
mkdir -p "$APP"
case "$APP" in */app-src) ;; *) echo "rebuild: refusing to clean $APP" >&2; exit 1 ;; esac
# drop everything except installed deps and the generated native project, so deleted repo files go away too
find "$APP" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name android ! -name package-lock.json -exec rm -rf {} +
tar -C "$REPO" --anchored --exclude=./node_modules --exclude=./www --exclude=./android --exclude=./ios --exclude=./server -cf - . \
  | tar -C "$APP" -xf -

# ---- 2. web build ---------------------------------------------------------------------------------
cd "$APP"
step "npm install"
npm install --no-audit --no-fund --loglevel=error
step "Building www/"
node scripts/build-www.mjs > "$W/www-last.log"
head -1 "$W/www-last.log"

# ---- 3. Android SDK (only downloads when something is missing) ----------------------------------
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  step "Installing Android command-line tools"
  tmp="$(mktemp -d "$W/dl.XXXXXX")"
  curl -fsSL --retry 3 -o "$tmp/ct.zip" "https://dl.google.com/android/repository/$CMDLINE_TOOLS_ZIP"
  unzip -q "$tmp/ct.zip" -d "$tmp/x"
  mkdir -p "$SDK/cmdline-tools"; rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/x/cmdline-tools" "$SDK/cmdline-tools/latest"; rm -rf "$tmp"
fi
if [ ! -f "$SDK/licenses/android-sdk-license" ]; then
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
fi

# ---- 4. Capacitor sync ----------------------------------------------------------------------------
if [ ! -d "$APP/android" ]; then
  step "npx cap add android"
  npx cap add android
fi
step "npx cap sync android"
npx cap sync android > "$W/cap-sync-last.log" 2>&1 || { cat "$W/cap-sync-last.log" >&2; exit 1; }
grep -E '^\[(warn|error|info\] Sync)' "$W/cap-sync-last.log" || true

COMPILE_SDK="$(sed -n 's/^[[:space:]]*compileSdkVersion[[:space:]]*=[[:space:]]*\([0-9]*\).*/\1/p' android/variables.gradle)"
need=()
[ -d "$SDK/platform-tools" ] || need+=("platform-tools")
[ -d "$SDK/platforms/android-$COMPILE_SDK" ] || need+=("platforms;android-$COMPILE_SDK")
[ -d "$SDK/build-tools/35.0.0" ] || need+=("build-tools;35.0.0")   # AGP 8.13 default
if [ ${#need[@]} -gt 0 ]; then
  step "sdkmanager ${need[*]}"
  "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" "${need[@]}" >/dev/null
fi

# ---- 5. version from data.js ----------------------------------------------------------------------
VERSION_NAME="$(grep -m1 -E "^[[:space:]]*version:[[:space:]]*'[0-9][0-9.]*'" data.js | sed -E "s/.*'([0-9.]+)'.*/\1/" || true)"
if [ -n "$VERSION_NAME" ]; then
  IFS=. read -r vMa vMi vPa <<<"$VERSION_NAME"
  VERSION_CODE=$(( ${vMa:-0} * 1000000 + ${vMi:-0} * 1000 + ${vPa:-0} ))   # 4.43.0 -> 4043000
  sed -i -e "s/^\([[:space:]]*\)versionCode [0-9][0-9]*/\1versionCode $VERSION_CODE/" \
         -e "s/^\([[:space:]]*\)versionName \"[^\"]*\"/\1versionName \"$VERSION_NAME\"/" android/app/build.gradle
  step "Version $VERSION_NAME (code $VERSION_CODE)"
else
  echo "rebuild: DATA.version not found in data.js; keeping the version in android/app/build.gradle" >&2
fi

# ---- 5b. Rainkeep launcher icon + splash (replaces Capacitor's defaults) ---------------------------
# android-res.py (next to this script) cuts the medallion from icons/icon-1024.png into adaptive + legacy
# launcher icons, crops icons/splash-2732.png into the drawable*/splash.png files, sets the icon background
# colour and points the Android 12+ system splash at the icon. Skipped when nothing it reads has changed.
RES="$APP/android/app/src/main/res"
ICON_BG="$(node -p "const c=require('./capacitor.config.json'); (c.android && c.android.backgroundColor) || c.backgroundColor || '#1a0e07'")"
RES_STAMP="$APP/android/.rainkeep-res-stamp"
res_hash="$( { cat "$APP/icons/icon-1024.png" "$APP/icons/splash-2732.png" "$HERE/android-res.py"; echo "$ICON_BG"; } | shasum -a 256 | cut -d' ' -f1)"
if [ "$(cat "$RES_STAMP" 2>/dev/null)" != "$res_hash" ]; then
  step "Launcher icon + splash (background $ICON_BG)"
  python3 -I -c 'import PIL' 2>/dev/null || { echo "rebuild: python3 Pillow (PIL) is needed for the icons" >&2; exit 1; }
  python3 -I "$HERE/android-res.py" --icons "$APP/icons" --res "$RES" --bg "$ICON_BG"
  echo "$res_hash" > "$RES_STAMP"
else
  step "Launcher icon + splash unchanged"
fi

# ---- 6. Gradle --------------------------------------------------------------------------------------
# Where repo.maven.apache.org answers HTTP 429 (some cloud machines), RK_MAVEN_MIRROR=1 points mavenCentral() at
# Google's mirror of it.
mkdir -p "$GRADLE_USER_HOME/init.d"
if [ "${RK_MAVEN_MIRROR:-0}" = 1 ]; then
cat > "$GRADLE_USER_HOME/init.d/maven-central-mirror.gradle" <<'EOF'
// Rainkeep Android build (RK_MAVEN_MIRROR=1): repo.maven.apache.org rate-limits this machine (HTTP 429),
// so point every mavenCentral() repository at Google's official Maven Central mirror.
def MIRROR = 'https://maven-central.storage-download.googleapis.com/maven2/'
def useMirror = { RepositoryHandler repos ->
    repos.withType(MavenArtifactRepository).configureEach { r ->
        def u = r.url.toString()
        if (u.startsWith('https://repo.maven.apache.org/maven2') || u.startsWith('https://repo1.maven.org/maven2')) {
            r.url = MIRROR
        }
    }
}
beforeSettings { settings ->
    useMirror(settings.buildscript.repositories)
    useMirror(settings.pluginManagement.repositories)
    useMirror(settings.dependencyResolutionManagement.repositories)
}
allprojects { p ->
    useMirror(p.buildscript.repositories)
    useMirror(p.repositories)
}
EOF
else rm -f "$GRADLE_USER_HOME/init.d/maven-central-mirror.gradle"; fi

# Keep one debug signing key across container resets, so testers can install new builds over old ones.
KS="$HOME/.android/debug.keystore"
if [ ! -f "$KS" ] && [ -f "$W/debug.keystore" ]; then mkdir -p "$HOME/.android"; cp "$W/debug.keystore" "$KS"; fi

step "gradlew assembleDebug"
cd "$APP/android"
ok=0
for attempt in 1 2 3; do
  if ./gradlew assembleDebug --no-daemon --console=plain --warning-mode=none -q > "$W/gradle-last.log" 2>&1; then ok=1; break; fi
  echo "rebuild: gradle attempt $attempt failed:" >&2
  grep -m5 -E 'What went wrong|> Could not|error:' "$W/gradle-last.log" >&2 || tail -20 "$W/gradle-last.log" >&2
  [ $attempt -lt 3 ] && sleep $(( attempt * 30 ))
done
[ $ok = 1 ] || { echo "rebuild: gradle failed; full log in $W/gradle-last.log" >&2; exit 1; }
[ -f "$W/debug.keystore" ] || cp "$KS" "$W/debug.keystore"

# ---- 7. output --------------------------------------------------------------------------------------
cp app/build/outputs/apk/debug/app-debug.apk "$OUT"
step "Done"
AAPT2="$(ls -d "$SDK"/build-tools/*/aapt2 | sort -V | tail -1)"
"$AAPT2" dump badging "$OUT" | grep -E "^(package|minSdkVersion|targetSdkVersion):" || true
LISTING="$(unzip -l "$OUT")"
if grep -q 'assets/public/index.html' <<<"$LISTING"; then
  echo "assets/public/index.html: present ($(grep -c ' assets/public/' <<<"$LISTING") web files)"
else
  echo "WARNING: assets/public/index.html missing" >&2
fi
ICON_IN_APK="$(grep -oE 'res/mipmap-xxxhdpi[^ ]*/ic_launcher\.png' <<<"$LISTING" | head -1 || true)"
[ -n "$ICON_IN_APK" ] && unzip -p "$OUT" "$ICON_IN_APK" > "$W/icon-check.png" && echo "icon-check.png <- $ICON_IN_APK"
ls -l "$OUT" | awk '{printf "%s  %.1f MB\n", $NF, $5/1048576}'
shasum -a 256 "$OUT" | cut -d' ' -f1
echo "Built in $(( $(date +%s) - START ))s"
