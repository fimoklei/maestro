# ADR-0010 — Ephemeral smoke: test-vs-production state isolation

- **Status:** Accepted. The browse endpoint and per-entry facts its #168
  amendment names were removed in #1080 (ADR-0032); the seeding stands.
- **Date:** 2026-07-12

## Context

`pnpm smoke` isolates Maestro's own state via `MAESTRO_HOME` and also redirects
`HOME` to a sandbox dir — because apm derives its **global** (user-scope)
location from `HOME`, not `MAESTRO_HOME`, so a global deploy would otherwise
write into the real `~/.apm` and `~/.claude`. Two problems surfaced in dogfood:

1. The sandbox **persisted between runs**, so smoke never showed a clean
   first-run state — it already held a configured inventory
   (`tooling/smoke-not-first-run` in `LEARNINGS.md`).
2. Redirecting `HOME` **strips the gh git-credential helper**, so a real
   `apm install` of the private `agent-harness` fails while cloning. Maestro
   passes only ambient env to apm; no token reaches it.

The owner wants a genuine throwaway rehearsal: start bare, connect the local
inventory, run the use-cases (register a fake repo, deploy, update) against a
temporary consuming repo and temporary global targets, then clean up on stop.

## Decision

Smoke is a **dev-tooling harness** (`scripts/`), not product behaviour. No code
in `core`/`server`/`web` changes; `CONTEXT.md` is untouched (this adds no domain
term — "where Maestro runs" is not a Target, per CONTEXT.md).

- **`pnpm smoke` is always ephemeral.** The persistent-playground mode is
  dropped. It wipes `.maestro-sandbox` on start (a crash-safety net) and on stop
  (best-effort teardown). `MAESTRO_HOME` + `HOME` point at fresh sandbox dirs.
- **The harness — and only the harness — bridges credentials to apm.** It reads
  `gh auth token` and injects `GITHUB_TOKEN` into the child env (gh's token is
  `HOME`-independent, so it survives the redirect). If gh is not authenticated,
  it warns loudly at launch and continues — connect/register/UI need no auth;
  only the deploy clone does.
- **The product never bridges credentials.** `ApmCliDriver` stays ambient-env
  only. Recorded in `security.md` so a future agent does not "helpfully" add
  token-bridging into the product.
- **A bare temp consuming repo** is `git init`-ed inside the sandbox as a valid
  deploy target. It is **not** pre-registered — connect and registration stay
  UI use-cases the rehearsal exercises. *(Superseded in what it seeds by the
  amendment below; "not pre-registered" still stands.)*
- **Teardown wipes the sandbox dir only.** It never runs `apm uninstall -g`,
  which deletes beyond its lockfile and would hit real dirs (`apm-driver.md`).
  Because `HOME` points into the sandbox, `rm` of that dir cannot touch the real
  `~/.claude` / `~/.apm`.

## Consequences

- Reversing (2) later — having the *product* authenticate to apm — would be a
  deliberate security change, not a tweak; this ADR marks the current no.
- The persistent smoke mode is gone; iterative UI work that relied on surviving
  state across restarts now re-seeds each run (the owner judged clean-start worth
  more than saved clicks).
- The opaque "check apm" deploy error (no hint that gh auth is the cause) is a
  **product** defect, tracked separately from this harness.

## Amendment (issue #168) — what the sandbox seeds

The single bare consuming repo left the rehearsal unable to exercise the flows
the picker exists for. The browse endpoint's root ceiling is `os.homedir()`
(ADR-0009), which honours `HOME` — so under smoke the ceiling is
`.maestro-sandbox/home`, while the seeded repo sat beside it at
`.maestro-sandbox/consuming-repo`. The picker could not reach it, and pasting an
absolute path was the only way through. The rehearsal was therefore mis-seeded
by *placement* before it was mis-seeded by *quantity*.

The rehearsal's purpose is narrowed to the **screen flows** — connect, browse,
register, and the states those produce. What it seeds:

- **Everything the picker must show lives under the sandbox `HOME`**, never
  beside it. This is the rule the original seeding broke.
- **The inventory source is a copy of the owner's real `agent-harness` clone,
  `.git` included.** A fabricated tree would need a fabricated origin, and
  connect refuses a clone without a parseable GitHub origin
  (`connect-inventory.ts`, ADR-0014). Copying is measured at 6 MB / 0.51 s, so
  the cost does not register next to dev-server startup. If the source clone is
  absent the harness warns loudly and continues, matching its existing posture
  for an unauthenticated `gh`.
- **Deploy stays genuinely functional.** A real clone carries the real origin and
  real tags, so the credential bridge above keeps working unchanged. Nothing is
  removed to make the rehearsal offline-pure.
- **Three or four mixed candidate repos** under `HOME` — git repos, a plain
  directory, and one name containing a space — so browsing has something to
  browse and the per-entry facts of ADR-0009's #150 amendment have something to
  report. **None pre-registered**, unchanged from the original decision: the
  "already registered" fact is better observed appearing mid-rehearsal than
  found pre-baked.
- **Seeding moves to its own `scripts/seed-sandbox.mjs`**, invoked by `dev.mjs`
  under `--smoke`. The split is by rate of change, not by size: process
  management is generic and near-static, while seeding is adjusted with every
  new screen.
- **Ephemerality is unchanged.** Wipe-and-reseed per run stands; only a
  prohibitive seeding cost could overturn it, and half a second is not that.

`CONTEXT.md` stays untouched for the same reason as the original decision:
sandbox seeding is dev tooling, not domain vocabulary.

## Amendment — rehearsing the flows vs. verifying a change

"None pre-registered" was written for one job: rehearsing connect and
registration. A second job uses the same sandbox — proving that a UI change
renders correctly — and for that job the unconnected start is pure cost. It
took a median 6 tool calls and 59 seconds of clicking to reach the screen under
test, and the mandatory browser check was skipped in 42% of the sessions that
edited rendering code (`reflection-notes.md`, finding 4).

The two jobs are split across two commands rather than resolved in one default:

- **`pnpm smoke` is unchanged.** Bare, unconnected, nothing pre-registered. The
  rehearsal decision above stands in full.
- **`pnpm smoke:ready` (`scripts/smoke-ready.mjs`) is a separate step**, run
  against an already-started smoke. It polls until server and web answer, then
  connects the seeded inventory and registers the first seeded repo **through
  the API** — the same routes the UI calls, so no second write path exists.
  Measured cold on 2026-07-26: 4.3 s from launch to a seeded cockpit.
- **Failing closed.** No answer within 60 s exits non-zero naming `pnpm smoke`;
  a refused connect stops before registering. A half-seeded cockpit would look
  ready and lie.
- **The port rule is enforced at launch, not per command.** `pnpm smoke` refuses
  to start when a cockpit port survives its own cleanup, naming the process and
  directory that hold it (`scripts/port-holders.mjs`). The seeded-sandbox check the
  earlier per-command guard also performed is dropped (#433): under this ADR a
  bare smoke is always unseeded at start, so there is no launch moment at which
  the check could be true. `pnpm smoke:ready` remains the step that seeds it.

## Rejected alternatives

- **Keep smoke persistent, add a second `smoke:fresh`.** Two commands for one
  concept; the owner chose one always-clean command (KISS).
- **Require auth (abort if gh is not logged in).** Blocks the auth-free part of
  the rehearsal; warn-and-continue keeps connect/register/UI usable offline.
- **Bridge the token in `ApmCliDriver` (product).** Puts credential handling in
  the product for a dev-only need; rejected in favour of the harness owning it.

Added by the #168 amendment:

- **A hand-built inventory tree with a fake origin.** Becomes a second set of
  skill fixtures to maintain, and too few entries to exercise list behaviour.
- **A hand-built tree pointing at the real GitHub origin.** The screen would
  show skills a deploy would not fetch — a cockpit that lies is worse than one
  that is empty.
- **Pre-registering one candidate repo.** Reaches the same badge by removing the
  step that produces it.
