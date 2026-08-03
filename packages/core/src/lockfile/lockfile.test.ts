import { describe, expect, it } from "vitest";
import {
  classifyPackageType,
  claudeSkillName,
  parseLockfile,
  unreadableCovers,
} from "./lockfile";

// A tag-pinned claude_skill entry the way apm writes it (apm-driver.md): the
// human tag, the virtual path, the type, and the optional per-file hashes.
function skillEntry(opts?: { hashes?: boolean }): string {
  const hashes = opts?.hashes
    ? [
        "    deployed_file_hashes:",
        "      .claude/skills/tdd/SKILL.md: sha256:abc",
      ]
    : [];
  return [
    "dependencies:",
    "  - resolved_ref: v0.5.0",
    "    virtual_path: .apm/skills/tdd",
    "    package_type: claude_skill",
    ...hashes,
    "",
  ].join("\n");
}

describe("parseLockfile", () => {
  it("returns the dependencies of a valid lockfile", () => {
    const result = parseLockfile(skillEntry());

    expect(result).toEqual({
      ok: true,
      entries: [
        {
          resolved_ref: "v0.5.0",
          virtual_path: ".apm/skills/tdd",
          package_type: "claude_skill",
        },
      ],
      unreadable: [],
    });
  });

  it("carries the optional per-file hashes when present", () => {
    const result = parseLockfile(skillEntry({ hashes: true }));

    expect(result).toEqual({
      ok: true,
      entries: [
        {
          resolved_ref: "v0.5.0",
          virtual_path: ".apm/skills/tdd",
          package_type: "claude_skill",
          deployed_file_hashes: { ".claude/skills/tdd/SKILL.md": "sha256:abc" },
        },
      ],
      unreadable: [],
    });
  });

  it("fails on text that is not valid YAML", () => {
    expect(parseLockfile("dependencies: [unterminated\n")).toEqual({
      ok: false,
    });
  });

  it("fails when the shape does not match the schema", () => {
    expect(parseLockfile("dependencies: not-a-list\n")).toEqual({ ok: false });
  });

  it("keeps the readable entries when one entry is missing resolved_ref", () => {
    const raw = [
      "dependencies:",
      "  - virtual_path: .apm/skills/local-one",
      "    package_type: claude_skill",
      "  - resolved_ref: v0.5.0",
      "    virtual_path: .apm/skills/tdd",
      "    package_type: claude_skill",
      "",
    ].join("\n");

    expect(parseLockfile(raw)).toEqual({
      ok: true,
      entries: [
        {
          resolved_ref: "v0.5.0",
          virtual_path: ".apm/skills/tdd",
          package_type: "claude_skill",
        },
      ],
      unreadable: [{ virtualPath: ".apm/skills/local-one" }],
    });
  });

  it("reports an unreadable entry that has no usable virtual_path", () => {
    const raw = ["dependencies:", "  - not-an-object", ""].join("\n");

    expect(parseLockfile(raw)).toEqual({
      ok: true,
      entries: [],
      unreadable: [{ virtualPath: null }],
    });
  });
});

describe("unreadableCovers", () => {
  it("covers a skill an unreadable entry names", () => {
    expect(unreadableCovers([{ virtualPath: ".apm/skills/tdd" }], "tdd")).toBe(
      true,
    );
  });

  it("covers every skill when an unreadable entry cannot be named", () => {
    expect(unreadableCovers([{ virtualPath: null }], "tdd")).toBe(true);
  });

  it("leaves a skill no unreadable entry names alone", () => {
    expect(
      unreadableCovers([{ virtualPath: ".apm/skills/other" }], "tdd"),
    ).toBe(false);
  });
});

describe("claudeSkillName", () => {
  it("names a claude_skill entry by its virtual_path basename", () => {
    expect(
      claudeSkillName({
        resolved_ref: "v0.5.0",
        virtual_path: ".apm/skills/tdd",
        package_type: "claude_skill",
      }),
    ).toBe("tdd");
  });

  it("returns null for any other package_type", () => {
    expect(
      claudeSkillName({
        resolved_ref: "v0.5.0",
        virtual_path: "hooks/format",
        package_type: "claude_hook",
      }),
    ).toBeNull();
  });
});

describe("classifyPackageType", () => {
  it("classifies a claude_skill as a skill", () => {
    expect(classifyPackageType("claude_skill")).toBe("skill");
  });

  it("classifies a materialized hybrid as unsupported, not as another primitive", () => {
    expect(classifyPackageType("hybrid")).toBe("unsupported");
  });

  it("classifies a marketplace_plugin as unsupported", () => {
    expect(classifyPackageType("marketplace_plugin")).toBe("unsupported");
  });

  it("classifies apm's own invalid verdict as invalid", () => {
    expect(classifyPackageType("invalid")).toBe("invalid");
  });

  it("classifies a genuinely different primitive as other", () => {
    expect(classifyPackageType("claude_hook")).toBe("other");
  });
});

describe("parseLockfile package_type shape", () => {
  it("refuses an entry whose package_type is not a bounded token", () => {
    // The one apm-derived field that crosses to the browser, so it is checked
    // where apm's output is first read (ADR-0018).
    const raw = [
      "dependencies:",
      "- resolved_ref: v0.5.0",
      "  virtual_path: skills/tdd",
      '  package_type: "<script>alert(1)</script>"',
      "",
    ].join("\n");

    const parsed = parseLockfile(raw);

    expect(parsed).toEqual({
      ok: true,
      entries: [],
      unreadable: [{ virtualPath: "skills/tdd" }],
    });
  });
});
