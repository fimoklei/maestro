# ADR-0018 — apm's own output never reaches the browser

- **Status:** Accepted
- **Date:** 2026-07-30 (decision made on issue #417, which existed to make this
  call before any ticket could act on it)

## Context

The remove dialog's design handoff (`docs/design/design_handoff_remove_dialog/`,
state 3e) draws the failure block in apm's own terms: a mono label
`apm exited 1` and, under it, the raw reason — the handoff's example is
`permission denied: ~/.codex/skills/secret-scan/`. Tickets #415 and #416 shipped
that block with a fixed label and one curated sentence instead, and #417 was
opened to decide whether the handoff's version may ever be built.

Three facts frame the call:

- **apm's output is credential-bearing by construction.** It embeds the URLs it
  fetches, and a token-bridged fetch prints
  `https://x-access-token:<token>@github.com/...`. apm owns credentials, Maestro
  does not (`.claude/rules/security.md`).
- **It also names absolute paths outside the target** — the handoff's own
  example is a path under the user's home, not under the repo being changed.
- **The server frequently does not know what apm's terms were.** Every uninstall
  outcome exits 0, so there is no exit code to state; success is the positive
  marker and nothing else (`docs/apm-behavior.md` § Remove). `apm exited 1` would
  be a fiction on the very path the handoff drew it for.

A sanitiser was the alternative on the table. It would have to hold against
apm's whole output surface across versions, and it fails silently: a shape it
does not know passes through and reaches the browser.

## Decision

**Nothing from apm's stdout or stderr leaves `ApmCliDriver`. The cockpit states
every apm failure in Maestro's own words, from a fixed table, and the failure
block keeps a fixed label.**

- Raw output is read only inside `packages/core/src/deploy/apm-cli-driver.ts`.
  Every driver method classifies it into a closed union and returns that —
  `RemoveSkillDriverResult` carries no reason at all, and `deploySkill` /
  `resolveLatestTag` carry one of a fixed set of reason literals.
- The type system is the enforcement, not a convention: no port in
  `ApmDriverPort` has a free-text field an implementation could put output in.
- The wire message is chosen by the server's `removeErrorResponses` /
  `deployErrorResponses` tables, keyed by the use-case's error literal. The
  client renders what it is given and never composes a reason of its own.
- The sanitised driver log records operation, target basename, exit code and
  duration — never output, never a full path.
- No exit code reaches the browser either. It is not a leak risk, but it is a
  number the remove path does not honestly have, and a label that is right on
  one route and invented on another is worse than a fixed one.

## Consequences

- The failure block reads `the removal failed` plus one curated sentence, for
  every apm failure. A user chasing a permission problem goes to apm.
- Diagnosis stays a terminal job. This is the cost, accepted: the cockpit is a
  place to see and steer (ADR-0001), not a log viewer.
- Adding any apm-derived text to a response takes a new ADR. There is no
  sanitiser to extend, deliberately — the next change has to argue for the
  channel, not slip through it.
- Fenced at the wire by `tests/integration/apm-output-boundary.test.ts`, which
  drives the real driver with output carrying every leak shape and asserts the
  HTTP body carries none of it. The shapes are named there and nowhere else, so
  the list has one owner. `remove-skill-dialog.test.tsx` holds the other half:
  the failure block's label does not move with the server's sentence.

## Rejected alternatives

- **The handoff's version — mono label plus raw reason.** It is the design's
  intent and it is refused on the credential surface above. The handoff records
  a wish, not a measurement of what the server knows.
- **Exit code only (`apm exited 1`).** Safe — a number carries nothing. Rejected
  because the remove path has no non-zero code to state: apm exits 0 on every
  uninstall outcome, so the label would be invented exactly where the design
  drew it.
- **A sanitiser over apm's output.** Rejected on failure mode, not effort: an
  allowlist over free-form Rich-wrapped prose has no closed shape to allowlist,
  and a blocklist leaks whatever it has not met (`security.md` prefers
  allowlists). It would also put the decision in a regex that no reviewer reads.
- **Surfacing output behind a developer toggle.** A second code path with weaker
  rules, shipped to every user's machine. The dev loop already has the real
  thing: run apm in a terminal.
