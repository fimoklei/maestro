# ADR-0018 — apm's prose never reaches the browser; shape-checked fields may

- **Status:** Accepted
- **Date:** 2026-07-30 (decision made on issue #417, which existed to make this
  call before any ticket could act on it)

## Context

The remove dialog's design handoff (state 3e) draws the failure block in apm's own
terms: a mono label `apm exited 1` and, under it, the raw reason — the
handoff's example is `permission denied: ~/.codex/skills/secret-scan/`.
Tickets #415 and #416 shipped
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

A blanket "nothing crosses" was drafted first and is false. Drift already sends
three apm-derived fields to the browser and has to: `apm outdated` has no
`--json`, so the version pair can only be read off its table (ADR-0007), and
Maestro never computes a version diff itself (ADR-0001). Those three cells were
forwarded unvalidated — a hostile or wrapped cell could have carried any of the
shapes above. The channel is legitimate; the absence of a shape check was not.

## Decision

**apm's free-form prose never leaves `ApmCliDriver`. A named field derived from
its output may cross, but only after a shape check where that output is first
read, and only where the field has a shape to check.**

Two arms, because the two paths differ in what they have to offer:

- **Failures carry no apm text.** Every driver method classifies output into a
  closed union — `RemoveSkillDriverResult` carries no reason at all, `deploySkill`
  and `resolveLatestTag` carry one of a fixed set of reason literals. The type
  system is the enforcement, not a convention: no port in `ApmDriverPort` has a
  free-text field an implementation could fill. The wire message comes from the
  server's `removeErrorResponses` / `deployErrorResponses` tables, keyed by the
  use-case's error literal, and the failure block keeps a fixed label.
- **Drift carries three shape-checked fields.** `parseOutdated` is where apm's
  table is first read, so the check lives there: the package cell's last segment
  must be a skill slug (`isValidSkillSlug`), and both version cells must match one
  short word of letters, digits, dots and hyphens. A row that fails fails the
  whole read — never a skipped row, which would render that skill up-to-date and
  hide both the drift and the leak (J04).

Two further points the arms share:

- **No exit code reaches the browser.** It is not a leak risk, but the remove
  path has no non-zero code to state, and a label that is right on one route and
  invented on another is worse than a fixed one.
- **The version-cell check is an allowlist, deliberately loose about tags.** A
  path needs a slash, a credentialed URL a colon and an at-sign, a token an
  underscore, and all three exceed the length cap — so two independent limits
  refuse each shape. It is not pinned to `vX.Y.Z` because apm leaves those cells
  unconstrained and legitimately writes a bare word like `unknown`; refusing that
  would turn a genuine behind row into a failed read the cockpit shows as "could
  not check".

## Consequences

- The failure block reads `the removal failed` plus one curated sentence, for
  every apm failure. A user chasing a permission problem goes to apm. Diagnosis
  stays a terminal job — the cockpit is a place to see and steer (ADR-0001), not
  a log viewer.
- Drift keeps working, and a table shape Maestro does not recognise now reads as
  a failed check instead of quietly reaching the browser.
- Adding a new apm-derived field to a response takes a new ADR plus a shape check
  at the read. There is no general sanitiser to extend, deliberately: each field
  is admitted on its own shape, so the next change has to argue for that field.
- Fenced at the wire by `tests/integration/apm-output-boundary.test.ts`: it drives
  the real driver with output carrying every leak shape and asserts the HTTP body
  carries none of it, on the remove route and on both drift routes. The shapes are
  named there and nowhere else, so the list has one owner. The field-level shapes
  are covered in `parse-outdated.test.ts`, and `remove-skill-dialog.test.tsx`
  holds the last half: the failure block's label does not move with the server's
  sentence.

## Rejected alternatives

- **The handoff's version — mono label plus raw reason.** It is the design's
  intent and it is refused on the credential surface above. The handoff records
  a wish, not a measurement of what the server knows.
- **Exit code only (`apm exited 1`).** Safe — a number carries nothing. Rejected
  because the remove path has no non-zero code to state: apm exits 0 on every
  uninstall outcome, so the label would be invented exactly where the design
  drew it.
- **Nothing crosses at all.** Drafted, and false the moment drift was read: it
  would have made the rule a thing an agent reads and the code contradicts, which
  is worse than a narrower rule that holds.
- **A general sanitiser over apm's output.** Rejected on failure mode, not
  effort: an allowlist over free-form Rich-wrapped prose has no closed shape to
  allowlist, and a blocklist leaks whatever it has not met (`security.md` prefers
  allowlists). Per-field shape checks are the opposite trade — narrow enough to
  state, so each one can be read and argued with.
- **Leaving the drift fields unvalidated as an accepted residual.** Considered
  and refused: it fails the ticket's own criterion that nothing which could carry
  a credential, a token or a path outside the target reaches the client, and the
  check turned out to be six lines.
- **Surfacing output behind a developer toggle.** A second code path with weaker
  rules, shipped to every user's machine. The dev loop already has the real
  thing: run apm in a terminal.
