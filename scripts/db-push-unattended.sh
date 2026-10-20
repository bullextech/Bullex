#!/bin/bash
# Drizzle can exit zero at an unanswered TUI prompt when stdin is closed.
# Never send automatic answers or --force: those can authorize data loss.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${NODE_ENV:-}" == "production" || "${REPLIT_DEPLOYMENT:-}" == "1" ]]; then
  echo "Unattended schema setup is development-only; use Publish for production." >&2
  exit 1
fi

node scripts/reconcile-tfr-recipient-unique.mjs

log="$(mktemp)"
trap 'rm -f "$log"' EXIT

# Bound prompt hangs within the post-merge timeout, and preserve CLI failures.
status=0
timeout --kill-after=5s 90s npm run db:push </dev/null 2>&1 | tee "$log" || status=$?
if (( status != 0 )); then
  echo "Development schema push failed (exit $status); setup did not complete." >&2
  exit "$status"
fi

# Strip terminal colour/cursor escapes before matching a complete status line.
# A zero exit code alone is not success (prompts and some CLI errors use it).
if ! LC_ALL=C sed -E $'s/\x1B\\[[0-?]*[ -/]*[@-~]//g' "$log" \
  | grep -E '^[[:space:]]*\[(✓|i)\] (Changes applied|No changes detected)[[:space:]]*$' >/dev/null; then
  echo "Development schema push did not confirm completion (possibly an unanswered prompt)." >&2
  echo "Inspect the output and reconcile development schema drift safely, then rerun setup." >&2
  echo "Do not truncate tables or use --force. Production changes belong to Publish." >&2
  exit 1
fi
