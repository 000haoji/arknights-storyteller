#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

load_env_file() {
  local file="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    line="${line#${line%%[![:space:]]*}}"
    line="${line%${line##*[![:space:]]}}"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    if [[ "$line" == *"="* ]]; then
      local key="${line%%=*}"
      local value="${line#*=}"
      key="${key#${key%%[![:space:]]*}}"
      key="${key%${key##*[![:space:]]}}"
      value="${value#${value%%[![:space:]]*}}"
      value="${value%${value##*[![:space:]]}}"
      if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
        value="${value:1:-1}"
      elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:-1}"
      fi
      export "$key=$value"
    fi
  done < "$file"
}

if [[ -f "$ENV_FILE" ]]; then
  load_env_file "$ENV_FILE"
fi

cd "$PROJECT_ROOT"
exec npm run tauri dev
