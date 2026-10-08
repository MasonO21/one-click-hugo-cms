#!/usr/bin/env bash
# Checks a built iPhone app bundle for what App Store Connect validates on upload (or asks about every time):
# the app icon, the privacy manifest, the Info.plist keys for AdMob / tracking / encryption, iPhone portrait only
# with every iPad orientation (iPad multitasking), and no consumable purchase history (RELEASE.md, section 4).
#   bash tools/ci/ios-bundle-check.sh path/to/App.app
set -u
APP=${1:?usage: ios-bundle-check.sh App.app}
fail=0
ok() { echo "✔ $1"; }
bad() { echo "✘ $1"; fail=1; }
P="$APP/Info.plist"
key() { /usr/libexec/PlistBuddy -c "Print :$1" "$P" 2>/dev/null; }
[ -f "$APP/PrivacyInfo.xcprivacy" ] && ok "privacy manifest in the bundle" || bad "PrivacyInfo.xcprivacy missing from the bundle"
plutil -lint "$APP/PrivacyInfo.xcprivacy" >/dev/null 2>&1 && ok "privacy manifest is a valid plist" || bad "privacy manifest does not parse"
grep -q "NSPrivacyAccessedAPICategoryUserDefaults" "$APP/PrivacyInfo.xcprivacy" 2>/dev/null && ok "UserDefaults use declared (Preferences plugin)" || bad "UserDefaults reason not declared"
[ -f "$APP/Assets.car" ] && ok "asset catalog compiled" || bad "Assets.car missing"
if ls "$APP"/AppIcon*.png >/dev/null 2>&1 || grep -q AppIcon "$APP/Assets.car" 2>/dev/null; then ok "app icon in the bundle"; else bad "no app icon in the bundle"; fi
[ "$(key CFBundleIcons:CFBundlePrimaryIcon:CFBundleIconName)" = "AppIcon" ] && ok "icon name AppIcon" || bad "CFBundleIconName is not AppIcon"
[ "$(key CFBundleDisplayName)" = "Sizzle Flip" ] && ok "display name Sizzle Flip" || bad "display name: $(key CFBundleDisplayName)"
[ "$(key CFBundleIdentifier)" = "com.sizzleflip.game" ] && ok "bundle id com.sizzleflip.game" || bad "bundle id: $(key CFBundleIdentifier)"
[ -n "$(key CFBundleShortVersionString)" ] && [ -n "$(key CFBundleVersion)" ] && ok "version $(key CFBundleShortVersionString) ($(key CFBundleVersion))" || bad "version or build number missing"
[ -n "$(key GADApplicationIdentifier)" ] && ok "GADApplicationIdentifier set ($(key GADApplicationIdentifier))" || bad "GADApplicationIdentifier missing: the ads SDK stops the app at launch"
[ -n "$(key NSUserTrackingUsageDescription)" ] && ok "tracking prompt text set" || bad "NSUserTrackingUsageDescription missing"
n=$(/usr/libexec/PlistBuddy -c "Print :SKAdNetworkItems" "$P" 2>/dev/null | grep -c SKAdNetworkIdentifier)
[ "$n" -ge 40 ] && ok "$n SKAdNetwork ids" || bad "only $n SKAdNetwork ids"
[ "$(key ITSAppUsesNonExemptEncryption)" = "false" ] && ok "export compliance answered (no non-exempt encryption)" || bad "ITSAppUsesNonExemptEncryption not false"
o=$(key UISupportedInterfaceOrientations)
[ "$(echo "$o" | grep -c UIInterfaceOrientation)" = "1" ] && echo "$o" | grep -q "UIInterfaceOrientationPortrait$" && ok "iPhone: portrait only" || bad "iPhone orientations: $(echo $o)"
[ "$(key UISupportedInterfaceOrientations~ipad | grep -c UIInterfaceOrientation)" = "4" ] && ok "iPad: all four orientations (multitasking)" || bad "iPad needs all four orientations"
[ -z "$(key SKIncludeConsumableInAppPurchaseHistory)" ] && ok "no SKIncludeConsumableInAppPurchaseHistory" || bad "SKIncludeConsumableInAppPurchaseHistory set: finished Hot Dog purchases would come back after a reinstall"
[ -f "$APP/public/index.html" ] && ok "game files in the bundle" || bad "public/index.html missing (run npm run cap:sync)"
exit $fail
