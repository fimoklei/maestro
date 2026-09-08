# `gh` driver rules (project-specific for Maestro)

Imperatives for reading GitHub through the `gh` CLI — rules only. The observed
behavior behind them is in `docs/research/806-gh-pull-request-status.md`
(measured against `gh` 2.86.0). The decision is ADR-0029; the host gate is
ADR-0014; the field carve-out is ADR-0018.

## Grounding

- Never guess `gh` behavior — read the research file, or measure it and record
  it there with the command that produced the capture.
- Build fixtures from real `--json` captures, never retyped.

## Invocation

- `execFile("gh", [...])` with an args array, never a shell string
  (`security.md`).
- Gate on `github.com` before every call. `gh` sends an unknown host's query
  onward as GitHub Enterprise.
- Read the whole Harness in one call. Never one call per skill.
- Always pass `--repo`, `--state all` and `--limit`. The defaults are the
  current repository, `open` only, and 30.
- Always pass `--json` with the exact fields you consume.
- Disable prompts (`GH_PROMPT_DISABLED`) and bound execution time, as
  `HarnessGitAdapter` does.
- Pass ambient env only. Never inject `GH_TOKEN`, `GITHUB_TOKEN` or any other
  credential.

## Writing

- Open a request with `pr create` and an explicit `--head`; never let `gh` push
  or fork. Pass `--title` and `--body`, never `--fill`.
- Withdraw with `pr close` and reopen with `pr reopen`, naming the number the
  fresh read matched. Never pass `--delete-branch`.
- Recheck identity and the request itself against a fresh read before every
  write. A number the browser sent is a claim, never an authorisation.
- Never write while more than one open request matches the branch.
- Classify a write's failure the way a read's is classified, and parse nothing
  out of its stdout.

## Classifying output

- `[]` with exit 0 means none exist. Never read it as a failed read.
- Treat a missing binary, exit 4, and `error connecting to` as *no answer
  possible*; everything else non-zero is a failed read, fail-closed.
- Never separate an absent repository from a private one — GitHub answers both
  the same way.
- Never claim absence from a bounded or incomplete answer; report the unknown
  reading instead.
- Degrade the review capability alone. A `gh` failure never blocks git or
  release facts, known links, or local files.

## Fields

- Validate the parsed JSON with Zod at the adapter; a row failing the shape
  fails the whole read.
- Let only shape-checked named fields cross — request number, URL, state, draft
  flag, review decision, requested users and teams.
- Never put `gh` prose in an HTTP response, a notice or a log.
- Sort matching requests explicitly; never take `[0]`. One branch can carry
  several requests.
- Take state from `state` plus `mergedAt`, never from branch ancestry.

## Division of labour

- Read content from git tree hashes; read what the team did with it from `gh`.
- Never use `gh` to decide what a skill's content is, and never use refs to
  decide whether a pull request exists.

## Testing

- Keep real `gh` out of every test lane. Drive the adapter with captured
  responses and controlled process outcomes (`testing.md`).
