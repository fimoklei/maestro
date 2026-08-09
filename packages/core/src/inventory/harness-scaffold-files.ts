// The canonical empty Harness, written as data so one reader owns the shape.
// apm scaffolds `apm.yml` and nothing else, and `plugin.json` belongs to the
// plugin-author workflow — see docs/research/552-empty-repo-and-scaffold-shape.md.
import { HARNESS_MANIFEST, HARNESS_SKILLS_DIR } from "./harness-layout";

export type ScaffoldFile = { path: string; contents: string };

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

export const canonicalHarnessFiles = (ownerRepo: string): ScaffoldFile[] => {
  const repo = ownerRepo.split("/")[1] ?? ownerRepo;
  return [
    { path: HARNESS_MANIFEST, contents: manifest(repo) },
    { path: "README.md", contents: readme(ownerRepo, repo) },
    { path: `${HARNESS_SKILLS_DIR}/.gitkeep`, contents: "" },
    { path: WORKFLOW, contents: SKILL_CHECK_WORKFLOW },
  ];
};

// `apm init -y`'s own output, reproduced rather than shelled out to: the
// command writes this one file and nothing else (#552 S1).
const manifest = (repo: string) => `name: ${repo}
version: 1.0.0
description: APM project for ${repo}
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
