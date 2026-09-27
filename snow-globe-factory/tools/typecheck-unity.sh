#!/usr/bin/env bash
# Compile-only check of the Unity layer without a Unity install.
# Maps Unity 6 Rigidbody renames back to their 2021.3 names in a scratch copy.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
scripts="$here/../Assets/_Project/Scripts"
out="$here/UnityTypeCheck/src"
rm -rf "$out" && mkdir -p "$out"
cp -r "$scripts/Core" "$scripts/Runtime" "$out/"
mkdir -p "$out/Tests"
cp -r "$scripts/../Tests/EditModeRuntime" "$scripts/../Tests/PlayMode" "$out/Tests/"
find "$out" -name '*.cs' -exec sed -i 's/\.linearVelocity/.velocity/g; s/\.linearDamping/.drag/g; s/\.angularDamping/.angularDrag/g' {} +
dotnet build "$here/UnityTypeCheck" --nologo -v q
