# ADR-0031 — A target follows one Harness release

- **Status:** Accepted — amends ADR-0019 §1, ADR-0027 and ADR-0028
- **Date:** 2026-09-11 (wayfinder map #833: gate #930, spike #929, research #928)

## Context

Every deployed skill was its own APM dependency, pinned by subpath at a tag of
the whole Harness (ADR-0019 §1). One release therefore moved every pin at once,
and the cockpit answered with one **Behind** per row and one *Update skill*
button per row. At forty-seven skills that is forty-seven identical actions.

APM's native shape for this is a **root package**: one dependency
`github.com/<owner>/<harness>#vX.Y.Z` with a persisted skill subset (`--skill`).
Research #928 and spike #929 measured it on apm 0.29.0, project and global:
tagged upgrade, narrowing, `outdated`, `uninstall` all work, with eight gaps
Maestro has to own.

## Decision

**A target follows one Harness release with one selection.** One dependency,
one tag, one lockfile entry per target. APM owns release, selection, pin and
lockfile (ADR-0001 intact): Maestro passes the selection as `--skill` and reads
the result.

- **Target release**: every selected skill is deployed from the same tag. Only
  the latest release can be adopted, and **Update target** moves the whole
  selection there in one preview and one install (#932).
- **Selection**: **Deploy skill** adds at the target's release, **Remove
  skill** takes away; Update never changes it (#937). Removing one skill is an
  `uninstall` of the Harness dependency followed by an `install` at the same
  tag with the narrower selection; Maestro never writes the consumer's
  `apm.yml` (ADR-0019 §7).
- **Global** adopts as one set of detected tools (ADR-0011).

### What Maestro owns

The gaps #929 measured, and the rule for each:

| APM behaviour | Maestro's rule |
|---|---|
| A selected skill absent at the new tag is cleaned silently on a bare install | Compare the selection with `.apm/skills/` at the chosen tag before install; the preview states the removal. |
| Fails closed only when every name is re-passed as `--skill` | Always pass the full selection as `--skill` on every install. |
| `skills:` / `skill_subset` keep stale names | Read deployed state from `deployed_files` per `skills/<name>/`, never from the subset list. |
| No atomicity, no no-op marker for a root package | Compare `deployed_file_hashes` before and after; a half-landed Update reads **Mixed releases** per skill from the files; **Retry update** re-runs the same chosen tag. |
| A same-ref reinstall resets an edited copy silently | The Local-edits guard (#931) runs before every install: deploy, remove, update. |
| `deployments[].target` differs per form | The lockfile reader admits `package_type: apm_package` and attributes files by path and target. |
| A false `-g` ownership warning | Never shown, never parsed. |
| An update banner on `apm view` stdout | The versions parser skips leading lines. |

### Accepted limits

1. No all-or-nothing install. The cockpit shows a half-landed Update honestly,
   and Retry converges (#929 measured it).
2. *No content changes* is Maestro's own reading from hashes, never APM's.
3. `includes: auto` deploys every primitive type the Harness holds; the
   Harness stays skills-only.

## Consequences

- `CONTEXT.md` gains **Target release** and **Selection**; **Version drift**
  and **Behind** become target readings; **Older tag** retires; **Bundle**
  keeps Maestro's meaning with an *Avoid* line for APM's.
- ADR-0019 §1 is amended (the consumer pins the Harness, not a skill) and §7
  is added (narrowing by uninstall plus reinstall). ADR-0027 keeps its content
  reading as the changed count and loses its row status and row action.
  ADR-0028 keeps its row reading; the action moves to the target.
- Migrating a target that still holds per-skill dependencies is its own
  decision (#933).
- The apm-driver rules for the eight gaps are written when the code that
  follows them lands, not before.

## Rejected alternatives

- **N skill refs held at one tag by Maestro.** The fallback the gate carried:
  every skill stays its own dependency and "all pins agree" becomes a Maestro
  invariant. Rejected because it keeps the concept in Maestro instead of in
  the data — the lockfile would still say forty-seven pins while the cockpit
  claims one release — and because every Update would be forty-seven
  installs with no natural half-landed state to read back.
- **Maestro edits the consumer's `apm.yml` to narrow the selection.** APM's
  own way to narrow. Rejected: see ADR-0019 §7.
