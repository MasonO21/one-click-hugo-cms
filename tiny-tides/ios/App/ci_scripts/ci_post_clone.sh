#!/bin/sh
# Xcode Cloud runs this right after cloning, before it resolves Swift packages and builds.
# Tiny Tides is a Capacitor app: the Xcode project needs the game's web build (ios/App/App/public) and the
# Capacitor plugins from npm (CapApp-SPM points into node_modules), so install Node and build those first.
set -e
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
command -v node >/dev/null 2>&1 || brew install node
cd "$CI_PRIMARY_REPOSITORY_PATH/tiny-tides"
npm ci
npm run build
npx cap sync ios
node tools/configure-ios.mjs
