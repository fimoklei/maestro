# What guardrails a public GitHub Free repo can switch on in 2026 (issue #1136)

Read 2026-09-25 against GitHub's current documentation (docs.github.com) and
changelog (github.blog/changelog). GitHub's plans and defaults change; re-check
before relying on this past 2027.

## Verdict

A **public** repository on GitHub Free gets real, first-party guardrails that a
**private** Free repo does not: repository rulesets (require PR, require status
checks, block force-push, block deletion), secret scanning with push
protection, Dependabot alerts, and private vulnerability reporting — all free,
no GitHub Advanced Security purchase needed, because GHAS features are free by
default on every public repository.

**There is no setting to stop a non-collaborator from opening a pull request
on a public repo.** GitHub docs describe no such control. Public means open to
PRs from any GitHub user by design — that is the point of a public repo. The
closest documented levers are indirect and only shrink the blast radius, they
never block the *open*:
- **Interaction limits** (`collaborators_only`) — blocks non-collaborators from
  opening issues/PRs, commenting, etc., but only for a bounded window (max 6
  months), not permanently.
- **Per-user open-PR cap** — caps how many *open* PRs a non-collaborator can
  have at once; doesn't stop the first one.
- **Fork-PR workflow-run approval** — stops a stranger's PR from *running CI/
  Actions* unapproved; doesn't stop the PR from existing.
- **Required reviews via ruleset + CODEOWNERS** — stops a stranger's PR from
  *merging* unreviewed; doesn't stop it from being opened.

So: opening is always possible; only running workflows and merging can be
gated.

The owner **can** bypass a ruleset they created (bypass list, default: repo
admins) — GitHub does not tell you whether you should; that's a team-policy
call, not something the docs prescribe.

## 1. Repository rulesets on `main`

Rulesets are the modern replacement for classic branch protection rules.

- **Plan availability:** *"Rulesets are available in public repositories with
  GitHub Free and GitHub Free for organizations, and in public and private
  repositories with GitHub Pro, GitHub Team, and GitHub Enterprise Cloud."*
  ([About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets))
  Confirms the issue's premise: on Free, rulesets work on **public** repos
  only; a private Free repo cannot use them (matches the existing learning
  "No server-side branch protection" for Maestro-as-private-repo-today).
- **Require a pull request before merging:** *"You can require that all
  changes to the target branch be associated with a pull request."*
  ([Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets))
  Sub-options include required approval count, dismiss-stale-approvals,
  require review from CODEOWNERS, require conversation resolution.
- **Require status checks to pass:** *"Required status checks ensure that all
  required CI tests are passing before collaborators can make changes to a
  branch."* (same page) You name the exact check by its job/context name (e.g.
  the job name inside `ci.yml`) when adding it as a required status check in
  the ruleset UI/API — the docs don't special-case workflow file names, a
  required check is identified by the check-run name GitHub receives from
  Actions.
- **Restrict force pushes:** *"You can prevent users from force pushing to the
  targeted branches or tags."* (same page)
- **Restrict deletions:** *"Only users with bypass permissions can delete
  branches or tags whose name matches the pattern you specify."* (same page)

Enable at: **Settings → Rules → Rulesets → New ruleset → New branch ruleset**,
target `main`, toggle the four rules above, save.

## 2. Bypass

*"When you create a ruleset, you can allow certain users to bypass the rules
in the ruleset. This can be users with certain roles, specific teams, or
GitHub Apps."* ([Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets))

So yes — the repository owner/admin can add "Repository admin" (or
themselves) to the bypass list, and can merge past every rule in the ruleset.
This is opt-in per ruleset, not automatic: an empty bypass list means nobody
bypasses, including the owner. GitHub's docs describe the mechanism but state
no recommendation on whether an owner *should* bypass their own ruleset — that
is left to the reader. For a solo-maintainer repo this is a real trade-off
Maestro's own team has already made explicitly (LEARNINGS.md: "No
server-side branch protection... the team's own workflow skills are the only
gate") — a public-repo ruleset with an empty bypass list is the first point
where that stops being true and something server-side actually blocks a
merge, including the owner's own.

## 3. Restricting PRs from non-collaborators

**No such setting exists.** Searched docs.github.com for "who can open pull
requests", "restrict pull requests from forks", "disable pull requests from
non-collaborators" — nothing. A public repository is, by GitHub's design,
open to a pull request from any account. The only per-branch push
restriction (**"Restrict updates"** in rulesets, the successor to classic
branch protection's **"Restrict who can push to matching branches"**) governs
direct pushes to the branch by people with write access — it says nothing
about opening a PR from a fork, which any user can always do regardless of
write access.

Documented fallbacks, each partial:

1. **Temporary interaction limits** — *"You can temporarily enforce a period
   of limited activity for certain users on a public repository."* Choose
   **Limit to collaborators only**, for a bounded duration (24h / 3 days /
   1 week / 1 month / 6 months) — after that it lapses and reverts to open.
   ([Limiting interactions in your repository](https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository))
   Settings → Moderation options → Interaction limits.
2. **Maximum open pull requests for a user without write access** — caps
   concurrent PRs from any one non-collaborator; documented on the same page.
   It throttles volume, it doesn't block the first PR.
3. **Require approval to run workflows** (§7 below) — stops Actions/CI from
   running on a stranger's PR without a maintainer's explicit approval.
4. **CODEOWNERS + required reviews via a ruleset** — stops a stranger's PR
   from being *merged* without review; it can still be opened, discussed, and
   left open indefinitely.

Honest summary for the issue: there is no server-side "no PRs from strangers"
switch on a public repo. The workflow-approval gate plus required reviews is
the closest thing GitHub documents, and it protects CI/secrets and the merge
gate, not the open action itself.

## 4. Secret scanning, push protection, Dependabot alerts, private vulnerability reporting

- **Secret scanning** — *"Secret scanning runs automatically for free"* on
  public repositories (no GHAS purchase required).
  ([About secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning))
- **Push protection** — *"secret scanning's push protection feature is now
  generally available for all free public repositories on GitHub.com... users
  can enable push protection for any public repository on GitHub.com from
  their repository's 'Code security and analysis' settings."*
  ([Push protection GA changelog, 2023-05-09](https://github.blog/changelog/2023-05-09-secret-scannings-push-protection-is-available-on-public-repositories-for-free/))
  Later widened further: *"on February 27, 2024, this feature began being
  enabled automatically for all free accounts across GitHub"* at the
  user/account level, independent of per-repo settings.
  ([Push protection auto-enable, 2024-02-14](https://github.blog/changelog/2024-02-14-secret-scannings-push-protection-will-soon-be-enabled-for-all-free-accounts-on-github/))
  Enable/verify: **Settings → Code security → Secret scanning → Push
  protection**.
- **Dependabot alerts** — included in GitHub Free for both public and private
  repos: *"Dependabot alerts and dependency graph are included in all
  plans."* Enable: **Settings → Code security → Dependabot alerts →
  Enable**, or bulk-enable per-org/personal account.
  ([About Dependabot alerts](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts))
- **Private vulnerability reporting** — *"owners and administrators of public
  repositories can enable private vulnerability reporting on their
  repositories"*, giving researchers a structured, private disclosure form
  instead of public issues/social media. Free for public repos. Enable:
  **Settings → Code security → Private vulnerability reporting → Enable**.
  ([Configuring private vulnerability reporting for a repository](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository))

## 5. Actions settings for a public repo

- **Fork PR workflow-run approval** — under **Settings → Actions → General
  → Fork pull request workflows from outside collaborators (a.k.a. "Approval
  for running fork pull request workflows from contributors")**, choose one
  of the documented policies: *require approval for first-time contributors
  who are new to GitHub*, *require approval for first-time contributors*
  (anyone without a prior merged contribution), *require approval for all
  outside collaborators*, or approve automatically. Maintainers with write
  access approve a held run from the PR's **Checks** tab.
  ([Approving workflow runs from forks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks))
  Caveat found live: the "first-time contributor" bar is low — one merged
  typo-fix PR clears it permanently for that user.
- **`GITHUB_TOKEN` default permissions** — **Settings → Actions → General →
  Workflow permissions**, choose **Read repository contents permission** (the
  restrictive default) or **Read and write permissions**. Individual
  workflows can still request more via the `permissions:` key.
  ([Automatic token authentication](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication))
  GitHub changed the *new-repository* default from read/write to read-only:
  *"Previously, GitHub Actions gets a GITHUB_TOKEN with both read/write
  permissions by default whenever Actions is enabled on a repository"* — the
  new default is read-only, applying to newly created organizations/repos
  going forward, **with no impact on existing enterprises, organizations, or
  repositories** — i.e. an existing repo keeps whatever it already had unless
  someone changes the setting by hand.
  ([GITHUB_TOKEN default permissions changelog, 2023-02-02](https://github.blog/changelog/2023-02-02-github-actions-updating-the-default-github_token-permissions-to-read-only/))
  For a fork PR specifically: when the "send write tokens to workflows from
  pull requests" option is off (the default), a forked PR's `GITHUB_TOKEN` is
  forced to read-only regardless of the repo-level default — except
  `pull_request_target`, which always gets read/write even from a public
  fork, which is exactly why that event needs care.

## Checklist

Rulesets (`Settings → Rules → Rulesets`, target `main`):
- [ ] Require a pull request before merging (add required approvals, CODEOWNERS review, conversation resolution as wanted)
- [ ] Require status checks to pass — name the `ci.yml` job(s) as required checks
- [ ] Restrict force pushes
- [ ] Restrict deletions
- [ ] Bypass list reviewed deliberately (empty = nobody bypasses, including the owner; add "Repository admin" only if you want that)

Non-collaborator PRs (no single switch — layer these):
- [ ] Accept that opening a PR cannot be blocked on a public repo
- [ ] Set interaction limit to "Collaborators only" if a temporary lockdown is needed (`Settings → Moderation options → Interaction limits`)
- [ ] Set a max-open-PR cap for users without write access, if volume is a concern
- [ ] Require reviews (ruleset, §1) so a stranger's PR can't merge unreviewed
- [ ] Add `CODEOWNERS` for reviewer routing

Code security (`Settings → Code security`):
- [ ] Secret scanning — on by default for public repos, verify it's enabled
- [ ] Push protection — enable under Secret scanning
- [ ] Dependabot alerts — enable
- [ ] Private vulnerability reporting — enable

Actions (`Settings → Actions → General`):
- [ ] Fork pull request workflow-run approval — set to "Require approval for first-time contributors" at minimum
- [ ] Workflow permissions — set `GITHUB_TOKEN` default to read-only; grant write per-workflow via `permissions:` only where needed
- [ ] Confirm "Send write tokens to workflows from pull requests" stays off

## Sources

- [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) — plan matrix: rulesets on Free apply to public repos only.
- [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) — PR-required, status checks, force-push restriction, deletion restriction, bypass-permission mechanics.
- [Limiting interactions in your repository](https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository) — interaction limits (`collaborators_only`), duration options, max open PRs for non-collaborators.
- [About secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning) — secret scanning free on public repos.
- [Secret scanning's push protection is available on public repositories, for free (changelog, 2023-05-09)](https://github.blog/changelog/2023-05-09-secret-scannings-push-protection-is-available-on-public-repositories-for-free/) — GA of push protection for public repos.
- [Secret scanning's push protection will soon be enabled for all free accounts (changelog, 2024-02-14)](https://github.blog/changelog/2024-02-14-secret-scannings-push-protection-will-soon-be-enabled-for-all-free-accounts-on-github/) — auto-enable at account level.
- [About Dependabot alerts](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts) — included in all plans, enablement.
- [Configuring private vulnerability reporting for a repository](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository) — what it is, free for public repos, enablement.
- [Approving workflow runs from forks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks) — fork PR workflow-run approval policies and their exact names.
- [Automatic token authentication](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication) — `GITHUB_TOKEN` default permission setting location and fork-PR read-only forcing, `pull_request_target` exception.
- [GITHUB_TOKEN default permissions changelog, 2023-02-02](https://github.blog/changelog/2023-02-02-github-actions-updating-the-default-github_token-permissions-to-read-only/) — the default flip to read-only, scoped to newly created repos/orgs only.
- Existing repo docs read for context: `LEARNINGS.md` ("No server-side branch protection"), `.claude/rules/gh-driver.md`, `docs/research/806-gh-pull-request-status.md` (style precedent).
