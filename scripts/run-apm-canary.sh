#!/usr/bin/env bash
# Runs the real-apm canary integration test (network + auth to the private
# agent-harness repo required). Kept out of the fast loop; see apm-driver.md.
set -euo pipefail
cd "$(dirname "$0")/.."
MAESTRO_REAL_APM=1 exec pnpm vitest run --project integration apm-canary
