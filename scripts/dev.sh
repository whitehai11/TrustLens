#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  kill 0
}
trap cleanup EXIT

cd "$ROOT_DIR/server"
npm run dev &

cd "$ROOT_DIR/client"
npm run dev &

wait