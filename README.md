# Maestro

**See and steer your AI agent setup from one screen.**

Your agents (Claude Code, Codex and others) read skills from folders on your
machine, some per project, some global. Maestro shows what you have, where
each copy runs, and which copies are behind. From the same screen you deploy,
update and publish.

[APM](https://microsoft.github.io/apm/), the package manager for agent skills,
does the installing, pinning and tracking. Maestro reads APM's lockfiles and
runs its commands; it reimplements nothing
([ADR-0001](docs/adr/0001-apm-is-the-engine-maestro-is-the-cockpit.md)).

## Three words you will meet

- **Harness** — the git repository on GitHub that holds every skill your team
  shares. Each release is a git tag. Maestro reads from it and publishes to it.
- **Target** — a place a skill is deployed to: a project you registered, or the
  global folder a tool reads on your machine.
- **Deploy** — copy one skill, at one tagged version, into one target. APM does
  the copying; Maestro tells it what to copy.

## Install

Maestro needs APM. Install APM first.

**1. Install APM**

```sh
curl -sSL https://aka.ms/apm-unix | sh
apm --version
```

If the second line prints no version, stop and fix that first. Windows and
other options are in the [APM docs](https://microsoft.github.io/apm/).

**2. Have these ready**

- git and a terminal.
- [Node](https://nodejs.org/) 24 or newer, then `corepack enable` once for
  `pnpm`.
- A GitHub account that can read the Harness. Run `gh auth login` so git
  fetches without prompting.

**3. Install and start Maestro**

```sh
git clone https://github.com/fimoklei/maestro.git
cd maestro
pnpm install
pnpm dev
```

`pnpm dev` prints the cockpit's address. Open it in your browser.

## Your first harness

The cockpit opens on **Inventory not connected** and asks for a Harness.
Give it one of these:

- **The URL of an empty GitHub repository you created.** Maestro scaffolds it
  into a Harness: the folder layout, a `README.md` and a `CONTRIBUTING.md`.
  One person per team does this once.
- **The URL or local clone of a Harness that already exists.** Everyone else
  on the team does this.

From there the cockpit guides you. The Harness view shows what the Harness
holds and what waits for a release. Inventory shows what you can deploy. Each
target's page shows what it holds and which copies are behind.

## Daily use

- **Deploy a skill** from Inventory to a project or to your global folder.
- **Update a target** when the Harness moves ahead of it.
- **Import a skill** you wrote in `~/.claude/skills/` into the Harness, then
  **propose the change**. That opens a pull request on the Harness. The
  curator merges it; you **publish a release**, which cuts a new tag. The
  Harness's `CONTRIBUTING.md` says what may enter it.

## For contributors to Maestro itself

Read in this order:

1. [`CONTEXT.md`](CONTEXT.md) — glossary
2. [`docs/brief.md`](docs/brief.md) — why Maestro exists
3. [`docs/jobs.md`](docs/jobs.md) — the board: now, next, later, done
4. [`docs/operating-model.md`](docs/operating-model.md) — how the product is run
5. [`docs/adr/`](docs/adr/) — binding decisions

`pnpm verify` runs lint, typecheck and tests. `pnpm smoke` starts the cockpit
against a sandbox that never touches your real setup.

> **Status:** the cockpit works for skills. Hooks and MCP servers are on
> [the board](docs/jobs.md).
