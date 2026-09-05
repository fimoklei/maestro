# What `gh` knows about a promote branch (issue #806)

Measured 2026-09-05 against **`gh` version 2.86.0 (2026-01-21)**, signed in as
`fimoklei` via keyring, token scopes `delete_repo, gist, project, read:org,
repo, workflow`. The live subject is `fimoklei/harness`, which carries three
promote branches: `maestro/agent-native-cli`, `maestro/app-creator`,
`maestro/workflow-ship`.

Every command below was run; every JSON block is the output verbatim. Where a
failure could not be triggered without damaging the author's `gh` state, that is
said and the primary documentation is cited instead.

## Verdict

**One call answers the whole screen**, and it is
`gh pr list --repo <owner>/<repo> --state all --limit <n> --json ...`. It exits
0 with `[]` when no pull request exists, prints no prose on the happy path, and
returns `OPEN` / `CLOSED` / `MERGED` in one field — the merged/closed
distinction the journey needs.

**But the ticket's premise needs one correction, measured in the code and on the
live repo.** "Pending review" is *not* "a branch exists that differs from the
default branch". `classifyMovement` compares the **skill's tree hash** on the
promote branch against its tree hash at `origin/HEAD`
(`packages/core/src/harness/classify-movement.ts:32`). That already survives a
squash merge, which is the case the ancestry-based reading would get wrong.
What it cannot see is whether a pull request was ever opened, whether it is a
draft, and whether it was closed unmerged. Those three are the whole of what
`gh` adds — see [§5](#5-answerable-from-git-refs-alone).

---

## 1. The invocation

### The command

```sh
gh pr list \
  --repo fimoklei/harness \
  --head maestro/agent-native-cli \
  --state all \
  --json number,state,url,isDraft,mergedAt,closedAt,headRefName,baseRefName,title
```

Output, verbatim:

```json
[{"baseRefName":"main","closedAt":"2026-09-04T17:30:12Z","headRefName":"maestro/agent-native-cli","isDraft":false,"mergedAt":"2026-09-04T17:30:12Z","number":8,"state":"MERGED","title":"Promote skill: agent-native-cli","url":"https://github.com/fimoklei/harness/pull/8"}]
```

Exit code 0.

### When there is no pull request

`maestro/app-creator` has a live promote branch and no pull request. Same
command, same flags:

```json
[]
```

Exit code **0**. No prose, on stdout or stderr. This is the shape that matters:
absence is an empty array, not an error, so the classifier never has to read a
message to learn "no pull request".

### `--state all` is mandatory

The documented default of `--state` is `open`
([`gh pr list` manual](https://cli.github.com/manual/gh_pr_list)). Measured
against the *same* merged branch without it:

```console
$ gh pr list --repo fimoklei/harness --head maestro/agent-native-cli --json number,state,url
[]
```

A merged pull request is indistinguishable from no pull request unless
`--state all` is passed. The same manual gives `--limit` a default of **30** —
also mandatory to pass for a whole-repo read.

### One call for the whole screen

`--head` can be dropped and every pull request read at once, then joined on
`headRefName` in `core`:

```sh
gh pr list --repo fimoklei/harness --state all --limit 100 \
  --json number,state,url,isDraft,headRefName,updatedAt
```

Returned all 8 pull requests in **0.38 s wall clock**. Newest-first by number
was observed (8, 7, 6, 5, 4, 3, 2, 1); *the manual does not guarantee that
order*, so a consumer must sort rather than take `[0]`.

This is the shape to prefer: the Harness view needs the answer for every skill
at once, and one call costs one GraphQL request instead of one per skill.

### Rejected alternatives

| Form | Why not |
|---|---|
| `gh pr view <branch> --repo … --json …` | Exits **1** with the prose `no pull requests found for branch "maestro/app-creator"` when there is none. Absence becomes a message to parse — exactly what `security.md` forbids crossing into a response. |
| `gh api "repos/O/R/pulls?head=owner:branch&state=all"` | Works (returns `[]` for none, exit 0), but REST `state` is only `open`/`closed`; merged has to be derived from `merged_at != null`. `gh pr list --json state` gives `MERGED` directly. Its one advantage: REST accepts `head=<owner>:<branch>`, which `gh pr list --head` explicitly does not (`--head` manual: *"no `<owner>:<branch>` syntax"*), so a cross-fork pull request can only be pinned down through REST. Not a solo-author concern today. |

### One head branch can carry several pull requests

Measured on `fimoklei/maestro`, grouping every pull request by `headRefName`:

```json
[[{"headRefName":"renovate/dev-tooling","number":669},
  {"headRefName":"renovate/dev-tooling","number":597},
  {"headRefName":"renovate/dev-tooling","number":586},
  {"headRefName":"renovate/dev-tooling","number":330},
  {"headRefName":"renovate/dev-tooling","number":293}]]
```

Five. A promote branch that is closed and then re-proposed produces the same
shape. The read must pick the newest, never assume the array holds one element.

## 2. Merged vs closed, and what git still has to say

`state` carries the distinction on its own, and `mergedAt` corroborates it.
Measured shapes, all three from live data:

| Situation | `state` | `mergedAt` | `closedAt` |
|---|---|---|---|
| Open | `OPEN` | `null` | `null` |
| Closed without merging (`fimoklei/maestro` #564) | `CLOSED` | `null` | `2026-08-09T10:19:55Z` |
| Merged (`fimoklei/harness` #8) | `MERGED` | `2026-09-04T17:30:12Z` | same timestamp |

So `MERGED` is the gate into **Pending release**, and `CLOSED` with
`mergedAt: null` is the withdrawn proposal that today sits in Pending review
forever (#805's measured row on `classify-movement.ts:32`).

Other fields measured on `gh pr view 8 --repo fimoklei/harness --json …`:

```json
{"isDraft":false,"mergeCommit":{"oid":"e4406bde548932966b859a1c4cc50a319d09dd85"},
 "mergeStateStatus":"UNKNOWN","mergedBy":{"login":"fimoklei"},"reviewDecision":"",
 "headRefOid":"a7cbf2efbd0eb978503342906593ef81ca724894",
 "statusCheckRollup":[{"name":"skill-check","conclusion":"SUCCESS", …}]}
```

- `reviewDecision` is `""` when nobody reviewed — not `null`, not absent. A
  team-proof read must treat empty string as "no decision".
- `statusCheckRollup` carries CI per run. Available, not needed for the three
  stages.
- Passing an unknown field makes `gh` exit 1 and **print the full list of valid
  fields**. Useful for pinning a field set against a `gh` upgrade.

### Does Maestro still need its own tree-hash reading?

**Yes, for three separate answers `gh` cannot give.**

1. **Pending proposal.** A skill edited on disk and not yet pushed has no branch
   and no pull request. Only `working` vs `local` vs `remote` tree hashes see
   it (`classify-movement.ts:36`).
2. **Pending release means "merged and not yet tagged".** `gh` says merged; the
   tag question is git's. Measured: `fimoklei/harness` has tags `v0.3.0`,
   `v0.2.0`, `v0.1.0`, and the harness already reads them through
   `HarnessGitPort.readFacts` into `HarnessFacts.tags`.
3. **A branch that moved on after merging.** `gh` reports `MERGED` against the
   pull request's head at merge time; if the author pushes again to the same
   branch, `state` stays `MERGED` while the content is new. The tree hash
   catches that; the pull-request state does not.

The honest division: **git answers what the content is, `gh` answers what the
team has done with it.** Neither substitutes for the other.

## 3. Every way the call can fail

Probed live where safe. Nothing was signed out and no token was revoked.

| Failure | How it was produced | What comes back | Distinguishable by |
|---|---|---|---|
| **`gh` absent** | `env PATH=/usr/bin:/bin sh -c 'gh --version'` | `sh: gh: command not found`, exit **127** | Node's `execFile` raises `ENOENT` before any output — the same signal `ToolPresencePort` already uses for a missing binary |
| **Not signed in** | `GH_CONFIG_DIR=<empty dir> GH_TOKEN= GITHUB_TOKEN= gh pr list …` | `To get started with GitHub CLI, please run:  gh auth login` / `Alternatively, populate the GH_TOKEN environment variable…`, exit **4** | **Exit code 4.** Documented: *"If a command requires authentication, the exit code will be 4"* ([gh exit codes](https://cli.github.com/manual/gh_help_exit-codes)) |
| **Bad or expired token** | `GH_TOKEN=gho_0000…` | `HTTP 401: Bad credentials (https://api.github.com/graphql)` / `Try authenticating with:  gh auth login`, exit **1** | Exit 1 with `HTTP 401` in stderr — *not* exit 4. A rejected credential is a reply, not a missing one |
| **Repository unreachable — absent, private, or wrong account** | `gh pr list --repo fimoklei/does-not-exist-xyz123 --state all --json number` | `GraphQL: Could not resolve to a Repository with the name 'fimoklei/does-not-exist-xyz123'. (repository)`, exit **1** | Exit 1 with `Could not resolve to a Repository`. **These three are not separable:** GitHub returns the same not-found for a private repository the token cannot see, which is deliberate: *"GitHub uses a `404 Not Found` response instead of a `403 Forbidden` response to avoid confirming the existence of private repositories"* ([Troubleshooting the REST API](https://docs.github.com/en/rest/overview/troubleshooting-the-rest-api)). "Wrong account" therefore reaches Maestro as "repository not found" |
| **Branch exists, no pull request** | `--head maestro/app-creator --state all` | `[]`, exit **0** | Empty array. Not a failure |
| **Non-github.com origin** | `gh pr list --repo gitlab.com/some/project --state all --json number` | `GraphQL: No such type PullRequest, so it can't be a fragment condition (fragment pr), PullRequestState isn't a defined input type …`, exit **1** | Exit 1 with GraphQL schema errors. **Note the hazard:** `gh` treats any unknown host as a GitHub Enterprise host and *sends the query there*. Maestro must gate on `origin.host === "github.com"` before the call — ADR-0014 already refuses non-GitHub origins at parse time, so the gate exists |
| **Offline / host unreachable** | `gh pr list --repo nonexistent-host.invalid/some/project --state all --json number` | `error connecting to nonexistent-host.invalid` / `check your internet connection or https://githubstatus.com`, exit **1** | Exit 1 with `error connecting to`. Matches the existing `classify-fetch-failure.ts` idea, whose `OFFLINE_PHRASES` list would need `error connecting to` added |
| **Rate limited** | **Not probed.** Triggering it would burn the author's hourly budget for every tool on this machine | Documented: HTTP **403 or 429**, with `x-ratelimit-remaining: 0` and `x-ratelimit-reset`; a secondary limit adds a `retry-after` header ([GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)) | `HTTP 403` / `HTTP 429` in stderr, exit 1. Measured headroom right now: `{"limit":5000,"remaining":5000,"used":0}` for both core and graphql. One batched call per Harness read is ~1 request; the ceiling is not a practical risk for a solo author |
| **Cancelled mid-run** | Not probed | Documented exit **2** ([gh exit codes](https://cli.github.com/manual/gh_help_exit-codes)) | Exit 2 |

Two classes fall out of this cleanly, matching the shape `classify-fetch-failure`
already uses:

- **No answer possible** — `gh` absent (ENOENT), exit 4 (not signed in),
  `error connecting to` (offline). The screen must say it does not know.
- **An answer that is "no"** — `[]`. The screen may state it.

Everything else (401, 403/429, not-found, GraphQL schema errors) is a failed
read, and the classifier should default there, fail-closed, the way the apm
driver's markers do.

### Two more invocation notes

- `GH_PROMPT_DISABLED` — *"set to any value to disable interactive prompting"*
  ([gh environment](https://cli.github.com/manual/gh_help_environment)). Set it,
  so a `gh` that decides to ask something can never hang a cockpit read.
- `NO_COLOR` / `CLICOLOR=0` — not needed with `--json`, which emits plain JSON,
  but cheap insurance against an ANSI-wrapped payload.

## 4. What it costs architecturally

### Where the port sits

`.claude/rules/architecture.md`:

> Outside-world access (filesystem, `apm` CLI, git) sits behind a **port** (an
> interface) in `core`. […] Adapters live in `core`, not `server` (ADR-0002).

So: a `HarnessReviewPort` (interface) beside `HarnessGitPort` in
`packages/core/src/harness/read-harness-state.ts`, and a `GhCliAdapter`
implementing it beside `HarnessGitAdapter` in
`packages/core/src/harness/harness-git.ts` or its own sibling file. `server`
gets nothing but the wiring; `web` gets a typed field on the movement row.

The port's surface should be **one method**, matching the one call that answers
the screen:

```ts
readPromoteReviews(root: string): Promise<PromoteReview[] | null>
```

`null` on the "no answer possible" class, the way `readSkillTrees` and
`readMovementTrees` already use `null` for an unreadable ref. Per-skill methods
would turn one request into N.

The precedent for the failure side is `classify-fetch-failure.ts`, whose header
states the rule exactly: *"The text is read here and thrown away: nothing
derived from it but the class crosses into a response (security.md)."*

### A third binary

Maestro shells out to `apm` and `git` today (#805's measured row). `gh` would be
the third, and it is the first one that is **not** already required to use the
product: `git` is required to have a harness at all, `apm` is the engine
(ADR-0001). A missing `gh` must therefore degrade to today's behaviour, never
block the Harness view. `ToolPresencePort`'s live-probe-per-call pattern
(ADR-0011: *"A live probe per call — no caching, no stored list"*) is the model.

Whether a third binary needs an ADR is listed as open in #805 ("Not yet
specified"). ADR-0019 is the amendment target for a departure from APM's model;
this is not that — it is a new outward dependency, so it reads more like an
amendment to ADR-0021, which is where the harness's read model was fixed.

### Against `security.md`

| Rule | What it demands here |
|---|---|
| *"Args array only (`execFile`/`spawn` with a list). Never `exec`, never `shell: true`"* | `execFile("gh", ["pr", "list", "--repo", ownerRepo, "--state", "all", "--limit", "100", "--json", FIELDS], …)`. The repo slug and any branch name go in as **data**. `isPromotableSkillName` already gates the slug (`promote-branch.ts`) |
| *"Never put `apm` prose in an HTTP response"* (ADR-0018) | Same rule for `gh`. `gh`'s stderr carries URLs, hostnames and `HTTP 401` text. Only the class crosses. The **exception ADR-0018 already carves** — *"A named field derived from apm's output may cross only with a shape check where that output is first read"* — is exactly what the pull-request URL, number and state need: parse JSON → validate with Zod at the adapter → typed data inward |
| *"`ApmCliDriver` passes only ambient env to apm — never inject `GITHUB_TOKEN` or any credential"* | The whole point of the `gh` route: Maestro passes ambient env and `gh` finds the author's keyring token itself. **Maestro never reads, stores, or forwards a token.** This is what makes the author's preference (#805: *"the `gh` CLI they are already signed in to over Maestro holding credentials of its own"*) sound rather than a workaround |
| *"Don't log raw `apm` output (may contain tokens)"* | `gh --json` output is not secret, but `GH_DEBUG=api` output is. Never set it in product code |
| Timeout | `HarnessGitAdapter` sets `GIT_TIMEOUT_MS = 60_000` because *"Without this a hung connection holds the request open for as long as git is willing to wait, which is forever."* Identical need. Plus `GH_PROMPT_DISABLED` so it cannot hang on a prompt |

One new obligation with no existing analogue: **Zod at the adapter**. `git`'s
output is parsed positionally today; `gh --json` returns a JSON document from
outside the trust boundary, so `architecture.md`'s *"any parse of external
data"* rule applies in full — normalize → validate → pass typed data inward.

## 5. Answerable from git refs alone?

Partly, and more than #806 assumes — but not the part that matters.

### What refs already answer, measured

Today's classifier is not ancestry-based and not branch-existence-based. It
compares the **skill's tree hash** on `maestro/<skill>` against its tree hash at
`origin/HEAD`, and returns `pending-review` only when they differ
(`classify-movement.ts:29-34`). Measured on the three live branches, via
`gh api repos/fimoklei/harness/contents/.apm/skills?ref=…`:

| Branch | Tree of its skill on the branch | …at `main` | Classifier says |
|---|---|---|---|
| `maestro/agent-native-cli` | `83792d6e92e4f35e1a10752e8fd443a1c0c7fe49` | **same** | not pending review |
| `maestro/workflow-ship` | `01b312033f60c5e70fd9a327fd070f5a10df18df` | **same** | not pending review |
| `maestro/app-creator` | `feb1677ccda3f095bfbc32ac6760d77d4f0533fa` | absent from `main` | **pending review** |

This is a genuinely good result, and it survives the case that would defeat a
naive ancestry check. `fimoklei/harness` **squash-merges**: PR #8's
`mergeCommit.oid` is `e4406bd…`, which is `main`'s tip
(`"Promote skill: agent-native-cli (#8)"`), while the branch head is `a7cbf2e…`.
Comparing the refs by ancestry gives the wrong answer for all three:

```console
$ gh api repos/fimoklei/harness/compare/main...maestro/agent-native-cli --jq '{status,ahead_by,behind_by}'
{"ahead_by":1,"behind_by":1,"status":"diverged"}     # merged, yet "diverged"
$ … maestro/workflow-ship   → {"ahead_by":1,"behind_by":2,"status":"diverged"}   # merged, yet "diverged"
$ … maestro/app-creator     → {"ahead_by":1,"behind_by":1,"status":"diverged"}   # genuinely open
```

All three read `diverged`. Tree hashes separate them; commit ancestry does not.
ADR-0021's refusal to read ancestry is vindicated, not worked around.

### What refs cannot answer, at any price

1. **Does a pull request exist?** `maestro/app-creator` and a branch pushed
   thirty seconds ago are the same picture in refs. A pull request lives on
   GitHub's side; there is no ref for it under `refs/heads` or `refs/tags`.
   *(GitHub does expose `refs/pull/<n>/head`, but it is not fetched by the
   default refspec and only exists once a pull request is opened — so it can
   confirm one exists, and cannot tell open from closed from merged, nor which
   of five pull requests on one head branch is current. Not a substitute.)*
2. **Was it closed without merging?** The withdrawn proposal that #805 measured
   as stuck in Pending review forever. In refs a closed-unmerged branch and an
   open one are byte-identical.
3. **Is it a draft?** No ref.
4. **The pull-request URL after a refresh.** #805's first measured row:
   `harness-view.tsx:105` keeps it in browser memory only. `promoteCompareUrl`
   (`promote-branch.ts`) can rebuild a *compare* URL from the origin and branch
   name with no network at all — but that is the link that **opens** a pull
   request, not the link to the one that exists. Only `gh` supplies
   `url: "https://github.com/fimoklei/harness/pull/8"`.

### Verdict on the dependency

The dependency is **not unnecessary, and not as large as feared**. Three of the
three stages already work from refs; what `gh` buys is one narrow, real thing:
**the difference between "a branch is out there" and "a pull request is open,
closed, or merged"** — plus the durable link. That is precisely #805's
watertight criterion *"a screen that never claims more than it knows"*, which
today's screen fails for `maestro/app-creator`: a branch with no pull request,
labelled Pending review.

A cheaper fallback exists and should be stated for the record: keep the tree-hash
classifier as the sole source of the stage, and use `gh` only to **enrich** the
row with the pull-request link and to demote a `CLOSED`-unmerged branch out of
Pending review. Then a missing or unauthenticated `gh` costs the link and the
withdrawal case, and nothing else. That is the lazy shape, and it is the one
that survives failure mode 3 gracefully.

## Commands, for re-running

```sh
gh --version
gh auth status
gh pr list --repo fimoklei/harness --head maestro/app-creator --state all --json number,state,url,mergedAt,closedAt,headRefName
gh pr list --repo fimoklei/harness --state all --limit 100 --json number,state,url,isDraft,headRefName,updatedAt
gh pr view 8 --repo fimoklei/harness --json number,state,mergedAt,mergeCommit,headRefOid,url,reviewDecision,statusCheckRollup,isDraft,closedAt,baseRefName,mergeStateStatus,mergedBy
gh api "repos/fimoklei/harness/pulls?head=fimoklei:maestro/agent-native-cli&state=all"
gh api repos/fimoklei/harness/compare/main...maestro/app-creator --jq '{status,ahead_by,behind_by}'
gh api "repos/fimoklei/harness/contents/.apm/skills?ref=main"
gh api rate_limit
git ls-remote https://github.com/fimoklei/harness.git 'refs/heads/maestro/*'

# failure probes — none of these touch the author's gh state
env PATH=/usr/bin:/bin sh -c 'gh --version'
env GH_CONFIG_DIR=<empty dir> GH_TOKEN= GITHUB_TOKEN= gh pr list --repo fimoklei/harness --state all --json number
env GH_TOKEN=gho_0000000000000000000000000000000000 gh pr list --repo fimoklei/harness --state all --json number
gh pr list --repo fimoklei/does-not-exist-xyz123 --state all --json number
gh pr list --repo gitlab.com/some/project --state all --json number
gh pr list --repo nonexistent-host.invalid/some/project --state all --json number
```

## Sources

- [`gh pr list` manual](https://cli.github.com/manual/gh_pr_list) — flags, `--state` default `open`, `--limit` default `30`, `--head` has no `<owner>:<branch>` form.
- [`gh` exit codes](https://cli.github.com/manual/gh_help_exit-codes) — 0 success, 1 failure, 2 cancelled, 4 authentication required.
- [`gh` environment variables](https://cli.github.com/manual/gh_help_environment) — `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST`, `GH_CONFIG_DIR`, `GH_PROMPT_DISABLED`, `NO_COLOR`, `CLICOLOR`, `GH_DEBUG`.
- [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — 5,000/hour for a personal access token; 403 or 429 with `x-ratelimit-remaining: 0`.
- [Troubleshooting the REST API](https://docs.github.com/en/rest/overview/troubleshooting-the-rest-api) — *"GitHub uses a `404 Not Found` response instead of a `403 Forbidden` response to avoid confirming the existence of private repositories."*
- Repo code read for this note: `packages/core/src/harness/classify-movement.ts`, `promote-branch.ts`, `classify-fetch-failure.ts`, `read-harness-state.ts`, `harness-git.ts`, `packages/core/src/tools/tool-presence-port.ts`.
- Repo rules and decisions: `.claude/rules/architecture.md`, `.claude/rules/security.md`, ADR-0011, ADR-0014, ADR-0018, ADR-0019, ADR-0021.
