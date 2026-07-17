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
  ConfigStore,
  DeployStateReader,
  InventoryReader,
  NodeFileSystem,
  Registry,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

// Integration lane: drives the real browse route against a real sandbox
// filesystem. Home-root ceiling, dirs-only filtering, and symlink escapes are
// proven here on a live disk — the place those can actually misbehave. The
// Origin/Host guard is disabled (its enforcement lives in server-security.test).
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
    const registry = new Registry({
      fs,
      store: new ConfigStore({ fs, configPath: join(home, "config.json") }),
    });
    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const deployState = new DeployStateReader({ fs });
    return createApp({
      registry,
      inventory,
      connect: stubConnect(),
      deployState,
      deploy: stubDeploy({ inventory, registry }),
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
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
        {
          name: "repo-b",
          path: join(realDev, "repo-b"),
          facts: { isGitRepo: false, hasSkillsSubdir: false },
        },
      ],
    });
  });

  it("reports git-repo and skills/-subdir facts for real directories", async () => {
    // A directory-form .git (the common case).
    await mkdir(join(home, "repo", ".git"), { recursive: true });
    // A file-form .git, as a git worktree has.
    await mkdir(join(home, "worktree"), { recursive: true });
    await writeFile(
      join(home, "worktree", ".git"),
      "gitdir: ../repo/.git/worktrees/x",
      "utf8",
    );
    // A folder that looks like an inventory.
    await mkdir(join(home, "inventory", "skills"), { recursive: true });
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
        facts: { isGitRepo: false, hasSkillsSubdir: true },
      },
      {
        name: "plain",
        path: join(realHome, "plain"),
        facts: { isGitRepo: false, hasSkillsSubdir: false },
      },
      {
        name: "repo",
        path: join(realHome, "repo"),
        facts: { isGitRepo: true, hasSkillsSubdir: false },
      },
      {
        name: "worktree",
        path: join(realHome, "worktree"),
        facts: { isGitRepo: true, hasSkillsSubdir: false },
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
        facts: { isGitRepo: boolean; hasSkillsSubdir: boolean };
      }[];
    };
    const factsFor = (name: string) =>
      body.entries.find((e) => e.name === name)?.facts;

    // A symlinked .git reports true unconditionally — its target is never
    // resolved, so an existing and a missing outside target read the same.
    expect(factsFor("git-to-existing")).toEqual({
      isGitRepo: true,
      hasSkillsSubdir: false,
    });
    expect(factsFor("git-to-missing")).toEqual({
      isGitRepo: true,
      hasSkillsSubdir: false,
    });
    // A symlinked skills/ is invisible to the directory listing this fact
    // reads from — never true, regardless of what it points at.
    expect(factsFor("skills-to-existing")).toEqual({
      isGitRepo: false,
      hasSkillsSubdir: false,
    });
    expect(factsFor("skills-to-missing")).toEqual({
      isGitRepo: false,
      hasSkillsSubdir: false,
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
          facts: { isGitRepo: false, hasSkillsSubdir: false },
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
