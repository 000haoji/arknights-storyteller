#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

info() { printf '\033[1;34m[build-apk]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[build-apk]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[build-apk]\033[0m %s\n' "$*" >&2; exit 1; }

REQUIRED_CMDS=(
  node
  npm
  cargo
  rustup
  java
  sdkmanager
)

missing=()
for cmd in "${REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing+=("$cmd")
  fi
done

if [ "${#missing[@]}" -ne 0 ]; then
  fail "Missing required command(s): ${missing[*]}"
fi

: "${ANDROID_SDK_ROOT:=${ANDROID_HOME:-}}"
if [ -z "$ANDROID_SDK_ROOT" ]; then
  fail "ANDROID_SDK_ROOT/ANDROID_HOME is not set. Please install the Android SDK and expose the path."
fi

if [ ! -d "$ANDROID_SDK_ROOT" ]; then
  fail "Android SDK directory '$ANDROID_SDK_ROOT' does not exist."
fi

info "Using project root: $PROJECT_ROOT"
info "Using Android SDK root: $ANDROID_SDK_ROOT"

export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$PROJECT_ROOT/.gradle-cache}"
mkdir -p "$GRADLE_USER_HOME"
info "Using Gradle user home: $GRADLE_USER_HOME"

if ! npm exec -- tauri -V >/dev/null 2>&1; then
  fail "Tauri CLI not found. Install it with 'npm install --save-dev @tauri-apps/cli'."
fi

if [ ! -d node_modules ]; then
  info "Installing npm dependencies (node_modules missing)..."
  npm ci
fi

info "Building web assets..."
npm run build

info "Building Android APK via Tauri (release profile)..."

# Clean up stale tauri plugin cache directories to avoid "File exists" conflicts
CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
TAURI_CACHE_ROOT="$CARGO_HOME/registry/src"
if [ -d "$TAURI_CACHE_ROOT" ]; then
  info "Clearing cached Tauri plugin sources..."
  find "$TAURI_CACHE_ROOT" -maxdepth 2 -type d \( -name 'tauri-plugin-fs-*' -o -name 'tauri-plugin-opener-*' \) -prune -exec rm -rf {} + 2>/dev/null || true
fi

npm exec -- tauri android build "$@"

info "APK build finished. Check the Tauri Android output directory for the generated artifact."
