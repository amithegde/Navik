#!/usr/bin/env bash
#
# Builds and packages Navik into a distributable installer (dmg on macOS, AppImage on Linux).
# macOS/Linux counterpart to publish.ps1.
#
# Usage:
#   ./publish.sh              # packages for the current OS (mac or linux)
#   ./publish.sh mac
#   ./publish.sh linux
#   ./publish.sh win           # unverified — cross-building for Windows from mac/linux

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$root/app"

platform="${1:-}"
if [ -z "$platform" ]; then
  case "$(uname -s)" in
    Darwin) platform="mac" ;;
    Linux) platform="linux" ;;
    *) echo "Could not auto-detect platform from 'uname -s'; pass mac, linux, or win explicitly." >&2; exit 1 ;;
  esac
fi
case "$platform" in
  win|mac|linux) ;;
  *) echo "Unknown platform: $platform (expected win, mac, or linux)" >&2; exit 1 ;;
esac

cd "$app_dir"

echo "==> Installing dependencies"
npm install

npm_script="dist:$platform"

attempt() {
  echo "==> Building and packaging ($platform)"
  npm run "$npm_script"
}

# electron-builder occasionally fails packaging with a transient "can't open output file" style
# error (a file lock from a virus scanner or the OS still flushing the previous write). One retry
# clears it — see publish.ps1's Windows counterpart for the same behavior.
if ! attempt; then
  echo "==> Packaging failed, retrying once (often a transient file lock)..."
  sleep 2
  if ! attempt; then
    echo "FAILED: packaging did not succeed after retry" >&2
    exit 1
  fi
fi

echo "==> Packaging succeeded."
dist_dir="$app_dir/dist"
artifacts="$(find "$dist_dir" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.AppImage' -o -name '*.exe' \) 2>/dev/null || true)"
if [ -n "$artifacts" ]; then
  echo "$artifacts"
else
  echo "    $dist_dir"
fi
