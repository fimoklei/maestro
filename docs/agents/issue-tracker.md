# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `fimoklei/maestro`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Pass a multi-line body as a file with `--body-file <path>`.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments` (`--comments` returns empty through the rtk rewrite, `~/.claude/RTK.md`).
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Triage label names: `docs/agents/triage-labels.md`.

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests

External PRs are not a triage surface. GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill publishes a spec

Create the issue with `--label spec`, alongside `ready-for-agent`. A spec for a new capability is a **sub-issue** of its job (label `job`, see the Legend in `docs/jobs.md`); attach it with the recipe below, the job as parent. A spec that improves something already built opens its body with the line `Small work: improves <what>, no job.`

A decision about an existing spec (a grill answer, a design pass) goes into its body with `gh issue edit <spec> --body-file <path>`, never into a comment.

## When a skill breaks a spec into tickets

Every ticket lands as a **sub-issue** of the spec it implements, and each blocking edge as a native **blocked-by** link. Both endpoints take the issue's database `id`, never its number, and need `-F` so the id is sent as an integer; `-f` sends a string, which the API refuses with `is not of type integer`.

```sh
id=$(gh api repos/fimoklei/maestro/issues/<ticket> --jq .id)
gh api -X POST repos/fimoklei/maestro/issues/<spec>/sub_issues -F sub_issue_id="$id"

blocker=$(gh api repos/fimoklei/maestro/issues/<blocker> --jq .id)
gh api -X POST repos/fimoklei/maestro/issues/<ticket>/dependencies/blocked_by -F issue_id="$blocker"
```

Loop over literal issue numbers (`for n in 914 915 916`), one call per ticket: zsh never word-splits `$ids`, so a list held in one variable reaches `gh` as a single argument. Done when `gh api repos/fimoklei/maestro/issues/<spec>/sub_issues --jq '.[].number'` lists every new ticket.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Edit the body with `gh issue edit <map> --body-file <path>`.
- **Child ticket**: a sub-issue of the map (recipe above, the map as parent), labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: a native blocked-by link (recipe above). A ticket is unblocked when every blocker is closed.
- **Frontier query**: the map's open, unassigned, unblocked children, in map order; the first wins.

  ```sh
  gh api "repos/fimoklei/maestro/issues/<map>/sub_issues?per_page=100" \
    --jq '.[] | select(.state=="open" and (.assignees|length)==0 and .issue_dependencies_summary.blocked_by==0) | [.number, .title] | @tsv'
  ```

- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --json number,title,body,labels,comments`.
