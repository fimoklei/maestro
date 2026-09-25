#!/usr/bin/env bash
# Runs the real-apm canary integration tests (needs network and auth to the
# private agent-harness repo). Kept out of the fast loop.
set -euo pipefail
cd "$(dirname "$0")/.."
MAESTRO_REAL_APM=1 exec pnpm vitest run --project integration canary
