# Harness release adoption through APM

Date: 2026-09-06. Research only; no implementation or accepted ADR amendment.

## Conclusion

APM 0.29.0 provides the underlying package model: one Harness dependency at
one Git tag, with an explicit selection of skills. Maestro must supply the
release comparison, local-edit guard, adoption action and truthful completion
state. This is feasible in principle, not an end-to-end verified migration.

## Evidence

The installed `apm --version` reports 0.29.0, matching `docs/apm-behavior.md`.
Official [install documentation](https://microsoft.github.io/apm/reference/cli/install/)
describes Git tag refs, multiple package arguments and repeated `--skill`
selection. The [manifest schema](https://microsoft.github.io/apm/reference/manifest-schema/)
defines dependency-level `skills`. Online documentation can move independently
of the installed release; the findings below also use installed source or a
local command.

An isolated local-path experiment created a Harness-shaped package with six
directories under `.apm/skills/` and one instruction. Installing it with
`--skill alpha --skill beta --skill gamma --skill delta --skill epsilon -t claude`
deployed exactly those five skills. The sixth was absent. The manifest retained
one dependency with a `skills` list; the lockfile retained one `apm_package`
entry with `skill_subset` and hashes for the deployed files.

The instruction was also deployed to `.claude/rules/extra.md`: `--skill`
filters skills, not every other primitive a package can contain. This matters
when replacing today's single-skill dependencies with a root Harness package.

Scratch evidence is in
`/private/var/folders/md/9htx0_616wl_v3lv2ldd9pcr0000gn/T/apm-subset-031ohl_q/`:
`result.txt`, `consumer/apm.yml`, and `consumer/apm.lock.yaml`.
This experiment proves selection and deployment shape, not Git-tag upgrades,
global installs, migration or failure recovery. No real deployment was changed.

Installed source lives under
`/Users/dev/.local/share/uv/tools/apm-cli/lib/python3.11/site-packages/apm_cli/`:

- `integration/skill_integrator.py:1457` passes `skill_subset` when promoting
  `.apm/skills/` from an ordinary APM package, confirming that this is not
  restricted to root `skills/` bundles.
- `install/transaction.py:73` explicitly limits the resolution journal to
  `apm_modules`; native target integrations are outside the transaction.
  A package install therefore must not be presented as guaranteed atomic
  replacement of every deployed file.
- Exact-tag movement remains explicit reinstall at the chosen new tag;
  `apm update` stays within the declared ref. See the measured reference in
  [APM behavior](../apm-behavior.md#update--re-install-not-apm-update).

## Fit with the agreed process

| Requirement | APM support / Maestro responsibility |
| --- | --- |
| One Harness release per installation | A root dependency can hold the tag; selection is stored by APM. |
| Keep the same five skills | An explicit skill selection supports this; avoid wildcard selection. |
| Show two changed out of five | Maestro compares selected skill trees between releases. APM outdated alone compares versions. |
| Adopt the release once | Maestro drives APM using a fixed chosen tag and verifies the resulting selection and files. |
| Block unresolved local edits | Maestro must check every selected deployed copy before writing. APM install is not the existing safety guard. |
| Allow edits already incorporated in the release | Maestro needs a destination-to-selected-release comparison; its existing old-lockfile comparison is insufficient. |
| All files switch together or nothing changes | Not guaranteed by APM's transaction scope. Failure and retry behavior need a separate proof. |

## Existing Maestro seams

[DeploySkill](../../packages/core/src/deploy/deploy-skill.ts) resolves the latest
tag per call and refuses destination divergence from the old lockfile unless
forced. It does not implement the accepted destination-equals-new-release
exception. That exception needs complete directory equality, including added
and missing files, before install is allowed.

[BulkDeploySkills](../../packages/core/src/deploy/bulk-deploy-skills.ts) invokes
that operation per skill and continues after failures. It is not a release
adoption operation with a whole-selection preflight and a fixed release.

[DeployStateReader](../../packages/core/src/deploy-state/deploy-state-reader.ts)
expects individual skill entries. The measured root `apm_package` entry cannot
simply replace them without changing state reading, skill identity and related
drift/removal/import handling. Existing [release-tree comparison](../../packages/core/src/drift/read-drift.ts)
provides a starting point for the changed-skill count.

## Recommendation and remaining proof

Prefer APM's native root-package selection as the candidate model. Before
implementation, prove a tagged Harness upgrade in isolation at project and
global scope: five selected skills, two changed, one new unselected skill,
unchanged selection afterward. Also prove migration from existing per-skill
owners, local content already matching the new release, a removed selected
skill, and a failure during deployment. Check that unrelated primitives and
dependencies are not unintentionally deployed or removed.

If root-package scope cannot satisfy the product boundary, multiple explicit
skill refs at one chosen tag remain an alternative, but they require Maestro
to coordinate and report mixed states. Do not call that a native Harness pin.

The agreed concept would amend ADR-0019's per-skill consumption decision and
ADR-0027 section 6's moved-skills-only bulk rule. This research does not amend
them or move the board; it documents evidence for the design discussion.
