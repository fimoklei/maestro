import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeployedCleanupAdapter,
  DeployedLocation,
  DeployedRefAdapter,
  GlobalDeployStateReader,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  RemoveDeployedSkill,
  type SupportedTool,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubBrowse } from "../helpers/stub-browse";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";

// What a user's screen shows after a removal. server-remove.test.ts asserts the
// ref apm is handed; this asserts the row disappearing, which needs a faithful
// apm: it rewrites the target's lockfile and deletes the file rather than
// emptying it when the last dependency goes (docs/apm-behavior.md § Remove).

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
      `  virtual_path: skills/${name}`,
      "  package_type: claude_skill",
      ...(deployedFiles
        ? ["  deployed_files:", ...deployedFiles(name).map((f) => `  - ${f}`)]
        : []),
    ]),
    "",
  ].join("\n");

// Which tools a global entry carries. The global read groups per tool from
// these, so a skill only shows on a card whose tool has a file.
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
    repo = await mkdtemp(join(tmpdir(), "maestro-remove-state-repo-"));
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
    const fs = new NodeFileSystem();
    const tools = options?.detectedTools ?? ["claude", "codex"];
    const confirms = options?.confirms ?? true;
    const registry = realRegistry(fs, join(home, "config.json"));
    // What apm believes is installed in each scope, kept beside the lockfiles
    // the fake rewrites.
    const state = { repo: [] as string[], global: [] as string[] };
    // HOME redirected at the sandbox throughout, so no test can read or write
    // the real ~/.apm (.claude/rules/apm-driver.md § Danger).
    const location = new DeployedLocation({ HOME: home });
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

    const locks = new InFlightLocks();
    const remove = new RemoveDeployedSkill({
      registry,
      locks,
      deployedRef: new DeployedRefAdapter({ fs, location }),
      deployedContent: { classify: async () => "clean" as const },
      apm: {
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
      },
      deployedCleanup: new DeployedCleanupAdapter({ location }),
      toolPresence: { detectGlobalTools: async () => tools },
      canonicalPath: (path) => fs.realpath(path),
      location,
    });

    const inventory = new InventoryReader({ fs, resolvePath: () => undefined });
    const app = createApp({
      registry,
      inventory,
      deployState: new GlobalDeployStateReader({
        fs,
        toolPresence: { detectGlobalTools: async () => tools },
      }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove,
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => apmRoot,
      connect: stubConnect(),
      browse: stubBrowse(),
      enforceOriginHost: false,
    });

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

  const removeSkill = (app: App, body: unknown) =>
    app.request("/api/deploy/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

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
    // apm deletes the lockfile with its last dependency, so the read has no
    // file to parse — that has to be an empty list, not a 4xx.
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
