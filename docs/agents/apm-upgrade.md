# apm upgrade runbook

What to do when the installed `apm` version differs from the version in the
header of `docs/apm-behavior.md`. Until this runbook has been completed for
the new version, that document and every claim resting on it are **stale** —
treat them as hypotheses, not facts.

## Safety first

- Every `-g` command runs against a sandbox `HOME`, never the real home
  (`LEARNINGS.md` · spike-isolation). Auth survives the redirect via
  `GITHUB_TOKEN=$(gh auth token)`; set `GITHUB_APM_PAT` too — apm resolves
  it first.
- Never run a bare `apm uninstall -g` (ADR-0013's context records why). The
  one permitted form is a *named* package under a sandbox `HOME`, solely to
  re-capture `apm-uninstall-global-ok.txt` in step 2.

- Every install spends the machine's anonymous GitHub quota (60 an hour), token
  or not. The capture script refuses to start on a short quota; before any
  other batch run `node scripts/github-quota.mjs <calls>` and wait for the
  reset it prints. Discard any capture that holds a
  `GitHub API rate limit hit` line. The canaries pass on a spent quota; only
  captures need it.

## Steps

1. **Record the new version.** `apm --version`, and note it for the
   behavior-doc header in step 4.
2. **Re-verify the command-backed claims.** Run
   `node scripts/capture-apm-fixtures.mjs`: it re-runs the Command-output
   captures of `tests/fixtures/README.md` and reports each as same or
   differs. Differs → copy the capture over the fixture (re-captured); same →
   leave it (verified unchanged), per that README's bookkeeping. Re-run any
   other README capture by hand from its recorded command and conditions.
   Then run the real-apm lanes: the four canary tests, via
   `scripts/run-apm-canary.sh`, and the integration suite. A failing lane is
   the finding, not an obstacle — it marks a behavior change. The canaries are
   a gate: the upgrade is not done until they are green against the new
   version.
3. **Re-verify the source-read claims.** Some claims in
   `docs/apm-behavior.md` are marked "(source)" — no command proves them.
   Re-read the named functions in the installed apm source (currently:
   `_read_yaml_targets`, `declared_target_profiles`, `_is_stale` for
   ghost-entry retention; `core/target_detection.py::resolve_targets` for
   literal `-t` handling; `core/scope.py` for `Path.home()` derivation)
   rather than re-running an install.
4. **Rewrite `docs/apm-behavior.md` section by section.** Replace each
   section's content with what the new version does; bump the version and
   date in the header. Bump the same version in the `tests/fixtures/README.md`
   header and in `REQUIRED_APM_VERSION` (`scripts/bootstrap.mjs`);
   `tests/integration/apm-version-pins.test.ts` stays red until all three
   agree. Never append version deltas — `git log` on the file
   is the changelog. A claim that no longer holds is rewritten, not
   annotated.
5. **Sweep the dependents.**
   - ADR-0013: does apm now prune ghost entries? If so the `rm` becomes more
     necessary, not less — see the "both halves" clause before touching
     anything.
   - ADR-0014: has the ref grammar or host gate changed?
   - `LEARNINGS.md`: reconfirm or archive entries naming an apm version.
   - `.claude/rules/apm-driver.md`: do the imperatives still match the
     measured behavior?
6. **Commit** via `workflow-commit`, with the version bump named in the
   message.
