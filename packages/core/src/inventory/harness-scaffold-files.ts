// The canonical empty Harness, written as data so one reader owns the shape.
// apm scaffolds `apm.yml` and nothing else, and `plugin.json` belongs to the
// plugin-author workflow — see docs/research/552-empty-repo-and-scaffold-shape.md.
import { stringify } from "yaml";
import { HARNESS_MANIFEST, HARNESS_SKILLS_DIR } from "./harness-layout";

// skipIfExists marks a file the scaffold offers but never overwrites: a
// caller's own CONTRIBUTING.md wins over the canonical default (#678).
export type ScaffoldFile = {
  path: string;
  contents: string;
  skipIfExists?: boolean;
};

const WORKFLOW = ".github/workflows/skill-check.yml";

// Every entry the scaffold brings into existence, parents included, so an
// occupied `.github/` is refused before a single byte is written.
export const SCAFFOLD_ENTRIES = [
  ".apm",
  HARNESS_SKILLS_DIR,
  `${HARNESS_SKILLS_DIR}/.gitkeep`,
  ".github",
  ".github/workflows",
  WORKFLOW,
  "README.md",
  HARNESS_MANIFEST,
];

// The top of every tree the scaffold creates, and so exactly what a rollback
// removes: nothing under these existed before SCAFFOLD_ENTRIES was cleared.
export const SCAFFOLD_ROOTS = [
  ".apm",
  ".github",
  "README.md",
  HARNESS_MANIFEST,
];

export const canonicalHarnessFiles = (ownerRepo: string): ScaffoldFile[] => {
  const repo = ownerRepo.split("/")[1] ?? ownerRepo;
  return [
    { path: HARNESS_MANIFEST, contents: manifest(repo) },
    { path: "README.md", contents: readme(ownerRepo, repo) },
    { path: `${HARNESS_SKILLS_DIR}/.gitkeep`, contents: "" },
    { path: WORKFLOW, contents: SKILL_CHECK_WORKFLOW },
    {
      path: "CONTRIBUTING.md",
      contents: contributing(ownerRepo),
      skipIfExists: true,
    },
  ];
};

// A repository name is a valid YAML scalar only by accident: `true`, `null`
// and `123` are legal GitHub names that parse as non-strings unquoted.
const scalar = (value: string) => stringify(value).trimEnd();

// `apm init -y`'s own output, reproduced rather than shelled out to: the
// command writes this one file and nothing else (#552 S1).
// The git tag is the real version (#642); this field exists only because
// APM's schema requires it — never repair it back to 1.0.0.
const manifest = (repo: string) => `name: ${scalar(repo)}
version: 0.0.0
description: ${scalar(`APM project for ${repo}`)}
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
`;

const readme = (ownerRepo: string, repo: string) => `# ${repo}

The team Harness: every skill this team shares, authored in one place.

A skill is a directory under \`${HARNESS_SKILLS_DIR}/\` holding a \`SKILL.md\`
whose frontmatter carries a non-empty \`description\`. The advisory
\`skill-check\` workflow reports on that shape; it never blocks a merge.

Install one skill by its tag-pinned ref:

    apm install github.com/${ownerRepo}/${HARNESS_SKILLS_DIR}/<skill>#v0.1.0

Nothing is tagged yet. \`v0.1.0\` is the first release of real skill content,
not of this scaffold.
`;

// The settled review/release policy (fimoklei/maestro#629), written as the
// three situations a contributor is actually in (#715, after fimoklei/harness#6)
// because scaffold is the only place a fresh Harness gets it in writing.
const contributing = (ownerRepo: string) => `# Contributing

\`README.md\` says what this Harness is. This file says what to do, step by step.

## I want to add a new skill

1. Write it and try it out in \`~/.claude/skills/\` on your own machine — this
   is your personal, ungated set of skills; nothing here is shared yet.
2. Once it works, press **Import skill…** in Maestro's Harness view. That puts
   it in the **Working harness**: this repository's checked-out copy, ahead of
   what anyone has installed.
3. Press **Propose change** on its row. Maestro pushes the skill to a branch of
   its own and leaves a **Pull request →** link; follow it and open the pull
   request on GitHub.
4. Three rules check it before anyone merges it:
   - **Structurally valid** — the directory name matches the \`name\` in
     \`SKILL.md\`'s frontmatter, and \`description\` is filled in. The
     \`skill-check\` workflow reports this on the pull request; read it, it
     never blocks the merge by itself.
   - **Not repo-specific** — no paths, commands, or assumptions that only
     hold on one machine or in one repository. A skill that only works in one
     repository belongs in that repository's own \`.claude/skills/\`, not here.
   - **Admitted at the moment it was needed** — you added it because you
     needed it just now, not because it already existed somewhere else.
5. **One skill per pull request, always.** No batch imports.

**Example:** you write a \`grilling\` skill in \`~/.claude/skills/grilling\`, use
it a few times, then import it here and open a pull request for it alone.

## I want to change an existing skill

1. Open this repository (\`${ownerRepo}\`) itself and edit the skill in place
   under \`${HARNESS_SKILLS_DIR}/\`.
2. **Never edit a skill copy that Maestro deployed into another repository or
   globally.** That copy lives on a path Maestro's tooling owns, and it
   deletes local edits there without warning. Always edit the copy inside
   \`${ownerRepo}\`.
3. Press **Propose change** on its row in Maestro's Harness view and open the
   pull request from the **Pull request →** link, checked against the same
   three rules as a new skill (see above).

**Example:** \`grilling\` already exists in this Harness. To sharpen its
wording, you edit \`${HARNESS_SKILLS_DIR}/grilling/SKILL.md\` in this
repository, then open a pull request with just that change.

## My skill is ready — what now?

1. Open the pull request, if you have not already: **Propose change** in
   Maestro's Harness view pushes the branch, and the **Pull request →** link it
   leaves takes you to GitHub's form.
2. Someone other than you — the curator — reviews it and merges it. You never
   merge your own change. The Harness owner is the curator until the team
   names another.
3. Press **Refresh** in the Harness view. Your merged change now sits under
   **Pending release**: in this repository, but on no tag, so nobody else's
   Maestro installs it yet.
4. Press **Plan release**, read the plan, then press **Publish release** to cut
   the tag. That is what moves your skill into the **Released harness** — the
   tagged version teams actually install. Do this promptly after the merge; an
   unreleased change is invisible to the rest of the team.

Because trying a skill costs no tag, a tag stays a real promise: only cut one
when the content is ready, never just to test it.

## Why this is a human agreement

A private repository cannot enable branch protection without GitHub Pro, so
a contributor with tag-push rights may be technically able to merge their own
work. The steps above say they do not. Independent review holds because the
team agreed to it, not because GitHub enforces it.
`;

// The same three rules core applies at a ref (`validate-skill-structure.ts`),
// restated for the runner because a workflow cannot import them.
const SKILL_CHECK_WORKFLOW = `# Advisory structural check over the skills this Harness publishes.
#
# Assumes the GitHub-hosted \`ubuntu-latest\` runner and the Python 3 with PyYAML
# its image provides; nothing is installed here. If that assumption ever stops
# holding, the step below says so and still passes.
#
# Advisory means advisory: findings go to the run summary and the job succeeds
# either way. Structural shape is explained here, never enforced.
name: Skill check

on:
  push:
    paths:
      - "${HARNESS_SKILLS_DIR}/**"
  pull_request:
    paths:
      - "${HARNESS_SKILLS_DIR}/**"

jobs:
  skill-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Report skill structure
        # Belt and braces with the script's own exit 0: an advisory check that
        # can redden a pull request is not advisory.
        continue-on-error: true
        run: |
          python3 - <<'PY'
          import os, pathlib, re, sys

          SKILLS = pathlib.Path("${HARNESS_SKILLS_DIR}")
          FRONTMATTER = re.compile(r"^---\\n(.*?)\\n---[ \\t]*(?:\\r?\\n|$)", re.DOTALL)

          def report(lines):
              text = "\\n".join(["## Skill check", ""] + lines)
              print(text)
              summary = os.environ.get("GITHUB_STEP_SUMMARY")
              if summary:
                  pathlib.Path(summary).write_text(text + "\\n", encoding="utf-8")
              sys.exit(0)

          try:
              import yaml
          except ImportError:
              report(["This runner has no PyYAML, so frontmatter was not checked."])

          def problem(manifest):
              try:
                  # errors="replace" so an unreadable byte is a finding, never a
                  # crash — the same shape core reads at a ref.
                  raw = manifest.read_text(encoding="utf-8", errors="replace")
              except OSError:
                  return "missing-manifest"
              block = FRONTMATTER.match(raw)
              if block is None:
                  return "invalid-frontmatter"
              try:
                  data = yaml.safe_load(block.group(1))
              except yaml.YAMLError:
                  return "invalid-frontmatter"
              # A list or a bare scalar parses but is not frontmatter.
              if not isinstance(data, dict):
                  return "invalid-frontmatter"
              description = data.get("description")
              if not isinstance(description, str) or not description.strip():
                  return "empty-description"
              return None

          skills = sorted(p for p in SKILLS.iterdir() if p.is_dir()) if SKILLS.is_dir() else []
          findings = [(s.name, p) for s in skills for p in [problem(s / "SKILL.md")] if p]

          if findings:
              report(
                  ["| Skill | Problem |", "| --- | --- |"]
                  + ["| \`%s\` | %s |" % f for f in findings]
                  + ["", "Advisory only — this job does not fail."]
              )
          report(["%d skill(s): every one has a SKILL.md whose frontmatter parses and carries a description." % len(skills)])
          PY
`;
