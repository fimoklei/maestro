---
name: find-duplicate-abstractions
description: "Sweep the Maestro codebase for near-duplicate abstractions — two functions, hooks, types, schemas, adapters, or components that do the same job under different names or as drifted copies — and report merge candidates ranked by payoff. Report-only: it proposes merges, it never applies them. Use in the Maestro repo when the user asks, in any language, to find duplicated or redundant code or abstractions, spot copy-paste drift, or decide what to merge. Not for diff-only reuse review (that is /simplify) or over-engineering audits (that is /ponytail-audit)."
---

# Find duplicate abstractions

Find pairs (or clusters) of code that do **the same job** but live in two places —
under different names, or as a copy that has since drifted. Output a ranked
report of merge candidates. **This skill reports; it does not merge.** The
danger in any near-duplicate is the *difference*, so every candidate names what
differs before recommending a merge.

Detection is a pure LLM read of the source — no clone-detection tooling. That
means the sweep can only judge what it actually reads. Never claim the codebase
is clean; claim the part you read is clean and list what you skipped.

## What counts as a near-duplicate abstraction

Two units of code that a reader would say "these do the same thing":

- Two functions/hooks with the same job, different names (`fetchInventory` vs
  `getInventory`; `useDeployState` written twice).
- Two Zod schemas or TypeScript types describing the same shape.
- Copy-pasted logic that drifted — same skeleton, small edits.
- Two components rendering the same thing.
- Two adapters/ports with overlapping behavior.

Not a duplicate: two things that merely share a name or a few lines but serve
different jobs. Coincidental similarity is the main false positive — reject it.

## Steps

### 1. Map the source tree
Enumerate the code to sweep. Maestro's product code is three packages
(`architecture.md`): `packages/core` (domain), `packages/server` (transport),
`packages/web` (UI). Glob the source files:
```bash
git -C ~/Projects/maestro ls-files 'packages/**/*.ts' 'packages/**/*.tsx' | grep -v -E '\.(test|stories)\.'
```
Group the paths by concern — types, schemas, hooks, components, helpers/utils,
adapters/ports, HTTP routes. Duplicates cluster within a concern and across the
core↔server↔web boundary (a type copied into `web` instead of imported).
**Done when:** you have a grouped file list and a count of files to read.

### 2. Read and cluster
Read each group. For a large tree, dispatch **one** subagent per package
(standing consent covers a single wide read per package; never more than three).
Each reader returns candidate clusters, not prose: a list of
`{ abstraction, locations[], why-same, what-differs }`.

Read for real — open the files, don't grep-and-guess. A name match is a
hypothesis; confirm it by reading both bodies.
**Done when:** every group is read and each reader has returned its clusters.

### 3. Judge each cluster
Kill coincidental matches. For each surviving cluster, pin down:
- **why-same** — the shared job, in one line.
- **what-differs** — the exact delta (an extra arg, a different error path, a
  wider type). This is where a careless merge introduces a bug. If you cannot
  state the delta, you have not read closely enough — go back.
- **spread** — how many call-sites route through each copy.

Reject anything you are not confident is a real duplicate. A short honest list
beats a long noisy one.
**Done when:** every cluster is either confirmed with all three fields or dropped.

### 4. Write the report
Rank by payoff: confirmed duplication × spread × drift risk (drifted copies rank
above clean ones — drift means the two are already diverging silently). Write to
a file in the session scratchpad and print the summary table in chat. Do **not**
commit it or add it to `docs/` — it is a throwaway working report.

Use this structure:

```markdown
# Duplicate-abstraction report — <date>

## Coverage
Read: <packages/dirs, file count>. Skipped: <what and why — tests, stories,
generated, anything the sweep did not open>.

## Candidates (ranked)

### 1. <one-line name of the shared abstraction>
- **Same job:** <why these are the same>
- **Locations:** `path:line`, `path:line`
- **Differs:** <the exact delta — the merge risk>
- **Spread:** <N call-sites vs M>
- **Merge:** <which one wins, what the smallest safe merge looks like, or
  "hold — the delta is real behavior, not accidental">

### 2. ...
```

End with the honest line: what the sweep did **not** cover, so nobody reads the
report as "the whole codebase is deduped."
**Done when:** the file is written, the summary is in chat, and the coverage gap
is stated.

## Guardrails
- Report-only. Never edit, never merge — even if the merge looks trivial.
- Every candidate states its delta. A candidate without a named difference is
  not ready to report.
- Confidence over recall. Missing a real duplicate is cheaper than a confident
  false one that sends the user merging two things that only look alike.
