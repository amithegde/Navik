#!/usr/bin/env bash
#
# Builds and launches Navik in dev mode (hot reload), or relaunches the last build as-is.
# macOS/Linux counterpart to run.ps1.
#
# Usage:
#   ./run.sh
#   ./run.sh --no-build   # relaunch the last ./build.sh output directly

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$root/app"

no_build=false
for arg in "$@"; do
  case "$arg" in
    --no-build) no_build=true ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

cd "$app_dir"

if [ "$no_build" = true ]; then
  echo "==> Launching last build (no rebuild)"
  exec npm run start
else
  echo "==> Starting dev server"
  exec npm run dev
fi
