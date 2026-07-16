#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
APP_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd "$APP_ROOT/../.." && pwd)
BUILD_DIR="$APP_ROOT/build"
OUTPUT_DIR=${MACOS_OUTPUT_DIR:-"$BUILD_DIR/release"}
APP_BUNDLE="$OUTPUT_DIR/Agent Extension Auditor.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
ICON_ARTWORK="$APP_ROOT/Assets/AppIconArtwork.png"
ICON_WORK_DIR="$BUILD_DIR/icon-work"
ICON_SOURCE="$ICON_WORK_DIR/AppIcon.png"
ICONSET_DIR="$ICON_WORK_DIR/AppIcon.iconset"
BUILD_ARCHS=${MACOS_BUILD_ARCHS:-universal}
SIGN_IDENTITY=${MACOS_SIGN_IDENTITY:--}

fail() {
  echo "error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

for command_name in node npm swift lipo codesign ditto iconutil sips plutil xcrun grep; do
  require_command "$command_name"
done

reject_private_artifact_data() {
  local artifact_root=$1
  local private_data_pattern='/Users/[^/[:space:][:cntrl:]]+|/home/[^/[:space:][:cntrl:]]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
  local scan_status

  if LC_ALL=C grep -a -R -E -i -q "$private_data_pattern" "$artifact_root"; then
    fail "packaged app contains a private email address or absolute user-home path"
  else
    scan_status=$?
    [[ "$scan_status" -eq 1 ]] || fail "packaged app privacy scan could not inspect all artifacts"
  fi
}

case "$BUILD_ARCHS" in
  universal|arm64|x86_64) ;;
  *) fail "MACOS_BUILD_ARCHS must be universal, arm64, or x86_64" ;;
esac

if [[ "$SIGN_IDENTITY" != "-" ]]; then
  case "$SIGN_IDENTITY" in
    "Developer ID Application:"*) ;;
    *) fail "release signing requires a Developer ID Application identity" ;;
  esac

  if ! security find-identity -v -p codesigning | grep -F "\"$SIGN_IDENTITY\"" >/dev/null; then
    fail "Developer ID Application identity is not available in the current Keychain"
  fi
fi

VERSION=$(node --input-type=module -e '
  import fs from "node:fs";
  const packageJson = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(packageJson.version);
' "$REPO_ROOT/package.json")

npm run build --prefix "$REPO_ROOT"

build_architecture() {
  local architecture=$1
  local triple="${architecture}-apple-macosx14.0"

  swift build \
    --package-path "$APP_ROOT" \
    --configuration release \
    --triple "$triple"

  BUILT_BINARY="$APP_ROOT/.build/${architecture}-apple-macosx/release/AgentExtensionAuditor"
  [[ -x "$BUILT_BINARY" ]] || fail "Swift binary was not created for $architecture"
}

ARM64_BINARY=""
X86_64_BINARY=""

if [[ "$BUILD_ARCHS" == "universal" || "$BUILD_ARCHS" == "arm64" ]]; then
  build_architecture arm64
  ARM64_BINARY=$BUILT_BINARY
fi

if [[ "$BUILD_ARCHS" == "universal" || "$BUILD_ARCHS" == "x86_64" ]]; then
  build_architecture x86_64
  X86_64_BINARY=$BUILT_BINARY
fi

mkdir -p "$OUTPUT_DIR" "$ICON_WORK_DIR"
if [[ -e "$APP_BUNDLE" ]]; then
  mv "$APP_BUNDLE" "$OUTPUT_DIR/Agent Extension Auditor.previous-$(date +%Y%m%d-%H%M%S)-$$.app-backup"
fi

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR/agent-audit"
if [[ "$BUILD_ARCHS" == "universal" ]]; then
  lipo -create "$ARM64_BINARY" "$X86_64_BINARY" -output "$MACOS_DIR/AgentExtensionAuditor"
  chmod 755 "$MACOS_DIR/AgentExtensionAuditor"
elif [[ "$BUILD_ARCHS" == "arm64" ]]; then
  install -m 755 "$ARM64_BINARY" "$MACOS_DIR/AgentExtensionAuditor"
else
  install -m 755 "$X86_64_BINARY" "$MACOS_DIR/AgentExtensionAuditor"
fi

xcrun strip -S "$MACOS_DIR/AgentExtensionAuditor"

BUNDLE_ARCHS=$(lipo -archs "$MACOS_DIR/AgentExtensionAuditor")
for required_architecture in ${BUILD_ARCHS/universal/arm64 x86_64}; do
  case " $BUNDLE_ARCHS " in
    *" $required_architecture "*) ;;
    *) fail "packaged executable is missing $required_architecture" ;;
  esac
done

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

reject_private_artifact_data "$APP_BUNDLE"

if [[ "$SIGN_IDENTITY" == "-" ]]; then
  codesign --force --sign - "$APP_BUNDLE"
  SIGNING_KIND="ad-hoc"
else
  codesign \
    --force \
    --options runtime \
    --timestamp \
    --sign "$SIGN_IDENTITY" \
    "$APP_BUNDLE"
  SIGNING_KIND="Developer ID"
fi

codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

echo "$APP_BUNDLE"
echo "Architectures: $BUNDLE_ARCHS"
echo "Signing: $SIGNING_KIND"
