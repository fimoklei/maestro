import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystem } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("NodeFileSystem", () => {
  const fs = new NodeFileSystem();
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-node-fs-"));
    await mkdir(join(root, "folder"));
    await writeFile(join(root, "file.md"), "contents", "utf8");
    await symlink(join(root, "folder"), join(root, "folder-link"));
    await symlink(join(root, "file.md"), join(root, "file-link"));
    await symlink(join(root, "gone"), join(root, "dangling"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("counts a dangling link as existing, without following it", async () => {
    expect(await fs.exists(join(root, "dangling"))).toBe(true);
  });

  it("never takes a link to a folder for a folder entry", async () => {
    expect(await fs.isDirectoryEntry(join(root, "folder-link"))).toBe(false);
  });

  it("never takes a link to a file for a file entry", async () => {
    expect(await fs.isFileEntry(join(root, "file-link"))).toBe(false);
  });

  it("rejects a read that fails for any reason but a missing file", async () => {
    await expect(fs.readFile(join(root, "file.md", "child"))).rejects.toThrow(
      "ENOTDIR",
    );
  });

  it("rejects a stamp that fails for any reason but a missing file", async () => {
    await expect(fs.stamp(join(root, "file.md", "child"))).rejects.toThrow(
      "ENOTDIR",
    );
  });

  it("lists a folder that does not exist as empty", async () => {
    expect(await fs.listRawEntries(join(root, "absent"))).toEqual([]);
  });

  it("never replaces an existing file on an exclusive create", async () => {
    expect(await fs.createNewFile(join(root, "file.md"), "new")).toBe(false);
    expect(await readFile(join(root, "file.md"), "utf8")).toBe("contents");
  });

  it("removes a path that is not there without an error", async () => {
    await expect(fs.remove(join(root, "absent"))).resolves.toBeUndefined();
  });

  it("lets two writes to one file run at once", async () => {
    const path = join(root, "config.json");

    await Promise.all([fs.writeFile(path, "one"), fs.writeFile(path, "two")]);

    expect(["one", "two"]).toContain(await readFile(path, "utf8"));
  });
});
