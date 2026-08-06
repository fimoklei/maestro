# What does an empty repo advertise, and what is the producer scaffold? (#552)

Spike input for the connect-gate job
[#498](https://github.com/fimoklei/maestro/issues/498), which leaves both
facts explicitly unproven. Resolves
[#552](https://github.com/fimoklei/maestro/issues/552). Captured 2026-08-06
against **git 2.50.1 (Apple Git-155)**, **gh 2.86.0** and **apm 0.26.0** (the
version `docs/apm-behavior.md` describes). Every claim below is a command run
in a scratch directory, or a line read in apm's installed source and cited by
file and line. What could not be measured is in **UNMEASURED**.

One caveat on re-checking: the two throwaway GitHub repositories were deleted
at the end of the session, so the GitHub half re-runs only by creating fresh
ones. Method gives that sequence verbatim.

Method and isolation are at the end.

## Answers

**Git.** A clone of an empty repository *does* learn the remote's default
branch name — GitHub and a local bare repo both advertise the unborn branch,
and the client's `init.defaultBranch` loses to it. What the clone does not get
is `refs/remotes/origin/HEAD`: it is absent after the clone, still absent
after the first push, and only `git remote set-head origin -a` creates it.
`git ls-remote --symref` answers nothing at all while the repository is empty
— it prints zero lines and exits 0.

**First push.** GitHub and a bare repo diverge, and the divergence is the
trap. Push the advertised branch and both are fine. Push a *different* branch
into the empty repository and GitHub adopts it as the repository's default
branch, while a local bare remote leaves `HEAD` dangling at a branch that
never got created — default branch unknown, permanently. A test suite that
stands a bare repo in for GitHub will therefore pass a case GitHub forgives
and a bare remote does not.

**APM producer scaffold.** `apm.yml` is the only file apm 0.26.0 creates.
`apm init -y` writes `apm.yml` and nothing else — no `README.md`, no
`.apm/`, no `.gitkeep`. `README.md` is a convention apm only *reads* (the
publish archive bundles it when present); `.apm/skills/<name>/SKILL.md` is
the deploy path, proven in
[`344-repo-shape.md`](344-repo-shape.md), but no apm command scaffolds the
directory.

**`plugin.json` does not belong.** It is written only by `apm plugin init`,
the plugin-author workflow whose next step is `apm pack` — a distribution
concern, not a Harness one. A team Harness that is installed per skill by
tag-pinned ref never needs it.

## Part 1 — Empty-repository git behaviour

### G1 — An empty repository advertises nothing to `ls-remote`

```
$ git ls-remote --symref https://github.com/fimoklei/<throwaway>.git HEAD
exit=0
```

Zero lines, exit 0 — from GitHub and from a local bare repo alike. A caller
that reads "no output" as an error will misread an empty repository; a caller
that reads it as "no default branch" will misread it too. The name exists;
`ls-remote` is simply not the command that reveals it.

### G2 — Clone learns the unborn branch, and it beats `init.defaultBranch`

The remote's default is `main`; the client is told `trunk`:

```
$ git -c init.defaultBranch=trunk clone https://github.com/fimoklei/<throwaway>.git c1
Cloning into 'c1'...
warning: You appear to have cloned an empty repository.
$ git -C c1 symbolic-ref HEAD
refs/heads/main
```

Same result against a local bare repo whose unborn HEAD is `trunk` and whose
client default is `main` — the clone lands on `trunk`. This is protocol v2's
`unborn` capability; the branch name crosses the wire even though no ref
does. **Consequence for #498: after cloning an empty repository, the branch
to scaffold onto is already the checked-out branch. Nothing needs to be
guessed or configured.**

### G3 — `origin/HEAD` is absent after the clone, and after the first push

```
$ git -C c1 symbolic-ref refs/remotes/origin/HEAD
fatal: ref refs/remotes/origin/HEAD is not a symbolic ref
$ git -C c1 show-ref
exit=1                       # no refs at all
$ git -C c1 remote show origin | grep 'HEAD branch'
  HEAD branch: (unknown)
```

After committing and pushing that branch:

```
$ git push -u origin HEAD
 * [new branch]      HEAD -> main
$ git symbolic-ref refs/remotes/origin/HEAD
fatal: ref refs/remotes/origin/HEAD is not a symbolic ref
$ git ls-remote --symref origin HEAD
ref: refs/heads/main	HEAD
0e61ab7c…	HEAD
```

The *remote* now answers; the local tracking symref still does not. Push
never writes it. One command does:

```
$ git remote set-head origin -a
'origin/HEAD' is now created and points to 'main'
```

A later fresh clone gets `refs/remotes/origin/main` without help — the gap is
specific to the clone that was made while the repository was empty. **This
confirms #498's implementation decision to set or refresh `origin/HEAD` after
the first push; it is required, not defensive.**

### G4 — GitHub adopts the first pushed branch; a bare repo does not

On a second throwaway GitHub repository, advertised default `main`, pushing
`trunk` instead:

```
$ git push -u origin trunk
 * [new branch]      trunk -> trunk
$ git ls-remote --symref origin HEAD
ref: refs/heads/trunk	HEAD
$ gh repo view <throwaway2> --json defaultBranchRef
{"defaultBranchRef":{"name":"trunk"}}
```

The same sequence against a local bare repo created with
`--initial-branch=trunk`, pushing `main`:

```
$ git push -u origin main
 * [new branch]      main -> main
$ git ls-remote --symref origin HEAD
exit=0                                  # still nothing
$ git remote show origin | grep 'HEAD branch'
  HEAD branch: (unknown)
$ git --git-dir=remote2.git symbolic-ref HEAD
refs/heads/trunk                        # points at a branch that does not exist
```

What this means for #498's integration seam ("real temporary repositories and
bare remotes"): a bare remote reproduces G1, G2 and G3 faithfully, but not
G4 — it is stricter than GitHub. Push the branch the clone landed on and the
two agree, which is the only behaviour the scaffold needs. A bare-remote test
that pushes a *different* branch proves nothing about GitHub.

### G5 — Every claim above is client-side git plus one server

Nothing here depends on Maestro. Re-check on a git upgrade by re-running the
Method block; re-check the GitHub half only if GitHub changes what an empty
repository advertises, which `ls-remote` will not tell you either way.

## Part 2 — The producer scaffold shape (apm 0.26.0)

### S1 — `apm init -y` writes `apm.yml`, and only `apm.yml`

```
$ apm init -y
[>] Initializing APM project: harness
[*] APM project initialized successfully!
    Created Files
    | File | Description |
    | *    | apm.yml     |
$ find . -not -path './.git/*'
.
./apm.yml
```

The generated manifest:

```yaml
name: harness
version: 1.0.0
description: APM project for harness
author: Developer
# Which agent platforms to deploy to (uncomment to pin):
# targets:
#   - copilot
#   - claude

dependencies:
  apm: []
  mcp: []
includes: auto
scripts: {}
```

`name` is the directory name, `author` is the literal string `Developer`.
Maestro writing its own `apm.yml` rather than shelling out to `apm init` is
therefore not a departure — there is nothing else in the command to reuse.

### S2 — `plugin.json` comes from `apm plugin init`, a different workflow

```
$ apm plugin init -y
    | File        |
    | apm.yml     |
    | plugin.json |
  Next Steps
  * Add dev dependencies:    apm install --dev <owner>/<repo>
  * Pack as plugin:          apm pack
```

`apm plugin --help` describes the group as "Scaffold and manage plugins
(plugin-author workflows)", and `apm init --plugin` is deprecated in favour
of it. The next step it proposes is packing a distributable bundle. A Harness
consumed per skill through tag-pinned refs never packs, so **`plugin.json`
stays out of the scaffold** — the one-line answer #552 asks for.

### S3 — `README.md` is read, never written

apm creates no `README.md`. It reads one: the registry publish archive
bundles root-level docs when present —

```python
# commands/publish.py:232
_DOC_CANDIDATES = ("README.md", "CHANGELOG.md", "LICENSE", "LICENCE")
```

— "matching npm's behaviour of bundling standard root-level documentation
files" (`publish.py:202-204`). So a scaffolded `README.md` is for the humans
who open the repository, and costs nothing on the apm side. Keep it; do not
claim apm requires it.

### S4 — `apm compile --validate` does not see `.apm/skills/`

[`344-repo-shape.md`](344-repo-shape.md) left this open: `--validate` exits 1
in both shapes, "but for the same reason in neither case related to skills …
Whether the P3 ladder can validate a skill at all is a separate question this
spike did not answer" (its UNMEASURED section). It cannot. A correct Harness
validates no better than an empty directory:

```
$ tree                       # apm.yml, README.md, .apm/skills/hello/SKILL.md
$ apm compile --validate
[x] No instruction files found in .apm/ directory
[i]  To add instructions, create files like:
[i]    .apm/instructions/coding-standards.instructions.md
exit=1
```

Identical output and exit 1 with `.apm/skills/` empty. The reason is in
discovery: local skill discovery is *root* `SKILL.md` only —
`_discover_local_skill` opens `Path(base_dir) / "SKILL.md"`
(`primitives/discovery.py:487`) and `LOCAL_PRIMITIVE_PATTERNS`
(`discovery.py:19-39`) has no skills entry at all. `.apm/skills/<name>/` is
read on the *install* side, where the ref names the subpath literally
(E2 in [`344-repo-shape.md`](344-repo-shape.md)).

So `apm compile --validate` cannot be the scaffold's self-check — it fails a
correct Harness. #498 already plans an advisory workflow; this says apm
offers no producer-side structural check the workflow could lean on. It also
extends
`docs/apm-behavior.md`'s existing note that `--validate` cannot fail on a
skill content defect: it cannot *pass* on skill content either.

### S5 — Git will not carry an empty `.apm/skills/`

Not an apm fact, but it decides a line of the scaffold: git tracks files, not
directories, so an empty `.apm/skills/` never reaches the remote. The
scaffold must write a placeholder file inside it (`.gitkeep`) or accept that
a freshly scaffolded clone has no `.apm/` at all.

## Method

Git, apm and the scratch trees all ran under a redirected `HOME`
(`GIT_CONFIG_GLOBAL` pointed into the same sandbox) in a scratch directory
outside the repo. No apm `-g` command was run at any point
(`LEARNINGS.md` · spike-isolation).

The GitHub half is the one exception and it is deliberate: measuring what
GitHub advertises requires GitHub. Two throwaway **private** repositories
were created with `gh repo create`, measured, and deleted with
`gh repo delete` in the same session; both are gone. They used ambient git
credentials from the real home, because the sandbox has none — no token was
written anywhere. No real repository was touched.

Reproduce the local half:

```bash
git init --bare --initial-branch=trunk remote.git
git ls-remote --symref remote.git HEAD                 # G1: nothing, exit 0
git -c init.defaultBranch=main clone remote.git c1     # G2: lands on trunk
git -C c1 symbolic-ref HEAD
git -C c1 symbolic-ref refs/remotes/origin/HEAD        # G3: fatal
# commit, then:
git -C c1 push -u origin HEAD
git -C c1 symbolic-ref refs/remotes/origin/HEAD        # G3: still fatal
git -C c1 remote set-head origin -a                    # G3: creates it
```

Reproduce the GitHub half — needs two fresh throwaway repositories, because
the ones measured here are deleted. Both are private, and both are deleted
again at the end:

```bash
R=maestro-spike-552-$RANDOM
gh repo create "$R" --private
git ls-remote --symref "https://github.com/<owner>/$R.git" HEAD   # G1: nothing, exit 0
git -c init.defaultBranch=trunk clone "https://github.com/<owner>/$R.git" c1
git -C c1 symbolic-ref HEAD                            # G2: refs/heads/main
git -C c1 symbolic-ref refs/remotes/origin/HEAD        # G3: fatal
# commit, then:
git -C c1 push -u origin HEAD
git -C c1 symbolic-ref refs/remotes/origin/HEAD        # G3: still fatal
gh repo view "$R" --json defaultBranchRef              # main

R2=maestro-spike-552b-$RANDOM                          # G4: push a NON-default branch
gh repo create "$R2" --private
git clone "https://github.com/<owner>/$R2.git" c2 && git -C c2 checkout -b trunk
# commit, then:
git -C c2 push -u origin trunk
git -C c2 ls-remote --symref origin HEAD               # ref: refs/heads/trunk
gh repo view "$R2" --json defaultBranchRef             # trunk — GitHub adopted it

gh repo delete "<owner>/$R" --yes && gh repo delete "<owner>/$R2" --yes
```

Reproduce the apm half:

```bash
mkdir harness && cd harness && apm init -y && find . -not -path './.git/*'
mkdir ../plug && cd ../plug && apm plugin init -y && ls
mkdir -p ../scaffold/.apm/skills/hello && cd ../scaffold
# apm.yml + README.md + .apm/skills/hello/SKILL.md, then:
apm compile --validate; echo "exit=$?"                 # S4: exit 1
```

## UNMEASURED

- **Older git clients.** The `unborn` capability that carries G2 needs git
  ≥ 2.32 on the client. Everything here is git 2.50.1. A user on an older
  client falls back to their own `init.defaultBranch`, which would make G2's
  guarantee wrong for them; not tested.
- **A GitHub repository whose default branch is not `main`.** GitHub's
  advertised name comes from the account setting, and an empty repository has
  no branch to rename, so the "not `main`" case was proven only against a
  bare remote (G2) and indirectly through G4.
- **apm 0.28.0.** Every apm invocation in this spike printed
  `[!] A new version of APM is available: 0.28.0 (current: 0.26.0)`. Nothing
  here was re-run against it; all apm claims are 0.26.0, the installed and
  documented version. Adopting it runs `docs/agents/apm-upgrade.md`.
