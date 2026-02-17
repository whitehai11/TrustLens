#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/server"
npm install
cp -n .env.example .env || true
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed

cd "$ROOT_DIR/client"
npm install

echo "Install complete."