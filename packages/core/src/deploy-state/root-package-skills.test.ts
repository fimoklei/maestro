import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type LockfileEntry, parseLockfile } from "../lockfile/lockfile";
import {
  attributeRootPackageFiles,
  countExtraRootPackageFiles,
  isRootPackage,
} from "./root-package-skills";

// The exact apm 0.29.0 output of a narrow re-install that left phantom rows
// behind: `delta` is named in deployed_files but is on neither tool root
// (docs/research/941-narrowing-spike.md, step 3d).
const PHANTOM_LOCKFILE = readFileSync(
  new URL(
    "../../../../tests/fixtures/apm.lock.spike-941-step3d-phantom.yaml",
    import.meta.url,
  ),
  "utf8",
);

// The lockfile's first dependency, or a loud failure: a fixture that stopped
// parsing must not read as an entry with nothing in it.
const firstEntry = (raw: string): LockfileEntry => {
  const parsed = parseLockfile(raw);
  const entry = parsed.ok ? parsed.entries[0] : undefined;
  if (entry === undefined) {
    throw new Error("the lockfile under test must hold one entry");
  }
  return entry;
};

const rootEntry = () => firstEntry(PHANTOM_LOCKFILE);

const PREFIXES = [".claude", ".agents"];

describe("isRootPackage", () => {
  it("recognises the apm_package row a Harness dependency writes", () => {
    expect(isRootPackage(rootEntry())).toBe(true);
  });

  it("does not recognise a per-skill claude_skill row", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .apm/skills/tdd\n  package_type: claude_skill\n",
    );
    expect(isRootPackage(entry)).toBe(false);
  });
});

describe("attributeRootPackageFiles", () => {
  it("attributes each recorded file to its tool prefix and skill name", () => {
    const attributed = attributeRootPackageFiles(rootEntry(), PREFIXES);

    expect(
      attributed.map((skill) => `${skill.prefix}/${skill.name}`),
    ).toStrictEqual([
      ".claude/alpha",
      ".claude/beta",
      ".claude/gamma",
      ".claude/zeta",
      ".agents/alpha",
      ".agents/beta",
      ".agents/delta",
      ".agents/gamma",
      ".agents/zeta",
    ]);
  });

  it("carries the files under a skill, so their presence can be probed", () => {
    const attributed = attributeRootPackageFiles(rootEntry(), PREFIXES);
    const alpha = attributed.find(
      (skill) => skill.prefix === ".claude" && skill.name === "alpha",
    );

    expect(alpha?.files).toStrictEqual([".claude/skills/alpha/SKILL.md"]);
  });

  it("drops the directory row, which names no file under the skill", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .\n  package_type: apm_package\n  deployed_files:\n  - .claude/skills/tdd\n",
    );

    expect(attributeRootPackageFiles(entry, PREFIXES)).toStrictEqual([]);
  });

  it("ignores a file outside any tool's skills directory", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .\n  package_type: apm_package\n  deployed_files:\n  - .claude/hooks/format/hook.json\n  - .cursor/skills/tdd/SKILL.md\n",
    );

    expect(attributeRootPackageFiles(entry, PREFIXES)).toStrictEqual([]);
  });

  it("never reads a name from skill_subset, which keeps stale names", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .\n  package_type: apm_package\n  skill_subset:\n  - tdd\n  - grill\n  deployed_files:\n  - .claude/skills/tdd/SKILL.md\n",
    );

    expect(
      attributeRootPackageFiles(entry, PREFIXES).map((skill) => skill.name),
    ).toStrictEqual(["tdd"]);
  });
});

describe("countExtraRootPackageFiles", () => {
  it("counts the recorded files a tool subtree holds outside skills/", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .\n  package_type: apm_package\n  deployed_files:\n  - .claude/skills/tdd/SKILL.md\n  - .claude/agents/reviewer.md\n  - .agents/hooks/format/hook.json\n",
    );

    expect(countExtraRootPackageFiles(entry, PREFIXES)).toBe(2);
  });

  it("counts the skill directory row as part of the selection", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .\n  package_type: apm_package\n  deployed_files:\n  - .claude/skills/tdd\n  - .claude/skills/tdd/SKILL.md\n",
    );

    expect(countExtraRootPackageFiles(entry, PREFIXES)).toBe(0);
  });

  it("counts nothing outside the prefixes it was given", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .\n  package_type: apm_package\n  deployed_files:\n  - .claude/agents/reviewer.md\n  - .agents/agents/reviewer.md\n",
    );

    expect(countExtraRootPackageFiles(entry, [".claude"])).toBe(1);
  });

  it("counts nothing on a record that names no file", () => {
    const entry = firstEntry(
      "dependencies:\n- resolved_ref: v1.0.0\n  virtual_path: .\n  package_type: apm_package\n",
    );

    expect(countExtraRootPackageFiles(entry, PREFIXES)).toBe(0);
  });
});
