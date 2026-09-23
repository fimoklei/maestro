# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `fimoklei/maestro`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Pass a multi-line body as a file with `--body-file <path>`.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments` (`--comments` returns empty through the rtk rewrite, `~/.claude/RTK.md`).
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests

External PRs are not a triage surface. GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill breaks a spec into tickets

Every ticket lands as a **sub-issue** of the spec it implements, and each blocking edge as a native **blocked-by** link. Both endpoints take the issue's database `id`, never its number, and need `-F` so the id is sent as an integer; `-f` sends a string, which the API refuses with `is not of type integer`.

```sh
id=$(gh api repos/fimoklei/maestro/issues/<ticket> --jq .id)
gh api -X POST repos/fimoklei/maestro/issues/<spec>/sub_issues -F sub_issue_id="$id"

blocker=$(gh api repos/fimoklei/maestro/issues/<blocker> --jq .id)
gh api -X POST repos/fimoklei/maestro/issues/<ticket>/dependencies/blocked_by -F issue_id="$blocker"
```

Loop over literal issue numbers (`for n in 914 915 916`), one call per ticket: zsh never word-splits `$ids`, so a list held in one variable reaches `gh` as a single argument. Done when `gh api repos/fimoklei/maestro/issues/<spec>/sub_issues --jq '.[].number'` lists every new ticket.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --json number,title,body,labels,comments`.
