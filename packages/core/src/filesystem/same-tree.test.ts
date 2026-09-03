import { describe, expect, it } from "vitest";
import { type SameTreeFs, sameTree } from "./same-tree";

type File = { text: string; executable?: boolean; symlink?: boolean };

// One in-memory disk: every key is a file, and a folder exists wherever a key
// sits under it.
function disk(files: Record<string, File>): SameTreeFs {
  const dirs = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    for (let depth = 2; depth < parts.length; depth += 1) {
      dirs.add(parts.slice(0, depth).join("/"));
    }
  }
  return {
    listRawEntries: async (path: string) => {
      const prefix = `${path}/`;
      const found = new Map<string, boolean>();
      for (const key of [...Object.keys(files), ...dirs]) {
        if (!key.startsWith(prefix)) {
          continue;
        }
        const name = key.slice(prefix.length).split("/")[0] as string;
        found.set(name, dirs.has(prefix + name));
      }
      return [...found].map(([name, isDirectory]) => ({
        name,
        isDirectory,
        isSymlink: files[prefix + name]?.symlink === true,
      }));
    },
    readFile: async (path: string) => files[path]?.text ?? null,
    describe: async (path: string) => {
      const file = files[path];
      return file === undefined
        ? null
        : {
            kind: "file" as const,
            size: file.text.length,
            hardLinks: 1,
            executable: file.executable === true,
            identity: path,
          };
    },
  };
}

const text = (body: string): File => ({ text: body });

describe("sameTree", () => {
  it("reads two folders holding the same files as one tree", async () => {
    const fs = disk({
      "/left/SKILL.md": text("One.\n"),
      "/left/steps/first.md": text("Two.\n"),
      "/right/SKILL.md": text("One.\n"),
      "/right/steps/first.md": text("Two.\n"),
    });

    await expect(sameTree(fs, "/left", "/right")).resolves.toBe(true);
  });

  it("reads a file only one side holds as a difference", async () => {
    const fs = disk({
      "/left/SKILL.md": text("One.\n"),
      "/left/steps.md": text("Two.\n"),
      "/right/SKILL.md": text("One.\n"),
    });

    await expect(sameTree(fs, "/left", "/right")).resolves.toBe(false);
  });

  it("reads changed text as a difference", async () => {
    const fs = disk({
      "/left/SKILL.md": text("One.\n"),
      "/right/SKILL.md": text("Two.\n"),
    });

    await expect(sameTree(fs, "/left", "/right")).resolves.toBe(false);
  });

  it("reads an executable bit only one side carries as a difference", async () => {
    const fs = disk({
      "/left/run.sh": { text: "One.\n", executable: true },
      "/right/run.sh": text("One.\n"),
    });

    await expect(sameTree(fs, "/left", "/right")).resolves.toBe(false);
  });

  it("reads a symbolic link as a difference", async () => {
    const fs = disk({
      "/left/steps.md": { text: "One.\n", symlink: true },
      "/right/steps.md": text("One.\n"),
    });

    await expect(sameTree(fs, "/left", "/right")).resolves.toBe(false);
  });

  it("leaves a repository's own internals out at every depth", async () => {
    const fs = disk({
      "/left/SKILL.md": text("One.\n"),
      "/left/.git/HEAD": text("ref\n"),
      "/left/steps/.git/HEAD": text("ref\n"),
      "/right/SKILL.md": text("One.\n"),
      "/right/steps/first.md": text("Two.\n"),
      "/left/steps/first.md": text("Two.\n"),
    });

    await expect(sameTree(fs, "/left", "/right")).resolves.toBe(true);
  });

  it("leaves out the names the caller excludes, at the top level only", async () => {
    const fs = disk({
      "/left/SKILL.md": text("One.\n"),
      "/left/steps/SKILL.md": text("Three.\n"),
      "/right/SKILL.md": text("Two.\n"),
      "/right/steps/SKILL.md": text("Four.\n"),
    });

    await expect(
      sameTree(fs, "/left", "/right", new Set(["SKILL.md"])),
    ).resolves.toBe(false);
  });

  it("reads a folder it cannot list as a difference", async () => {
    const fs = disk({
      "/left/SKILL.md": text("One.\n"),
      "/right/SKILL.md": text("One.\n"),
    });
    const unreadable: SameTreeFs = {
      ...fs,
      listRawEntries: async (path: string) => {
        if (path === "/right") {
          throw new Error("EACCES");
        }
        return fs.listRawEntries(path);
      },
    };

    await expect(sameTree(unreadable, "/left", "/right")).resolves.toBe(false);
  });
});
