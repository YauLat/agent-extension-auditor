#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
APP_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd "$APP_ROOT/../.." && pwd)
BUILD_DIR="$APP_ROOT/build"
OUTPUT_DIR="$BUILD_DIR/release"
APP_BUNDLE="$OUTPUT_DIR/Agent Extension Auditor.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
ICON_ARTWORK="$APP_ROOT/Assets/AppIconArtwork.png"
ICON_WORK_DIR="$BUILD_DIR/icon-work"
ICON_SOURCE="$ICON_WORK_DIR/AppIcon.png"
ICONSET_DIR="$ICON_WORK_DIR/AppIcon.iconset"

VERSION=$(node --input-type=module -e '
  import fs from "node:fs";
  const packageJson = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(packageJson.version);
' "$REPO_ROOT/package.json")

npm run build --prefix "$REPO_ROOT"
swift build --package-path "$APP_ROOT" --configuration release
SWIFT_BIN_DIR=$(swift build --package-path "$APP_ROOT" --configuration release --show-bin-path)

mkdir -p "$OUTPUT_DIR" "$ICON_WORK_DIR"
if [[ -e "$APP_BUNDLE" ]]; then
  mv "$APP_BUNDLE" "$OUTPUT_DIR/Agent Extension Auditor.previous-$(date +%Y%m%d-%H%M%S).app-backup"
fi

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR/agent-audit"
install -m 755 "$SWIFT_BIN_DIR/AgentExtensionAuditor" "$MACOS_DIR/AgentExtensionAuditor"
cp "$APP_ROOT/Supporting/Info.plist" "$CONTENTS_DIR/Info.plist"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$CONTENTS_DIR/Info.plist"
ditto "$REPO_ROOT/dist" "$RESOURCES_DIR/agent-audit/dist"
cp "$REPO_ROOT/PRIVACY.md" "$RESOURCES_DIR/PRIVACY.md"
cp "$REPO_ROOT/LICENSE" "$RESOURCES_DIR/LICENSE"

swift "$APP_ROOT/scripts/prepare-app-icon.swift" "$ICON_ARTWORK" "$ICON_SOURCE"
mkdir -p "$ICONSET_DIR"
sips -z 16 16 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"

codesign --force --sign - "$APP_BUNDLE"

echo "$APP_BUNDLE"
