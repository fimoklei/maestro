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

- **2026-05-30 · tooling/RTK-masks-output** — RTK (the global command-rewriting hook) replaces Biome's stdout with a canned `Lint: No issues found` line for EVERY subcommand and corrupts the captured exit code, so `pnpm exec biome check .` looked green locally while it actually failed (CI/Codex caught it). This shipped a broken commit. → To see a tool's true output AND exit code, run it through `rtk proxy <cmd>` (e.g. `rtk proxy pnpm exec biome check .`). Never trust a piped/`tail`-ed exit code under RTK; write to a file via `rtk proxy` and read it.
- **2026-05-30 · tooling/format** — The PostToolUse formatter is Prettier via `~/.claude/hooks/format-after-edit.sh` (local bin or `npx`), with no repo config → Prettier defaults: 2-space indent, **80-char width**, double quotes, semicolons. Biome at `lineWidth: 100` disagreed with Prettier's 80 and broke `biome check`. → In `biome.json` match Prettier: `indentStyle: space`, `indentWidth: 2`, `lineWidth: 80`, and Biome defaults for quotes/semicolons (don't set single/asNeeded). Biome's organize-imports assist is fine — Prettier doesn't reorder imports, so they don't fight.
- **2026-05-30 · tooling/pnpm** — esbuild's build script is ignored on install until allowed, which breaks vite/vitest; and the root scripts call nested `pnpm -r`, so `pnpm` must be on PATH. → Keep `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`, and run `corepack enable` once (not just `corepack pnpm`) so nested `pnpm -r` resolves.

## Archive

Entries proven wrong or no longer relevant. Kept for historical context.

_(none yet)_
