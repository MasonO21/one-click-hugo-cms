#!/usr/bin/env bash
# Adds the Info.plist keys the AdMob plugin needs (RELEASE.md, section 4) to the iOS project made by `npx cap add ios`.
# Without GADApplicationIdentifier the Google Mobile Ads SDK stops the app at launch.
#   bash tools/ci/ios-plist.sh                      Google's test app id (simulator / CI)
#   GAD_APP_ID=ca-app-pub-…~… bash tools/ci/ios-plist.sh    your own AdMob iOS app id
# For a store build, also paste Google's full SKAdNetworkItems list from the AdMob iOS quick-start.
set -e
P=${1:-ios/App/App/Info.plist}
[ -f "$P" ] || { echo "no $P — run npx cap add ios first"; exit 1; }
plutil -replace GADApplicationIdentifier -string "${GAD_APP_ID:-ca-app-pub-3940256099942544~1458002511}" "$P"
plutil -replace NSUserTrackingUsageDescription -string "Your data will be used to show you more relevant ads." "$P"
plutil -replace SKAdNetworkItems -json '[{"SKAdNetworkIdentifier":"cstr6suwn9.skadnetwork"}]' "$P"
plutil -lint "$P"
