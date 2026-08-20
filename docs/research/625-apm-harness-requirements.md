# What APM says a producer repository must look like (#625)

Research input for wayfinder map #621. The question: build a harness from
scratch **to APM's documented model**, not to Maestro's assumptions.

Every claim below is tagged:

- **[doc]** — read on <https://microsoft.github.io/apm/> on 2026-08-20, with the
  exact page URL. Docs-read is not measurement.
- **[measured]** — a command run locally, with the command shown. Read-only
  inspection only; nothing that writes was run.

Local apm: **0.26.0** [measured: `apm --version`], the same version
`docs/apm-behavior.md` describes. The CLI reports 0.28.0 is available, so the
doc site may run ahead of what is installed; where that matters it is called
out.

Terminology warning: **APM's docs use "harness" for the *consumer's* agent tool**
(Claude Code, Copilot, Cursor). "I ship a set of harness hooks"
[doc: /apm/reference/package-types/]. What Maestro calls "the harness" — the
producer repository — APM calls a **package** or **plugin**. This note uses
Maestro's sense but flags the clash; see Departures.

## Answer — the from-scratch checklist

A producer repository that APM's own docs would recognise:

- [ ] **`apm.yml` at the repo root.** Exactly two keys are mandatory at parse
      time: `name` and `version`. [doc: manifest-schema]
- [ ] **`version:` is semver `^\d+\.\d+\.\d+` and acts as a release-gate value** —
      it is what `apm pack --check-versions` validates against the marketplace
      version and against the git tag pattern. It is not decoration.
      [doc: manifest-schema, versioning-strategies]
- [ ] **`.apm/` directory holding primitives by type**: `skills/`, `prompts/`,
      `instructions/`, `agents/`, `hooks/`. [doc: producer index, author-primitives]
- [ ] **Each skill at `.apm/skills/<name>/SKILL.md`**, optionally with
      `scripts/`, `references/`, `assets/`, `examples/`. [doc: skills]
- [ ] **`SKILL.md` frontmatter: `name` + `description`, both required.** `name`
      matches `[a-z0-9]+(-[a-z0-9]+)*`, 1–64 chars, and **must equal the parent
      directory name**. `description` ≤1024 chars. Body under 500 lines / 5000
      tokens. [doc: skills]
- [ ] **`README.md`** — shown on the marketplace listing. [doc: producer index]
- [ ] **Hooks as JSON keyed by lifecycle event**, in `.apm/hooks/` (or a
      Claude-native `hooks/`). [doc: hooks-and-commands]
- [ ] **MCP servers as *declarations in `apm.yml`***, under `dependencies.mcp:` —
      never as files. [doc: mcp-as-primitive]
- [ ] **A `marketplace:` block in `apm.yml`** if anyone is meant to discover the
      package, plus the generated `.claude-plugin/marketplace.json` **committed**.
      [doc: publish-to-a-marketplace]
- [ ] **A git tag per release matching `tagPattern` (default `v{version}`)**,
      pushed; `apm pack` resolves version ranges against tags via `git ls-remote`.
      [doc: publish-to-a-marketplace, manifest-schema]
- [ ] **Nothing special for private repos.** Producer side is identical; only the
      consumer's auth differs (`GITHUB_APM_PAT` / `GITHUB_APM_PAT_<ORG>`).
      [doc: private-and-org-packages]

What is *not* required: a bundle. `apm pack` produces one, but a bundle is "the
artifact you hand to a consumer when you do not want to publish to a registry"
[doc: pack-a-bundle] — an alternative, not a step.

## 1. `apm.yml`

Source: <https://microsoft.github.io/apm/reference/manifest-schema/>

> "Two fields are mandatory at parse time: `name` and `version`; all others are
> optional."

| Field | Required | Type / pattern |
| --- | --- | --- |
| `name` | **yes** | alphanumeric, dots, hyphens, underscores |
| `version` | **yes** | `^\d+\.\d+\.\d+` (semver) |
| `description` | no | string |
| `author` | no | string |
| `license` | no | SPDX expression |
| `targets` | no | list or string; `copilot`, `claude`, `grok-build`, `cursor`, `opencode`, `codex`, `gemini`, `antigravity`, `windsurf`, `kiro`, `agent-skills`. Default: auto-detect |
| `target` | no | legacy singular; docs say use `targets` in new manifests |
| `type` | no | `instructions` \| `skill` \| `hybrid` \| `prompts` |
| `scripts` | no | map name → shell command; `start` is the default `apm run` entry |
| `includes` | no | `auto` or explicit path list — deployment consent |
| `registries` | no | REST registry config, with a `default` key |
| `policy` | no | consumer-side org policy controls |
| `dependencies` | no | `.apm` / `.mcp` / `.lsp` lists |
| `devDependencies` | no | same shape; excluded from packed bundles |
| `compilation` | no | `target`, `strategy`, `output`, `exclude`, `agents_md`, … |
| `marketplace` | no | authoring block; see §4 |

### What `version:` is actually for

Not a label. It is the **release gate**.

> "`marketplace.versioning.strategy` in `apm.yml` controls how
> `apm pack --check-versions` validates each local package's declared version
> before a release tag is issued."
> [doc: /apm/producer/versioning-strategies/]

Three strategies [doc: versioning-strategies]:

- **`lockstep` (default)** — "Every local package's manifest `version` must equal
  the marketplace's top-level `version`. One tag, one bump, all packages move
  together."
- **`tag_pattern`** — per-package versions; rendered git tags must be unique
  across packages (`plugin-a-v1.2.0`, `plugin-b-v0.4.1`). "Useful when you want
  per-package tags on a shared release branch."
- **`per_package`** — no consistency constraint.

`apm pack` exit codes make the gate concrete [measured: `apm pack --help`]:

```
0  Success
1  Build or runtime error
2  Manifest schema validation error
3  Version alignment check failed (--check-versions)
4  Marketplace working-tree drift detected (--check-clean)
```

`apm init` seeds `version: 1.0.0`, or `0.1.0` under `--plugin --yes`
[doc: /apm/reference/cli/init/]. `apm init` creates **only** `apm.yml` — no
directories.

## 2. Primitive layout

Source: <https://microsoft.github.io/apm/producer/author-primitives/> and
<https://microsoft.github.io/apm/producer/author-primitives/skills/>

The prescribed tree [doc: author-primitives]:

```
.apm/
  skills/
    my-skill/
      SKILL.md
      scripts/
      references/
      assets/
  prompts/
    review.prompt.md
  instructions/
    style.instructions.md
  agents/
    cli-logging-expert.agent.md
  hooks/
    pre-commit.json
```

### Skills

Layout [doc: skills]:

```
.apm/skills/code-review-expert/
├── SKILL.md           # required
├── scripts/           # optional: executable helpers
├── references/        # optional: deep-dive context
├── assets/            # optional: templates, images, fixtures
└── examples/          # optional: sample inputs and outputs
```

"Single-skill repositories may place `SKILL.md` at the package root."

Frontmatter — **two required fields, no more**:

| Field | Required | Rules |
| --- | --- | --- |
| `name` | yes | lowercase alphanumeric + hyphens; `[a-z0-9]+(-[a-z0-9]+)*`; 1–64 chars; no leading/trailing/consecutive hyphens; **"must equal the parent directory name"** |
| `description` | yes | imperative ("Use when…"), intent-first, ≤1024 characters (the agent-skills spec ceiling) |

"APM derives `name` from the directory when omitted; if both exist and conflict,
the directory name takes precedence." Body budget: under "500 lines and 5000
tokens", overflow into `references/<topic>.md`.

No `version`, `license`, `author`, `allowed-tools` or `targets` field is
documented as part of SKILL.md frontmatter. Skill versioning lives in `apm.yml`
and the git tag, not in the skill.

### Hooks

Source: <https://microsoft.github.io/apm/producer/author-primitives/hooks-and-commands/>

- Discovered in `.apm/hooks/` (standard) **or** `hooks/` (Claude-native).
- Each file is a JSON document keyed by lifecycle event, in either a wrapped
  shape (`{"hooks": {"PreToolUse": [...]}}`) or a naked Claude settings-slice
  shape (`{"PreToolUse": [...]}`).
- Script paths use `${PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_ROOT}` / `${CURSOR_PLUGIN_ROOT}`
  / `${KIRO_PLUGIN_ROOT}` tokens.
- Per-target output differs sharply: `copilot` → one file per hook in
  `.github/hooks/`; `claude` → **merged into `.claude/settings.json`**; `cursor`
  → `.cursor/hooks.json`; `kiro` → one file per hook *action*; `grok-build` and
  `opencode` → **silently skipped**.
- Docs are explicit that this is not portable: "Hooks and commands do not
  pretend to be portable."

Commands are not a directory. "Commands ship as prompts
(`.apm/prompts/*.prompt.md`); there is no separate `.apm/commands/` directory."
[doc: author-primitives]

### MCP servers

Source: <https://microsoft.github.io/apm/producer/author-primitives/mcp-as-primitive/>

MCP is **not a file primitive**. "Unlike skills or prompts that exist as files,
MCP servers exist purely as **declarations** in the manifest. APM materialises
them at install time into the harness-specific config file."

Declared under `dependencies.mcp:` (or `devDependencies.mcp:`), in three forms:
a bare registry reference (`io.github.github/github-mcp-server`), a self-defined
stdio server (`registry: false`, `transport: stdio`, `command`, `args`), or a
self-defined remote (`transport: http`, `url`, `headers`).

Secrets: "Treat `apm.yml` like `package.json`: it is committed, reviewed, and
shipped. Do not embed tokens." Use `${VAR}` indirection. Self-defined servers are
"trusted only when your package is a **direct** dependency"; transitive ones need
`--trust-transitive-mcp`.

### Package layouts APM recognises

Five, not one [doc: /apm/reference/package-types/]:

1. **APM package** — has `.apm/`. "I have N independent primitives."
2. **Skill bundle** — `SKILL.md` at root. "I am one skill bundle."
3. **Skill collection** — `skills/<name>/SKILL.md`. "I ship many skills in one repo."
4. **Hook package** — `hooks/*.json` only.
5. **Plugin collection** — `plugin.json`, Claude-native.

Where both exist, `.apm/` wins: "When `.apm/` exists, it becomes the
authoritative pack source. Mixed layouts generate warnings about skipped root
sources." [doc: /apm/producer/repo-shapes/]

## 3. Versioning and releasing, and git tags

Sources: <https://microsoft.github.io/apm/producer/publish-to-a-marketplace/>,
<https://microsoft.github.io/apm/producer/releasing-from-any-ci/>,
<https://microsoft.github.io/apm/producer/versioning-strategies/>

**Yes, APM documents git tags explicitly.** The publish flow ends with a tag:

```bash
apm marketplace init
# author the marketplace: block in apm.yml
apm marketplace check
apm pack
git add apm.yml .claude-plugin/marketplace.json
git commit -m "Release v1.0.0" && git tag v1.0.0 && git push --tags
```

- Default tag pattern is **`v{version}`**, configurable per marketplace via
  `marketplace.build.tagPattern` and per package via `packages[].tag_pattern`
  [doc: manifest-schema].
- "Each compiled package carries one resolved ref — the highest tag matching the
  range at build time." Resolution is `git ls-remote`
  [doc: publish-to-a-marketplace].
- `apm marketplace check` "confirms every package's ref/range resolves" before a
  release.
- `marketplace.json` must be **committed**, not gitignored, and must match a
  fresh pack — that is what `--check-clean` enforces (exit 4)
  [doc: releasing-from-any-ci].

CI recipe, identical across providers [doc: releasing-from-any-ci]:

1. `apm pack --check-versions --check-clean --json > pack-report.json`
2. `sha256sum` sidecar per artifact
3. forge release API (`gh release create`, `glab release create`) uploading
   artifacts + sidecars under the version tag

Releases are triggered by pushing tags matching `v*`.

What APM does **not** document: any requirement that a consumer pin to a tag.
Refs may be "branch, tag, SHA, or semver range" [doc: manifest-schema,
`dependencies.apm[].ref`]. Tag-only is a producer-side release convention, not a
consumer-side constraint.

## 4. Bundles and grouping constructs

APM has **four** grouping constructs, and they are not interchangeable.

**Bundle** — output of `apm pack`. "A bundle is the artifact you hand to a
consumer when you do not want to publish to a registry."
[doc: /apm/producer/pack-a-bundle/]

```
build/<your-package>/
├── plugin.json
├── agents/
├── skills/
├── commands/
├── hooks/
└── apm.lock.yaml
```

Includes local primitives from `.apm/` plus dependency files attested in the
lockfile's `deployed_files`. Excludes the `apm_modules` cache ("no provenance or
integrity guarantee"), unattested dependency config, and symlinks. `--archive`
gives a `.zip`; `--archive-format tar.gz` the legacy form.

**Plugin** — the unit of identity, carried by `plugin.json`, "synthesized from
`apm.yml` fields or authored separately". Scaffolded with `apm plugin init`
[measured: `apm plugin --help` → `init  Scaffold a plugin (creates plugin.json + apm.yml)`].

**Marketplace** — an index. A `marketplace:` block in `apm.yml` with `owner`
(required), `packages[]`, `sourceBase`, `output`, `build.tagPattern`,
`versioning.strategy`. Packs to `.claude-plugin/marketplace.json` by default, and
optionally `.agents/plugins/marketplace.json` for Codex.
[doc: manifest-schema, publish-to-a-marketplace]

**Repo shape** — three documented ones [doc: /apm/producer/repo-shapes/]:

- *Single-plugin*: one repo, one plugin, one marketplace entry pointing at local
  source.
- *Aggregator*: a marketplace that indexes packages hosted in **other** repos
  (`source: acme-org/skill-pkg-a`, `version: "^1.0.0"` or `ref: v0.4.2`),
  resolved via `git ls-remote`. Produces only `marketplace.json`, no bundle.
- *Monorepo-hybrid*: `packages/<plugin>/apm.yml` + `.apm/` per plugin, with a
  root marketplace and `versioning.strategy`.

There is no "bundle" in the sense of *a named grouping of skills a consumer
installs as one unit*. The nearest thing is a marketplace package entry, or an
`.apm/` package whose primitives all deploy together.

[measured: `apm marketplace --help` on 0.26.0 lists consumer commands
`add/list/browse/update/remove/validate` and authoring commands
`init/check/outdated/audit/package/migrate` — the machinery is present in the
version Maestro pins to, not only in the newer docs.]

## 5. Private repositories and authentication

Sources: <https://microsoft.github.io/apm/consumer/private-and-org-packages/>,
<https://microsoft.github.io/apm/consumer/authentication/>

**Producer side: nothing changes.** "APM treats private dependencies identically
to public ones — you declare them in `apm.yml` using the same reference syntax.
The differentiator is authentication."

Consumer side, GitHub, in precedence order:

1. `GITHUB_APM_PAT_<ORG>` — per-org; uppercase, hyphens → underscores
2. `GITHUB_APM_PAT` — global fine-grained PAT, "read access on the org"
3. fallback: `gh auth token --hostname <host>`; silently skipped if `gh` is
   absent or not logged in

Other hosts: `GITLAB_APM_PAT` → `GITLAB_TOKEN` → git credential helper;
`ADO_APM_PAT` → `az login` bearer, and "ADO is always auth-required — no
anonymous fallback". Bitbucket/Gitea and the rest go through the ordinary git
credential helper — "if you can `git clone`, APM can install".

Enterprise hosts: `.ghe.com` recognised automatically; GHES needs `GITHUB_HOST`.

APM forwards its own tokens only to hosts classified as GitHub/GitLab/ADO, and
suppresses credential helpers for plaintext HTTP clone/ls-remote
[doc: /apm/enterprise/security/].

The page is explicit about what it does not cover: "Out of scope: Token scopes,
SSO authorization, EMU classes." Nothing is documented about a **private
marketplace** — whether `apm marketplace add` against a private repo works, and
whether release-asset downloads authenticate the same way, is undocumented and
unmeasured.

Maestro is compatible here without doing anything: `ApmCliDriver` passes ambient
env only (`.claude/rules/security.md`), which is exactly what the documented
`GITHUB_APM_PAT` / `gh auth token` chain needs. No token-bridging is required to
consume a private harness.

## Where the docs and our measurements disagree

Reported, not resolved. `docs/apm-behavior.md` (apm 0.26.0, verified 2026-07-20)
is the measured record and wins on every line below.

**D1 — the 1024-character description ceiling.** Docs call it a "Hard ceiling:
1024 characters per agent-skills spec" [doc: skills]. Measured: apm enforces
nothing — `grep -rn "5000"` and `grep -rniE "max_lines|token_budget|max_tokens|line_limit"`
over `apm_cli` both exit 1, and apm's own producer guide (read 2026-07-28)
disclaims the sibling 500-line rule in the next sentence: *"This is the
agent-skills convention, not an APM check."* The doc states a spec ceiling, not
an APM check. Maestro's advisory-only treatment (`manifestAdvisories`) matches
the measurement.

**D2 — `name` is required frontmatter.** Docs list `name` as **required** and
say it "must equal the parent directory name" [doc: skills], while also saying
"APM derives `name` from the directory when omitted". Those two sentences do not
agree with each other. `docs/apm-behavior.md` names no required frontmatter field
at all. Unmeasured: whether apm 0.26.0 refuses a `SKILL.md` with no `name`.
Worth a spike before any harness validator treats `name` as required.

**D3 — what `apm init` seeds into `targets:`.** Docs say `targets` is "seeded
with stable targets like `copilot`, `claude`, `cursor`, and others"
[doc: /apm/reference/cli/init/]. Measured (#552 S1, reproduced verbatim in
`packages/core/src/inventory/harness-scaffold-files.ts`): 0.26.0's `apm init -y`
writes `targets:` **commented out**. The measurement wins.

**D4 — marketplace reachability.** ADR-0019 §1 records the marketplace as "ruled
out 2026-07-27, measured unreachable by #354". Separately measured today:
`apm marketplace --help` on 0.26.0 lists working consumer commands
(`add/list/browse/update/remove/validate`) and authoring commands
(`init/check/outdated/audit/package/migrate`), and `apm pack --help` documents
exit codes 3 and 4 for the release gates. The machinery is present in the pinned
version. This does not contradict #354 — I did not re-run whatever #354
measured — but the ADR sentence reads as "the marketplace does not work", and
what is present in 0.26.0 is more than that phrasing suggests. **Re-read #354's
exact claim before quoting ADR-0019 §1 as "the marketplace is unreachable".**

## Departures

### Accepted — already in ADR-0019

All six entries hold up against the current docs. Nothing in ADR-0019 has been
overtaken by a doc change.

**§1 — the version lives on a git tag, not in the manifest (deliberate).**
Confirmed as a real departure and sharpened: `version:` is not decoration in
APM's model, it is the **release gate**. `apm pack --check-versions` exits 3 when
a package's manifest version does not satisfy the marketplace strategy, and the
default `tagPattern` is literally `v{version}` — the tag is *rendered from* the
manifest version [doc: versioning-strategies, manifest-schema]. Maestro inverts
that: the tag is computed from the skill-set delta (`propose-release-version.ts`)
and the manifest never moves. See the first gap below for the concrete cost.

**§2 — the producer ladder is not APM's ladder (deliberate).** Docs confirm the
five steps verbatim: author-primitives → compile → preview-and-validate →
pack-a-bundle → publish-to-a-marketplace, and "there is no separate build
pipeline — the CLI is the build pipeline" [doc: /apm/producer/]. Maestro runs
none of them and drives four subcommands only (`install`, `uninstall`,
`outdated`, `view`). The measured grounds still hold — `apm compile` overwrites
hand-owned `AGENTS.md`/`CLAUDE.md` [doc: /apm/producer/compile/ confirms the
same file list], and `apm compile --validate` exits 1 on the canonical harness.

**§3 — a skill from outside is copied in, never depended on (deliberate).** APM's
`dependencies.apm` is documented in detail (string shorthand, object form with
`git`/`path`/`ref`/`alias`/`skills`/`targets`) [doc: manifest-schema]. Maestro's
scaffold writes `apm: []` and import copies the folder. Departure stands.

**§4 — "harness" means something else here (deliberate).** Confirmed from the
current docs: APM uses "harness" for the consumer's agent tool — "I ship a set of
harness hooks", "the harness-specific config file"
[doc: /apm/reference/package-types/, mcp-as-primitive]. APM's own word for what
Maestro calls the harness is **package** (or **plugin**). `CONTEXT.md` already
carries the *Avoid* line.

**§5 — `.apm/skills/` is APM's shape (resolved drift).** Fully resolved and now
matching: APM prescribes `.apm/skills/<name>/SKILL.md` and says "When `.apm/`
exists, it becomes the authoritative pack source"
[doc: author-primitives, repo-shapes]. Maestro's `harness-layout.ts` is the
single source of that constant.

> **ADR-0019 §5 is stale on its own residual.** It records root `skills/` as
> "still hard-coded in `core` (`deployed-ref.ts`, `inventory-git.ts`,
> `package-ref.ts`, registry readers)". All three now import
> `harnessSkillSubpath` from `packages/core/src/inventory/harness-layout.ts`, and
> no root-`skills/` fallback survives in `core`. The residual sentence should be
> struck.

**§6 — review is Maestro's concept (not a departure).** Mostly holds, with one
correction: ADR-0019 says APM "says nothing at all about review, approval, or who
may publish". APM does document **release gates** — `apm marketplace check`
(every ref/range resolves), `apm pack --check-versions` (exit 3),
`apm pack --check-clean` (exit 4), and `apm audit --ci`
[doc: publish-to-a-marketplace, releasing-from-any-ci]. Those are mechanical
pre-tag checks, not review or approval, so the verdict "not a departure" is
unchanged — but the sentence overstates. Worth softening to "APM gates artifacts,
never people."

### Unlisted — gaps

Five. Each is a place where Maestro's behaviour diverges from a documented APM
rule and no accepted ADR names it. Per `.claude/rules/apm-driver.md`, a new
departure is **amended into ADR-0019**, never given its own ADR.

#### G1 — the scaffolded `version: 1.0.0` actively contradicts every tag Maestro creates

ADR-0019 §1 says `apm.yml`'s `version:` is *inert*. It is worse than inert: it is
**wrong on purpose and never reconciled**.

`harness-scaffold-files.ts` writes `version: 1.0.0` (0.26.0's own `apm init -y`
output) and no code path ever changes it — Maestro never parses `apm.yml`, and
`publish-release.ts` does not touch it. Meanwhile `release-tag.ts` publishes
`v0.1.0`, then `v0.2.0`, and so on, computed from the skill-set delta. So a
Maestro harness at tag `v0.3.0` declares `version: 1.0.0`.

Under APM's documented default (`lockstep`), "every local package's manifest
`version` must equal the marketplace's top-level `version`"
[doc: versioning-strategies], and the default tag pattern renders as
`v{version}` [doc: manifest-schema] — so a Maestro harness fails
`apm pack --check-versions` (exit 3) from its first release, and its tags never
match the pattern APM would render from the manifest.

Not fatal — nothing in the install path reads `version:` [measured:
`docs/apm-behavior.md`, lockfile entries carry `version: unknown` deliberately,
apm PR #2217]. But it means a Maestro harness can never be picked up by APM's
release tooling without a migration, and ADR-0019 §1 should say so out loud
rather than "inert".

Cheapest fix if wanted: write `version: 0.0.0` at scaffold, and have
`publish-release.ts` bump it in the promote commit. Not proposing it here.

#### G2 — `dev.azure.com` is refused even though apm's own parser accepts it

ADR-0014 allowlists `github.com` as the one deployable host, and ADR-0019 does
not list host narrowing as a departure at all.

APM documents four host families for `dependencies.apm` — GitHub (incl. GHES,
`.ghe.com`), GitLab (incl. self-managed, via `type: gitlab`), Azure DevOps
(`dev.azure.com/acme-org/platform/repo#ref`), and everything else through the git
credential helper [doc: private-and-org-packages, manifest-schema].

For GitLab the narrowing is *justified by measurement*, not a departure:
`gitlab.com/o/r/skills/tdd#v1` parses with `virtual_path` **None** and `repo_url`
`o/r/skills/tdd` — a silent mis-parse [measured: `docs/apm-behavior.md`].

For **Azure DevOps it is a genuine unlisted departure**: the same measured
section records that the trailing `skills/<name>` *is* read as a virtual package
on `dev.azure.com` (3 path segments). apm can express a Maestro-shaped deploy ref
against ADO; `parseGitOrigin` refuses it anyway. That refusal is a product
decision — it has never been written down as one.

#### G3 — MCP servers are declarations in `apm.yml`, not files, and Maestro's model has no room for that

`.claude/rules/apm-driver.md` defers hooks and MCP to "Unobserved — spike before
relying". That is a *not yet*, not a departure — but the doc reading turns up a
structural mismatch that a spike will not resolve, and nobody has recorded it.

APM: "Unlike skills or prompts that exist as files, MCP servers exist purely as
**declarations** in the manifest. APM materialises them at install time into the
harness-specific config file." [doc: mcp-as-primitive] An MCP server is a list
entry under `dependencies.mcp:` in `apm.yml` — it has no directory, no
`SKILL.md`-equivalent, and no tag of its own.

Every load-bearing assumption in `packages/core/src/harness/` is
directory-shaped: a primitive is a `tree` entry under `.apm/skills`
(`harness-git.ts`), promotion builds a commit that swaps a subtree, a deploy ref
is `…/.apm/skills/<name>#vX.Y.Z` (`package-ref.ts`), and release versioning is
computed from *added / removed / renamed directories*
(`propose-release-version.ts`). An MCP entry moves none of those needles: adding
one changes only `apm.yml`, which Maestro never parses, so
`proposeReleaseVersion` would report "Nothing has changed since the last
release."

Hooks are half a mismatch: they *are* files (`.apm/hooks/*.json`), so the
directory model bends — but they are JSON keyed by lifecycle event with no
frontmatter and no `description`, so `validate-skill-structure.ts` has nothing to
say about them, and per-target deployment is wildly non-uniform (`claude` merges
into `.claude/settings.json`; `grok-build` and `opencode` silently skip)
[doc: hooks-and-commands].

`packages/web/src/ui/type-tag.tsx` already ships
`PrimitiveType = "skill" | "hook" | "mcp" | "bundle"`, which promises a
uniformity APM does not have.

#### G4 — `bundle` is a UI primitive type with no APM referent

`type-tag.tsx` lists `bundle` alongside skill/hook/mcp as a kind of primitive.
APM has no such thing. In APM, a **bundle is the output of `apm pack`** — "the
artifact you hand to a consumer when you do not want to publish to a registry"
[doc: pack-a-bundle] — a build product, not a primitive and not a grouping a
consumer installs.

APM's actual grouping constructs are: the **package** (`.apm/` + `apm.yml`), the
**plugin** (`plugin.json`), the **marketplace** (`marketplace:` block →
`.claude-plugin/marketplace.json`), and the dependency-level **`skills:` narrowing
list** (§G5). None of them is called a bundle.

`docs/apm-behavior.md` never mentions bundles, so nothing measured backs the UI
tag. Either the tag means something Maestro-specific and needs a `CONTEXT.md`
entry, or it should go.

#### G5 — APM documents a `skills:` narrowing field that Maestro never considered

`dependencies.apm[]` object form carries `skills: list<string>` — "Install only
named skills", with `["*"]` for all [doc: manifest-schema]. That is APM's
documented way to consume a *subset* of a multi-skill package:

```yaml
dependencies:
  apm:
    - git: acme/harness
      ref: v0.3.0
      skills: [tdd, code-review]
```

Maestro instead writes one dependency entry per skill, each a tag-pinned virtual
subpath (`github.com/<owner>/<repo>/.apm/skills/<name>#vX.Y.Z`, ADR-0003 /
ADR-0021 §4). Both are documented APM syntax, so this is a choice, not an error —
but it is an **undocumented choice**, and it has consequences nobody has weighed:
the `skills:` form pins the whole harness at one ref (so all deployed skills move
together), while Maestro's form lets each skill sit at a different tag in the same
consumer repo. That is arguably a feature; it is also why per-skill drift exists
at all. It belongs in ADR-0003's rejected-alternatives, and it is not there.

#### Not a gap — checked and clean

- **Skill name pattern.** `package-ref.ts`'s `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` with
  `MAX_SLUG_LENGTH = 64` is character-for-character APM's documented rule
  [doc: skills].
- **Harness recognition by `apm.yml`.** ADR-0021 §4 — "a harness is recognised by
  `apm.yml` in the repo root — APM's own marker". Docs agree: `apm init` creates
  `apm.yml` and nothing else, and `.apm/` alone is the "APM package" layout
  [doc: cli/init, package-types].
- **`README.md`.** APM lists it as part of a producer package ("displayed on the
  marketplace listing") [doc: /apm/producer/]; `SCAFFOLD_ENTRIES` writes one.
- **Private-repo consumption.** Nothing producer-side changes for a private
  harness [doc: private-and-org-packages]; Maestro's ambient-env-only driver is
  already what the documented auth chain expects.

## Unmeasured

Named so nobody mistakes silence for absence:

- Whether apm 0.26.0 refuses a `SKILL.md` with no `name:` in frontmatter (D2).
- Whether `apm marketplace add` works against a **private** repo, and how release
  assets authenticate.
- Whether a Maestro-shaped harness actually exits 3 on
  `apm pack --check-versions` (G1) — inferred from the documented lockstep rule
  and the exit-code table, not run. Running it needs a sandbox `HOME`
  (`LEARNINGS.md` · spike-isolation) and would write `build/`.
- Anything about hook or MCP **deploy** behaviour — still the "Unobserved"
  section of `docs/apm-behavior.md`.

