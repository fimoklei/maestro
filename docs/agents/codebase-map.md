# Codebase map

Where to look first. Layer rules and package shape: `.claude/rules/architecture.md`.

- **Packages**: one dir per domain feature under `packages/*/src/<feature>/`
  (deploy, drift, registry…). `tests/` holds the unit, integration and git-lane tests, fixtures and helpers.
- **Product docs**: `docs/brief.md` holds the thesis and the bet; `docs/research/`
  files are named by the issue that asked.
- **Harness repositories on GitHub**: `fimoklei/harness` is the operator's
  private, live Harness. `fimoklei/agent-harness` is a test source only: the
  root-package canary installs its `v0.6.0`, and plain `pnpm smoke` seeds its
  inventory from a local clone. Its skills sit in `skills/` before `v0.6.0`
  and in `.apm/skills/` from `v0.6.0`.
- **Adapter wiring** (which real class backs a port): `realDeps()` in
  `packages/server/src/app.ts`. Routes: `packages/server/src/routes/<feature>-routes.ts`;
  the Harness reads, refresh and release in `harness-routes.ts`, every other
  Harness write (promote, delete, withdraw, proposal, import, prompt) in
  `harness-authoring-routes.ts`. Screen paths: `packages/web/src/shell/screens.tsx`.
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
- **Harness row and pane actions**, in `packages/web/src/`: a row menu's
  actions in `harness/row-actions.ts` (labels in `ui/control-labels.ts`), the
  presses in `harness/use-harness-presses.ts` (writes through
  `ui/use-write-action.ts`), the dialogs in `harness/harness-dialogs.tsx` (words
  in `harness/dialog-copy.ts`, `ui/busy-copy.ts`, `harness/notice-copy.ts`),
  the pane buttons in `ui/foot-actions.tsx` and `ui/gated-button.tsx`. Flow
  tests build on `harness/harness-flow-fixture.tsx`.
- **Contract tests** in `packages/web/src/` check every feature module at once.
  A new dialog, table screen, named sentence or server code can fail one you
  did not touch:
  - `dialog-contract.test.tsx`: every dialog runs on `Dialog`; it reads each
    dialog's source.
  - `table-screen-contract.test.tsx`: every table screen runs on `TableScreen`,
    with the shared Status card, name cell and row actions.
  - `name-contract.test.tsx`: a template with a name in it is a `phrase`, or
    stays plain text with its reason in `PLAIN`, keyed by file.
  - `reason-contract.test.ts`: one approved reason per server code.
  - `target-name-contract.test.ts`: only `shell/target-name.ts` shortens a
    target path.
- **Error code** → status: `packages/server/src/error-responses.ts`; → sentence:
  `packages/web/src/<feature>/notice-copy.ts`, keyed by the same code.
