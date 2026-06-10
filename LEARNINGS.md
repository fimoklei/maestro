# LEARNINGS

Project-specific observations an agent discovered through doing in this repo.

**Filter:** *Would a future agent make the same mistake without this entry?*

- Yes → it belongs here.
- No → write it elsewhere:
  - User preference / cross-project behavior → global memory (`~/.codex/memories/` for Codex, `~/.claude/memory/` for Claude)
  - Intentional architectural decision → `AGENTS.md`, `CLAUDE.md`, or `docs/adr/`
  - Something obvious without prior session evidence → `AGENTS.md` or `CLAUDE.md`

**Entry format:**

```
- **YYYY-MM-DD · <area>** — <observation>. → <action>.
```

## Active

Confirmed patterns. Apply as rules. Newest on top.

_(none yet)_

## Tentative

Single observations. Consider but do not auto-apply. Promote to Active on reconfirmation.

- **2026-06-10 · process/roadmap-status** — The roadmap table once carried a hand-maintained Status column; it silently went stale (PRD #8 closed while 01.1 still read "Specced") because no instruction said to flip it. The column was removed: status is derived from the tracker (no PRD link = planned; PRD open = specced/building; PRD closed = done). → Read sub-step status from the issue tracker; never add a status column back to `docs/roadmap/NN-*.md`.
- **2026-06-06 · testing/forbidden-headers** — The fetch-spec "forbidden headers" `Origin` and `Host` are NOT stripped by Node's undici on a manually-built `new Request(url, { headers })`, and survive through Hono's `app.request`. So the Origin/Host guard is testable end-to-end without a real socket: set `host`/`origin` headers directly. → Test write-route security via `app.request` headers; verify with a quick node probe before assuming.
- **2026-06-06 · core/tsconfig-node-types** — `packages/core/tsconfig.json` sets `types: []`, so the moment core legitimately uses a Node built-in (allowed behind a port — see `architecture.md`) typecheck fails with TS2591. → Keep `types: ["node"]` + `@types/node` in core's devDeps now the registry adapter uses `node:fs`.
- **2026-06-05 · apm-update** — A same-ref `apm install`/update silently overwrites local edits and drops untracked files in a deployed skill, printing `(files unchanged)`. `apm outdated` reports version drift only, never content drift. → When speccing J08 (update a deploy), warn before overwriting local changes. Detail in `.claude/rules/apm-driver.md`.
- **2026-05-30 · tooling/RTK-masks-output** — RTK (the global command-rewriting hook) replaces Biome's stdout with a canned `Lint: No issues found` line for EVERY subcommand and corrupts the captured exit code, so `pnpm exec biome check .` looked green locally while it actually failed (CI/Codex caught it). This shipped a broken commit. → To see a tool's true output AND exit code, run it through `rtk proxy <cmd>` (e.g. `rtk proxy pnpm exec biome check .`). Never trust a piped/`tail`-ed exit code under RTK; write to a file via `rtk proxy` and read it.
- **2026-05-30 · tooling/format** — The PostToolUse formatter is Prettier via `~/.claude/hooks/format-after-edit.sh` (local bin or `npx`), with no repo config → Prettier defaults: 2-space indent, **80-char width**, double quotes, semicolons. Biome at `lineWidth: 100` disagreed with Prettier's 80 and broke `biome check`. → In `biome.json` match Prettier: `indentStyle: space`, `indentWidth: 2`, `lineWidth: 80`, and Biome defaults for quotes/semicolons (don't set single/asNeeded). Biome's organize-imports assist is fine — Prettier doesn't reorder imports, so they don't fight.
- **2026-05-30 · tooling/pnpm** — esbuild's build script is ignored on install until allowed, which breaks vite/vitest; and the root scripts call nested `pnpm -r`, so `pnpm` must be on PATH. → Keep `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`, and run `corepack enable` once (not just `corepack pnpm`) so nested `pnpm -r` resolves.

## Archive

Entries proven wrong or no longer relevant. Kept for historical context.

_(none yet)_
