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
      parent: "/home/user",
      breadcrumbs: [
        { name: "~", path: "/home/user" },
        { name: "dev", path: "/home/user/dev" },
      ],
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
      breadcrumbs: [{ name: "~", path: "/home/user" }],
      entries: [{ name: "dev", path: "/home/user/dev" }],
    });
  });

  it("omits the parent at the home ceiling", async () => {
    // The ceiling is where "up" stops: no parent field means the client has
    // nowhere higher to go (issue #146) — and never derives one itself.
    const browse = makeBrowse({
      directories: { "/home/user": "/home/user" },
      listings: { "/home/user": [] },
    });

    const result = await browse.browse("/home/user");

    expect(result).not.toHaveProperty("parent");
  });

  it("derives breadcrumbs for a deeply nested path, one segment per ancestor", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev/repos/maestro": "/home/user/dev/repos/maestro",
      },
      listings: { "/home/user/dev/repos/maestro": [] },
    });

    const result = await browse.browse("/home/user/dev/repos/maestro");

    expect(result).toMatchObject({
      ok: true,
      parent: "/home/user/dev/repos",
      breadcrumbs: [
        { name: "~", path: "/home/user" },
        { name: "dev", path: "/home/user/dev" },
        { name: "repos", path: "/home/user/dev/repos" },
        { name: "maestro", path: "/home/user/dev/repos/maestro" },
      ],
    });
  });

  it("derives parent and breadcrumbs from the resolved path, not the requested one", async () => {
    // A symlink inside home resolves to its target; parent and breadcrumbs must
    // follow the resolved location so "up" from a symlinked dir cannot land on
    // a path that does not exist.
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/link": "/home/user/real/target",
        "/home/user/real/target": "/home/user/real/target",
      },
      listings: { "/home/user/real/target": [] },
    });

    const result = await browse.browse("/home/user/link");

    expect(result).toMatchObject({
      ok: true,
      path: "/home/user/real/target",
      parent: "/home/user/real",
      breadcrumbs: [
        { name: "~", path: "/home/user" },
        { name: "real", path: "/home/user/real" },
        { name: "target", path: "/home/user/real/target" },
      ],
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

  it("rejects a non-existent path outside the root without leaking its absence", async () => {
    // The ceiling must bound disclosure: a missing path outside home must look
    // identical to an existing one (both outside-root), or callers could probe
    // existence beyond the home ceiling (ADR-0009).
    const browse = makeBrowse({
      directories: { "/home/user": "/home/user" },
    });

    const result = await browse.browse("/etc/secret-that-does-not-exist");

    expect(result).toEqual({ ok: false, error: "outside-root" });
  });

  it("rejects a non-existent path inside the root as not-found", async () => {
    const browse = makeBrowse({
      directories: { "/home/user": "/home/user" },
    });

    const result = await browse.browse("/home/user/missing");

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("rejects an unreadable directory with a typed error, not a crash", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/locked": "/home/user/locked",
      },
      unreadable: ["/home/user/locked"],
    });

    const result = await browse.browse("/home/user/locked");

    expect(result).toEqual({ ok: false, error: "unreadable" });
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
