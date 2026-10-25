# Who else lets one person see and steer their agent skills

Read 2026-10-25. Asks whether a shipped product already answers the bet in
`docs/jobs.md`: see the whole setup and steer it, without per-repo handwork.
[827](827-competitor-journey.md) and [833](833-competitor-update.md) compare
analogues (GitHub, Vercel, Homebrew, Claude Code plugins) for single journeys.
This document covers direct competitors, which neither names.

Method: web search, the products' READMEs and official docs. No product was
installed or run. A claim marked *unverified* rests on a missing statement in
the source, not on a test.

## Findings

| Product | What it covers | What it lacks for the bet |
|---|---|---|
| [Skills Manager](https://github.com/xingkongliang/skills-manager) | Desktop app plus CLI, MIT, 6.8k stars. One central library (`~/.skills-manager`); Project Workspaces compare a project's skill folder with the library and sync either way; 56 tools; Git backup and multi-device sync; snapshots and `restore`; upstream update check on Git-sourced skills. | No team features and no publishing described. No release or pin per project described (*unverified*). |
| [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) | Anthropic's own. A Git repo with `.claude-plugin/marketplace.json` lists plugins; a git source pins to a `ref` or `sha`; an admin can [require a marketplace on every machine](https://code.claude.com/docs/en/plugins/org.md). [Thoughtworks Radar](https://www.thoughtworks.com/radar/tools/claude-code-plugin-marketplace) reports teams using it against version drift. | Claude Code only. Per-machine CLI and `/plugin` panel; no view of which version runs in which repo (*unverified*). |
| [`npx skills`](https://www.mintlify.com/vercel-labs/skills/installation) (Vercel) | CLI install and `update` of skills into `.claude/skills/` or `~/.claude/skills/`. | Pulls latest; no overview, no pin per target described. |
| [Tessl](https://docs.tessl.io/creating-skills-and-plugins/publish-and-update) | Registry with semver publishing; `tessl outdated` and `tessl update` on the consumer side; security scan on install. | CLI only; a hosted registry, not the team's own Git repo. |
| [Claude Code Dashboard](https://github.com/tommasinigiovanni/claude-code-dashboard), [claude-code-gui](https://github.com/markes76/claude-code-gui) | Desktop GUIs over `~/.claude` and project config: skills, MCP servers, hooks, global and project scope. | One machine's files; no versions, no central source, no cross-repo view. |
| [APM](https://cdn.jsdelivr.net/gh/microsoft/apm@main/README.md) | The engine Maestro drives (ADR-0001). | No UI or dashboard found in any source. The gap ADR-0001 names is still open. |

## Reading

- The solo overview is no longer unique. Skills Manager offers a central
  library, a per-project compare and 56 tools, without APM.
- Team distribution is covered for Claude Code by its own marketplace, with
  pinning and admin enforcement.
- Not found elsewhere: a per-Target view of the deployed release and whether
  it is behind, across repos and tools; and the contribute path in one place
  (import, propose a pull request, publish a release on the Harness).
- Gaps: no product was run, so screen details and Skills Manager's update
  behaviour are unverified. The APM roadmap board
  (`github.com/orgs/microsoft/projects/2304`) was not read.

## Candidate moves

Proposals only; none is decided.

1. **Name the competitor in the bet.** Add "why not Skills Manager?" beside
   the kill question in `docs/jobs.md`.
2. **Weight the team path.** Rank jobs that serve the per-Target view and the
   contribute path (#1287, #1420, #1641) above solo extras the competitors
   already ship.
3. **Read plugin marketplaces.** If teams standardise on Claude Code
   marketplaces, #1286 (*Steer a plugin as one unit*) gains weight. Touches
   ADR-0001 and ADR-0019; needs a decision.
4. **Prompts overlap.** #1588 and #1650 rebuild a prompt library the
   operator already keeps outside Maestro. Pick one home.
