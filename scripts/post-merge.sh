#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Development setup only. Production schema changes belong to Publish.
if [[ "${NODE_ENV:-}" == "production" || "${REPLIT_DEPLOYMENT:-}" == "1" ]]; then
  echo "Post-merge setup is development-only; use Publish for production schema changes." >&2
  exit 1
fi
npm install
bash scripts/db-push-unattended.sh
