import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DeployStateExtras,
  GlobalDeployStateReader,
  InFlightLocks,
  InventoryReader,
  NodeFileSystem,
  type ReleaseHead,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// Real files on disk decide what is deployed; the Release head crosses the
// HTTP edge shape-checked.

// The shape apm 0.29.0 writes for a root package: no virtual_path, a
// skill_subset beside deployed_files.
const rootPackageLockfile = (
  ref: string,
  deployedFiles: string[],
  subset: string[],
) =>
  [
    "lockfile_version: '1'",
    "apm_version: 0.29.0",
    "dependencies:",
    "- repo_url: fimoklei/agent-harness",
    "  name: agent-harness",
    "  host: github.com",
    `  resolved_ref: ${ref}`,
    "  package_type: apm_package",
    "  deployed_files:",
    ...deployedFiles.map((file) => `  - ${file}`),
    "  skill_subset:",
    ...subset.map((name) => `  - ${name}`),
    "",
  ].join("\n");

const HEAD: ReleaseHead = {
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 1,
  selected: 2,
  comparedAt: "2026-09-12T10:00:00.000Z",
};

describe("reading a root-package target over HTTP", () => {
  let home: string;
  let apmRoot: string;
  let repo: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-root-package-"));
    apmRoot = join(home, ".apm");
    repo = join(home, "repo");
    await mkdir(apmRoot, { recursive: true });
    await mkdir(join(repo, ".git"), { recursive: true });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function seedFiles(root: string, files: string[]) {
    for (const file of files) {
      await mkdir(join(root, file, ".."), { recursive: true });
      await writeFile(join(root, file), "# skill\n", "utf8");
    }
  }

  async function makeApp(
    head: ReleaseHead | undefined = HEAD,
    harnessPage?: DeployStateExtras["harnessPage"],
  ) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const locks = new InFlightLocks();
    const app = createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      deployState: new GlobalDeployStateReader({
        fs,
        toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
        treeRoot: () => home,
        releaseHead: { read: async () => head ?? HEAD },
        harnessPage,
        harnessOrigin: async () => ({
          host: "github.com",
          ownerRepo: "fimoklei/agent-harness",
        }),
      }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => apmRoot,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
    await registry.register(repo);
    return app;
  }

  it("lists the repository's skills from its files and carries the Release head", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".claude/skills/grill/SKILL.md",
    ];
    await seedFiles(repo, files);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      rootPackageLockfile("v0.3.2", files, ["tdd", "grill"]),
      "utf8",
    );

    const app = await makeApp();
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [
        { type: "skill", name: "tdd", version: "v0.3.2" },
        { type: "skill", name: "grill", version: "v0.3.2" },
      ],
      skipped: [],
      releaseHead: HEAD,
    });
  });

  it("carries the names the newest release changed, so the Inventory can mark one skill", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
    await seedFiles(repo, files);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      rootPackageLockfile("v0.3.2", files, ["tdd"]),
      "utf8",
    );

    const app = await makeApp({ ...HEAD, selected: 1, changedSkills: ["tdd"] });
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    const body = (await res.json()) as { releaseHead: ReleaseHead };
    expect(body.releaseHead.changedSkills).toEqual(["tdd"]);
  });

  // The Inventory's `→ N targets` counts the Selection.
  it("carries the Selection the count speaks about", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
    await seedFiles(repo, files);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      rootPackageLockfile("v0.3.2", files, ["tdd"]),
      "utf8",
    );

    const app = await makeApp({ ...HEAD, selected: 1, selection: ["tdd"] });
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    const body = (await res.json()) as { releaseHead: ReleaseHead };
    expect(body.releaseHead.selection).toEqual(["tdd"]);
  });

  it("leaves a skill whose file is gone off the list", async () => {
    const recorded = [
      ".claude/skills/tdd/SKILL.md",
      ".claude/skills/removed/SKILL.md",
    ];
    await seedFiles(repo, [".claude/skills/tdd/SKILL.md"]);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      rootPackageLockfile("v0.3.2", recorded, ["tdd", "removed"]),
      "utf8",
    );

    const app = await makeApp();
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    const body = (await res.json()) as {
      primitives: { name: string }[];
    };
    expect(body.primitives.map((primitive) => primitive.name)).toStrictEqual([
      "tdd",
    ]);
  });

  it("sends no Release head whose release is not a release tag", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
    await seedFiles(repo, files);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      rootPackageLockfile("main", files, ["tdd"]),
      "utf8",
    );

    const app = await makeApp({ ...HEAD, release: "main" });
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(await res.json()).toEqual({
      primitives: [{ type: "skill", name: "tdd", version: "main" }],
      skipped: [],
    });
  });

  it("carries the count of recorded files outside the selected skills", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".claude/agents/reviewer.md",
      ".claude/hooks/format.json",
    ];
    await seedFiles(repo, files);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      rootPackageLockfile("v0.3.2", files, ["tdd"]),
      "utf8",
    );

    const app = await makeApp();
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(await res.json()).toMatchObject({ extraFiles: 2 });
  });

  it("carries the per-skill pins a target still holds, grouped by release", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".claude/skills/grill/SKILL.md",
    ];
    await seedFiles(repo, files);
    await writeFile(
      join(repo, "apm.lock.yaml"),
      [
        "lockfile_version: '1'",
        "dependencies:",
        ...files.flatMap((file, index) => {
          const name = file.split("/")[2];
          return [
            "- repo_url: fimoklei/agent-harness",
            "  host: github.com",
            `  resolved_ref: v0.3.${index}`,
            `  virtual_path: .apm/skills/${name}`,
            "  package_type: claude_skill",
            "  deployed_files:",
            `  - ${file}`,
          ];
        }),
        "",
      ].join("\n"),
      "utf8",
    );

    const app = await makeApp();
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    expect(await res.json()).toMatchObject({
      pinnedPerSkill: [
        { release: "v0.3.1", skills: 1 },
        { release: "v0.3.0", skills: 1 },
      ],
    });
  });

  it("carries a Release head per global tool card", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".agents/skills/tdd/SKILL.md",
    ];
    await seedFiles(home, files);
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      rootPackageLockfile("v0.3.2", files, ["tdd"]),
      "utf8",
    );

    const app = await makeApp();
    const res = await app.request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
          releaseHead: HEAD,
        },
        {
          tool: "codex",
          primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
          releaseHead: HEAD,
        },
      ],
      skipped: [],
      otherOrigins: [],
    });
  });

  describe("the Harness's GitHub pages", () => {
    const HARNESS = "https://github.com/fimoklei/agent-harness";
    const SKILL = `${HARNESS}/tree/v0.3.2/.apm/skills/tdd`;
    const RELEASE = `${HARNESS}/releases/tag/v0.3.2`;
    const files = [".claude/skills/tdd/SKILL.md"];

    async function read(
      harnessPage: DeployStateExtras["harnessPage"],
      path = `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    ): Promise<unknown> {
      await seedFiles(repo, files);
      await seedFiles(home, files);
      const lockfile = rootPackageLockfile("v0.3.2", files, ["tdd"]);
      await writeFile(join(repo, "apm.lock.yaml"), lockfile, "utf8");
      await writeFile(join(apmRoot, "apm.lock.yaml"), lockfile, "utf8");
      const res = await (await makeApp(HEAD, harnessPage)).request(path);
      expect(res.status).toBe(200);
      return await res.json();
    }

    it("sends each skill's folder and the release's page", async () => {
      expect(
        await read(async () => ({ kind: "link", url: HARNESS })),
      ).toMatchObject({
        primitives: [{ name: "tdd", github: { kind: "link", url: SKILL } }],
        releaseGitHub: { kind: "link", url: RELEASE },
      });
    });

    it("sends them per global tool card", async () => {
      expect(
        await read(
          async () => ({ kind: "link", url: HARNESS }),
          "/api/deploy-state/global",
        ),
      ).toMatchObject({
        tools: [
          {
            tool: "claude",
            primitives: [{ name: "tdd", github: { kind: "link", url: SKILL } }],
            releaseGitHub: { kind: "link", url: RELEASE },
          },
          { tool: "codex", primitives: [] },
        ],
      });
    });

    it("sends a failed Harness origin read as unknown", async () => {
      expect(
        await read(async () => {
          throw new Error("git unavailable");
        }),
      ).toMatchObject({
        primitives: [{ name: "tdd", github: { kind: "unknown" } }],
        releaseGitHub: { kind: "unknown" },
      });
    });

    it("sends a link that fails the shape check as unknown, never as a link", async () => {
      await seedFiles(repo, files);
      await writeFile(
        join(repo, "apm.lock.yaml"),
        rootPackageLockfile("v0.3.2", files, ["tdd"]).replace(
          "repo_url: fimoklei/agent-harness",
          "repo_url: o/r#x",
        ),
        "utf8",
      );
      const app = await makeApp(HEAD, async () => ({
        kind: "link",
        url: "https://github.com/o/r#x",
      }));
      const res = await app.request(
        `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
      );
      expect(await res.json()).toMatchObject({
        primitives: [{ name: "tdd", github: { kind: "unknown" } }],
        releaseGitHub: { kind: "unknown" },
      });
    });
  });
});
