import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { DeployStateReader } from "./deploy-state-reader";

const REPO = "/repo";
const LOCKFILE = `${REPO}/apm.lock.yaml`;

// Builds an apm.lock.yaml the way apm writes it: a tag-pinned skill entry has
// resolved_ref (the human tag), virtual_path, and package_type. See
// .claude/rules/apm-driver.md for the observed shape.
function lockfile(entries: string): string {
  return `lockfile_version: '1'\ngenerated_at: '2026-06-05T13:22:03+00:00'\napm_version: 0.16.0\ndependencies:\n${entries}`;
}

function skillEntry(ref: string, virtualPath: string): string {
  return `- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb\n  resolved_ref: ${ref}\n  virtual_path: ${virtualPath}\n  is_virtual: true\n  package_type: claude_skill\n  deployed_files:\n  - .claude/${virtualPath}\n  content_hash: sha256:abc\n`;
}

describe("DeployStateReader", () => {
  it("lists a deployed skill with its name and human tag version", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: lockfile(skillEntry("v0.5.0", "skills/tdd")) },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [],
    });
  });

  it("lists every deployed skill", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(
          skillEntry("v0.5.0", "skills/tdd") +
            skillEntry("v1.2.0", "skills/diagnose"),
        ),
      },
    });
    const reader = new DeployStateReader({ fs });

    const result = await reader.read(REPO);

    expect(result).toEqual({
      ok: true,
      primitives: [
        { type: "skill", name: "tdd", version: "v0.5.0" },
        { type: "skill", name: "diagnose", version: "v1.2.0" },
      ],
      skipped: [],
    });
  });

  it("shows an empty list when the repo has no lockfile", async () => {
    const fs = new InMemoryFileSystem();
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [],
      skipped: [],
    });
  });

  it("shows an empty list when the lockfile has no dependencies", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]:
          "lockfile_version: '1'\napm_version: 0.16.0\ndependencies: []\n",
      },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [],
      skipped: [],
    });
  });

  it("reports malformed when the lockfile is not valid YAML", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: "dependencies: [unterminated\n" },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("reports malformed when the lockfile shape is invalid", async () => {
    const fs = new InMemoryFileSystem({
      // Valid YAML, but dependencies is not the expected array of entries.
      files: { [LOCKFILE]: "dependencies: not-a-list\n" },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("skips an entry of an unsupported package_type and surfaces it", async () => {
    const hookEntry =
      "- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb\n  resolved_ref: v0.5.0\n  virtual_path: hooks/format\n  is_virtual: true\n  package_type: claude_hook\n  deployed_files:\n  - .claude/hooks/format\n  content_hash: sha256:abc\n";
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(hookEntry + skillEntry("v0.5.0", "skills/tdd")),
      },
    });
    const reader = new DeployStateReader({ fs });

    const result = await reader.read(REPO);

    expect(result).toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [{ virtualPath: "hooks/format", packageType: "claude_hook" }],
    });
  });
});
