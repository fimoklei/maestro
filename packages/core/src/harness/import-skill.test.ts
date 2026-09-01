import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CopySkillFolderResult } from "../filesystem/copy-skill-folder";
import { ImportSkill } from "./import-skill";

const ROOT = "/harness";
const SOURCE = "/work/Code Review";
const MANIFEST =
  "---\nname: whatever\ndescription: Reviews code.\n---\n\nBody.\n";

// One in-memory disk: paths that exist, directories among them, and file text.
function harness(
  overrides: {
    files?: Record<string, string>;
    directories?: string[];
    deployedTargets?: { treeRoot: string; lockfilePath: string }[];
    copy?: () => Promise<CopySkillFolderResult>;
  } = {},
) {
  const files: Record<string, string> = {
    [`${SOURCE}/SKILL.md`]: MANIFEST,
    ...overrides.files,
  };
  // "/" is the ceiling every case but the outside-root one runs under.
  const directories = new Set([
    "/",
    ROOT,
    SOURCE,
    ...(overrides.directories ?? []),
  ]);
  const copied: { input: unknown }[] = [];

  const fs = {
    realpath: async (path: string) => {
      if (!directories.has(path) && files[path] === undefined) {
        throw new Error("ENOENT");
      }
      return path;
    },
    isDirectory: async (path: string) => directories.has(path),
    exists: async (path: string) =>
      directories.has(path) || files[path] !== undefined,
    readFile: async (path: string) => files[path] ?? null,
    writeFile: async (path: string, contents: string) => {
      files[path] = contents;
    },
    ensureDir: vi.fn(async (path: string) => {
      directories.add(path);
    }),
  };

  const importSkill = new ImportSkill({
    resolveRoot: async () => ROOT,
    homeRoot: () => "/",
    fs,
    copy: {
      copy: async (input) => {
        copied.push({ input });
        if (overrides.copy) {
          return overrides.copy();
        }
        const staged = `${input.destinationParent}/.staging`;
        files[`${staged}/SKILL.md`] = MANIFEST;
        if (input.finalize !== undefined && !(await input.finalize(staged))) {
          return { ok: false, error: "copy-failed" };
        }
        const path = `${input.destinationParent}/${input.name}`;
        directories.add(path);
        files[`${path}/SKILL.md`] = files[`${staged}/SKILL.md`] as string;
        return { ok: true, path, skipped: 0 };
      },
    },
    deployedTargets: async () => overrides.deployedTargets ?? [],
  });

  return { importSkill, files, directories, copied, fs };
}

describe("ImportSkill.check", () => {
  it("proposes a slug from the folder name and refuses nothing", async () => {
    const { importSkill } = harness();

    const result = await importSkill.check({ source: SOURCE });

    expect(result).toEqual({
      ok: true,
      check: {
        name: "code-review",
        sourceBlocker: null,
        nameBlocker: null,
        advisories: [],
      },
    });
  });

  it("refuses a source with no SKILL.md", async () => {
    const { importSkill } = harness({ directories: ["/work/empty"] });

    await expect(
      importSkill.check({ source: "/work/empty" }),
    ).resolves.toMatchObject({ check: { sourceBlocker: "missing-manifest" } });
  });

  it("refuses frontmatter that does not parse", async () => {
    const { importSkill } = harness({
      files: { [`${SOURCE}/SKILL.md`]: "---\n: :\n---\n" },
    });

    await expect(importSkill.check({ source: SOURCE })).resolves.toMatchObject({
      check: { sourceBlocker: "invalid-frontmatter" },
    });
  });

  it("refuses an empty description", async () => {
    const { importSkill } = harness({
      files: { [`${SOURCE}/SKILL.md`]: "---\ndescription: '  '\n---\n" },
    });

    await expect(importSkill.check({ source: SOURCE })).resolves.toMatchObject({
      check: { sourceBlocker: "empty-description" },
    });
  });

  it("refuses a source that is not a readable directory", async () => {
    const { importSkill } = harness();

    await expect(
      importSkill.check({ source: "/work/gone" }),
    ).resolves.toMatchObject({ check: { sourceBlocker: "source-unreadable" } });
  });

  it("refuses a folder outside the ceiling the picker browses", async () => {
    const outside = new ImportSkill({
      resolveRoot: async () => ROOT,
      homeRoot: () => "/home/me",
      fs: {
        realpath: async (path: string) => path,
        isDirectory: async () => true,
        exists: async () => false,
        readFile: async () => MANIFEST,
        writeFile: async () => {},
        ensureDir: async () => {},
      },
      copy: { copy: async () => ({ ok: false, error: "copy-failed" }) },
      deployedTargets: async () => [],
    });

    await expect(outside.check({ source: SOURCE })).resolves.toMatchObject({
      check: { sourceBlocker: "outside-root" },
    });
  });

  it("refuses a copy the registered target's lockfile records as deployed", async () => {
    const deployed = "/repo/.claude/skills/code-review";
    const lockfile = [
      "dependencies:",
      "- virtual_path: skills/code-review",
      "  resolved_ref: v1.0.0",
      "  package_type: claude_skill",
      "  deployed_files:",
      "  - .claude/skills/code-review",
      "  - .claude/skills/code-review/SKILL.md",
    ].join("\n");
    const { importSkill } = harness({
      files: {
        [`${deployed}/SKILL.md`]: MANIFEST,
        "/repo/apm.lock.yaml": lockfile,
      },
      directories: [deployed],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({ check: { sourceBlocker: "deployed-copy" } });
  });

  it("lets a hand-authored skill through even though it sits where a deploy would write (#667)", async () => {
    const authored = "/repo/.claude/skills/code-review";
    const { importSkill } = harness({
      files: {
        [`${authored}/SKILL.md`]: MANIFEST,
        "/repo/apm.lock.yaml": "dependencies: []",
      },
      directories: [authored],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      importSkill.check({ source: authored }),
    ).resolves.toMatchObject({ check: { sourceBlocker: null } });
  });

  it("reports a name the harness already holds on the name, not the source", async () => {
    const { importSkill } = harness({
      directories: [`${ROOT}/.apm/skills/code-review`],
    });

    await expect(importSkill.check({ source: SOURCE })).resolves.toMatchObject({
      check: { sourceBlocker: null, nameBlocker: "name-taken" },
    });
  });

  it("refuses a chosen name that is not a slug", async () => {
    const { importSkill } = harness();

    await expect(
      importSkill.check({ source: SOURCE, name: "Code Review" }),
    ).resolves.toMatchObject({ check: { nameBlocker: "invalid-name" } });
  });

  it("reports the conventions without refusing", async () => {
    const long = `---\ndescription: ${"d".repeat(1025)}\n---\n${"line\n".repeat(500)}`;
    const { importSkill } = harness({
      files: { [`${SOURCE}/SKILL.md`]: long },
    });

    await expect(importSkill.check({ source: SOURCE })).resolves.toMatchObject({
      check: {
        sourceBlocker: null,
        nameBlocker: null,
        advisories: ["long-manifest", "long-description"],
      },
    });
  });

  it("reports an unconnected harness rather than a blocker", async () => {
    const unconnected = new ImportSkill({
      resolveRoot: async () => undefined,
      homeRoot: () => "/",
      fs: {
        realpath: async (path: string) => path,
        isDirectory: async () => true,
        exists: async () => false,
        readFile: async () => MANIFEST,
        writeFile: async () => {},
        ensureDir: async () => {},
      },
      copy: { copy: async () => ({ ok: false, error: "copy-failed" }) },
      deployedTargets: async () => [],
    });

    await expect(unconnected.check({ source: SOURCE })).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });
});

describe("ImportSkill.execute", () => {
  let disk: ReturnType<typeof harness>;

  beforeEach(() => {
    disk = harness();
  });

  it("copies the folder under the harness's skills directory", async () => {
    const result = await disk.importSkill.execute({ source: SOURCE });

    expect(result).toEqual({ ok: true, name: "code-review", skipped: 0 });
    // The canonical source and the harness's own skills directory, never a
    // path the caller supplied.
    expect(disk.copied).toMatchObject([
      {
        input: {
          source: SOURCE,
          destinationParent: `${ROOT}/.apm/skills`,
          name: "code-review",
        },
      },
    ]);
    expect(disk.fs.ensureDir).toHaveBeenCalledWith(`${ROOT}/.apm/skills`);
  });

  it("rewrites the copied manifest's name to the directory name", async () => {
    await disk.importSkill.execute({ source: SOURCE, name: "reviewer" });

    expect(disk.files[`${ROOT}/.apm/skills/reviewer/SKILL.md`]).toContain(
      "name: reviewer",
    );
  });

  it("refuses before copying when the name is taken", async () => {
    const taken = harness({ directories: [`${ROOT}/.apm/skills/code-review`] });

    await expect(
      taken.importSkill.execute({ source: SOURCE }),
    ).resolves.toEqual({ ok: false, error: "name-taken" });
    expect(taken.copied).toEqual([]);
  });

  it("passes a refused copy back as its own reason", async () => {
    const failing = harness({
      copy: async () => ({ ok: false, error: "too-many-files" }),
    });

    await expect(
      failing.importSkill.execute({ source: SOURCE }),
    ).resolves.toEqual({ ok: false, error: "too-many-files" });
  });
});
