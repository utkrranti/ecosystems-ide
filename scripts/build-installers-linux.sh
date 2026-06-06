#!/usr/bin/env bash
# Build Altus IDE Linux artifacts (.tar.gz portable + optional .deb).
# Run on Linux or WSL2 Ubuntu. .rpm needs rpmbuild (use GitHub Actions for full distro packages).
# Usage: ./scripts/build-installers-linux.sh [x64|arm64] [--deb]
set -euo pipefail

ARCH="${1:-x64}"
WITH_DEB=false
for arg in "$@"; do
	if [[ "$arg" == "--deb" ]]; then WITH_DEB=true; fi
done

if [[ "$ARCH" != "x64" && "$ARCH" != "arm64" ]]; then
	echo "Usage: $0 [x64|arm64] [--deb]" >&2
	exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECOSYSTEMS_ROOT="$(dirname "$REPO_ROOT")"
VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
DIST="$REPO_ROOT/dist/linux-$ARCH"
LINUX_DIR="$ECOSYSTEMS_ROOT/VSCode-linux-$ARCH"
GULP="$REPO_ROOT/node_modules/gulp/bin/gulp.js"

if [[ "$(uname -s)" != "Linux" ]]; then
	echo "Linux packages must be built on Linux or WSL2." >&2
	exit 1
fi

if command -v pwsh >/dev/null 2>&1; then
	pwsh -NoProfile -File "$REPO_ROOT/scripts/brand.ps1" || true
fi

mkdir -p "$DIST"
cd "$REPO_ROOT"

echo "Packaging Altus IDE for Linux $ARCH (v$VERSION)..."
node --max-old-space-size=8192 "$GULP" "vscode-linux-${ARCH}-min"

if [[ ! -d "$LINUX_DIR" ]]; then
	echo "Packaged app not found: $LINUX_DIR" >&2
	exit 1
fi

TARBALL="$DIST/AltusIDE-linux-$ARCH-$VERSION.tar.gz"
echo "Creating portable tarball..."
tar -czf "$TARBALL" -C "$ECOSYSTEMS_ROOT" "VSCode-linux-$ARCH"

echo "  $TARBALL"

if $WITH_DEB; then
	if ! command -v dpkg-deb >/dev/null 2>&1; then
		echo "dpkg-deb not found - install: sudo apt install dpkg-dev" >&2
		exit 1
	fi
	echo "Building .deb (requires VS Code linux sysroots on first run)..."
	node --max-old-space-size=8192 "$GULP" "vscode-linux-${ARCH}-prepare-deb"
	node --max-old-space-size=8192 "$GULP" "vscode-linux-${ARCH}-build-deb"
	DEB="$(find "$REPO_ROOT/.build/linux/deb" -name '*.deb' -print -quit)"
	if [[ -n "$DEB" && -f "$DEB" ]]; then
		DEB_OUT="$DIST/AltusIDE-linux-$ARCH-$VERSION.deb"
		cp "$DEB" "$DEB_OUT"
		echo "  $DEB_OUT"
	else
		echo "deb build finished but no .deb file found under .build/linux/deb" >&2
		exit 1
	fi
fi

echo ""
echo "Note: code.sh / altus-ide in bin/ is the app launcher, not an installer."
echo "For .rpm and signed packages, use: gh workflow run release-installers.yml"
