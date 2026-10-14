import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeployStateExtras } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeApp } from "../helpers/node-app";
import { makeRepoDir } from "../helpers/repo-dir";

describe("deploy-state HTTP route", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-deploy-state-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  // A repo with no GitHub page unless a test says otherwise.
  function makeApp(
    githubPage: DeployStateExtras["githubPage"] = async () => null,
  ) {
    const app = nodeApp(
      { HOME: home, MAESTRO_HOME: home },
      { git: { githubPage } },
    );
    const register = async (path: string) => {
      const res = await app.request("/api/registry/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      expect(res.status).toBe(201);
    };
    return { app, register };
  }

  async function makeRepo(lockfile: string | null): Promise<string> {
    const repo = await makeRepoDir("maestro-repo-");
    if (lockfile !== null) {
      await writeFile(join(repo, "apm.lock.yaml"), lockfile, "utf8");
    }
    return repo;
  }

  const tddLockfile = [
    "lockfile_version: '1'",
    "apm_version: 0.16.0",
    "dependencies:",
    "- repo_url: fimoklei/agent-harness",
    "  host: github.com",
    "  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb",
    "  resolved_ref: v0.5.0",
    "  virtual_path: .apm/skills/tdd",
    "  is_virtual: true",
    "  package_type: claude_skill",
    "  deployed_files:",
    "  - .claude/skills/tdd",
    "  content_hash: sha256:abc",
    "",
  ].join("\n");

  it("lists deployed skills with their human tag version", async () => {
    const repo = await makeRepo(tddLockfile);
    const { app, register } = makeApp();
    await register(repo);

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [],
    });
    await rm(repo, { recursive: true, force: true });
  });

  it("shows an empty list for a registered repo with nothing deployed", async () => {
    const repo = await makeRepo(null);
    const { app, register } = makeApp();
    await register(repo);

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ primitives: [], skipped: [] });
    await rm(repo, { recursive: true, force: true });
  });

  it("rejects a repo that is not registered, even when it has a lockfile", async () => {
    // The gate refuses before reading, so the response never leaks the lockfile.
    const repo = await makeRepo(tddLockfile);
    const { app } = makeApp();

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("v0.5.0");
    await rm(repo, { recursive: true, force: true });
  });

  it("returns 400 when no repo is given", async () => {
    const { app } = makeApp();

    const res = await app.request("/api/deploy-state");

    expect(res.status).toBe(400);
  });

  it("surfaces a visible error for a malformed lockfile", async () => {
    const repo = await makeRepo("dependencies: not-a-list\n");
    const { app, register } = makeApp();
    await register(repo);

    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("malformed");
    await rm(repo, { recursive: true, force: true });
  });

  describe("the repository's GitHub page", () => {
    async function readGithub(
      githubPage: DeployStateExtras["githubPage"],
    ): Promise<unknown> {
      const repo = await makeRepo(tddLockfile);
      const { app, register } = makeApp(githubPage);
      await register(repo);
      const res = await app.request(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      );
      await rm(repo, { recursive: true, force: true });
      expect(res.status).toBe(200);
      return ((await res.json()) as { github?: unknown }).github;
    }

    it("sends the link beside the rest of the reading", async () => {
      const page = { kind: "link", url: "https://github.com/o/r" } as const;
      expect(await readGithub(async () => page)).toEqual(page);
    });

    it("sends a failed origin read as unknown", async () => {
      expect(
        await readGithub(async () => {
          throw new Error("git unavailable");
        }),
      ).toEqual({ kind: "unknown" });
    });

    it("sends a link that fails the shape check as unknown, never as a link", async () => {
      expect(
        await readGithub(async () => ({
          kind: "link",
          url: "https://evil.example/o/r",
        })),
      ).toEqual({ kind: "unknown" });
    });

    it("sends no key where the repository has no GitHub page", async () => {
      expect(await readGithub(async () => null)).toBeUndefined();
    });
  });
});
