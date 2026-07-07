#!/usr/bin/env bash
# Assemble the bundled Node runtime + engine for a Tauri release build.
# These land in src-tauri/binaries/ (externalBin) and src-tauri/resources/engine/
# (resources), which src-tauri/tauri.bundle.conf.json points at.
#
# Usage: scripts/assemble-bundle.sh <target-triple> <path-to-node-binary>
#   e.g. scripts/assemble-bundle.sh x86_64-pc-windows-msvc "$(command -v node)"
set -euo pipefail

TRIPLE="${1:?target triple required}"
NODEBIN="${2:?node binary path required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXT=""
case "$TRIPLE" in *windows*) EXT=".exe" ;; esac

echo "[bundle] Node runtime -> src-tauri/binaries/nexus-node-$TRIPLE$EXT"
mkdir -p src-tauri/binaries
cp "$NODEBIN" "src-tauri/binaries/nexus-node-$TRIPLE$EXT"

echo "[bundle] engine resources (prod deps only) -> src-tauri/resources/engine"
rm -rf src-tauri/resources/engine
mkdir -p src-tauri/resources/engine
cp -r engine/src src-tauri/resources/engine/src
cp engine/package.json src-tauri/resources/engine/package.json
[ -f engine/package-lock.json ] && cp engine/package-lock.json src-tauri/resources/engine/package-lock.json || true

pushd src-tauri/resources/engine >/dev/null
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi
popd >/dev/null

echo "[bundle] done: $(du -sh src-tauri/resources/engine | cut -f1) engine, node $("$NODEBIN" --version)"
