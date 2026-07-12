# ADR-0010 — Ephemeral smoke: test-vs-production state isolation

- **Status:** Accepted
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
  UI use-cases the rehearsal exercises.
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

## Rejected alternatives

- **Keep smoke persistent, add a second `smoke:fresh`.** Two commands for one
  concept; the owner chose one always-clean command (KISS).
- **Require auth (abort if gh is not logged in).** Blocks the auth-free part of
  the rehearsal; warn-and-continue keeps connect/register/UI usable offline.
- **Bridge the token in `ApmCliDriver` (product).** Puts credential handling in
  the product for a dev-only need; rejected in favour of the harness owning it.
