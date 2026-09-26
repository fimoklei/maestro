# 1146 — Code comment practice in agent-built repos

Measured 2026-09-25 against three trees:

- [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) at
  [`d01253d`](https://github.com/vercel-labs/agent-browser/tree/d01253d9db28d75080e36da3c1c31ef89454731e)
  (Rust CLI in `cli/`, TypeScript dashboard and sandbox in `packages/`).
- [openai/codex](https://github.com/openai/codex) at
  [`4b1c0c3`](https://github.com/openai/codex/tree/4b1c0c30dabd08fed7d6523844f9156d982eb297)
  (Rust in `codex-rs/`). Chosen because it is a large public repo
  whose `AGENTS.md` has explicit comment rules.
- Maestro at `78899e0f` (`packages/`).

## Method

A script counted non-blank lines and comment lines (`//`, `/*`, `*`) per
source file. It skipped `node_modules`, build output, fixtures, examples,
`.test.`/`.stories.` files and `.d.ts`. A second script grouped
consecutive comment lines into blocks and sorted each block by keyword:

- **pointer**: cites an ADR, a doc path, an issue number or a URL.
- **warning**: `never`, `must`, `do not`, `SAFETY`, `NOTE`.
- **why**: `because`, `so that`, `otherwise`, `since`.
- **what only**: none of these.

A block can match more than one kind. The sort is crude. Read the
percentages as proportions, not as exact counts. Rust tests sit inside the
source files (`mod tests`), so the Rust figures include some test comments.
The Maestro figures exclude test files.

## Comment density

| Tree | Files | Comment lines / non-blank lines | Median per file | Files with no comments |
|---|---|---|---|---|
| agent-browser `cli/` (Rust) | 81 | 4.8% | 3.6% | 7 |
| agent-browser `packages/` (TS) | 68 | 1.8% | 0% | 53 |
| codex `codex-rs/` (Rust) | 3615 | 3.8% | 2.8% | 641 |
| Maestro `packages/` (TS) | 319 | 15.1% | 16% | 2 |

| Tree | Blocks | Pointer | Warning | Why | What only | Doc-comment form |
|---|---|---|---|---|---|---|
| agent-browser `cli/` | 1851 | 2% | 13% | 11% | 77% | 36% |
| codex `codex-rs/` | 28727 | 1% | 7% | 4% | 90% | 52% |
| Maestro `packages/` | 2450 | 47% | 23% | 20% | 35% | 9% |

In the two external repos, most comments are `///` doc comments that say
what an item is. A few "why" and warning comments sit where a reader could
break something. Two examples from agent-browser:

- [`browser.rs` L111–114](https://github.com/vercel-labs/agent-browser/blob/d01253d9db28d75080e36da3c1c31ef89454731e/cli/src/native/browser.rs#L111-L114)
  explains why a 3-second timeout is the only discard signal, and cites #1528.
- [`chrome.rs` L848–856](https://github.com/vercel-labs/agent-browser/blob/d01253d9db28d75080e36da3c1c31ef89454731e/cli/src/native/cdp/chrome.rs#L848-L856)
  has a `NOTE: Do NOT use PR_SET_PDEATHSIG` warning with its cause and two
  issue numbers.

The agent-browser dashboard (React) is almost uncommented. Its largest
components, such as `viewport.tsx` (684 lines) and `session-tree.tsx`
(550 lines), have no comments at all.

In Maestro, about half of all comment blocks cite something. A typical block
([`deploy-skill.ts`](../../packages/core/src/deploy/deploy-skill.ts)
L50–52) states the behaviour, then points to `apm-behavior.md` and an ADR.

## Where the reasoning lives

**agent-browser.** The reasoning is in PR descriptions and GitHub issues.
There is no ADR folder and no design-doc folder (`docs/` holds only the
Next.js docs site). PR bodies are long and structured: behaviour, design and
validation. [#1777](https://github.com/vercel-labs/agent-browser/pull/1777)
has a 14-row table of what a new tab inherits and why.
[#1869](https://github.com/vercel-labs/agent-browser/pull/1869) lists the
commands that verified it. Squashed commit messages are mostly a title and a
PR number: 67–388 characters in the 15 most recent commits. Code comments
cite GitHub issue numbers (`#1528`, `issue #1113`), and 11 of 81 Rust files
do so. Every citation points to a public issue.

**codex.** The reasoning is also in PRs. The median PR body is 768 characters
(20 most recent merged), under a `## What changed` heading, and squash
commits carry the body (median 755 characters). There is no ADR folder.
Comments that cite something mostly cite external specs and upstream source
lines by URL. Only 88 of 3615 files cite anything. One
[module header](https://github.com/openai/codex/blob/4b1c0c30dabd08fed7d6523844f9156d982eb297/codex-rs/tui/src/streaming/chunking.rs#L73-L77)
points to three `docs/tui-stream-chunking-*.md` files that do not exist in
the tree. That is a dangling pointer.

**Maestro.** The reasoning lives in all of these places: 33 ADRs in
`docs/adr/`, 36 research notes in `docs/research/`, `docs/apm-behavior.md`,
`LEARNINGS.md`, commit bodies (median 702 characters over the last 50
non-merge commits) and PR bodies (median 997 characters over the last 20
merged PRs). Comments point at the documents instead of repeating them.

## Do comments cite documents, and are those documents public?

| Tree | What comments cite | Public? |
|---|---|---|
| agent-browser | GitHub issue numbers | Yes, public issues |
| codex | External spec URLs, upstream source lines, a few repo docs | Yes. One pointer is dangling |
| Maestro | ADRs (153 source files, test files excluded), issue numbers (219 files), research notes, `apm-behavior.md`, `LEARNINGS.md`, spec story IDs such as `(J07)` | No. The repo is private, so the ADRs and issues are private too |

Every ADR number Maestro cites exists in `docs/adr/` (27 distinct numbers).
Every `docs/research/*.md` path cited in code exists. Counted over all `.ts`
and `.tsx` files in `packages/`, `scripts/` and `tests/`, 255 files cite an
ADR and 76 cite `docs/research`, `apm-behavior.md`, `LEARNINGS.md` or
`CONTEXT.md`. The ticket says 259 and 81, probably because it counted more
file types.

## Agent rule files on comments

- **agent-browser** [`AGENTS.md`](https://github.com/vercel-labs/agent-browser/blob/d01253d9db28d75080e36da3c1c31ef89454731e/AGENTS.md#L19-L28)
  says one thing about comments. When a user-facing feature changes, the
  agent updates "inline doc comments in the relevant source files" together
  with the help text, README, skill and docs site. It gives no rule for
  what a comment should say or how long it may be.
  `examples/eve/CLAUDE.md` only imports `AGENTS.md`. There is no
  contributing guide.
- **codex** [`AGENTS.md`](https://github.com/openai/codex/blob/4b1c0c30dabd08fed7d6523844f9156d982eb297/AGENTS.md#L15-L22)
  has two comment rules. The first is a lint-enforced `/*param_name*/`
  comment before an opaque positional literal (`argument_comment_lint`). The
  second: a new trait gets a doc comment that explains its role. There is no
  rule about why-comments or pointers.
  [`docs/contributing.md`](https://github.com/openai/codex/blob/4b1c0c30dabd08fed7d6523844f9156d982eb297/docs/contributing.md#L7)
  says the project does not accept external code contributions.
- **Maestro** Comment rules come from the operator's global
  `code-standards.md`, not from the repo. They set a three-line ceiling, say
  where reasoning lives (comment, ADR or commit) and ask for a one-line
  pointer to an ADR. `AGENTS.md` and `.claude/rules/` say nothing about
  comments.

## What this means for the decision

- Maestro comments about three to four times as densely as either external
  repo. About half of its blocks are pointers. In the external repos,
  pointers are 1–2% of blocks.
- Neither external repo keeps ADRs. Their durable reasoning is in PR bodies
  and issues, and comments cite issue numbers or external URLs.
- Once Maestro goes public, its pointers can resolve for outside readers. The
  ADRs and research notes are in the repo, and every cited one exists today.
  Issue numbers and `(Jnn)` story IDs resolve only if the tracker is public
  too.
- A rule file for agents does not have to say much about comments. The two
  external repos show that a small codebase-specific rule can work, such as
  codex's lint-backed parameter comments. Neither repo writes down a
  pointer or ceiling policy.
- Pointers can rot. codex has a dangling doc pointer. Maestro has none today,
  but nothing checks this mechanically.
