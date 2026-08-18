import {
  chmod,
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowseFilesystem,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";

// Integration lane: drives the real browse route against a real sandbox
// filesystem. Home-root ceiling, dirs-only filtering, and symlink resolution —
// a real symlinked directory shown when it resolves inside the ceiling,
// dropped when it escapes it, a file or dangling target, or a broken link
// (issue #148) — are proven here on a live disk, the place those can actually
// misbehave. The Origin/Host guard is disabled (its enforcement lives in
// server-security.test).
describe("filesystem browse HTTP route", () => {
  let home: string;
  let outside: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-browse-home-"));
    outside = await mkdtemp(join(tmpdir(), "maestro-browse-outside-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  function makeApp() {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const deployState = stubDeployState({ fs });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      browse: new BrowseFilesystem({ fs, homeRoot: () => home }),
      enforceOriginHost: false,
    });
  }

  function postBrowse(app: ReturnType<typeof makeApp>, body: unknown) {
    return app.request("/api/filesystem/children", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("lists only the immediate child directories, never files", async () => {
    await mkdir(join(home, "dev", "repo-b"), { recursive: true });
    await mkdir(join(home, "dev", "repo-a"), { recursive: true });
    await writeFile(join(home, "dev", "notes.txt"), "ignore me", "utf8");
    const realDev = await nodeRealpath(join(home, "dev"));
    const realHome = await nodeRealpath(home);

    const res = await postBrowse(makeApp(), { path: join(home, "dev") });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      path: realDev,
      parent: realHome,
      breadcrumbs: [
        { name: "~", path: realHome },
        { name: "dev", path: realDev },
      ],
      entries: [
        {
          name: "repo-a",
          path: join(realDev, "repo-a"),
          isHidden: false,
          isSymlink: false,
          facts: { isGitRepo: false, hasApmManifest: false },
        },
        {
          name: "repo-b",
          path: join(realDev, "repo-b"),
          isHidden: false,
          isSymlink: false,
          facts: { isGitRepo: false, hasApmManifest: false },
        },
      ],
    });
  });

  it("marks a dot-prefixed entry as hidden", async () => {
    await mkdir(join(home, ".config"), { recursive: true });
    await mkdir(join(home, "dev"), { recursive: true });
    const realHome = await nodeRealpath(home);

    const res = await postBrowse(makeApp(), { path: home });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: { name: string; isHidden: boolean }[];
    };
    expect(body.entries).toEqual([
      {
        name: ".config",
        path: join(realHome, ".config"),
        isHidden: true,
        isSymlink: false,
        facts: { isGitRepo: false, hasApmManifest: false },
      },
      {
        name: "dev",
        path: join(realHome, "dev"),
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: false, hasApmManifest: false },
      },
    ]);
  });

  it("lists a real symlinked directory that resolves inside the home ceiling, tagged as a symlink", async () => {
    await mkdir(join(home, "dev", "actual-repo"), { recursive: true });
    await symlink(
      join(home, "dev", "actual-repo"),
      join(home, "dev", "linked-repo"),
    );
    const realDev = await nodeRealpath(join(home, "dev"));

    const res = await postBrowse(makeApp(), { path: join(home, "dev") });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: { name: string; path: string; isSymlink: boolean }[];
    };
    expect(body.entries).toEqual([
      {
        name: "actual-repo",
        path: join(realDev, "actual-repo"),
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: false, hasApmManifest: false },
      },
      {
        name: "linked-repo",
        path: join(realDev, "linked-repo"),
        isHidden: false,
        isSymlink: true,
        facts: { isGitRepo: false, hasApmManifest: false },
      },
    ]);
  });

  it("excludes a real symlinked directory whose target resolves outside the home ceiling", async () => {
    await mkdir(join(outside, "secret-project"), { recursive: true });
    await mkdir(join(home, "dev", "plain"), { recursive: true });
    await symlink(
      join(outside, "secret-project"),
      join(home, "dev", "escaping-link"),
    );

    const res = await postBrowse(makeApp(), { path: join(home, "dev") });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { name: string }[] };
    expect(body.entries.map((e) => e.name)).toEqual(["plain"]);
  });

  it("excludes a real symlink pointing at a file, not a directory", async () => {
    await mkdir(join(home, "dev"), { recursive: true });
    await writeFile(join(home, "dev", "notes.txt"), "hi", "utf8");
    await symlink(
      join(home, "dev", "notes.txt"),
      join(home, "dev", "link-to-file"),
    );

    const res = await postBrowse(makeApp(), { path: join(home, "dev") });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { name: string }[] };
    expect(body.entries.map((e) => e.name)).toEqual([]);
  });

  it("excludes a real broken (dangling) symlink from the listing", async () => {
    await mkdir(join(home, "dev"), { recursive: true });
    await symlink(
      join(home, "dev", "does-not-exist"),
      join(home, "dev", "dangling"),
    );

    const res = await postBrowse(makeApp(), { path: join(home, "dev") });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { name: string }[] };
    expect(body.entries.map((e) => e.name)).toEqual([]);
  });

  it("reports git-repo and apm.yml facts for real directories", async () => {
    // A directory-form .git (the common case).
    await mkdir(join(home, "repo", ".git"), { recursive: true });
    // A file-form .git, as a git worktree has.
    await mkdir(join(home, "worktree"), { recursive: true });
    await writeFile(
      join(home, "worktree", ".git"),
      "gitdir: ../repo/.git/worktrees/x",
      "utf8",
    );
    // A folder that looks like a Harness: an apm.yml manifest, no skills/ dir.
    await mkdir(join(home, "inventory"), { recursive: true });
    await writeFile(join(home, "inventory", "apm.yml"), "dependencies: []\n");
    // A plain folder with neither.
    await mkdir(join(home, "plain"), { recursive: true });
    const realHome = await nodeRealpath(home);

    const res = await postBrowse(makeApp(), { path: home });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: { name: string; facts: unknown }[];
    };
    expect(body.entries).toEqual([
      {
        name: "inventory",
        path: join(realHome, "inventory"),
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: false, hasApmManifest: true },
      },
      {
        name: "plain",
        path: join(realHome, "plain"),
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: false, hasApmManifest: false },
      },
      {
        name: "repo",
        path: join(realHome, "repo"),
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: true, hasApmManifest: false },
      },
      {
        name: "worktree",
        path: join(realHome, "worktree"),
        isHidden: false,
        isSymlink: false,
        facts: { isGitRepo: true, hasApmManifest: false },
      },
    ]);
  });

  it("never leaks whether a symlinked .git or skills/ target outside home exists (Codex review, #150)", async () => {
    // A fact probe that follows a symlink turns a boolean into an oracle: an
    // attacker who can already plant a symlink inside home (the only
    // precondition) could otherwise learn whether an arbitrary path outside
    // the home ceiling exists by pointing ".git"/"skills" at it and reading
    // the fact back. Both an existing and a non-existent outside target must
    // report identically — that sameness is the proof there is no leak.
    await mkdir(join(home, "git-to-existing"), { recursive: true });
    await symlink(outside, join(home, "git-to-existing", ".git"));
    await mkdir(join(home, "git-to-missing"), { recursive: true });
    await symlink(
      join(outside, "does-not-exist"),
      join(home, "git-to-missing", ".git"),
    );
    await mkdir(join(home, "skills-to-existing"), { recursive: true });
    await symlink(outside, join(home, "skills-to-existing", "skills"));
    await mkdir(join(home, "skills-to-missing"), { recursive: true });
    await symlink(
      join(outside, "does-not-exist"),
      join(home, "skills-to-missing", "skills"),
    );

    const res = await postBrowse(makeApp(), { path: home });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: {
        name: string;
        facts: { isGitRepo: boolean; hasApmManifest: boolean };
      }[];
    };
    const factsFor = (name: string) =>
      body.entries.find((e) => e.name === name)?.facts;

    // A symlinked .git reports true unconditionally — its target is never
    // resolved, so an existing and a missing outside target read the same.
    expect(factsFor("git-to-existing")).toEqual({
      isGitRepo: true,
      hasApmManifest: false,
    });
    expect(factsFor("git-to-missing")).toEqual({
      isGitRepo: true,
      hasApmManifest: false,
    });
    // A symlinked skills/ is invisible to the directory listing this fact
    // reads from — never true, regardless of what it points at.
    expect(factsFor("skills-to-existing")).toEqual({
      isGitRepo: false,
      hasApmManifest: false,
    });
    expect(factsFor("skills-to-missing")).toEqual({
      isGitRepo: false,
      hasApmManifest: false,
    });
  });

  it("defaults an empty path to the home root, without a parent", async () => {
    // At the home ceiling the JSON carries no parent key at all — the client
    // reads its absence as "up is disabled" (issue #146).
    await mkdir(join(home, "dev"), { recursive: true });
    const realHome = await nodeRealpath(home);

    const res = await postBrowse(makeApp(), { path: "" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      path: realHome,
      breadcrumbs: [{ name: "~", path: realHome }],
      entries: [
        {
          name: "dev",
          path: join(realHome, "dev"),
          isHidden: false,
          isSymlink: false,
          facts: { isGitRepo: false, hasApmManifest: false },
        },
      ],
    });
  });

  it("rejects a path outside the home root with 403", async () => {
    const res = await postBrowse(makeApp(), { path: outside });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("outside-root");
    expect(body.message).toMatch(/\S/);
    // The path is never echoed back — it may be a misconfigured secret.
    expect(body.message).not.toContain(outside);
  });

  it("rejects a symlink that escapes the home root with 403", async () => {
    const escapeLink = join(home, "escape");
    await symlink(outside, escapeLink);

    const res = await postBrowse(makeApp(), { path: escapeLink });

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      "outside-root",
    );
  });

  it("returns 404 for a non-existent path inside the home root", async () => {
    const res = await postBrowse(makeApp(), { path: join(home, "missing") });

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("not-found");
  });

  it("rejects a non-existent path outside the home root with 403, not 404", async () => {
    // A missing outside path must look identical to an existing one — otherwise
    // the endpoint leaks existence beyond the home ceiling (ADR-0009).
    const res = await postBrowse(makeApp(), {
      path: join(outside, "definitely-missing"),
    });

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      "outside-root",
    );
  });

  it("returns 400 for a path that is not a directory", async () => {
    await writeFile(join(home, "file.txt"), "hi", "utf8");

    const res = await postBrowse(makeApp(), { path: join(home, "file.txt") });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "not-a-directory",
    );
  });

  it("returns 422 for a real directory inside home that cannot be read", async () => {
    // A user can select a directory under home that exists but denies listing
    // (permission denied). The endpoint must answer a controlled error, never a
    // 500 (issue #94: "a readable error, not a crash").
    const locked = join(home, "locked");
    await mkdir(locked, { recursive: true });
    await chmod(locked, 0o000);
    try {
      const res = await postBrowse(makeApp(), { path: locked });

      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toBe(
        "unreadable",
      );
    } finally {
      // Restore so afterEach can remove it.
      await chmod(locked, 0o700);
    }
  });

  it("rejects a malformed body with a 400", async () => {
    const res = await postBrowse(makeApp(), { notPath: 1 });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid-body",
    );
  });
});
