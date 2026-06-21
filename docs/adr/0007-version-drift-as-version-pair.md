# ADR-0007 — Show version drift as a version pair, not a binary flag

- **Status:** Accepted — reverses the binary-only decision in roadmap 01.3 and `CONTEXT.md`
- **Date:** 2026-06-19

## Context

Roadmap 01.3 and `CONTEXT.md` deliberately scoped version drift to **binary**
(behind / up-to-date), never a version diff. The stated reason: do not
re-derive APM's version resolution; consume `apm outdated` and avoid
brittleness.

Two facts revisit that call:

1. `apm outdated` already emits **both** versions on the same row Maestro
   parses — `Current vX.Y.Z | Latest vA.B.C` (see `apm-driver.md`). The binary
   reduction discards data already in hand.
2. The owner's "Control Room" design surfaces the pair (`v2.1.0 → 2.3.1`) as the
   core drift signal, in deploy-state and the resolve view.

So the pair costs no new `apm` call and no re-derivation — it is the existing
output, kept rather than thrown away.

## Decision

Surface version drift as the **deployed → latest** version pair in deploy-state
and the resolve view. Extend the existing `apm outdated` parser to retain both
versions and expose them through the drift query and the API.

**Explicitly not adopted:** the design's "N versions behind" distance and
progress bars. Counting intermediate tags needs a separate tag-enumeration call
and is semver-fragile — the most cost for the least value.

## Consequences

- `CONTEXT.md`'s "Version drift" term is updated to the version pair.
- The drift parser keeps two fields where it kept one; the binary
  behind/up-to-date judgment stays derivable (latest ≠ deployed).
- This **supersedes the drift payload shape in ADR-0005** (`behind: string[]`):
  each behind entry is now the `{ name, current, latest }` pair. ADR-0005's other
  decisions stand — drift as a separate, registry-gated read; the `{ ok: false }`
  "unknown" outcome; and skill identity staying with deploy-state's lockfile read.
- Content drift is unaffected — still outside the deploy-state view; ADR-0006 is
  unchanged.
