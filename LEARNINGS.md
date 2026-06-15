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

_(none yet — the RTK-masks-output entry was retired to Archive on 2026-06-13)_

## Tentative

Single observations. Consider but do not auto-apply. Promote to Active on reconfirmation.

- **2026-06-15 · tooling/biome-autofix-masked** — `pnpm exec biome check --write <path>` printed the canned `Lint: No issues found` and did **not** modify the file; the real binary `./node_modules/.bin/biome check --write <path>` printed `Fixed 1 file` and applied it. `pnpm lint` (= `biome check .`) reported honestly throughout (it surfaced real `assist/source/organizeImports` errors with file:line). So RTK still intercepts `pnpm exec biome` **with `--write`** (no-op + canned line) — narrower than the masking the 2026-06-13 Archive entry retired. Also: `pnpm format` (= `biome format --write`) does not run the assist, so nothing in the `pnpm` scripts auto-sorts imports/exports. → To auto-fix import/export order, run `./node_modules/.bin/biome check --write .` directly; never rely on `pnpm exec biome --write`. Without that binary, sort by hand (bare modules before relative; `type` members sort by name among the rest).
- **2026-06-11 · apm-driver/spike-isolation** — A real global `apm install -g` and especially `apm uninstall -g` operate on `Path.home()` for BOTH metadata (`~/.apm/`) and deployed primitives (`~/.claude/`); `core/scope.py` derives them from `Path.home()` with no env override. `apm uninstall` deleted 19 pre-existing skill dirs from the real `~/.claude/skills/` even though the global lockfile read `dependencies: []` — it cleans more than its lockfile tracks. → Never run spike `apm -g` commands against the real home. Run them with `HOME` redirected to a throwaway dir (auth survives: gh uses the system keyring; symlink `~/.gitconfig` + `~/.config/gh` into the fake home). This is the answer to PRD 01.2 spike observation 4: user-scope IS `HOME`-redirectable, so the integration lane can run real `-g` against a sandbox home.
- **2026-06-10 · process/roadmap-status** — The roadmap table once carried a hand-maintained Status column; it silently went stale (PRD #8 closed while 01.1 still read "Specced") because no instruction said to flip it. The column was removed: status is derived from the tracker (no PRD link = planned; PRD open = specced/building; PRD closed = done). → Read sub-step status from the issue tracker; never add a status column back to `docs/roadmap/NN-*.md`.
- **2026-06-06 · testing/forbidden-headers** — The fetch-spec "forbidden headers" `Origin` and `Host` are NOT stripped by Node's undici on a manually-built `new Request(url, { headers })`, and survive through Hono's `app.request`. So the Origin/Host guard is testable end-to-end without a real socket: set `host`/`origin` headers directly. → Test write-route security via `app.request` headers; verify with a quick node probe before assuming.
- **2026-06-06 · core/tsconfig-node-types** — `packages/core/tsconfig.json` sets `types: []`, so the moment core legitimately uses a Node built-in (allowed behind a port — see `architecture.md`) typecheck fails with TS2591. → Keep `types: ["node"]` + `@types/node` in core's devDeps now the registry adapter uses `node:fs`.
- **2026-06-05 · apm-update** — A same-ref `apm install`/update silently overwrites local edits and drops untracked files in a deployed skill, printing `(files unchanged)`. `apm outdated` reports version drift only, never content drift. → When speccing J08 (update a deploy), warn before overwriting local changes. Detail in `.claude/rules/apm-driver.md`.
- **2026-05-30 · tooling/format** — The PostToolUse formatter is Prettier via `~/.claude/hooks/format-after-edit.sh` (local bin or `npx`), with no repo config → Prettier defaults: 2-space indent, **80-char width**, double quotes, semicolons. Biome at `lineWidth: 100` disagreed with Prettier's 80 and broke `biome check`. → In `biome.json` match Prettier: `indentStyle: space`, `indentWidth: 2`, `lineWidth: 80`, and Biome defaults for quotes/semicolons (don't set single/asNeeded). Biome's organize-imports assist is fine — Prettier doesn't reorder imports, so they don't fight.
- **2026-05-30 · tooling/pnpm** — esbuild's build script is ignored on install until allowed, which breaks vite/vitest; and the root scripts call nested `pnpm -r`, so `pnpm` must be on PATH. → Keep `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`, and run `corepack enable` once (not just `corepack pnpm`) so nested `pnpm -r` resolves.

## Archive

Entries proven wrong or no longer relevant. Kept for historical context.

- **2026-05-30 · tooling/RTK-masks-output** (archived 2026-06-13) — Was Active: claimed RTK replaced Biome's stdout with a canned `Lint: No issues found` line and corrupted the exit code, so `pnpm exec biome check .` looked green while it actually failed (blamed for two broken commits). **Not reproducible at rtk 0.42.0 on 2026-06-13.** Differential in maestro: `pnpm lint` (= `biome check .`) through the live RTK hook returns honest output — an injected real error gave exit 1 with full detail; `pnpm exec biome check .` showed real output, not the canned line. The hook is still live (it rewrites git/ls/find/grep) but no longer intercepts `pnpm lint`/`pnpm exec biome` — they pass through to the real Biome. → Stop treating `pnpm lint` as untrustworthy under RTK. Cheap insurance only: if ever in doubt, run `./node_modules/.bin/biome check .` directly. Re-open this entry if masking returns on an rtk upgrade.
