import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CopySkillFolderResult } from "../filesystem/copy-skill-folder";
import { ImportSkill } from "./import-skill";
import type { HarnessSkillTrees } from "./read-harness-state";

const ROOT = "/harness";
const SOURCE = "/work/Code Review";
const MANIFEST =
  "---\nname: whatever\ndescription: Reviews code.\n---\n\nBody.\n";
// The same manifest as the import stamps it into the harness: the directory
// name is the skill's identity, so a copy that came from there names itself
// code-review.
const HELD_MANIFEST = MANIFEST.replace("whatever", "code-review");
const ORIGIN = "git@github.com:fimoklei/agent-harness.git";

// A lockfile recording one deployed skill folder, with whatever provenance the
// case is about.
const lockfile = (
  provenance: string[],
  virtualPath = ".apm/skills/code-review",
) =>
  [
    "dependencies:",
    `- virtual_path: ${virtualPath}`,
    "  resolved_ref: v1.0.0",
    "  package_type: claude_skill",
    ...provenance,
    "  deployed_files:",
    "  - .claude/skills/code-review",
    "  - .claude/skills/code-review/SKILL.md",
  ].join("\n");

const FROM_THIS_HARNESS = [
  "  host: github.com",
  "  repo_url: fimoklei/agent-harness",
];

// The cases refused before any two folders are compared.
const unreachableFacts = {
  describe: async () => {
    throw new Error("facts port was reached");
  },
};

// The cases that never reach a lockfile never reach git either.
const unreachableGit = {
  readFacts: async () => {
    throw new Error("git port was reached");
  },
  readMovementTrees: async () => {
    throw new Error("git port was reached");
  },
};

// One in-memory disk: paths that exist, directories among them, and file text.
function harness(
  overrides: {
    files?: Record<string, string>;
    directories?: string[];
    // Files carrying the one mode bit git tracks.
    executable?: string[];
    // Paths whose read fails outright, as a lockfile with no read permission
    // does — apart from one that is missing or does not parse.
    unreadable?: string[];
    deployedTargets?: { treeRoot: string; lockfilePath: string }[];
    copy?: () => Promise<CopySkillFolderResult>;
    originUrl?: string | null;
    trees?: HarnessSkillTrees | null;
    // The ceiling the picker browses under; "/" holds every seeded path.
    homeRoot?: string;
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
    readFile: async (path: string) => {
      if (overrides.unreadable?.includes(path) === true) {
        throw new Error("EACCES");
      }
      return files[path] ?? null;
    },
    listRawEntries: async (path: string) => {
      const prefix = `${path}/`;
      const names = new Set<string>();
      for (const key of [...Object.keys(files), ...directories]) {
        if (key.startsWith(prefix)) {
          names.add(key.slice(prefix.length).split("/")[0] as string);
        }
      }
      return [...names].map((name) => ({
        name,
        isDirectory: directories.has(prefix + name),
        isSymlink: false,
      }));
    },
    writeFile: async (path: string, contents: string) => {
      files[path] = contents;
    },
    ensureDir: vi.fn(async (path: string) => {
      directories.add(path);
    }),
  };

  const executable = new Set(overrides.executable ?? []);
  const facts = {
    describe: async (path: string) =>
      files[path] === undefined
        ? null
        : {
            kind: "file" as const,
            size: (files[path] as string).length,
            hardLinks: 1,
            executable: executable.has(path),
            identity: path,
          },
  };

  // The harness's own git: where it was cloned from, and whether its copy of a
  // skill still matches the commit it sits on.
  let trees: HarnessSkillTrees | null =
    overrides.trees === undefined
      ? {
          remote: {},
          promote: {},
          local: { "code-review": "tree-1" },
          working: { "code-review": "tree-1" },
        }
      : overrides.trees;
  const git = {
    readFacts: async () => ({
      originUrl:
        overrides.originUrl === undefined ? ORIGIN : overrides.originUrl,
      defaultBranch: "main",
      defaultBranchCommit: null,
      tags: [],
    }),
    readMovementTrees: async () => trees,
  };

  const importSkill = new ImportSkill({
    resolveRoot: async () => ROOT,
    homeRoot: () => overrides.homeRoot ?? "/",
    fs,
    facts,
    git,
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

  const setTrees = (next: HarnessSkillTrees | null) => {
    trees = next;
  };

  return { importSkill, files, directories, copied, fs, setTrees };
}

describe("ImportSkill.check", () => {
  it("proposes a slug from the folder name and refuses nothing", async () => {
    const { importSkill } = harness();

    const result = await importSkill.check({ source: SOURCE });

    expect(result).toEqual({
      ok: true,
      check: {
        mode: "add",
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
        listRawEntries: async () => [],
      },
      facts: unreachableFacts,
      copy: { copy: async () => ({ ok: false, error: "copy-failed" }) },
      git: unreachableGit,
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

  // One deployed copy of code-review, recorded by the registered repository's
  // lockfile with whatever provenance the case is about.
  const deployedInRepo = (
    provenance: string[],
    overrides: Parameters<typeof harness>[0] = {},
  ) => {
    const deployed = "/repo/.claude/skills/code-review";
    return {
      deployed,
      ...harness({
        ...overrides,
        files: {
          [`${deployed}/SKILL.md`]: MANIFEST,
          "/repo/apm.lock.yaml": lockfile(provenance),
          ...overrides.files,
        },
        directories: [
          deployed,
          `${ROOT}/.apm/skills/code-review`,
          ...(overrides.directories ?? []),
        ],
        deployedTargets: overrides.deployedTargets ?? [
          { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
        ],
      }),
    };
  };

  it("offers an update for a copy this Harness's own record deployed", async () => {
    const { importSkill, deployed } = deployedInRepo(FROM_THIS_HARNESS);

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: {
        mode: "update",
        name: "code-review",
        sourceBlocker: null,
        nameBlocker: null,
      },
    });
  });

  it("offers an update for a globally deployed copy too", async () => {
    const deployed = "/home/.claude/skills/code-review";
    const { importSkill } = harness({
      files: {
        [`${deployed}/SKILL.md`]: MANIFEST,
        "/home/.apm/apm.lock.yaml": lockfile(FROM_THIS_HARNESS),
      },
      directories: [deployed, `${ROOT}/.apm/skills/code-review`],
      deployedTargets: [
        { treeRoot: "/home", lockfilePath: "/home/.apm/apm.lock.yaml" },
      ],
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", name: "code-review" },
    });
  });

  it("reads two spellings of one remote as one origin", async () => {
    const { importSkill, deployed } = deployedInRepo(FROM_THIS_HARNESS, {
      originUrl: "https://github.com/fimoklei/agent-harness.git",
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({ check: { mode: "update" } });
  });

  it("refuses a copy whose record names a different repository", async () => {
    const { importSkill, deployed } = deployedInRepo([
      "  host: github.com",
      "  repo_url: someone-else/their-harness",
    ]);

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "add", sourceBlocker: "deployed-copy" },
    });
  });

  it("refuses a copy whose record cannot prove its origin", async () => {
    const { importSkill, deployed } = deployedInRepo(["  host: github.com"]);

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "add", sourceBlocker: "deployed-copy" },
    });
  });

  it("refuses a copy under a skill name the Harness does not hold", async () => {
    const deployed = "/repo/.claude/skills/code-review";
    const { importSkill } = harness({
      files: {
        [`${deployed}/SKILL.md`]: MANIFEST,
        "/repo/apm.lock.yaml": lockfile(FROM_THIS_HARNESS),
      },
      directories: [deployed],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "add", sourceBlocker: "deployed-copy" },
    });
  });

  it("refuses a copy whose record names something that is not a skill slug", async () => {
    // A record naming `Code Review` cannot be this Harness's own skill: the
    // Harness holds skills under slugs, and a name that is not one would reach
    // a path and a package ref it can never resolve (security.md).
    const deployed = "/repo/.claude/skills/code-review";
    const { importSkill } = harness({
      files: {
        [`${deployed}/SKILL.md`]: MANIFEST,
        "/repo/apm.lock.yaml": lockfile(
          FROM_THIS_HARNESS,
          ".apm/skills/Code Review",
        ),
      },
      directories: [deployed, `${ROOT}/.apm/skills/Code Review`],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "add", sourceBlocker: "deployed-copy" },
    });
  });

  it("keeps a copy outside the ceiling out of update mode, record or no record", async () => {
    // Outside the ceiling the deployment records are never consulted, so an
    // unreachable folder cannot become an update — it is refused for where it
    // sits, and the name it proposes is judged like any other addition.
    const { importSkill, deployed } = deployedInRepo(FROM_THIS_HARNESS, {
      homeRoot: "/elsewhere",
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: {
        mode: "add",
        name: "code-review",
        sourceBlocker: "outside-root",
        nameBlocker: "name-taken",
      },
    });
  });

  it("refuses an update while the Harness's own copy has uncommitted changes", async () => {
    const { importSkill, deployed } = deployedInRepo(FROM_THIS_HARNESS, {
      trees: {
        remote: {},
        promote: {},
        local: { "code-review": "tree-1" },
        working: { "code-review": "tree-2" },
      },
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", sourceBlocker: "harness-copy-uncommitted" },
    });
  });

  it("names the unreadable clone apart from work it can see is uncommitted", async () => {
    const { importSkill, deployed } = deployedInRepo(FROM_THIS_HARNESS, {
      trees: null,
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", sourceBlocker: "harness-unreadable" },
    });
  });

  // A deployed copy of code-review beside the Harness's own folder for it, each
  // holding the files the case is about.
  const update = (
    copy: Record<string, string>,
    held: Record<string, string>,
    executableInCopy: string[] = [],
  ) => {
    const prefix = (root: string, files: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [`${root}/${name}`, text]),
      );
    return deployedInRepo(FROM_THIS_HARNESS, {
      files: {
        ...prefix("/repo/.claude/skills/code-review", copy),
        ...prefix(`${ROOT}/.apm/skills/code-review`, held),
      },
      executable: executableInCopy.map(
        (name) => `/repo/.claude/skills/code-review/${name}`,
      ),
    });
  };

  it("refuses an update that holds what the Harness holds already", async () => {
    const { importSkill, deployed } = update(
      { "SKILL.md": HELD_MANIFEST },
      { "SKILL.md": HELD_MANIFEST },
    );

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", sourceBlocker: "nothing-to-carry-back" },
    });
  });

  it("refuses an update whose only edit is the name the copy stamps back", async () => {
    const { importSkill, deployed } = update(
      { "SKILL.md": MANIFEST },
      { "SKILL.md": HELD_MANIFEST },
    );

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", sourceBlocker: "nothing-to-carry-back" },
    });
  });

  it("carries an update through where one file differs", async () => {
    const { importSkill, deployed } = update(
      { "SKILL.md": HELD_MANIFEST, "steps.md": "One.\n" },
      { "SKILL.md": HELD_MANIFEST, "steps.md": "Two.\n" },
    );

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", sourceBlocker: null },
    });
  });

  it("carries an update through where only a file's executable bit differs", async () => {
    const { importSkill, deployed } = update(
      { "SKILL.md": HELD_MANIFEST, "run.sh": "One.\n" },
      { "SKILL.md": HELD_MANIFEST, "run.sh": "One.\n" },
      ["run.sh"],
    );

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", sourceBlocker: null },
    });
  });

  it("carries an update through where the Harness holds a file the copy does not", async () => {
    const { importSkill, deployed } = update(
      { "SKILL.md": HELD_MANIFEST },
      { "SKILL.md": HELD_MANIFEST, "steps.md": "One.\n" },
    );

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "update", sourceBlocker: null },
    });
  });

  it("keeps refusing a copy nothing can be compared against", async () => {
    const { importSkill, deployed } = deployedInRepo(FROM_THIS_HARNESS, {
      originUrl: null,
    });

    await expect(
      importSkill.check({ source: deployed }),
    ).resolves.toMatchObject({
      check: { mode: "add", sourceBlocker: "deployed-copy" },
    });
  });

  it("lets a folder through that an unreadable record claims nothing about", async () => {
    const authored = "/repo/.claude/skills/code-review";
    const { importSkill } = harness({
      files: {
        [`${authored}/SKILL.md`]: MANIFEST,
        // Readable, this entry would claim the folder and open update mode.
        "/repo/apm.lock.yaml": lockfile(FROM_THIS_HARNESS),
      },
      directories: [authored, `${ROOT}/.apm/skills/code-review`],
      unreadable: ["/repo/apm.lock.yaml"],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      importSkill.check({ source: authored }),
    ).resolves.toMatchObject({ check: { mode: "add", sourceBlocker: null } });
  });

  it("lets a folder through that an unparseable record claims nothing about", async () => {
    const authored = "/repo/.claude/skills/code-review";
    const { importSkill } = harness({
      files: {
        [`${authored}/SKILL.md`]: MANIFEST,
        "/repo/apm.lock.yaml": "dependencies: [",
      },
      directories: [authored],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      importSkill.check({ source: authored }),
    ).resolves.toMatchObject({ check: { mode: "add", sourceBlocker: null } });
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
        listRawEntries: async () => [],
      },
      facts: unreachableFacts,
      copy: { copy: async () => ({ ok: false, error: "copy-failed" }) },
      git: unreachableGit,
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

    expect(result).toEqual({
      ok: true,
      mode: "add",
      name: "code-review",
      skipped: 0,
    });
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

  it("replaces the Harness's own folder when it updates a deployed copy", async () => {
    const deployed = "/repo/.claude/skills/code-review";
    const update = harness({
      files: {
        [`${deployed}/SKILL.md`]: MANIFEST,
        "/repo/apm.lock.yaml": lockfile(FROM_THIS_HARNESS),
      },
      directories: [deployed, `${ROOT}/.apm/skills/code-review`],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      update.importSkill.execute({ source: deployed }),
    ).resolves.toEqual({
      ok: true,
      mode: "update",
      name: "code-review",
      skipped: 0,
    });
    expect(update.copied).toMatchObject([
      {
        input: {
          source: deployed,
          destinationParent: `${ROOT}/.apm/skills`,
          name: "code-review",
          replaceExisting: true,
        },
      },
    ]);
  });

  it("copies nothing for an update that carries no change", async () => {
    const deployed = "/repo/.claude/skills/code-review";
    const update = harness({
      files: {
        [`${deployed}/SKILL.md`]: HELD_MANIFEST,
        [`${ROOT}/.apm/skills/code-review/SKILL.md`]: HELD_MANIFEST,
        "/repo/apm.lock.yaml": lockfile(FROM_THIS_HARNESS),
      },
      directories: [deployed, `${ROOT}/.apm/skills/code-review`],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });

    await expect(
      update.importSkill.execute({ source: deployed }),
    ).resolves.toEqual({ ok: false, error: "nothing-to-carry-back" });
    expect(update.copied).toEqual([]);
  });

  it("refuses at confirm a Harness that gained uncommitted changes since the check", async () => {
    const deployed = "/repo/.claude/skills/code-review";
    const update = harness({
      files: {
        [`${deployed}/SKILL.md`]: MANIFEST,
        "/repo/apm.lock.yaml": lockfile(FROM_THIS_HARNESS),
      },
      directories: [deployed, `${ROOT}/.apm/skills/code-review`],
      deployedTargets: [
        { treeRoot: "/repo", lockfilePath: "/repo/apm.lock.yaml" },
      ],
    });
    await update.importSkill.check({ source: deployed });
    update.setTrees({
      remote: {},
      promote: {},
      local: { "code-review": "tree-1" },
      working: { "code-review": "tree-2" },
    });

    await expect(
      update.importSkill.execute({ source: deployed }),
    ).resolves.toEqual({ ok: false, error: "harness-copy-uncommitted" });
    expect(update.copied).toEqual([]);
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
