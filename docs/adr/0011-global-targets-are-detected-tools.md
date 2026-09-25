# ADR-0011 — Global targets are the tools you actually have

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

A global deploy is meant to make a primitive available across all of a user's
work in their AI coding tools. Until now the cockpit modelled "Global" as a
single opaque target and every global deploy ran `apm install -g -t
claude,codex` — **always both tools**, per the earlier decision recorded in
`CONTEXT.md` ("every deploy targets both Claude Code and Codex; no per-tool
choice", roadmap 01.2).

Two problems surfaced in dogfood (issue #111):

1. **The label teaches nothing.** The deploy-state view shows one card literally
   titled "Global" (the word repeated: `GLOBAL Global`), and the deploy picker
   offers a bare "Global" option. A user cannot tell that "Global" means
   *user-level Claude Code and Codex, available across every project*. The
   concept — not the file path — is what is missing.

2. **"Always both" leaves junk for single-tool users.** Not everyone runs both
   tools: the owner has Claude Code and Codex, a colleague has only Claude Code.
   `-t claude,codex` on a Claude-only machine still writes a `.agents/skills/`
   directory that no tool reads — dead files the user never asked for. This is
   wrong behaviour, not just confusing UI.

The exact apm mechanics for scoping to only-installed tools, and how Maestro
should detect tool presence, are **not yet observed** — a spike gates the
implementation (issue tracked separately, blocks #111). This ADR records the
*decision*; the spike proves the *how*.

## Decision

**"Global" is not one target. It is the set of user-level tools the user
actually has, detected live.** This reverses "every global deploy targets both
tools".

- **Presence, not choice.** Maestro detects which supported tools (Claude Code,
  Codex) are present and deploys globally only to those. The user does not pick
  tools per deploy; the machine already knows. A Claude-only machine gets no
  `.agents` directory.
- **Live detection, not stored.** Presence is read fresh whenever Maestro needs
  the global targets (deploy-state read, deploy picker), not captured once at
  onboarding. Installing a second tool later makes it appear on the next read;
  there is no stale stored list. Detection is a filesystem-cheap check, not a
  setting the user can override.
- **Deploy-state shows one card per detected tool.** The opaque "Global" card is
  replaced by a "GLOBAL TARGETS" section with a card per present tool
  (`Claude Code`, `Codex`), each with its own deployed set and drift, read from
  apm's lockfile (`deployed_files` counted per tool root). Per-tool counts are
  now truthful, not a fiction — a skill can genuinely exist in one tool and not
  the other.
- **The deploy picker keeps one "Global" option** that targets the detected set,
  labelled with those tools (e.g. "Global (Claude Code + Codex)", or
  "Global (Claude Code)" on a single-tool machine) so the effect is visible at
  deploy time. No per-tool sub-options.
- **The tool name is the message; the path is secondary.** Each card names its
  tool (the effect: "available in Claude Code"); the concrete destination path
  (the skills folder under `~/.claude`) is a secondary detail on the card, not the headline.
- **No supported tool detected → no global target.** The section shows a hint to
  install a tool and the global deploy option is disabled; Maestro never writes
  files for a tool that is not there.
- **Newly-installed tools are not back-filled.** If Codex is installed after
  skills were deployed to Claude Code, its card appears empty ("nothing deployed
  here") until the user deploys again. Maestro shows the gap honestly but does
  not auto-mirror. Closing that gap is a future job ("Backfill a newly-detected
  global tool", job map, Job B).
- **The sandbox is a harness concern, not product UI.** `pnpm smoke` redirects
  `HOME`, so a "global" deploy lands in the sandbox home. That distinction stays
  in the terminal (`[smoke] HOME=…`, ADR-0010); the cockpit does not grow a
  mode indicator for a dev-only rehearsal.

## Consequences

- Reverses roadmap 01.2's "always both tools". `CONTEXT.md`'s *Global deploy* /
  *Global target* definitions and its "Resolved" note on tool targeting are
  updated to match.
- Implementation is **blocked by the detection spike**: apm's behaviour when a
  tool is absent, and Maestro's presence-detection mechanism, must be measured
  before code — no guessing in the driver.
- Single-tool users stop getting dead directories; the fix is the strongest
  reason for the change, independent of the UI clarity win.
- Per-tool visibility can now show scheefstand between tools (Claude has a skill,
  Codex does not). MVP1 only surfaces it; remediation is the future backfill job.

## Amendment (2026-07-20, issue #202) — dead wood needs an exclusive directory

This ADR's second problem ("always both leaves junk") assumed that an untargeted
tool's deployed copy is unread. That holds only where the tool is the **sole
reader** of its skills directory.

It does not. Measured against apm 0.26.0's own target table
(`apm_cli/integration/targets.py`): ten apm
targets deploy skills under `.agents` — `copilot`, `cursor`, `opencode`,
`gemini`, `codex`, `windsurf`, `antigravity`, `agent-skills`, `openclaw`,
`hermes`. Only `claude` and `kiro` deploy skills elsewhere. So "Codex is not
detected" says one of ten possible readers is absent — not that the tree is
dead. On a machine with Cursor and without Codex, the reconciliation this ADR
motivated would delete skills Cursor reads.

Amended:

- **Removal requires exclusivity, not just absence.** A narrowed global deploy
  removes an untargeted tool's copy only where that tool owns the directory
  outright. Claude Code's skills directory under `~/.claude` qualifies; `.agents/skills/` does not, and its copy
  is retained unconditionally.
- **Exclusivity is declared per tool**, next to the tool definitions, so adding a
  tool cannot silently reintroduce the assumption.

Unchanged: presence still drives the install target (`-t`), so a Claude-only
machine still never *writes* a new `.agents` tree. Only the removal half narrows.

**Accepted cost.** A genuinely dead `.agents/skills/<name>` tree now survives on
a Claude-Code-only machine. The two errors are not symmetric: a stale directory
costs disk, a wrong removal costs another tool its skills. The retained tree
stays inert for the reader — the guard scoping already keeps an untargeted tool's
recorded hashes out of the destination guard's comparison, so no false drift
appears.

**Rejected here:** content-hash provenance (apm's own `integration/cleanup.py`
model) answers *who wrote the content*, not *who reads the directory* — when
another tool installed the same skill from the same tag, the bytes match and the
gate passes; and apm 0.25.0's `deployments:` block, which could name every target
claiming a path but is unmeasured, so driving it is barred until spiked.

## Rejected alternatives

- **Model A — one deploy unit mirrored to both tools.** Simpler, matches apm's
  two-`deployed_files` shape, but keeps writing dead `.agents` directories for
  Claude-only users and does not honour "not everyone has both". Rejected because
  it does not fix the real defect.
- **Manual per-tool choice (Claude-only / Codex-only / both toggle).** Gives
  control no one asked for in MVP1, adds a per-deploy control surface, and
  contradicts "presence, not choice". Deferred as a governance luxury (YAGNI).
- **Store detected tools at onboarding.** Introduces exactly the staleness the
  colleague scenario must avoid: install Codex later, and Maestro keeps thinking
  you only have Claude. Live detection has no such failure mode.
- **App-wide sandbox mode indicator in product UI.** Builds product surface for a
  dev-only harness situation; the terminal signal already covers it (KISS).
