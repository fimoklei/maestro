# ADR-0031 — A target follows one Harness release

- **Status:** Accepted — amends ADR-0019 §1, ADR-0027 and ADR-0028
- **Amended:** 2026-09-11 — rules 9 and 10 and the manifest write, after the #833 review
- **Amended:** 2026-09-12 — the last removal, the operation record, and the two
  recovery notices that no longer retire, after the #957 canary (#951)
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
  skill** takes away; Update never changes it (#937). Before every install
  Maestro writes the exact selection to `skills:` in the consumer's `apm.yml`
  and passes the same list as `--skill`; removing one skill is one `install`
  at the same tag with the narrower list (ADR-0019 §7).
- **An empty Selection has no expression.** The #957 canary measured apm
  refusing `skills: []` outright, and installing the whole bundle when the key
  is dropped. Removing the *last* skill is therefore a guarded, named
  `apm uninstall` of the Harness dependency, which spares every other
  dependency and every hand-placed file in both scopes. The target then reads
  **Empty**, with no Target release.
- **The intent is durable.** Before the first mutation Maestro records the
  target, the Harness, the operation, the chosen release, the previous and the
  desired Selection and the affected tools in `~/.maestro`. It is cleared only
  when disk, the manifest and the deployment record all agree with the desired
  result; a matching tag alone never clears it. One target holds one unfinished
  operation, and a second operation is refused until a retry converges. Deploy,
  Remove and Update share this one record.
- **Global** adopts as one set of detected tools (ADR-0011).

### What Maestro owns

The gaps #929 measured, and the rule for each:

| APM behaviour | Maestro's rule |
|---|---|
| A selected skill absent at the new tag is cleaned silently on a bare install | Compare the selection with `.apm/skills/` at the chosen tag before install; the preview states the removal. |
| Fails closed only when every name is re-passed as `--skill` | Always pass the full selection as `--skill` on every install. |
| `skills:` / `skill_subset` keep stale names, and `--skill` only unions | Write `skills:` to the exact selection before every install, so a dropped name never returns; read deployed state from `deployed_files` per `skills/<name>/`, never from the subset list. |
| No atomicity, no no-op marker for a root package | Record the chosen tag as the target's **Pending release** in `~/.maestro` before the install and clear it once the lockfile shows that tag; compare `deployed_file_hashes` before and after; a half-landed Update reads **Mixed releases** per skill from the files; **Retry update** re-runs the Pending release, across a restart too. |
| A same-ref reinstall resets an edited copy silently | The Local-edits guard (#931) runs before every install: deploy, remove, update. |
| `deployments[].target` differs per form | The lockfile reader admits `package_type: apm_package` and attributes files by path and target. |
| A false `-g` ownership warning | Never shown, never parsed. |
| An update banner on `apm view` stdout | The versions parser skips leading lines. |
| `apm.yml` may hold any shape | Edit `skills:` only under exactly one dependency on the connected Harness; any other shape stops before the install with **Manifest not recognised**. |
| `includes: auto` deploys every primitive type | Count lockfile files outside `skills/<name>/`; more than zero shows **Extra files deployed** on the target card. |

### How the code follows it

- **One Selection write path.** `SelectionWriter` owns the order every write
  shares: record the intent in `~/.maestro`, write `skills:` to the exact
  Selection, run one `apm install` with the whole list as `--skill`, then read
  back disk, manifest and lockfile before clearing the record. Deploy, Remove,
  Update and Retry all go through it, so no caller can invent its own order.
- **Completion is proof, never an exit code.** A write is finished only when
  the files, the manifest and the deployment record all name the desired
  Selection at the chosen release. Anything else leaves the record standing and
  the card reads *Mixed releases* with a Retry.
- **Reading is fail-closed.** A lockfile that is present but unreadable, a
  record naming more than one Harness package, and a ref that is not a release
  tag are all refusals — never an empty target a write may install over.
- **Consent binds content, not verdicts.** The local-copy guard fingerprints
  the bytes of every copy a consent would cover, and both the Update preflight
  token and the copy receipt sign that fingerprint. An edit made after the
  preview was priced therefore refuses the confirm with *Status out of date*.
- **Pinned per skill and a Release head are exclusive.** A target still holding
  per-skill dependencies follows no single release, so the reader answers one
  status or the other and no *Update target* is offered where no mechanism
  exists.
- **The Selection is what the roll-up counts.** `→ N targets` and the changed
  count speak about the Selection the target follows, never about whatever is
  left on disk beside it.

### Accepted limits

1. No all-or-nothing install. The cockpit shows a half-landed Update honestly,
   and Retry converges (#929 measured it).
2. *No content changes* is Maestro's own reading from hashes, never APM's.
3. `includes: auto` deploys every primitive type the Harness holds; the
   Harness stays skills-only, and the cockpit counts what lands outside it.
4. Only the latest release can be adopted and an empty target pins it. A
   broken latest release has one way out: tag a new release in the Harness.
   Rolling back stays a LATER job.
5. Comments in the consumer's `apm.yml` may not survive Maestro's write.

## Consequences

- `CONTEXT.md` gains **Target release** and **Selection**; **Version drift**
  and **Behind** become target readings; **Older tag** retires; **Bundle**
  keeps Maestro's meaning with an *Avoid* line for APM's.
- ADR-0019 §1 is amended (the consumer pins the Harness, not a skill) and §7
  is added (Maestro writes `skills:` before every install). ADR-0027 keeps its content
  reading as the changed count and loses its row status and row action.
  ADR-0028 keeps its row reading; the action moves to the target.
- Migrating a target that still holds per-skill dependencies is its own
  decision (#933).
- `CONTEXT.md` gains **Pending release**, **Manifest not recognised** and
  **Extra files deployed**. **Removal incomplete** and **Retry removal** stay:
  the last removal does empty the target, and a blocked uninstall leaves files
  behind whatever apm's exit code says. **Deploy incomplete** and **Retry
  deploy** join them, on the same record.
- The apm-driver rules for the gaps are written when the code that
  follows them lands, not before.

## Rejected alternatives

- **N skill refs held at one tag by Maestro.** The fallback the gate carried:
  every skill stays its own dependency and "all pins agree" becomes a Maestro
  invariant. Rejected because it keeps the concept in Maestro instead of in
  the data — the lockfile would still say forty-seven pins while the cockpit
  claims one release — and because every Update would be forty-seven
  installs with no natural half-landed state to read back.
- **Remove = uninstall the Harness, then reinstall with the narrower list,
  Maestro never touching `apm.yml`.** The first accepted shape (2026-09-11,
  gate #930). Reversed the same day: the target is empty between the two
  calls and the reinstall needs GitHub, so one Remove could empty a
  forty-seven skill target; and `skills:` would keep every name a release
  dropped, so a later release reusing the name would deploy it unasked.
  Writing one list APM created is the smaller departure (ADR-0019 §7).
