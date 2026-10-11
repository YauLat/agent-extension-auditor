#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
APP_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd "$APP_ROOT/../.." && pwd)
OUTPUT_DIR=${MACOS_OUTPUT_DIR:-"$APP_ROOT/build/release"}
ARTIFACT_DIR=${MACOS_ARTIFACT_DIR:-"$APP_ROOT/build/artifacts"}
APP_BUNDLE="$OUTPUT_DIR/Agent Extension Auditor.app"
PACKAGE_SCRIPT="$SCRIPT_DIR/package-app.sh"

fail() {
  echo "error: $*" >&2
  exit 1
}

SIGN_IDENTITY=${MACOS_SIGN_IDENTITY:-}
NOTARY_PROFILE=${NOTARY_KEYCHAIN_PROFILE:-}

[[ -n "$SIGN_IDENTITY" ]] || fail "MACOS_SIGN_IDENTITY is required"
[[ -n "$NOTARY_PROFILE" ]] || fail "NOTARY_KEYCHAIN_PROFILE is required"

case "$SIGN_IDENTITY" in
  "Developer ID Application:"*) ;;
  *) fail "MACOS_SIGN_IDENTITY must be a Developer ID Application identity" ;;
esac

VERSION=$(node --input-type=module -e '
  import fs from "node:fs";
  const packageJson = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(packageJson.version);
' "$REPO_ROOT/package.json")

archive_existing() {
  local path=$1
  if [[ -e "$path" ]]; then
    mv "$path" "$path.previous-$(date +%Y%m%d-%H%M%S)-$$"
  fi
}

MACOS_BUILD_ARCHS=universal \
MACOS_OUTPUT_DIR="$OUTPUT_DIR" \
MACOS_SIGN_IDENTITY="$SIGN_IDENTITY" \
  "$PACKAGE_SCRIPT"

EXECUTABLE="$APP_BUNDLE/Contents/MacOS/AgentExtensionAuditor"
ARCHITECTURES=$(lipo -archs "$EXECUTABLE")
for required_architecture in arm64 x86_64; do
  case " $ARCHITECTURES " in
    *" $required_architecture "*) ;;
    *) fail "release executable is missing $required_architecture" ;;
  esac
done

SIGNATURE_DETAILS=$(codesign -dv --verbose=4 "$APP_BUNDLE" 2>&1)
grep -q "Authority=Developer ID Application:" <<<"$SIGNATURE_DETAILS" \
  || fail "bundle is not signed with Developer ID Application"
grep -Eq "flags=.*runtime" <<<"$SIGNATURE_DETAILS" \
  || fail "Hardened Runtime is not enabled"
grep -q "Timestamp=" <<<"$SIGNATURE_DETAILS" \
  || fail "secure timestamp is missing"

mkdir -p "$ARTIFACT_DIR"
SUBMISSION_ZIP="$ARTIFACT_DIR/Agent-Extension-Auditor-$VERSION-notary-submission.zip"
FINAL_ZIP="$ARTIFACT_DIR/Agent-Extension-Auditor-$VERSION-macos-universal.zip"
CHECKSUM_FILE="$FINAL_ZIP.sha256"

archive_existing "$SUBMISSION_ZIP"
archive_existing "$FINAL_ZIP"
archive_existing "$CHECKSUM_FILE"

ditto -c -k --keepParent "$APP_BUNDLE" "$SUBMISSION_ZIP"
xcrun notarytool submit "$SUBMISSION_ZIP" \
  --keychain-profile "$NOTARY_PROFILE" \
  --wait

xcrun stapler staple -v "$APP_BUNDLE"
xcrun stapler validate -v "$APP_BUNDLE"
spctl --assess --type execute --verbose=4 "$APP_BUNDLE"

ditto -c -k --keepParent "$APP_BUNDLE" "$FINAL_ZIP"
(
  cd "$ARTIFACT_DIR"
  shasum -a 256 "$(basename "$FINAL_ZIP")" > "$(basename "$CHECKSUM_FILE")"
)

echo "$FINAL_ZIP"
echo "$CHECKSUM_FILE"
