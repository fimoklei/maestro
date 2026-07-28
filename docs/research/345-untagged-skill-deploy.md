# Can the cockpit deploy a skill that has no tag?

Resolves Wayfinder ticket
[#345](https://github.com/fimoklei/maestro/issues/345) on map
[#343](https://github.com/fimoklei/maestro/issues/343). Captured 2026-07-27
against `main` at `1adc965`, apm 0.26.0.

## Answer

**No — and the refusal is Maestro's own, not apm's.** The ticket's hypothesis is
half right. Inventory does list an untagged skill as if it were deployable, but
the deploy never reaches apm: three cockpit-side guards fire first, each
returning a typed domain error with a written cure. There is no correctness hole
and no raw apm error reaching the user.

What is missing is **timing, not safety**. Publish state is knowable offline,
before the click — `git ls-tree` and `git diff` against the latest tag already
answer it — yet the cockpit reveals it only at the click, one skill at a time,
and only as a refusal.

## Which source each surface reads

| Surface | Source | Evidence |
|---|---|---|
| Inventory list | the clone's **working tree** | `inventory-reader.ts:79-83` — `join(root, "skills", name, "SKILL.md")` through `FileSystemPort`; no git call anywhere in the file |
| Inventory API payload | working tree, three fields | `Primitive = { type, name, description }` (`use-inventory.ts:7`), served by `/api/inventory/primitives` (`app.ts:285`) |
| Deploy | the **latest git tag** | `deploy-skill.ts:296` resolves the tag, `:347` builds the tag-pinned ref (ADR-0003) |

So the two surfaces genuinely read different sources. The ticket was right about
that.

## The three guards, in order

All in `DeploySkill.deploy` (`packages/core/src/deploy/deploy-skill.ts`), all
before `apm.deploySkill`:

1. **Origin must be a GitHub remote** — `:273-277`. `parseGitOrigin` returns
   `null` for a missing remote, a non-`github.com` host, a non-default port, or
   a `file:`/`git:`/`http:` scheme (`git-origin.ts:19,34,44,51`) →
   `inventory-origin-unavailable`.
2. **A deployable tag must exist and contain the skill** — `:304` (apm reported
   no `vX.Y.Z` tag) and `:310` (`skillExistsAtTag` is false) → both
   `no-published-tag`, message *"No published tag contains this skill. Tag and
   push the central harness first."* (`app.ts:113-116`).
3. **The working tree must match the tag** — `:313`, `skillDivergesFromTag` →
   `local-diverged-from-tag`, message *"Your local skill differs from its latest
   published tag. Tag and push your change first."* (`app.ts:118-121`).

Guard 3 answers the ticket's second question directly: for a skill edited in the
working tree since its tag, the cockpit deploys **neither** the tagged content
nor the edited content. It refuses. `skillDivergesFromTag` catches tracked
changes via `git diff --quiet <tag> -- skills/<name>` and untracked files via
`git ls-files --others --exclude-standard` (`inventory-git.ts:39-67`), so a
brand-new file inside an existing skill counts as divergence too.

Proven by passing tests, not by reading alone —
`npx vitest run packages/core/src/deploy/deploy-skill.test.ts -t "tag"`,
7 passed:

- `reports no-published-tag when the inventory has no tag at all`
- `reports no-published-tag when the latest tag does not contain the skill`
- `refuses to deploy a skill whose local tree diverges from the tag`
- `refuses a global deploy when the local tree diverges from the tag`
- `turns an apm tag-resolution failure into a typed deploy-failed error`

## What the screen shows before the click

Nothing about publish state. The payload has no field for it
(`use-inventory.ts:7`), so the row cannot render one. The deploy button's
`disabled` is `!registryReady || deploy.isPending || globalUnavailable`
(`deploy-skill-action.tsx:140`) — never publish state. An untagged skill and a
published one are visually identical until the refusal arrives.

`bulk-deploy-report.tsx:16-17` already maps both errors to short row-level
reasons, so bulk deploy surfaces them per skill — again only after the attempt.

## Consequence for the P4-vs-P1 priority argument (#353)

The standing argument on #353 says P4 "closes a hole that is open in the product
today". **Weaken it.** The hole is a feedback-timing gap, not a correctness or
safety gap — every unsafe path is already refused with an actionable message. P4
turns a click-time refusal into a scan-time signal. Real value, and it needs no
new external capability because git already answers it locally and offline. But
it is not a bug fix, and #353 should stop framing it as one.

## New finding, load-bearing for P1 and P5

**A scaffolded harness with no GitHub remote produces nothing deployable.** Guard
1 rejects it before tags are ever consulted, because `deployableHosts` is exactly
`{"github.com"}` (`git-origin.ts:34`) and tag resolution is GitHub-only by
ADR-0003. So "set up a harness" (P1) cannot mean `git init` alone — a
local-only harness dead-ends at `inventory-origin-unavailable`, an error whose
message talks about a clone's origin remote and will read as nonsense to someone
who just created the thing.

This deserves its own ticket: **does the scaffold create the GitHub repo, or hand
the user a checklist?** It is a `task`-type question (provisioning), and it sits
in front of P1.

## Unmeasured

- **No live click.** The guards are proven by the core unit tests, not by a
  `pnpm smoke` run with a sandboxed untagged clone and a browser click. The code
  path from route to guard is direct and typed, so the residual risk is that the
  *message* renders differently than `app.ts` states — a presentation risk, not
  a behavioural one.
- **No real `apm view` run.** `resolveLatestTag` wraps
  `apm view <owner>/<repo> versions` over the network; which of `no-tag`,
  `auth-required` or `failed` a genuinely untagged **remote** repo produces was
  not measured here. The mapping from each reason to its domain error is proven
  by test; the reason apm actually returns is not.
- **Ordering under multiple faults.** A harness that is both untagged and has no
  remote reports `inventory-origin-unavailable`, since guard 1 runs first. Read
  from the code, not observed.
