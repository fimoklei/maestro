import { describe, expect, it, vi } from "vitest";
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
        "/home/user/dev/repo-a": "/home/user/dev/repo-a",
        "/home/user/dev/repo-b": "/home/user/dev/repo-b",
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
        {
          name: "repo-a",
          path: "/home/user/dev/repo-a",
          isHidden: false,
          isSymlink: false,
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
        {
          name: "repo-b",
          path: "/home/user/dev/repo-b",
          isHidden: false,
          isSymlink: false,
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
      ],
    });
  });

  it("marks a dot-prefixed entry as hidden", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/.config": "/home/user/dev/.config",
        "/home/user/dev/repo": "/home/user/dev/repo",
      },
      listings: { "/home/user/dev": [".config", "repo"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        { name: ".config", isHidden: true },
        { name: "repo", isHidden: false },
      ],
    });
  });

  it("includes a symlinked directory that resolves inside the ceiling, tagged as a symlink", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        // "linked" is a symlink alias: its own path is a key, never a value,
        // so isDirectoryEntry (lstat-based) reports it is not a genuine
        // directory itself — only its realpath target is.
        "/home/user/dev/linked": "/home/user/dev/actual",
        "/home/user/dev/actual": "/home/user/dev/actual",
      },
      listings: { "/home/user/dev": ["linked"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        {
          name: "linked",
          path: "/home/user/dev/linked",
          isHidden: false,
          isSymlink: true,
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
      ],
    });
  });

  it("rejects a browsed path that raced away from being a directory after the ceiling check", async () => {
    // Same race as the per-entry one below, one level up: `real` is already
    // realpath'd and ceiling-checked, so a following stat here would list a
    // swapped-in symlink's target and leak entry names from outside home.
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
      },
      listings: { "/home/user/dev": ["secret"] },
      racedAwayAsDirectory: ["/home/user/dev"],
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toEqual({ ok: false, error: "not-a-directory" });
  });

  it("excludes a symlink whose target raced away from being a directory after the ceiling check", async () => {
    // The target was inside the ceiling and a genuine directory when
    // realpath resolved it, but a concurrent process swapped it for a new
    // symlink pointing out of home before the directory check ran (TOCTOU —
    // Codex review, #160). The check must be lstat-based (isDirectoryEntry):
    // `target` is already fully resolved, so following one more hop would
    // report on a location isWithinRoot never validated.
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/linked": "/home/user/dev/actual",
        "/home/user/dev/actual": "/home/user/dev/actual",
      },
      listings: { "/home/user/dev": ["linked"] },
      racedAwayAsDirectory: ["/home/user/dev/actual"],
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({ ok: true, entries: [] });
  });

  it("excludes a symlinked entry whose target resolves outside the home ceiling", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/escape": "/etc/secret",
        "/etc/secret": "/etc/secret",
      },
      listings: { "/home/user/dev": ["escape"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({ ok: true, entries: [] });
  });

  it("excludes a symlink pointing at a file, not a directory", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/link-to-file": "/home/user/dev/notes.txt",
      },
      files: { "/home/user/dev/notes.txt": "hi" },
      listings: { "/home/user/dev": ["link-to-file"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({ ok: true, entries: [] });
  });

  it("excludes a broken (dangling) symlink", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
      },
      listings: { "/home/user/dev": ["dangling"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({ ok: true, entries: [] });
  });

  it("never probes git/skills facts for a symlinked entry", async () => {
    // Facts stay unconditionally false for a symlink, even when its resolved
    // target looks exactly like a git repo with a skills/ subdir — probing
    // through the symlink a second time would reopen a fresh TOCTOU/ceiling
    // window this endpoint has not validated for a read that deep (#148).
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/linked": "/home/user/dev/actual",
        "/home/user/dev/actual": "/home/user/dev/actual",
        "/home/user/dev/actual/.git": "/home/user/dev/actual/.git",
      },
      listings: {
        "/home/user/dev": ["linked"],
        "/home/user/dev/actual": ["skills"],
      },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        {
          name: "linked",
          isSymlink: true,
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
      ],
    });
  });

  it("never stats a symlink's target before checking it against the home ceiling", async () => {
    // The endpoint's own security order is normalize -> realpath -> assert
    // inside root; classification must apply that per entry too. An
    // out-of-ceiling symlink target must never be touched again after
    // realpath — not even by a discard-the-result isDirectory call — or the
    // endpoint has stat'd a path outside the area it is bounded to (Codex
    // review, #148).
    const fs = new InMemoryFileSystem({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/escape": "/etc/secret",
        "/etc/secret": "/etc/secret",
      },
      listings: { "/home/user/dev": ["escape"] },
    });
    const isDirectorySpy = vi.spyOn(fs, "isDirectory");
    const browse = new BrowseFilesystem({ fs, homeRoot: () => "/home/user" });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({ ok: true, entries: [] });
    expect(isDirectorySpy).not.toHaveBeenCalledWith("/etc/secret");
  });

  it("never resolves a plain file as a possible symlink", async () => {
    // A raw listing name that listRawEntries already reports as neither a
    // directory nor a symlink (a plain file) must be dropped immediately,
    // with no realpath/isDirectory round trip spent resolving it — large,
    // ordinary directories (e.g. a Downloads folder full of files) must not
    // pay a symlink-resolution cost per file (Codex review, #148).
    const fs = new InMemoryFileSystem({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
      },
      files: { "/home/user/dev/notes.txt": "hi" },
      listings: { "/home/user/dev": ["notes.txt"] },
    });
    const realpathSpy = vi.spyOn(fs, "realpath");
    const browse = new BrowseFilesystem({ fs, homeRoot: () => "/home/user" });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({ ok: true, entries: [] });
    expect(realpathSpy).not.toHaveBeenCalledWith("/home/user/dev/notes.txt");
  });

  it("reports a directory-form .git as a git repo", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/repo": "/home/user/dev/repo",
        "/home/user/dev/repo/.git": "/home/user/dev/repo/.git",
      },
      listings: { "/home/user/dev": ["repo"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        { name: "repo", facts: { isGitRepo: true, hasSkillsSubdir: false } },
      ],
    });
  });

  it("reports a file-form .git worktree as a git repo", async () => {
    // A linked worktree's `.git` is a file pointing at the main repo's
    // worktrees dir, not a directory of its own — so the probe must not
    // require a directory.
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/worktree": "/home/user/dev/worktree",
      },
      files: {
        "/home/user/dev/worktree/.git": "gitdir: ../repo/.git/worktrees/x",
      },
      listings: { "/home/user/dev": ["worktree"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        {
          name: "worktree",
          facts: { isGitRepo: true, hasSkillsSubdir: false },
        },
      ],
    });
  });

  it("reports a folder holding a skills/ subdir", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/inventory": "/home/user/dev/inventory",
      },
      listings: {
        "/home/user/dev": ["inventory"],
        // hasSkillsSubdir reads the directory listing (not a direct
        // isDirectory probe) so a symlinked "skills" can never be resolved
        // and disclosed — see the comment in browse-filesystem.ts.
        "/home/user/dev/inventory": ["skills"],
      },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        {
          name: "inventory",
          facts: { isGitRepo: false, hasSkillsSubdir: true },
        },
      ],
    });
  });

  it("reports no facts for a folder that is neither a repo nor an inventory", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/plain": "/home/user/dev/plain",
      },
      listings: { "/home/user/dev": ["plain"] },
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        { name: "plain", facts: { isGitRepo: false, hasSkillsSubdir: false } },
      ],
    });
  });

  it("reports no facts for an entry that raced away from being a directory before probing", async () => {
    // A directory that was genuine when `dev` was first listed but that a
    // concurrent process swapped for a symlink out of home before the facts
    // probe ran (TOCTOU — Codex review, #150). isDirectoryEntry must be
    // rechecked immediately before probing; on a lost race, no probe runs
    // and no fact is reported, rather than resolving through the swap.
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
        "/home/user/dev/swapped": "/home/user/dev/swapped",
        "/home/user/dev/swapped/.git": "/home/user/dev/swapped/.git",
      },
      listings: {
        "/home/user/dev": ["swapped"],
        "/home/user/dev/swapped": ["skills"],
      },
      racedAwayAsDirectory: ["/home/user/dev/swapped"],
    });

    const result = await browse.browse("/home/user/dev");

    expect(result).toMatchObject({
      ok: true,
      entries: [
        {
          name: "swapped",
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
      ],
    });
  });

  it("defaults an empty path to the home root", async () => {
    const browse = makeBrowse({
      directories: {
        "/home/user": "/home/user",
        "/home/user/dev": "/home/user/dev",
      },
      listings: { "/home/user": ["dev"] },
    });

    const result = await browse.browse("");

    expect(result).toEqual({
      ok: true,
      path: "/home/user",
      breadcrumbs: [{ name: "~", path: "/home/user" }],
      entries: [
        {
          name: "dev",
          path: "/home/user/dev",
          isHidden: false,
          isSymlink: false,
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
      ],
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
