import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { inspectPrimitiveEntry } from "./harness-primitive-dir";

// Nothing in the type folder, so only the folder's own resolution shows.
const fsWith = (realpath: (path: string) => Promise<string>) => ({
  realpath,
  exists: async () => false,
  isFileEntry: async () => false,
  isDirectoryEntry: async () => false,
});

const TDD = { type: "skill", name: "tdd" } as const;

describe("inspectPrimitiveEntry's type folder", () => {
  it("returns the real skills folder inside the harness", async () => {
    const fs = fsWith(async (path) =>
      path.replace("/link-to-harness", "/real/harness"),
    );

    expect(await inspectPrimitiveEntry(fs, "/link-to-harness", TDD)).toEqual({
      kind: "absent",
      dir: "/real/harness/.apm/skills",
      path: "/real/harness/.apm/skills/tdd",
    });
  });

  it("returns the real prompts folder for a prompt", async () => {
    const fs = fsWith(async (path) => path);

    expect(
      await inspectPrimitiveEntry(fs, "/harness", {
        type: "prompt",
        name: "pr-review",
      }),
    ).toEqual({
      kind: "absent",
      dir: "/harness/.maestro/prompts",
      path: "/harness/.maestro/prompts/pr-review.md",
    });
  });

  it("refuses a symlinked skills folder that points outside the harness", async () => {
    const fs = fsWith(async (path) =>
      path === "/harness/.apm/skills" ? "/elsewhere/skills" : path,
    );

    expect(await inspectPrimitiveEntry(fs, "/harness", TDD)).toEqual({
      kind: "unsafe",
    });
  });

  it("reports an unreadable harness root", async () => {
    const fs = fsWith(async (path) => {
      if (path === "/harness") {
        throw new Error("EACCES");
      }
      return path;
    });

    expect(await inspectPrimitiveEntry(fs, "/harness", TDD)).toEqual({
      kind: "unreadable",
    });
  });

  it("reports a missing skills folder as unreadable", async () => {
    const fs = fsWith(async (path) => {
      if (path === "/harness/.apm/skills") {
        throw new Error("ENOENT");
      }
      return path;
    });

    expect(await inspectPrimitiveEntry(fs, "/harness", TDD)).toEqual({
      kind: "unreadable",
    });
  });
});

describe("inspectPrimitiveEntry", () => {
  const PROMPTS = "/harness/.maestro/prompts";
  const SKILLS = "/harness/.apm/skills";
  const prompt = { type: "prompt", name: "pr-review" } as const;
  const skill = { type: "skill", name: "tdd" } as const;

  const harness = (
    seed: ConstructorParameters<typeof InMemoryFileSystem>[0] = {},
  ) =>
    new InMemoryFileSystem({
      ...seed,
      directories: {
        "/harness": "/harness",
        [PROMPTS]: PROMPTS,
        [SKILLS]: SKILLS,
        ...seed.directories,
      },
    });

  it("finds a plain prompt file", async () => {
    const fs = harness({ files: { [`${PROMPTS}/pr-review.md`]: "Review" } });

    expect(await inspectPrimitiveEntry(fs, "/harness", prompt)).toEqual({
      kind: "plain",
      dir: PROMPTS,
      path: `${PROMPTS}/pr-review.md`,
    });
  });

  it("finds a plain skill folder", async () => {
    const fs = harness({ directories: { [`${SKILLS}/tdd`]: `${SKILLS}/tdd` } });

    expect(await inspectPrimitiveEntry(fs, "/harness", skill)).toEqual({
      kind: "plain",
      dir: SKILLS,
      path: `${SKILLS}/tdd`,
    });
  });

  // Occupied, not a link: the caller decides what a wrong kind means.
  it("finds a plain file standing where a skill folder belongs", async () => {
    const fs = harness({ files: { [`${SKILLS}/tdd`]: "mine" } });

    expect(await inspectPrimitiveEntry(fs, "/harness", skill)).toEqual({
      kind: "plain",
      dir: SKILLS,
      path: `${SKILLS}/tdd`,
    });
  });

  it("reports a primitive with nothing on disk as absent", async () => {
    expect(await inspectPrimitiveEntry(harness(), "/harness", prompt)).toEqual({
      kind: "absent",
      dir: PROMPTS,
      path: `${PROMPTS}/pr-review.md`,
    });
  });

  it("refuses a prompt that links to another prompt in the same folder", async () => {
    const fs = harness({
      files: { [`${PROMPTS}/other.md`]: "Other" },
      fileSymlinks: { [`${PROMPTS}/pr-review.md`]: `${PROMPTS}/other.md` },
    });

    expect(await inspectPrimitiveEntry(fs, "/harness", prompt)).toEqual({
      kind: "unsafe",
    });
  });

  it("refuses a prompt that links out of the harness", async () => {
    const fs = harness({
      files: { "/elsewhere/notes.md": "Notes" },
      fileSymlinks: { [`${PROMPTS}/pr-review.md`]: "/elsewhere/notes.md" },
    });

    expect(await inspectPrimitiveEntry(fs, "/harness", prompt)).toEqual({
      kind: "unsafe",
    });
  });

  it("refuses a dangling prompt link", async () => {
    const fs = harness({ danglingSymlinks: [`${PROMPTS}/pr-review.md`] });

    expect(await inspectPrimitiveEntry(fs, "/harness", prompt)).toEqual({
      kind: "unsafe",
    });
  });

  it("refuses a skill folder that links to another skill folder", async () => {
    const fs = harness({
      directories: {
        [`${SKILLS}/other`]: `${SKILLS}/other`,
        [`${SKILLS}/tdd`]: `${SKILLS}/other`,
      },
    });

    expect(await inspectPrimitiveEntry(fs, "/harness", skill)).toEqual({
      kind: "unsafe",
    });
  });

  it("refuses a prompts folder that links out of the harness", async () => {
    const fs = harness({
      directories: {
        [PROMPTS]: "/elsewhere/prompts",
        "/elsewhere/prompts": "/elsewhere/prompts",
      },
    });

    expect(await inspectPrimitiveEntry(fs, "/harness", prompt)).toEqual({
      kind: "unsafe",
    });
  });

  it("reports a missing prompts folder as unreadable", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/harness": "/harness" },
    });

    expect(await inspectPrimitiveEntry(fs, "/harness", prompt)).toEqual({
      kind: "unreadable",
    });
  });
});
