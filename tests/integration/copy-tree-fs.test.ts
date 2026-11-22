import {
  lstat,
  mkdtemp,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeCopyTreeFs } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("NodeCopyTreeFs", () => {
  const fs = new NodeCopyTreeFs();
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-copy-tree-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const modeOf = async (path: string) => (await stat(path)).mode & 0o777;

  it("refuses to open a file through a symbolic link in the last segment", async () => {
    await writeFile(join(root, "real.md"), "x", "utf8");
    await symlink(join(root, "real.md"), join(root, "link.md"));

    expect(await fs.openFile(join(root, "link.md"))).toBeNull();
  });

  it("answers missing for a dangling link it is asked to follow", async () => {
    await symlink(join(root, "gone.md"), join(root, "dangling.md"));

    expect(await fs.openFollowingLinks(join(root, "dangling.md"))).toBe(
      "missing",
    );
  });

  it("writes a file with the executable bit and nothing else of a mode", async () => {
    await fs.writeFile(join(root, "plain.sh"), Buffer.from("x"), false);
    await fs.writeFile(join(root, "tool.sh"), Buffer.from("x"), true);

    expect(await modeOf(join(root, "plain.sh"))).toBe(0o644);
    expect(await modeOf(join(root, "tool.sh"))).toBe(0o755);
  });

  it("sets the executable bit when it writes over an existing file", async () => {
    await writeFile(join(root, "tool.sh"), "old", { mode: 0o644 });

    await fs.writeFile(join(root, "tool.sh"), Buffer.from("x"), true);

    expect(await modeOf(join(root, "tool.sh"))).toBe(0o755);
  });

  it("removes a path that is not there without an error", async () => {
    await expect(fs.removePath(join(root, "absent"))).resolves.toBeUndefined();
  });

  it("tells apart two writes of one size within the same millisecond", async () => {
    const path = join(root, "same.md");
    await writeFile(path, "a", "utf8");
    const seconds = Math.floor(Date.now() / 1000);
    await utimes(path, seconds, seconds + 0.0001);
    const before = await fs.describe(path);
    await utimes(path, seconds, seconds + 0.0002);
    const after = await fs.describe(path);

    expect((await lstat(path, { bigint: true })).mtimeMs).toBe(
      BigInt(seconds) * 1000n,
    );
    expect(after?.identity).not.toBe(before?.identity);
  });
});
