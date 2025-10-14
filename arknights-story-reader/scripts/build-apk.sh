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

# Signing section -----------------------------------------------------------

UNSIGNED_APK="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
[ -f "$UNSIGNED_APK" ] || fail "Unsigned APK not found at $UNSIGNED_APK"

KEYSTORE_PATH="${ANDROID_KEYSTORE_PATH:-$HOME/.android/release.keystore}"
KEY_ALIAS="${ANDROID_KEY_ALIAS:-release}"
KEYSTORE_PASSWORD="${ANDROID_KEYSTORE_PASSWORD:-}"
KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-$KEYSTORE_PASSWORD}"

[ -f "$KEYSTORE_PATH" ] || fail "Keystore not found: $KEYSTORE_PATH (set ANDROID_KEYSTORE_PATH)"
[ -n "$KEYSTORE_PASSWORD" ] || fail "Please export ANDROID_KEYSTORE_PASSWORD"
[ -n "$KEY_PASSWORD" ] || fail "Please export ANDROID_KEY_PASSWORD or ensure it's same as keystore password"

find_build_tool() {
  local tool="$1"
  if command -v "$tool" >/dev/null 2>&1; then
    command -v "$tool"
    return 0
  fi
  local sdk="${ANDROID_SDK_ROOT}"
  if [ -z "$sdk" ]; then
    return 1
  fi
  local dirs
  IFS=$'\n' read -rd '' -a dirs < <(find "$sdk"/build-tools -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V && printf '\0')
  for dir in "${dirs[@]}"; do
    if [ -x "$dir/$tool" ]; then
      echo "$dir/$tool"
      return 0
    fi
  done
  return 1
}

ZIPALIGN=$(find_build_tool zipalign)
APKSIGNER=$(find_build_tool apksigner)
[ -n "$ZIPALIGN" ] || fail "zipalign not found in \$ANDROID_HOME/build-tools. Please install it."
[ -n "$APKSIGNER" ] || fail "apksigner not found in \$ANDROID_HOME/build-tools. Please install it."

OUTPUT_DIR="$(dirname "$UNSIGNED_APK")"
ALIGNED_APK="$OUTPUT_DIR/app-universal-release-aligned.apk"
SIGNED_APK="$OUTPUT_DIR/app-universal-release-signed.apk"

rm -f "$ALIGNED_APK" "$SIGNED_APK"

info "Aligning APK..."
"$ZIPALIGN" -v 4 "$UNSIGNED_APK" "$ALIGNED_APK" || fail "zipalign failed"

info "Signing APK..."
"$APKSIGNER" sign \
  --ks "$KEYSTORE_PATH" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASSWORD" \
  --key-pass "pass:$KEY_PASSWORD" \
  --in "$ALIGNED_APK" \
  --out "$SIGNED_APK" || fail "apksigner failed"

info "Verifying signature..."
"$APKSIGNER" verify --print-certs "$SIGNED_APK" || fail "Signature verification failed"

info "APK build finished. Signed APK: $SIGNED_APK"
