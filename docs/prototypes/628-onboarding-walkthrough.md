# PROTOTYPE — The onboarding walkthrough a teammate follows

Throwaway draft for [The onboarding walkthrough a teammate follows](https://github.com/fimoklei/maestro/issues/628).
Its purpose is to expose missing decisions, not to become product documentation.

## Hypothesis to test

Do not hand a teammate a long Maestro manual. Hand them a short team invite
containing only the values Maestro cannot know. Put each durable instruction at
the moment it is needed:

| Instruction | Proposed home |
|---|---|
| Which Maestro release to use and which team Harness URL to paste | Team invite |
| Machine and access requirements | Maestro bootstrap check, then the connect gate |
| What is in this Harness and what may be promoted | Harness `README.md` and `CONTRIBUTING.md` |
| How to connect, register a repo, deploy, promote, and release | The relevant cockpit screen |
| How to install or update Maestro itself | Maestro `README.md`, kept to two commands |

The invite should be disposable. The product and the two repositories must
remain sufficient after the teammate closes it.

**Accepted — 2026-08-31.** Onboarding uses this distributed model. There will
be no durable walkthrough that duplicates the route end to end.

## The things handed to teammates

There are two invite variants. Each contains only one connect-gate outcome;
after that, both roles follow the same deploy and authoring path.

### Founder invite

> You have access to Maestro and the empty repository that will become our
> team's Harness.
>
> 1. Install Maestro release `<tag>` from `<Maestro repository URL>` and run
>    `<bootstrap command>`.
> 2. On **Connect central inventory**, paste `<empty Harness repository URL>`
>    and choose **Scaffold the Harness**.
> 3. Continue to **Harness**.

### Follower invite

> You have access to Maestro and our team's Harness.
>
> 1. Install Maestro release `<tag>` from `<Maestro repository URL>` and run
>    `<bootstrap command>`.
> 2. On **Connect central inventory**, paste `<team Harness URL>`.
> 3. Continue to **Inventory** and deploy `<starter skill>` to `<starter repo>`.
>
> You are done when Maestro reports `deployed` and `in sync` for that repo.

**Accepted — 2026-08-31.** A single invite never asks a follower to reason
about the founder's one-time scaffold decision.

This is intentionally short. Today, its first line cannot be filled in: Maestro
has neither a release tag intended for teammates nor the decided bootstrap
script. Both are already jobs on the Maestro board.

## The path the cockpit must carry

### 0. Before Maestro opens

The teammate already has:

- access to the private Maestro repository;
- Git credentials that can clone the Maestro and Harness repositories and push
  a `maestro/<skill>` branch to the Harness;
- Node 24 or newer and pnpm;
- the `apm` executable and credentials that let APM read the private Harness;
- Claude Code or Codex if they want to use the deployed skill;
- one local Git repository to use as the first consuming repo.

The bootstrap blocks until Node 24 or newer, pnpm, and Maestro's supported APM
version are present. It installs nothing; each refusal gives the exact command
or official installation link. A missing Claude Code or Codex installation is
a warning, not a blocker. Cloning Maestro has already proved that Git exists;
the connect gate owns the first honest check of access to the concrete private
Harness.

**Accepted — 2026-08-31.** This expands the existing bootstrap job, which
currently names only Node and pnpm.

### 1. First sight: the connect gate

The first screen says **Central inventory not connected**. The teammate presses
**Connect inventory →** and reaches **Connect central inventory**.

The screen already says that a private Harness requires the teammate's own Git
and APM access. The teammate pastes the team's Harness URL. Maestro clones it,
then confirms **Harness joined** and shows the local clone path.

This is the first useful success: the teammate can see the team's released
skills in **Inventory** without learning the Harness's filesystem shape.

Founder-only fork: the first teammate starts with an empty GitHub repository.
The same gate offers **Scaffold the Harness**, then lands on **Harness**. This is
not part of every follower's walkthrough.

### 2. First product success: deploy one released skill

The teammate selects **+ repo**, chooses the first consuming repo, and registers
it. Registration writes nothing. In **Inventory**, they open the agreed starter
skill, choose that repo, and press **deploy →**.

Success reads **deployed** and then **in sync · `<tag>`**. At that point the
skill is available to the supported coding agents in that repo.

The starter skill is not settled. Picking one is a team onboarding choice, not
a Maestro product decision, but the invite needs a concrete name.

**Accepted — 2026-08-31.** Connecting is a setup confirmation. Deploying the
starter skill to a real consuming repo, ending at **in sync**, is the first
product success.

### 3. First authoring success: promote one change

The teammate opens the local Harness clone shown by Maestro and reads its
`CONTRIBUTING.md`.

For an existing skill, they edit `.apm/skills/<name>` in the Harness clone and
try it from that repo through the committed `.claude/skills` symlink. For a new
skill, the current rule says to write and try it in `~/.claude/skills/`, then
import it. That path is currently blocked in practice by the path-shaped
deployed-copy guard; a neutral staging copy is the only workaround.

**Accepted — 2026-08-31.** The onboarding change modifies an existing skill.
Creating and importing a new skill is a separate path and does not block this
walkthrough.

Back in **Harness**, the change appears under **Pending promotion**. They press
**promote**, then follow **pull request →** to GitHub. Maestro stops there. The
teammate opens the pull request and gets it merged on GitHub.

After **refresh**, the change appears under **Pending release**. A person with
release authority presses **release** and publishes the proposed tag. During
the onboarding run, that person is the teammate: their Harness access must
permit the tag push.

**Accepted — 2026-08-31.** No separate release owner enters the walkthrough.
Future team governance remains outside this map.

### 4. Close the loop: deploy the promoted change

Today this step dead-ends. Maestro's Harness clone remains behind after the pull
request is merged. A deploy of the newly released skill fails with **local copy
diverged from its tag**, although the teammate did not create that divergence.

The measured workaround is:

```sh
git -C <Harness clone path> pull
```

The same deploy then succeeds. This workaround is not acceptable as the final
onboarding path: it contradicts the destination that a teammate can walk alone,
and Maestro does not name it. The open job
[Promote leaves the harness clone behind, so nothing you just released can be deployed](https://github.com/fimoklei/maestro/issues/666)
blocks onboarding. The workaround remains diagnostic evidence in this
prototype; it does not enter the teammate path.

**Accepted — 2026-08-31.** The walkthrough cannot be called walkable until the
post-merge clone state is fixed.

## Dead ends exposed by the draft

1. **Installation cannot be written yet.** No teammate release or bootstrap
   command exists.
2. **The bootstrap job is incomplete.** It names Node and pnpm but must also
   verify Maestro's supported APM version and warn when no supported coding
   agent is installed.
3. **The first deployed skill is unspecified.** The team invite needs one
   concrete, low-risk success.
4. **The new-skill authoring instruction is currently false in practice.** The
   Harness guide points at a path Maestro refuses to import.
5. **The post-merge clone state breaks the final deploy.** The cockpit reports
   the wrong condition and gives no recovery.
6. **The onboarding account needs release access.** The teammate publishes the
   release during this run; Maestro adds no separate release role.
7. **The Maestro README contradicts the current model.** It still names
   `agent-harness` as the central inventory although that repository is now a
   fixture and each team starts its own Harness. Correcting it belongs to the
   existing install-and-bootstrap job, because that job makes the README the
   two-command install owner.

## Resolution candidate

- No durable end-to-end manual: two disposable team-invite variants supply the
  release, start command, Harness URL, starter skill, and starter repo.
- Bootstrap blocks on Node 24+, pnpm, and Maestro's supported APM version;
  missing Claude Code or Codex is only a warning; Harness access is checked by
  the connect gate.
- The first product success is one released starter skill deployed to a real
  consuming repo and shown **in sync**.
- The first authoring success is a small change to an existing Harness skill,
  tried from the Working harness, promoted, merged, released by the teammate,
  and deployed again.
- [Promote leaves the harness clone behind, so nothing you just released can be deployed](https://github.com/fimoklei/maestro/issues/666)
  blocks that final route. The manual `git pull` remains evidence, never an
  onboarding step.
