import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lenientRealpath } from "../../packages/core/src/filesystem/lenient-realpath";

describe("lenientRealpath", () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "maestro-lenient-")));
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "link"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves the links of the existing prefix and keeps the missing rest as written", () => {
    expect(lenientRealpath(join(root, "link", "not-yet", "SKILL.md"))).toBe(
      join(root, "real", "not-yet", "SKILL.md"),
    );
  });
});
