import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { InventoryReader } from "./inventory-reader";

const INVENTORY = "/inv";

// Builds the SKILL.md text an agent-harness skill ships: YAML frontmatter
// between --- fences, then markdown body the reader ignores.
function skillFile(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

// The reader takes only directory entries, so each skill folder is seeded as a
// genuine directory (the fake's self-mapping convention).
function skillDirs(...names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => {
      const path = `${INVENTORY}/skills/${name}`;
      return [path, path];
    }),
  );
}

describe("InventoryReader", () => {
  it("lists a skill with its name and one-line description", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [INVENTORY]: INVENTORY, ...skillDirs("tdd") },
      listings: { [`${INVENTORY}/skills`]: ["tdd"] },
      files: {
        [`${INVENTORY}/skills/tdd/SKILL.md`]: skillFile(
          "tdd",
          "Test-driven development loop",
        ),
      },
    });
    const reader = new InventoryReader({ fs, resolvePath: () => INVENTORY });

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
    const fs = new InMemoryFileSystem({
      directories: {
        [INVENTORY]: INVENTORY,
        ...skillDirs("tdd", "diagnose"),
      },
      listings: { [`${INVENTORY}/skills`]: ["tdd", "diagnose"] },
      files: {
        [`${INVENTORY}/skills/tdd/SKILL.md`]: skillFile("tdd", "TDD loop"),
        [`${INVENTORY}/skills/diagnose/SKILL.md`]: skillFile(
          "diagnose",
          "Disciplined diagnosis loop",
        ),
      },
    });
    const reader = new InventoryReader({ fs, resolvePath: () => INVENTORY });

    const result = await reader.read();

    expect(result).toEqual({
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
    const fs = new InMemoryFileSystem({
      directories: { [INVENTORY]: INVENTORY, ...skillDirs("broken", "tdd") },
      listings: { [`${INVENTORY}/skills`]: ["broken", "tdd"] },
      files: {
        // "broken" has a directory entry but no SKILL.md on disk.
        [`${INVENTORY}/skills/tdd/SKILL.md`]: skillFile("tdd", "TDD loop"),
      },
    });
    const reader = new InventoryReader({ fs, resolvePath: () => INVENTORY });

    const result = await reader.read();

    expect(result).toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
    });
  });

  it("skips a skill with malformed frontmatter and lists the rest", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [INVENTORY]: INVENTORY, ...skillDirs("bad", "tdd") },
      listings: { [`${INVENTORY}/skills`]: ["bad", "tdd"] },
      files: {
        // "bad" has a SKILL.md but its frontmatter lacks a description.
        [`${INVENTORY}/skills/bad/SKILL.md`]: "---\nname: bad\n---\n\n# bad\n",
        [`${INVENTORY}/skills/tdd/SKILL.md`]: skillFile("tdd", "TDD loop"),
      },
    });
    const reader = new InventoryReader({ fs, resolvePath: () => INVENTORY });

    const result = await reader.read();

    expect(result).toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
    });
  });

  it("reports not-configured when no inventory path resolves", async () => {
    const fs = new InMemoryFileSystem();
    const reader = new InventoryReader({ fs, resolvePath: () => undefined });

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
    });

    await expect(reader.configuredPath()).resolves.toBe(INVENTORY);
  });

  it("reports not-configured when the path is not a directory", async () => {
    const fs = new InMemoryFileSystem({
      files: { [INVENTORY]: "i am a file, not a dir" },
    });
    const reader = new InventoryReader({ fs, resolvePath: () => INVENTORY });

    await expect(reader.read()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });
});
