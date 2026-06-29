import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { BrowseFilesystem } from "./browse-filesystem";

// Pure unit lane: the browse use-case driven against an in-memory filesystem.
// Real dirs-only filtering and symlink escapes are proven against a live disk in
// tests/integration/server-filesystem.test.ts; here we pin the use-case's
// contract — the home-root ceiling, the error taxonomy, and the empty-input
// default.
function makeBrowse(seed: ConstructorParameters<typeof InMemoryFileSystem>[0]) {
  const fs = new InMemoryFileSystem(seed);
  return new BrowseFilesystem({ fs, homeRoot: () => "/home/user" });
}

describe("BrowseFilesystem", () => {
  it("lists the immediate child directories of a path inside the root", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
      },
      listings: { "/home/user/dev": ["repo-b", "repo-a"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toEqual({
      ok: true,
      path: "/home/user/dev",
      entries: [
        { name: "repo-a", path: "/home/user/dev/repo-a" },
        { name: "repo-b", path: "/home/user/dev/repo-b" },
      ],
    });
  });

  it("defaults an empty path to the home root", async () => {
    const browse = makeBrowse({
      directories: { "/home/user": "/home/user" },
      listings: { "/home/user": ["dev"] },
    });

    const result = await browse.browse("");

    expect(result).toEqual({
      ok: true,
      path: "/home/user",
      entries: [{ name: "dev", path: "/home/user/dev" }],
    });
  });

  it("rejects a path resolving outside the home root", async () => {
    const browse = makeBrowse({
      directories: { "/home/user": "/home/user", "/etc": "/etc" },
      listings: { "/etc": ["passwd.d"] },
    });

    const result = await browse.browse("/etc");

    expect(result).toEqual({ ok: false, error: "outside-root" });
  });

  it("rejects a non-existent path", async () => {
    const browse = makeBrowse({
      directories: { "/home/user": "/home/user" },
    });

    const result = await browse.browse("/home/user/missing");

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("rejects a path that is not a directory", async () => {
    const browse = makeBrowse({
      directories: { "/home/user": "/home/user" },
      files: { "/home/user/notes.txt": "hi" },
    });

    const result = await browse.browse("/home/user/notes.txt");

    expect(result).toEqual({ ok: false, error: "not-a-directory" });
  });
});
