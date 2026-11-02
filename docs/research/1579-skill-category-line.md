# A `category:` line in a skill's `SKILL.md` front matter

Date: 2026-10-19. Research only, for #1579; feeds #1581.

Question: what do apm 0.32.0, Claude Code and Codex do with an extra
top-level `category:` line in a skill's `SKILL.md` front matter?

Each fact is graded **measured** (sandbox capture), **source** (installed
apm source under
`~/.local/share/uv/tools/apm-cli/lib/python3.11/site-packages/apm_cli/`, or
Codex source at commit `d24507a`) or **docs** (official tool docs).

## Answer

- **apm delivers the line unchanged.** Deployed copies are byte-identical
  to the source. apm does not warn, refuse or lift the field anywhere
  (measured).
- **Lockfile and `apm outdated` react to bytes and tags, not to the
  field.** A release that adds only a `category:` line changes that skill's
  `deployed_file_hashes` and `content_hash`, like any byte change. The
  lockfile never contains `category`. `apm outdated` compares tags only: it
  reports a newer tag and stays silent about a category line edited in a
  deployed copy (measured).
- **Claude Code and Codex both load the skill and ignore the line.** Claude
  Code drops unknown fields silently (docs). Codex deserializes only `name`,
  `description` and `metadata.short-description`, with no
  `deny_unknown_fields`, so serde ignores the rest (source). Neither lists
  `category` among what it puts in the model's skill listing (docs).
- **But a top-level `category:` is not spec-valid.** The Agent Skills spec
  allows `name`, `description`, `license`, `compatibility`, `metadata`,
  `allowed-tools`. Claude's docs say an upload to claude.ai, the Skills API
  or `package_skill.py` fails with a hard error on a field the spec does not
  allow. The spec's home for such data is `metadata:` (a string-to-string
  map), e.g. `metadata: { category: review }`. Claude Code "doesn't act on
  its contents"; Codex reads only `metadata.short-description`; apm copies
  it byte-for-byte either way (source, docs).

## apm 0.32.0

**Source.** For a Harness with `apm.yml` and `.apm/skills/`, validation
(`models/validation.py:862`, `_validate_apm_package_with_yml`) never opens
`SKILL.md`. The root-`skills/` bundle validator
(`models/validation.py:593-690`) parses front matter but only warns on a
name mismatch, a missing `description` or non-ASCII values; it has no key
allowlist. Delivery is `shutil.copytree` (`integration/skill_integrator.py:1218`)
followed by markdown link rewriting (`:524-546`), which rewrites only link
targets. apm's own comment on hybrid packages (`models/validation.py:787-790`)
says the same: "APM never reads or mutates this field; the file is copied
byte-for-byte into <target>/skills/<name>/".

**Measured.** Sandbox `HOME` under the session scratchpad, no tokens,
`COLUMNS=200`, local bare repo served as
`github.com/fimoklei/maestro-fixture-harness` through the `GIT_CONFIG_COUNT`
`insteadOf` redirect. No run printed `GitHub API rate limit hit`; all four
installs printed `Installed 1 APM dependency`, exit 0.

Harness: `v1.0.0` has `alpha` (no category) and `beta`
(`category: review`); `v1.1.0` adds only `category: writing` to `alpha`.

| Step | Result |
|---|---|
| Project install `#v1.0.0 --skill alpha --skill beta -t claude,codex` | `.claude/skills/*/SKILL.md` and `.agents/skills/*/SKILL.md` byte-identical to source; no warning in `--verbose` output |
| `apm outdated` | `v1.0.0 → v1.1.0  outdated  git tags` |
| Install at `ref: v1.1.0` | copies identical to source; lockfile diff = `resolved_commit`, `resolved_ref`, `alpha` `deployed_file_hashes` and `content_hash` only |
| `apm outdated` | `All dependencies are up-to-date` |
| Edit `category:` in both deployed `alpha` copies, `apm outdated` | `All dependencies are up-to-date` (local edit not reported) |
| Same-ref reinstall | edit silently reset to `category: writing`; lockfile unchanged (the known reset, `docs/apm-behavior.md`) |
| `-g` install `#v1.1.0`, neutral cwd | `~/.claude/skills/` and `~/.agents/skills/` copies identical; `apm outdated -g` up to date |
| `grep category` over all four captured lockfiles | 0 hits |

## Claude Code (docs)

[Skills → Frontmatter reference](https://code.claude.com/docs/en/skills):
"A field name must match the table exactly, hyphens included: Claude Code
ignores a field it doesn't recognize without reporting an error." The skill
listing carries `description` (plus `when_to_use`); "full skill content only
loads when invoked". `metadata` is a "free-form YAML map … Claude Code
doesn't act on its contents". Under "Using skill frontmatter outside Claude
Code": "If you include any field the spec doesn't allow, packaging or upload
fails with a hard error instead of ignoring the field".

## Codex (docs, source)

[Build skills](https://learn.chatgpt.com/docs/build-skills) (the redirect
target of `developers.openai.com/codex/skills`): `SKILL.md` "must include
`name` and `description`"; Codex starts with each skill's name, description
and file path, and loads the full `SKILL.md` when it uses the skill. The
docs do not say what happens to unknown fields.

Source: [`codex-rs/skills/src/parser.rs`](https://github.com/openai/codex/blob/d24507a59b27464c69819e310e9429ce49c3a855/codex-rs/skills/src/parser.rs)
`SkillFrontmatter { name, description, metadata }` with
`SkillFrontmatterMetadata { short-description }`, plain `Deserialize`, no
`deny_unknown_fields`. The skill loader
(`codex-rs/ext/skills/src/loader/`) calls `parse_skill_frontmatter_metadata`.

## Agent Skills spec

[agentskills.io/specification](https://agentskills.io/specification):
fields `name`, `description`, `license`, `compatibility`, `metadata`,
`allowed-tools`. `metadata` is "a map from string keys to string values";
"Clients can use this to store additional properties not defined by the
Agent Skills spec". `skills-ref validate` checks the front matter.

## Not established

- Whether the raw front-matter line reaches the model once a skill is
  invoked; neither tool's docs say.
- Claude Code and Codex behavior was not measured, only read from docs and
  source. Codex source is a `main` commit, not a release tag.
- Only apm 0.32.0 (0.34.0 exists) and only the `claude` and `codex`
  targets. Nested `metadata.category` was read from source, not spiked.
- Captures and scripts stayed in the session scratchpad.
