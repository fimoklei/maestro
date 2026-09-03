// One case per rule in #573, on real temporary trees: inodes, link counts and
// file types are the rules, and no fake can prove them.
import { execFile } from "node:child_process";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  CopySkillFolder,
  type CopySkillFolderResult,
  NodeCopyTreeFs,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("CopySkillFolder", () => {
  let root: string;
  let source: string;
  let destinationParent: string;

  const copy = (
    overrides: {
      name?: string;
      source?: string;
      replaceExisting?: boolean;
    } = {},
  ): Promise<CopySkillFolderResult> =>
    new CopySkillFolder({ fs: new NodeCopyTreeFs() }).copy({
      source: overrides.source ?? source,
      destinationParent,
      name: overrides.name ?? "imported",
      replaceExisting: overrides.replaceExisting,
    });

  const destination = () => join(destinationParent, "imported");

  const write = async (relPath: string, contents: string) => {
    const path = join(source, relPath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, contents, "utf8");
    return path;
  };

  // Flat files at the root of an existing directory: no per-file mkdir, and
  // written in one fan-out instead of a thousand awaits.
  const writeFlat = (count: number) =>
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        writeFile(join(source, `f${i}.md`), "x", "utf8"),
      ),
    );

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-copy-"));
    source = join(root, "source");
    destinationParent = join(root, "harness");
    await mkdir(source, { recursive: true });
    await mkdir(destinationParent, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // Every refusal is proved against this, not only the one case that names it:
  // a leftover staging directory is as much a partial destination as a half
  // skill would be.
  const expectNothingWritten = async () => {
    expect(await readdir(destinationParent)).toEqual([]);
  };

  describe("a source it accepts", () => {
    it("copies nested content with file contents and executable bits intact", async () => {
      await write("SKILL.md", "# skill\n");
      await write("nested/deep/notes.md", "deep\n");
      const script = await write("bin/run.sh", "#!/bin/sh\necho hi\n");
      await chmod(script, 0o755);

      const result = await copy();

      expect(result).toMatchObject({ ok: true, path: destination() });
      expect(await readFile(join(destination(), "SKILL.md"), "utf8")).toBe(
        "# skill\n",
      );
      expect(
        await readFile(join(destination(), "nested/deep/notes.md"), "utf8"),
      ).toBe("deep\n");
      const copied = await lstat(join(destination(), "bin/run.sh"));
      expect(copied.mode & 0o111).not.toBe(0);
      expect((await lstat(join(destination(), "SKILL.md"))).mode & 0o111).toBe(
        0,
      );
      // The staging location is private and temporary — the destination is the
      // only thing the copy leaves behind.
      expect(await readdir(destinationParent)).toEqual(["imported"]);
    });

    it("omits .git entries at any depth", async () => {
      await write("SKILL.md", "# skill\n");
      await write(".git/config", "[core]\n");
      await write("nested/.git/HEAD", "ref: refs/heads/main\n");
      await write("nested/kept.md", "kept\n");

      expect(await copy()).toMatchObject({ ok: true, path: destination() });

      expect(await readdir(destination())).toEqual(["SKILL.md", "nested"]);
      expect(await readdir(join(destination(), "nested"))).toEqual(["kept.md"]);
    });

    it("omits .git reached through a symbolic link", async () => {
      await write("SKILL.md", "# skill\n");
      await write(".git/config", "[core]\n");
      await symlink(join(source, ".git"), join(source, "alias"));
      await symlink(join(source, ".git/config"), join(source, "smuggled.txt"));

      expect(await copy()).toMatchObject({ ok: true, path: destination() });

      // The rule is about repository internals, not about the name of the
      // entry that leads to them.
      expect(await readdir(destination())).toEqual(["SKILL.md"]);
    });

    it("follows a symbolic link that stays inside the source root", async () => {
      await write("real/asset.txt", "asset\n");
      await symlink(join(source, "real/asset.txt"), join(source, "link.txt"));
      await symlink(join(source, "real"), join(source, "linked-dir"));

      expect(await copy()).toMatchObject({ ok: true, path: destination() });

      expect(await readFile(join(destination(), "link.txt"), "utf8")).toBe(
        "asset\n",
      );
      // Followed, not reproduced: the destination holds content, never a link
      // back into the source it was copied from.
      expect((await lstat(join(destination(), "link.txt"))).isFile()).toBe(
        true,
      );
      expect(
        await readFile(join(destination(), "linked-dir/asset.txt"), "utf8"),
      ).toBe("asset\n");
    });

    it("counts a tree at the limits as acceptable", async () => {
      await writeFlat(1000);

      expect(await copy()).toMatchObject({ ok: true, path: destination() });
    });
  });

  describe("links it refuses", () => {
    it("refuses a link whose target escapes the source root", async () => {
      const outside = join(root, "secret.txt");
      await writeFile(outside, "secret\n", "utf8");
      await write("SKILL.md", "# skill\n");
      await symlink(outside, join(source, "leak.txt"));

      expect(await copy()).toEqual({ ok: false, error: "unsafe-link" });
      await expectNothingWritten();
    });

    it("refuses a dangling link", async () => {
      await write("SKILL.md", "# skill\n");
      await symlink(join(source, "gone.txt"), join(source, "dangling.txt"));

      expect(await copy()).toEqual({ ok: false, error: "unsafe-link" });
      await expectNothingWritten();
    });

    it("refuses a link that loops", async () => {
      await write("SKILL.md", "# skill\n");
      await symlink(join(source, "b.txt"), join(source, "a.txt"));
      await symlink(join(source, "a.txt"), join(source, "b.txt"));

      expect(await copy()).toEqual({ ok: false, error: "unsafe-link" });
      await expectNothingWritten();
    });

    it("refuses a directory link that points at its own ancestor", async () => {
      await write("nested/SKILL.md", "# skill\n");
      await symlink(source, join(source, "nested/up"));

      expect(await copy()).toEqual({ ok: false, error: "unsafe-link" });
      await expectNothingWritten();
    });
  });

  describe("entries it refuses", () => {
    it("refuses a regular file with more than one hard link", async () => {
      const original = await write("SKILL.md", "# skill\n");
      await link(original, join(source, "hardlink.md"));

      expect(await copy()).toEqual({ ok: false, error: "hard-linked-file" });
      await expectNothingWritten();
    });

    it("refuses a FIFO", async () => {
      await write("SKILL.md", "# skill\n");
      await run("mkfifo", [join(source, "pipe")]);

      expect(await copy()).toEqual({ ok: false, error: "special-file" });
      await expectNothingWritten();
    });

    // Device files take root to create; they reach the same branch as this
    // socket does — both are "neither a regular file nor a directory".
    it("refuses a unix socket", async () => {
      await write("SKILL.md", "# skill\n");
      const server = createServer();
      await new Promise<void>((resolve) =>
        server.listen(join(source, "sock"), resolve),
      );
      try {
        expect(await copy()).toEqual({ ok: false, error: "special-file" });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
      await expectNothingWritten();
    });
  });

  describe("limits", () => {
    it("refuses a tree over 1,000 regular files", async () => {
      await writeFlat(1001);

      expect(await copy()).toEqual({ ok: false, error: "too-many-files" });
      await expectNothingWritten();
    });

    it("refuses a tree over 50 MiB", async () => {
      await write("big.bin", "x".repeat(50 * 1024 * 1024 + 1));

      expect(await copy()).toEqual({ ok: false, error: "too-large" });
      await expectNothingWritten();
    });

    it("counts the tree after .git exclusions", async () => {
      await write("SKILL.md", "# skill\n");
      await write(".git/pack", "x".repeat(50 * 1024 * 1024 + 1));

      expect(await copy()).toMatchObject({ ok: true, path: destination() });
    });
  });

  describe("a source that moves under it", () => {
    // The real adapter, with the source disturbed the moment the copy starts:
    // preflight has already decided, so this is exactly the window the rule is
    // about. Files are planned in sorted order, so "a.md" is copied first and
    // "b.md" meets the check afterwards.
    const copyWhileDisturbing = async (
      disturb: () => Promise<void>,
    ): Promise<CopySkillFolderResult> => {
      const fs = new NodeCopyTreeFs();
      const original = fs.openFile.bind(fs);
      let disturbed = false;
      fs.openFile = async (path) => {
        if (!disturbed) {
          disturbed = true;
          await disturb();
        }
        return original(path);
      };
      return new CopySkillFolder({ fs }).copy({
        source,
        destinationParent,
        name: "imported",
      });
    };

    beforeEach(async () => {
      await write("a.md", "first\n");
      await write("b.md", "second\n");
    });

    const disturbances: [string, () => Promise<void>][] = [
      [
        "changes",
        () => writeFile(join(source, "b.md"), "changed after preflight\n"),
      ],
      ["disappears", () => rm(join(source, "b.md"))],
      [
        "changes type",
        async () => {
          await rm(join(source, "b.md"));
          await mkdir(join(source, "b.md"));
        },
      ],
    ];

    for (const [what, disturb] of disturbances) {
      it(`fails the whole operation when an entry ${what} during the copy`, async () => {
        expect(await copyWhileDisturbing(disturb)).toEqual({
          ok: false,
          error: "source-changed",
        });
        await expectNothingWritten();
      });
    }

    it("refuses a link repointed outside the root during the copy", async () => {
      await write("real/asset.txt", "asset\n");
      const outside = join(root, "secret.txt");
      await writeFile(outside, "secret\n", "utf8");
      const link = join(source, "z-link.txt");
      await symlink(join(source, "real/asset.txt"), link);

      // Containment was proved during preflight; it is proved again here, and
      // that second proof is the only thing standing between this link and the
      // file it now points at.
      const result = await copyWhileDisturbing(async () => {
        await rm(link);
        await symlink(outside, link);
      });

      expect(result).toEqual({ ok: false, error: "unsafe-link" });
      await expectNothingWritten();
    });
  });

  describe("the destination it is given", () => {
    it("refuses a source that does not exist", async () => {
      expect(await copy({ source: join(root, "absent") })).toEqual({
        ok: false,
        error: "not-found",
      });
      await expectNothingWritten();
    });

    it("refuses a source that is not a directory", async () => {
      const file = join(root, "plain.md");
      await writeFile(file, "x", "utf8");

      expect(await copy({ source: file })).toEqual({
        ok: false,
        error: "not-a-directory",
      });
      await expectNothingWritten();
    });

    it("refuses a name that is not a single path segment", async () => {
      await write("SKILL.md", "# skill\n");

      for (const name of ["..", "a/b", "", ".", "/abs"]) {
        expect(await copy({ name })).toEqual({
          ok: false,
          error: "invalid-name",
        });
      }
      await expectNothingWritten();
    });

    it("refuses a destination that already exists", async () => {
      await write("SKILL.md", "# skill\n");
      await mkdir(destination());

      expect(await copy()).toEqual({
        ok: false,
        error: "destination-exists",
      });
      expect(await readdir(destination())).toEqual([]);
    });
  });

  describe("replacing an existing destination", () => {
    // The folder the replacement writes over, holding one file the source has
    // and one it does not.
    const seedDestination = async () => {
      await mkdir(join(destination(), "stale"), { recursive: true });
      await writeFile(join(destination(), "SKILL.md"), "# old\n", "utf8");
      await writeFile(join(destination(), "stale/gone.md"), "old\n", "utf8");
    };

    beforeEach(async () => {
      await write("SKILL.md", "# new\n");
      await write("nested/kept.md", "kept\n");
      await write(".git/config", "[core]\n");
      await seedDestination();
    });

    it("leaves the destination holding exactly the source's files", async () => {
      const result = await copy({ replaceExisting: true });

      expect(result).toEqual({ ok: true, path: destination(), skipped: 1 });
      expect(await readdir(destination())).toEqual(["SKILL.md", "nested"]);
      expect(await readFile(join(destination(), "SKILL.md"), "utf8")).toBe(
        "# new\n",
      );
      // Nothing of the staging tree survives beside the replaced folder.
      expect(await readdir(destinationParent)).toEqual(["imported"]);
    });

    it("keeps the original folder when finalize refuses the staged copy", async () => {
      const result = await new CopySkillFolder({
        fs: new NodeCopyTreeFs(),
      }).copy({
        source,
        destinationParent,
        name: "imported",
        replaceExisting: true,
        finalize: async () => false,
      });

      expect(result).toEqual({ ok: false, error: "copy-failed" });
      expect(await readFile(join(destination(), "SKILL.md"), "utf8")).toBe(
        "# old\n",
      );
      expect(await readdir(destinationParent)).toEqual(["imported"]);
    });

    it("keeps the original folder when the publishing move fails", async () => {
      // The window the rule is about: the original has been moved aside and the
      // replacement is going in. Only the second move can fail here.
      const fs = new NodeCopyTreeFs();
      const original = fs.movePath.bind(fs);
      let refused = false;
      fs.movePath = async (from, to) => {
        if (to === destination() && !refused) {
          refused = true;
          throw new Error("rename refused");
        }
        return original(from, to);
      };

      const result = await new CopySkillFolder({ fs }).copy({
        source,
        destinationParent,
        name: "imported",
        replaceExisting: true,
      });

      expect(result).toEqual({ ok: false, error: "copy-failed" });
      expect(await readFile(join(destination(), "SKILL.md"), "utf8")).toBe(
        "# old\n",
      );
      expect(await readdir(join(destination(), "stale"))).toEqual(["gone.md"]);
      expect(await readdir(destinationParent)).toEqual(["imported"]);
    });
  });
});
