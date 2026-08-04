#!/usr/bin/env bash
#
# Installs dependencies and builds the Navik Electron app. macOS/Linux counterpart to build.ps1.
#
# Usage:
#   ./build.sh
#   ./build.sh --clean   # wipe node_modules/out first

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$root/app"

clean=false
for arg in "$@"; do
  case "$arg" in
    --clean) clean=true ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

cd "$app_dir"

if [ "$clean" = true ]; then
  echo "==> Cleaning node_modules and out"
  rm -rf node_modules out
fi

echo "==> Installing dependencies"
npm install

echo "==> Type-checking and building"
npm run build

echo "==> Build succeeded."
echo "    $app_dir/out"
