import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { InventoryReader } from "./inventory-reader";
import type { ReleasedSkill } from "./released-skills";

const INVENTORY = "/inv";

// Builds the SKILL.md text a Harness skill ships: YAML frontmatter between ---
// fences, then markdown body the reader ignores.
function skillFile(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

// The connected path only has to exist and be a directory; the content comes
// from the release, never from what is lying on disk under it.
const connected = () =>
  new InMemoryFileSystem({ directories: { [INVENTORY]: INVENTORY } });

const readerOver = (released: ReleasedSkill[] | null) =>
  new InventoryReader({
    fs: connected(),
    resolvePath: () => INVENTORY,
    readReleasedSkills: async () => released,
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
        { type: "skill", name: "tdd", description: "TDD loop" },
        {
          type: "skill",
          name: "diagnose",
          description: "Disciplined diagnosis loop",
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
      primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
    });
  });

  // The directory under .apm/skills/ is the skill's identity (ADR-0003); a
  // frontmatter name that disagrees is prose, not a second source of truth.
  it("names a skill by its directory, not by its frontmatter name", async () => {
    const reader = readerOver([
      {
        name: "tdd",
        manifest: skillFile("Test Driven Development", "TDD loop"),
      },
    ]);

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
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
      primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
    });
  });

  // The same input, rejected the same way, in validate-skill-structure.test.ts.
  // Reading one manifest two ways would make it two manifests.
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
      primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
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
        // The released skill's manifest on disk carries a newer description
        // and is gone from the working tree in the real case; either way the
        // release is what the reader answers with.
        [`${INVENTORY}/.apm/skills/tdd/SKILL.md`]: skillFile(
          "tdd",
          "Edited locally",
        ),
      },
    });
    const reader = new InventoryReader({
      fs,
      resolvePath: () => INVENTORY,
      readReleasedSkills: async () => [
        { name: "tdd", manifest: skillFile("tdd", "TDD loop") },
      ],
    });

    await expect(reader.read()).resolves.toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
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
      readReleasedSkills: async () => {
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
      readReleasedSkills: async () => [],
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
      readReleasedSkills: async () => [],
    });

    await expect(reader.configuredPath()).resolves.toBe(INVENTORY);
  });

  it("reports not-configured when the path is not a directory", async () => {
    const reader = new InventoryReader({
      fs: new InMemoryFileSystem({
        files: { [INVENTORY]: "i am a file, not a dir" },
      }),
      resolvePath: () => INVENTORY,
      readReleasedSkills: async () => [],
    });

    await expect(reader.read()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });
});
