import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { InventoryReader } from "./inventory-reader";
import type { ReleasedSkill } from "./released-primitives";

const INVENTORY = "/inv";

function skillFile(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

// Content comes from the release, never from what is on disk.
const connected = () =>
  new InMemoryFileSystem({ directories: { [INVENTORY]: INVENTORY } });

const readerOver = (released: ReleasedSkill[] | null) =>
  new InventoryReader({
    fs: connected(),
    resolvePath: () => INVENTORY,
    readPendingRelease: async () => null,
    readReleased: async () =>
      released === null ? null : { skills: released, prompts: [] },
  });

describe("InventoryReader", () => {
  it("lists a skill with its name and one-line description", async () => {
    const reader = readerOver([
      {
        name: "tdd",
        manifest: skillFile("tdd", "Test-driven development loop"),
      },
    ]);

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
      ],
    });
  });

  it("lists every skill in the inventory", async () => {
    const reader = readerOver([
      { name: "tdd", manifest: skillFile("tdd", "TDD loop") },
      {
        name: "diagnose",
        manifest: skillFile("diagnose", "Disciplined diagnosis loop"),
      },
    ]);

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "TDD loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
        {
          type: "skill",
          name: "diagnose",
          description: "Disciplined diagnosis loop",
          path: ".apm/skills/diagnose",
          pendingRelease: null,
        },
      ],
    });
  });

  it("skips a skill whose SKILL.md is missing and lists the rest", async () => {
    const reader = readerOver([
      // "broken" is a directory in the release that ships no SKILL.md.
      { name: "broken", manifest: null },
      { name: "tdd", manifest: skillFile("tdd", "TDD loop") },
    ]);

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "TDD loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
      ],
    });
  });

  // The directory is the skill's identity; a disagreeing frontmatter name is prose.
  it("names a skill by its directory, not by its frontmatter name", async () => {
    const reader = readerOver([
      {
        name: "tdd",
        manifest: skillFile("Test Driven Development", "TDD loop"),
      },
    ]);

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "TDD loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
      ],
    });
  });

  it("skips a skill with malformed frontmatter and lists the rest", async () => {
    const reader = readerOver([
      // "bad" has a SKILL.md but its frontmatter lacks a description.
      { name: "bad", manifest: "---\nname: bad\n---\n\n# bad\n" },
      { name: "tdd", manifest: skillFile("tdd", "TDD loop") },
    ]);

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "TDD loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
      ],
    });
  });

  it("skips a skill whose closing delimiter carries trailing text", async () => {
    const reader = readerOver([
      {
        name: "bad",
        manifest: "---\ndescription: Looks fine\n---junk\n\n# bad\n",
      },
      { name: "tdd", manifest: skillFile("tdd", "TDD loop") },
    ]);

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "TDD loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
      ],
    });
  });

  it("lists nothing when the harness has no release", async () => {
    await expect(readerOver([]).read()).resolves.toEqual({
      ok: true,
      primitives: [],
    });
  });

  // A skill only on disk was never published, so nobody can deploy it (#841).
  it("never reads a skill from the working tree", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        [INVENTORY]: INVENTORY,
        [`${INVENTORY}/.apm/skills/local-only`]: `${INVENTORY}/.apm/skills/local-only`,
      },
      listings: { [`${INVENTORY}/.apm/skills`]: ["local-only"] },
      files: {
        [`${INVENTORY}/.apm/skills/local-only/SKILL.md`]: skillFile(
          "local-only",
          "Never released",
        ),
        [`${INVENTORY}/.apm/skills/tdd/SKILL.md`]: skillFile(
          "tdd",
          "Edited locally",
        ),
      },
    });
    const reader = new InventoryReader({
      fs,
      resolvePath: () => INVENTORY,
      readPendingRelease: async () => null,
      readReleased: async () => ({
        skills: [{ name: "tdd", manifest: skillFile("tdd", "TDD loop") }],
        prompts: [],
      }),
    });

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "TDD loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
      ],
    });
  });

  it("reports unreadable when the release cannot be read", async () => {
    await expect(readerOver(null).read()).resolves.toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("reports unreadable when the release read throws", async () => {
    const reader = new InventoryReader({
      fs: connected(),
      resolvePath: () => INVENTORY,
      readPendingRelease: async () => null,
      readReleased: async () => {
        throw new Error("git exploded");
      },
    });

    await expect(reader.read()).resolves.toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("reports not-configured when no inventory path resolves", async () => {
    const reader = new InventoryReader({
      fs: new InMemoryFileSystem(),
      resolvePath: () => undefined,
      readPendingRelease: async () => null,
      readReleased: async () => ({ skills: [], prompts: [] }),
    });

    await expect(reader.read()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("returns the canonical configured path when the inventory is symlinked", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/home/me/agent-harness": INVENTORY,
        [INVENTORY]: INVENTORY,
      },
    });
    const reader = new InventoryReader({
      fs,
      resolvePath: () => "/home/me/agent-harness",
      readPendingRelease: async () => null,
      readReleased: async () => ({ skills: [], prompts: [] }),
    });

    await expect(reader.configuredPath()).resolves.toBe(INVENTORY);
  });

  it("reports not-configured when the path is not a directory", async () => {
    const reader = new InventoryReader({
      fs: new InMemoryFileSystem({
        files: { [INVENTORY]: "i am a file, not a dir" },
      }),
      resolvePath: () => INVENTORY,
      readPendingRelease: async () => null,
      readReleased: async () => ({ skills: [], prompts: [] }),
    });

    await expect(reader.read()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });
});
