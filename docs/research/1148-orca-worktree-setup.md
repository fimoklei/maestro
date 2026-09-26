# What can Orca do when it creates a worktree? (#1148)

Measured 2026-09-25 against Orca 1.4.210 (installed; latest release 1.4.211)
and Claude Code 2.1.282. Parent: #1134.

## Orca

### Three copy/link mechanisms, plus a setup script

The [Worktrees docs page](https://github.com/stablyai/orca/blob/main/docs/site/content/docs/model/worktrees.mdx)
("Shared directories & gitignored files") lists three ways to fill a new
worktree with gitignored paths:

| Mechanism | Lives in | Effect | Limits |
|---|---|---|---|
| **Worktree Shared Paths** | Per-user setting, Settings → Repository | APFS clone-copy on macOS, else symlink, from the primary checkout | — |
| `worktree.sharedDirectories` | `orca.yaml` at repo root | Symlink from the primary checkout | Directories only; must exist and be gitignored |
| `.worktreeinclude` | File at repo root | Copy (each worktree owns its copy) | Literal paths only, no globs or negation; must be gitignored |

On top of that, a **setup script** runs after `git worktree add`
([settings docs](https://github.com/stablyai/orca/blob/main/docs/site/content/docs/settings.mdx):
"Per-repo base ref and hooks. Auto-run commands on worktree create").
It gets `ORCA_ROOT_PATH` (primary checkout) and `ORCA_WORKTREE_PATH`
([`setup-hook-env-vars.ts`](https://github.com/stablyai/orca/blob/main/src/main/setup-hook-env-vars.ts)),
so it can copy or `ln -s` anything, ignored or not. The script can come
from two places, chosen by `commandSourcePolicy`
([`hooks.ts`](https://github.com/stablyai/orca/blob/main/src/main/hooks.ts),
`getSetupCommandSource`):

- **Local**: Settings → Repository → Worktree Hooks, stored per user.
- **`scripts.setup` in `orca.yaml`**, read from the *new worktree*, so it
  must be committed. A gitignored `orca.yaml` is invisible to setup. Orca
  itself uses this ([its own `orca.yaml`](https://github.com/stablyai/orca/blob/main/orca.yaml)).

Policies: `local-only`, `run-both` (yaml then local), otherwise yaml wins.

### Where the setting lives, and whether it survives updates

- Per-user settings are in
  `~/Library/Application Support/orca/profiles/local-default/orca-data.json`,
  under each repo's `hookSettings` and `symlinkPaths` (the Shared Paths
  list, per `getWorktreeSharedLinkPaths` in
  [`worktree-shared-directories.ts`](https://github.com/stablyai/orca/blob/main/src/main/git/worktree-shared-directories.ts)).
  That is app data outside the app bundle, so it survives app updates
  (observed: settings made in August are still present on 1.4.210). It
  does not travel to another machine or a teammate.
- `orca.yaml` and `.worktreeinclude` are repo files and travel with git.

### Maestro already uses the local setup script

The `maestro` repo entry in `orca-data.json` today has
`commandSourcePolicy: "local-only"`, `setupRunPolicy: "run-by-default"`,
and this setup script:

```sh
pnpm install && ln -sfn "$(dirname "$(git rev-parse --git-common-dir)")/.claude/skills/impeccable" .claude/skills/impeccable
```

It works: `~/orca/workspaces/maestro/afanc/.claude/skills/impeccable` is
a symlink to the main checkout's copy. No Shared Paths are set, and the
repo has no `orca.yaml` or `.worktreeinclude`. That is why `.mcp.json` and
`.codex/` are missing from the Orca worktrees.

### Known sharp edges (Orca issue tracker)

- Setup scripts silently stopped running after 1.4.207:
  [stablyai/orca#22270](https://github.com/stablyai/orca/issues/22270),
  open. The `afanc` symlink above shows it runs on 1.4.210 here.
- [#18094](https://github.com/stablyai/orca/issues/18094) (user report,
  checked against the app bundle, open) says: bad entries are dropped
  silently; a duplicate key makes Orca discard the *whole* `orca.yaml`;
  `sharedDirectories` and `.worktreeinclude` are read from the primary
  checkout, while `scripts.setup` is read from the new worktree.
- No `orca.yaml` reference page exists yet (same issue).

## Claude Code (`--worktree`, `EnterWorktree`, `isolation: worktree`)

From [Worktrees](https://code.claude.com/docs/en/worktrees) and the
[settings reference](https://code.claude.com/docs/en/settings-reference#worktree):

- **`.worktreeinclude`** at the project root, `.gitignore` syntax (globs
  allowed, unlike Orca). Copies files that match *and* are gitignored.
  Applies to every worktree Claude Code creates with git: `--worktree`,
  subagent worktrees, desktop parallel sessions. The `worktree` settings
  name `EnterWorktree` among the paths they govern.
- **`worktree.symlinkDirectories`** in settings: symlinks listed
  directories from the main repo into each worktree. `worktree.sparsePaths`
  and `worktree.baseRef` also live there. Settings files are "Any file"
  scope, so this can sit in `~/.claude/settings.json` (per user) or
  `.claude/settings.local.json` (per repo, gitignored).
- **`WorktreeCreate` hook** *replaces* creation entirely; `.worktreeinclude`
  is then not processed. There is no post-create hook that runs beside
  the default git logic.
- **Read-through, no copy needed**: when the worktree has no
  `.claude/skills` (for example because it is gitignored), Claude Code
  loads the main checkout's skills; the same holds for `.claude/agents`
  and `.claude/commands`. Permission approvals save to the main checkout's
  `.claude/settings.local.json`. This holds for `git worktree add`
  worktrees too, so Orca worktrees get it.
- **`CLAUDE.md` / `CLAUDE.local.md`** load from the working directory and
  every directory above it ([memory docs](https://code.claude.com/docs/en/memory)).
  A worktree under `.claude/worktrees/` sits inside the main checkout, so
  it inherits the main checkout's ignored `CLAUDE.md`. An Orca worktree
  under `~/orca/workspaces/` does not. The docs say an ignored
  `CLAUDE.local.md` "only exists in the worktree where you created it" and
  suggest importing a file from the home directory instead.
- Auto memory is shared by all worktrees of one repo.

## What this means for the decision

- Orca can already carry ignored workshop files into its worktrees without
  committing anything: the local setup script (in place today) or Shared
  Paths, both per user and update-safe. They do not help a second machine.
- Committed options (`orca.yaml`, `.worktreeinclude`) would put Orca- or
  tool-specific files in the public tree; #1138 decides whether that is
  acceptable.
- One `.worktreeinclude` serves both tools only if its entries are literal
  paths (Orca skips globs).
- For Claude Code worktrees inside the repo, `CLAUDE.md`, skills, agents
  and commands already reach the worktree without copying. `AGENTS.md`,
  `LEARNINGS.md`, `.claude/rules/` and `.mcp.json` would need
  `.worktreeinclude` or `symlinkDirectories`. Whether Claude Code reads
  `AGENTS.md` and `.claude/rules/` from an ancestor directory the same way
  as `CLAUDE.md` was not measured.
