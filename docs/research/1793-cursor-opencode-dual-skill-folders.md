# How Cursor and OpenCode load a skill present in both `~/.claude/skills` and `~/.agents/skills`

Serves [#1793](https://github.com/fimoklei/maestro/issues/1793), a research
ticket on the map [#1768](https://github.com/fimoklei/maestro/issues/1768).
Read 2026-11-03 from source and docs; neither tool was run.

## Answer

| Tool | Reads both folders | Same name in both | Reads `~/.agents/skills` without Codex | Confidence |
|---|---|---|---|---|
| OpenCode 2.2.5 | Yes | Loads once; the `~/.agents` copy wins, no warning | Yes, whenever the folder exists | High (source) |
| Cursor 3.26.13 | Yes, per docs | Unknown | Yes, per docs (no condition stated) | Low (docs only, closed source) |

For Maestro: on a two-tool machine with differing copies, OpenCode uses the
`~/.agents/skills` copy. On a machine without Codex, a stray
`~/.agents/skills/<name>` Maestro no longer manages replaces the fresh
`~/.claude/skills` copy in OpenCode, silently (#1770). Identical copies load
once.

## OpenCode

Source: `anomalyco/opencode` (the current home of `sst/opencode`), branch
`dev`, commit `4dd7b2662c60d33f98d6bea7ff8172a496738941`,
`packages/core/package.json` version 2.2.5.

1. **Roots.** `packages/core/src/config/discovery.ts:69-70, 152-166`:
   `claude` = `~/.claude`, then each project `.claude` from outermost to the
   working folder; `agents` = `~/.agents`, then the project `.agents` folders
   the same way. No check for Claude Code or Codex; the only filter is "is a
   directory" (`config.ts:492-496`). Home is `os.homedir()` or
   `OPENCODE_TEST_HOME` (`packages/util/src/global.ts:17`), usable for a
   sandbox run.
2. **One map, last wins.** `packages/core/src/config/plugin/compatibility.ts:45-55`
   scans `[...claude, ...agents]` + `/skills` into one `Map` keyed by skill id.
   Effective order, low to high: `~/.claude/skills` → project
   `.claude/skills` → `~/.agents/skills` → project `.agents/skills`. A global
   `~/.agents/skills/<name>` therefore also beats a repo's
   `.claude/skills/<name>`.
3. **OpenCode's own folders win over both.** `ConfigSkillPlugin`
   (`plugin/skill.ts:80-106, 152-157`) loads `~/.config/opencode/skill(s)`
   (or `$OPENCODE_CONFIG_DIR`), project `.opencode`, the managed system dir,
   then config `skills` paths, into a last-wins map, registered after the
   compatibility plugin (`plugin/internal.ts:289-290`; replay order
   `state.ts:197`; overwrite by id `skill.ts:128-129`).
4. **The id is the folder name**, not frontmatter `name`, which is optional
   and falls back to the id (`plugin/skill-file.ts:44-55`).
5. **Tests.** `packages/core/test/config/skill.test.ts:216-252` (later-source
   precedence), `:254-286` (worktree copy beats parent checkout). None pits
   `~/.claude` against `~/.agents` directly; that order follows from
   `compatibility.ts:45`.
6. **Opt-outs** (`config.ts:60-70`): `global: false` drops `~/.claude` and
   `~/.agents` together; `claude: false` drops only `.claude`. No opt-out for
   `.agents` alone.

### Docs against source

Docs: `packages/web/src/content/docs/skills.mdx`.

- Docs ask for unique names across locations (`:221`) and state no
  precedence; source has a fixed last-wins order and no warning.
- Docs call `name` required and equal to the folder (`:39`, `:57`); source
  makes it optional and keys on the folder.
- Docs list `.opencode` first (`:16-21`); source loads it last, so it wins.

## Cursor

Closed source; current docs could not be fetched this session. Per the
2026-10-15 docs reading in
[`1551-user-level-folders-and-detection.md`](1551-user-level-folders-and-detection.md)
(ref [3]), Cursor reads `~/.cursor/skills`, `~/.agents/skills`,
`~/.claude/skills` ("for compatibility") and `~/.codex/skills`, with no
condition on Codex being installed. Installed here: Cursor 3.26.13
(`/Applications/Cursor.app/Contents/Resources/app/package.json`); its bundle
was not searched.

## Unverified

- Cursor: which copy wins, whether it loads both, whether it warns. Settling
  it needs a sandboxed run: throwaway `HOME`, one name in both folders with
  different descriptions.
- Cursor's current folder list (docs not re-read since 2026-10-15).
- OpenCode: which flag or env var sets `global: false` / `claude: false`;
  whether the skill tool resolves by id or `name` when they differ; where the
  project walk stops.
