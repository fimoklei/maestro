# LEARNINGS

Project-specific observations an agent discovered through doing in this repo.

**Filter:** *Would a future agent make the same mistake without this entry?*
Yes → it belongs here. No → user preference goes to global memory, intentional
decisions go to `AGENTS.md` or `docs/adr/`.

**Entry format:**

```
- **YYYY-MM-DD · <area>** — <observation>. → <action>.
```

Retired entries are deleted, not archived.

## Active

Confirmed patterns. Apply as rules. Newest on top.

- **2026-10-24 · web/split-sentence-escapes-getbytext** — Once a name renders in its own element (`InlineName`), `getByText("whole sentence")` finds nothing, and `queryByText` of it passes vacuously. → Query a sentence with `sentence("…")` from `test-utils.tsx`; never leave a negative `queryByText` on a split sentence.
- **2026-10-24 · web/svg-use-needs-a-file-url** — Vite inlined the small logo SVG as a data URL; Chrome rendered `<use href="data:…#mark">` as an empty mark while component tests passed. → Import an external SVG referenced by `<use>` with `?no-inline` and verify the mark in a browser.
- **2026-10-24 · apm-driver/manifest-git-entry-is-an-object** — apm 0.29.0 writes a git dependency in `apm.yml` as an object (`git:`, `ref:`, `skills:`), so a `sed` on the `#tag` string matched nothing and the install ran at the old tag, green. → Move a pin by editing `ref:`; check with `grep -n ref:` before installing. Capture: `docs/research/929-native-model-spike.md`.
- **2026-10-14 · tooling/path-scoped-rules-load-on-touch** — A `.claude/rules` file with `paths:` loads the first time a Read *or* Write touches a matching file, with no read instruction (Claude Code 2.1.296): `app.tsx` → `comments`, `copy`, `frontend`, `design`; `app.test.tsx` adds `testing`; `deploy/apm-cli-driver.ts` → `comments`, `apm-driver`; `scripts/bootstrap.mjs` → `comments`, `scripts`. Proof is the transcript's `nested_memory` attachments, not the agent's self-report. Only files inside the session's own checkout count: in the #1427 `/implement-spec` run (2.1.300) the nine sub-agents editing their own worktrees, test files included, loaded zero rule files, while one in the parent checkout loaded five; a Read of a worktree file under the session root's `.claude/worktrees/` does load them. Codex loads none of them. → Keep the task pointers in `CODING_STANDARDS.md`; a worktree sub-agent or Codex reads the rule file whose text is missing from its context.
- **2026-10-02 · tooling/bsd-sed-needs-empty-suffix** — macOS `sed` is BSD: `sed -i 's/a/b/' file` takes the script as the backup suffix and the file name as the script, failing with `undefined label`, `extra characters at the end of d command` or `unterminated substitute pattern` (three times across the #792 and #1298 sessions). → Write `sed -i '' 's/a/b/' file`; for a multi-line edit use the Edit tool.
- **2026-09-27 · apm-driver/insteadof-needs-an-existing-github-name** — An `insteadOf` redirect of a GitHub origin reaches apm, but apm 0.29.0 first asks `api.github.com` whether the repository exists and aborts on a 404 before any git call. → Redirect only a name that exists; `pnpm smoke:ready --scenario` uses the empty `fimoklei/maestro-fixture-harness` for this, so reach deploy states with it instead of hand-building them.
- **2026-09-18 · tooling/gh-api-sends-ids-as-strings** — `gh api -f sub_issue_id=$ID` (and `…/dependencies/blocked_by`) posts a string; GitHub answers 422 `… is not of type integer`, which reads as a wrong id. → Pass ids with `-F`, taken from `gh api repos/<owner>/<repo>/issues/<n> --jq .id` (database id, never the issue number).
- **2026-09-09 · architecture/duplicated-invariant-drifts-across-sessions** — The J04 rule ("uncheckable is `unknown`, never `up-to-date`") is authored three times in `packages/web/src/drift/`; stateless per-job sessions never consolidate. Tell: a comment saying "mirrored from …". → Before mirroring a derivation, type or resolver, give the invariant one owner (shared type, deep module, named seam).
- **2026-09-09 · apm/rich-wraps-phrases-mid-sentence** — apm install output is Rich-rendered and wraps mid-sentence (`…/skills/tdd is` / `a symlink -- refusing to deploy`), so a literal `includes()` misses. → Match against whitespace-normalized lowercase output; fixtures from real captures only.
- **2026-09-09 · apm-driver/symlink-skill-destination** — apm (0.20.0–0.32.0) refuses a skill whose leaf destination `~/.claude/skills/<name>` is a symlink; 0.20.0 still prints the success marker. A directory-level symlink passes. → Use one directory symlink, never per-skill leaf symlinks. Measurements: `docs/research/apm-0.25-symlink-topology-impact.md`.
- **2026-09-04 · apm-driver/symlinked-home-deploys-nothing** — apm ≥0.29.0 `install -g` reports success and deploys zero files when `HOME` has a symlink component; macOS `tmpdir()` (`/var` → `/private/var`) is one. → `realpath` every sandbox `HOME` for `-g`; re-run with a resolved home before calling an empty global deploy a regression. Capture: `docs/research/772-apm-0.29.0-findings.md § F1`.
- **2026-09-03 · testing/coverage-project-flag-empties-the-report** — `vitest run --coverage --project <lane>` narrows the coverage root, so repo-root `coverage.include` globs match nothing: `Unknown% ( 0/0 )`, no warning (vitest 4.1.11). → Run `pnpm test:coverage` whole; for one lane, a throwaway root config with that single project. Capture: `docs/research/735-coverage-map.md`.
- **2026-09-01 · testing/red-needs-the-narrower-seam** — A journey test built on a real `git clone` went green before the fix (#668): git already writes the initial branch's tracking config, whatever `branch.autoSetupMerge` says (git 2.50.1). → When a new test passes before the fix, drop to the unit that owns the behaviour and build the fixture from `git init` + `remote add`; never bend the environment to force RED.
- **2026-08-09 · tooling/partial-commit-needs-add-first** — `git commit -- <paths>` on untracked paths fails `pathspec … did not match` (also on an unborn branch). → `git add -- <paths>`, then `git commit -- <paths>`; never fall back to a bare `git commit`, which sweeps up the user's staged work.
- **2026-07-28 · web/server-refusal-states-look-unreachable-in-smoke** — The remove dialog's refusal states look unverifiable without real apm. The deploy-state read is a plain lockfile parse, and `claudeSkillName` takes `virtual_path`'s basename unchecked while the removal rejects it. → Seed an entry with `virtual_path: skills/Not A Slug` for a real `invalid-name` 400; re-seed after every `pnpm smoke` start.
- **2026-07-27 · apm-driver/ref-subpath-is-literal** — An apm ref's subpath is literal: `github.com/o/r/skills/tdd#v…` fails `Subdirectory … not found` when skills live in `.apm/skills/`, though apm reads both shapes from disk (0.26.0, 0.29.0). → Build a skill's subpath with `harnessSkillSubpath`, never a hand-written `skills/<name>`.
- **2026-07-27 · apm-driver/compile-overwrites-owned-context-files** — Plain `apm compile` overwrites `AGENTS.md`/`CLAUDE.md` in `$PWD` with a generated build; `--user-scope` does the same to `~/.claude/CLAUDE.md` (0.26.0, re-read 0.29.0). → Only `--validate` and `--dry-run` are safe here.
- **2026-07-27 · apm-driver/validate-is-not-a-validity-signal** — `apm compile --validate` never reads `skills/*/SKILL.md` and reports `All primitives validated successfully!` over broken skills; `apm install` normalizes a bad name and exits 0 (0.26.0, re-read 0.29.0). → Check structural skill rules in `core`. For hidden Unicode, `apm audit --file <path> -f json` and read `passed`, never the exit code.
- **2026-07-22 · web/styling-is-test-invisible** — happy-dom renders without CSS, so an invalid Tailwind utility (`bg-app`) no-ops with every test green. Valid colours are the steps `styles/theme.css` maps (`bg-gray-1` … `bg-gray-12`, plus the blue, green, amber and red steps it lists). → Use only mapped utilities; prove styling with a smoke screenshot.
- **2026-07-18 · apm-driver/spike-isolation** — `apm uninstall -g` on the real home deleted 19 skill dirs beyond its lockfile. → Run spike `-g` commands with `HOME` on a throwaway dir, plus `GITHUB_TOKEN=$(gh auth token)` and `GITHUB_APM_PAT`.

## Tentative

Single observations. Consider but do not auto-apply. Promote to Active on reconfirmation.

- **2026-10-26 · tooling/orca-workspace-has-no-mcp-json** — `.mcp.json` is gitignored and lives only in `~/Projects/maestro`, so a session in an Orca workspace had no agentation tools while the toolbar's server ran on `:4747`. → Link it in: `ln -sfn "$(dirname "$(git rev-parse --git-common-dir)")/.mcp.json" .mcp.json`, then restart the session; meanwhile `curl -s localhost:4747/pending` lists the open annotations.

- **2026-10-26 · tooling/zsh-does-not-split-a-command-variable** — `AB="agent-browser --session x"; $AB open …` failed `command not found` on every call: zsh does not word-split an unquoted variable. → Wrap a repeated command with flags in a function: `ab(){ agent-browser --session x "$@"; }`.

- **2026-10-24 · tooling/commit-gate-blocks-the-whole-call** — The commit gate denies the whole Bash call, so a `git add … && git commit` that fails the gate never stages; the retry then failed `Exiting because of an unresolved conflict` while concluding a merge (#1663). → Stage in its own Bash call, then run `git commit` alone.

- **2026-10-24 · tooling/pnpm-exec-biome-writes-nothing** — `pnpm exec biome format --write` and `biome check --write` printed `Lint: No issues found` and left files unformatted, while `pnpm lint` kept failing on format; the shell hook rewrites the call. → Run `./node_modules/.bin/biome format --write <paths>`.
