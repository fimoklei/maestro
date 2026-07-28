# 427 — Proposed rewrite of the comment rule

Status: **awaiting Michiel's decision.** Nothing in `~/.claude/rules/code-standards.md`,
`AGENTS.md` or `.claude/rules/` is edited by this ticket.

## The problem in one line

The current § Comments rules ask for reasoning but never say where it stops, so
every session adds another paragraph and none removes one.

## Proposed replacement — paste-ready

Replace the whole `## Comments` section of `~/.claude/rules/code-standards.md`
with:

```markdown
## Comments

- Self-documenting first. A comment earns its place only when the code cannot
  say it: a non-obvious constraint, a deliberate corner, a trap for the next
  reader.
- **Ceiling: three lines.** Longer reasoning does not belong at the call site.
  Write the ADR and leave a one-line pointer (`// see ADR-0011`).
- Where reasoning lives:
  - **Comment** — what a reader must know *at this line* to not break it.
  - **ADR** — why the design is this way, and what was rejected. Durable.
  - **Commit message** — why this change happened now. Historical.
- Never restate an ADR in a comment. Link it.
- File headers: only when the file's name and exports do not already say what
  it is for. One line, no exceptions.
- A comment asserting external behaviour — a CLI's output, an API's response, a
  library's quirk — cites its source in the fewest words that make it
  re-checkable: version, issue number, or rules file.
- Never comment: obvious code, change history, commented-out code, TODO without
  a linked issue.
- Deferred work is traceable or absent. "a separate ticket", "a later slice",
  "a follow-up PR" name nothing — either link the issue or drop the sentence.
```

## The choices made

**Ceiling: three lines.** A number is the only thing that stops regrowth; a
principle does not. Three lines fits a constraint plus a citation and does not
fit an argument.

**File headers: narrowed, not dropped.** Dropped, a genuinely opaque file loses
its only signpost. Kept as-is, every file opens with prose whether or not it
needs it. The narrowing makes the header conditional and caps it at one line.

**Citations: kept, shortened.** Verifiability is worth the words. The old rule's
own trailing sentence ("Without a source it cannot be re-verified, so it rots
into a confident lie…") is rationale inside a rules file, which the existing
"rules instruct, never explain" principle already forbids. Cut.

**New rule — never restate an ADR.** This is the missing brake. The old rules
made citing an ADR optional and re-arguing it free, so comments kept absorbing
ADR content.

## Worked example

`packages/core/src/deploy/reclaim-untargeted-copies.ts` today: 40 lines of
comment over 25 lines of code, opening with a 15-line header that re-argues
ADR-0011 and ADR-0013.

Under the proposed rules the header becomes:

```ts
// One owner for clearing global copies apm left for a tool this machine does
// not have — the rule cannot drift between the deploy and remove callers.
// See ADR-0011, ADR-0013, #136, #339.
```

The two per-function headers collapse to their non-obvious half (`detected` is
undefined on the per-repo path; the reclaim is best-effort by design). The
measurement that justifies both already lives in
`docs/apm-behavior.md § "Narrowed targets"` and does not need repeating here.

## Follow-up if accepted

Trimming existing comments is a separate job — the rules change first, or the
next session refills what was trimmed.
