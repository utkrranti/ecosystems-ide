#!/usr/bin/env bash
# Build Altus IDE macOS artifacts (.dmg + .zip). Must run on macOS.
# Usage: ./scripts/build-installers-mac.sh [arm64|x64]
set -euo pipefail

ARCH="${1:-arm64}"
if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
	echo "Usage: $0 [arm64|x64]" >&2
	exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECOSYSTEMS_ROOT="$(dirname "$REPO_ROOT")"
VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
DIST="$REPO_ROOT/dist/darwin-$ARCH"
APP_ROOT="$ECOSYSTEMS_ROOT/VSCode-darwin-$ARCH"
GULP="$REPO_ROOT/node_modules/gulp/bin/gulp.js"

if [[ "$(uname -s)" != "Darwin" ]]; then
	echo "macOS installers (.app / .dmg / .zip) must be built on a Mac." >&2
	exit 1
fi

if command -v pwsh >/dev/null 2>&1; then
	pwsh -NoProfile -File "$REPO_ROOT/scripts/brand.ps1"
fi

mkdir -p "$DIST"
cd "$REPO_ROOT"

echo "Packaging Altus IDE for macOS $ARCH (v$VERSION)..."
node --max-old-space-size=8192 "$GULP" "vscode-darwin-${ARCH}-min"

APP="$(find "$APP_ROOT" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
	echo "App bundle not found under $APP_ROOT" >&2
	exit 1
fi

ZIP="$DIST/AltusIDE-darwin-$ARCH-$VERSION.zip"
DMG="$DIST/AltusIDE-darwin-$ARCH-$VERSION.dmg"

echo "Creating zip..."
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

echo "Creating dmg..."
rm -f "$DMG"
hdiutil create -volname "Altus IDE" -srcfolder "$APP" -ov -format UDZO "$DMG"

echo ""
echo "macOS installers:"
echo "  $ZIP"
echo "  $DMG"
