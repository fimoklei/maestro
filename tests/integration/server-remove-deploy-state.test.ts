import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApmDriverPort, SupportedTool } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unreachable } from "../helpers/in-memory-app";
import { nodeApp } from "../helpers/node-app";
import { makeRepoDir } from "../helpers/repo-dir";

// The row disappearing after a removal, behind a faithful fake apm that
// deletes the lockfile when the last dependency goes.

const lockfileFor = (
  names: string[],
  deployedFiles?: (name: string) => string[],
) =>
  [
    "lockfile_version: '1'",
    "dependencies:",
    ...names.flatMap((name) => [
      "- repo_url: fimoklei/agent-harness",
      "  host: github.com",
      "  resolved_ref: v0.5.1",
      `  virtual_path: .apm/skills/${name}`,
      "  package_type: claude_skill",
      ...(deployedFiles
        ? ["  deployed_files:", ...deployedFiles(name).map((f) => `  - ${f}`)]
        : []),
    ]),
    "",
  ].join("\n");

const globalFiles = (name: string, tools: SupportedTool[]) =>
  tools.map((tool) =>
    tool === "claude"
      ? `.claude/skills/${name}/SKILL.md`
      : `.agents/skills/${name}/SKILL.md`,
  );

describe("the deploy-state read after a removal", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-remove-state-home-"));
    repo = await makeRepoDir("maestro-remove-state-repo-");
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  function makeApp(options?: {
    confirms?: boolean;
    detectedTools?: SupportedTool[];
  }) {
    const tools = options?.detectedTools ?? ["claude", "codex"];
    const confirms = options?.confirms ?? true;
    const state = { repo: [] as string[], global: [] as string[] };
    // HOME is the sandbox, so no test touches the real ~/.apm.
    const apmRoot = join(home, ".apm");

    const writeRepoLockfile = async () => {
      const path = join(repo, "apm.lock.yaml");
      if (state.repo.length === 0) {
        await rm(path, { force: true });
        return;
      }
      await writeFile(path, lockfileFor(state.repo), "utf8");
    };

    const writeGlobalLockfile = async () => {
      const path = join(apmRoot, "apm.lock.yaml");
      if (state.global.length === 0) {
        await rm(path, { force: true });
        return;
      }
      await mkdir(apmRoot, { recursive: true });
      await writeFile(
        path,
        lockfileFor(state.global, (name) => globalFiles(name, tools)),
        "utf8",
      );
    };

    const app = nodeApp(
      { HOME: home, MAESTRO_HOME: home },
      {
        apm: unreachable<ApmDriverPort>("apm", {
          removeSkill: async ({ target, ref }) => {
            if (!confirms) {
              return { ok: false };
            }
            const drop = (names: string[]) =>
              names.filter((name) => !ref.includes(`/skills/${name}#`));
            if (target.kind === "repo") {
              state.repo = drop(state.repo);
              await writeRepoLockfile();
            } else {
              state.global = drop(state.global);
              await writeGlobalLockfile();
            }
            return { ok: true };
          },
        }),
        toolPresence: { detectGlobalTools: async () => tools },
      },
    );
    const registry = {
      register: async (path: string) => {
        const res = await app.request("/api/registry/repos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path }),
        });
        expect(res.status).toBe(201);
      },
    };

    return {
      app,
      registry,
      async deployInRepo(names: string[]) {
        state.repo = [...names];
        await writeRepoLockfile();
      },
      async deployGlobally(names: string[]) {
        state.global = [...names];
        await writeGlobalLockfile();
      },
    };
  }

  type App = ReturnType<typeof makeApp>["app"];

  // A removal that acknowledges no cost is refused (#364).
  const removeSkill = async (
    app: App,
    body: { type: string; name: string; target: unknown },
  ) => {
    const preflight = await app.request("/api/deploy/remove/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const { receipt } = (await preflight.json()) as { receipt?: string };
    return app.request("/api/deploy/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, confirmedRemovalReceipt: receipt }),
    });
  };

  const removeTddFromRepo = (app: App) =>
    removeSkill(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: repo },
    });

  const repoNames = async (app: App) => {
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );
    expect(res.status).toBe(200);
    const { primitives } = (await res.json()) as {
      primitives: { name: string }[];
    };
    return primitives.map((primitive) => primitive.name);
  };

  const globalNamesPerTool = async (app: App) => {
    const res = await app.request("/api/deploy-state/global");
    expect(res.status).toBe(200);
    const { tools } = (await res.json()) as {
      tools: { tool: string; primitives: { name: string }[] }[];
    };
    return tools.map((group) => ({
      tool: group.tool,
      names: group.primitives.map((primitive) => primitive.name),
    }));
  };

  it("stops listing the removed skill while the repo keeps the rest", async () => {
    const { app, registry, deployInRepo } = makeApp();
    await deployInRepo(["tdd", "jobs"]);
    await registry.register(repo);

    expect((await removeTddFromRepo(app)).status).toBe(200);

    expect(await repoNames(app)).toEqual(["jobs"]);
  });

  it("reads an emptied repo as empty, never as an error", async () => {
    // No lockfile must read as an empty list, not a 4xx.
    const { app, registry, deployInRepo } = makeApp();
    await deployInRepo(["tdd"]);
    await registry.register(repo);

    expect((await removeTddFromRepo(app)).status).toBe(200);

    expect(await repoNames(app)).toEqual([]);
  });

  it("still lists the skill when apm never confirmed the removal", async () => {
    const { app, registry, deployInRepo } = makeApp({ confirms: false });
    await deployInRepo(["tdd"]);
    await registry.register(repo);

    expect((await removeTddFromRepo(app)).status).toBe(502);

    expect(await repoNames(app)).toEqual(["tdd"]);
  });

  it("clears a globally removed skill from every tool, sparing the rest", async () => {
    const { app, deployGlobally } = makeApp();
    await deployGlobally(["tdd", "jobs"]);

    const response = await removeSkill(app, {
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });

    expect(response.status).toBe(200);
    expect(await globalNamesPerTool(app)).toEqual([
      { tool: "claude", names: ["jobs"] },
      { tool: "codex", names: ["jobs"] },
    ]);
  });
});
