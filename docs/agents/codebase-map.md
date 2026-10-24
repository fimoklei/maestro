# Codebase map

Where to look first. Layer rules and package shape: `.claude/rules/architecture.md`.

- **Packages**: one dir per domain feature under `packages/*/src/<feature>/`
  (deploy, drift, registry…). `tests/` holds the unit, integration and git-lane tests, fixtures and helpers.
- **Product docs**: `docs/brief.md` holds the thesis and the bet; `docs/research/`
  files are named by the issue that asked.
- **Adapter wiring** (which real class backs a port): `realDeps()` in
  `packages/server/src/app.ts`. Routes: `packages/server/src/routes/<feature>-routes.ts`.
- **Harness git**: the port in `packages/core/src/harness/read-harness-state.ts`,
  `HarnessGitAdapter` in `harness-git.ts` (no `-adapter` file), the git steps
  that differ by primitive type in `harness-primitive-git.ts`, and what differs
  by type (path, branch, listing) in `harness-primitive.ts`. `gh`:
  `gh-cli-adapter.ts` beside it.
- **Harness disk and release**: where a primitive sits on disk, and the link
  refusal, in `packages/core/src/harness/harness-primitive-dir.ts`
  (`inspectPrimitiveEntry`); the diff from the latest release in
  `release-delta.ts`; the released skills and prompts Inventory lists in
  `packages/core/src/inventory/released-primitives.ts`. The Prompts screen:
  `packages/web/src/prompts/`.
- **Drift / Behind**: read in `packages/core/src/drift/` (from `apm outdated`);
  served by `/api/drift` in `deploy-routes.ts`, not a `drift-routes.ts`. The
  target's reading lives in `packages/web/src/deploy-state/target-status.ts`.
- **Shared building blocks** (components, hooks, status tokens):
  `packages/web/src/ui/`; its stories show each state.
- **Visible sentences**: `packages/web/src/<feature>/*-copy.ts` (`busy-copy.ts` in `ui/`).
  Grep those modules first.
- **Harness strip status text**: `packages/web/src/harness/harness-view-model.ts`;
  `harness-view.tsx` only renders it.
- **Error code** → status: `packages/server/src/error-responses.ts`; → sentence:
  `packages/web/src/<feature>/notice-copy.ts`, keyed by the same code.
