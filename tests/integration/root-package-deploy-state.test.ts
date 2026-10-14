import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeployStateExtras, ReleaseHead } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { nodeApp } from "../helpers/node-app";

// Real files on disk decide what is deployed; the Release head, derived from
// the Harness's release tags, crosses the HTTP edge shape-checked.

const SKILL_BODY = "# skill\n";
const SKILL_HASH = `sha256:${createHash("sha256").update(SKILL_BODY).digest("hex")}`;

// The shape apm 0.29.0 writes for a root package: no virtual_path, a
// skill_subset beside deployed_files, a hash per deployed file.
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
    "  deployed_file_hashes:",
    ...deployedFiles.map((file) => `    ${file}: ${SKILL_HASH}`),
    "  skill_subset:",
    ...subset.map((name) => `  - ${name}`),
    "",
  ].join("\n");

const NOW = "2026-09-12T10:00:00.000Z";

// v0.3.4 changed tdd and left grill as v0.3.2 shipped it.
const HEAD: ReleaseHead = {
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 1,
  changedSkills: ["tdd"],
  selection: ["tdd", "grill"],
  selected: 2,
  comparedAt: NOW,
};

describe("reading a root-package target over HTTP", () => {
  let home: string;
  let apmRoot: string;
  let repo: string;
  let harnessRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    home = await realpath(
      await mkdtemp(join(tmpdir(), "maestro-root-package-")),
    );
    apmRoot = join(home, ".apm");
    repo = join(home, "repo");
    harnessRoot = join(home, "harness");
    await mkdir(apmRoot, { recursive: true });
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(harnessRoot);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(home, { recursive: true, force: true });
  });

  async function seedFiles(root: string, files: string[]) {
    for (const file of files) {
      await mkdir(join(root, file, ".."), { recursive: true });
      await writeFile(join(root, file), SKILL_BODY, "utf8");
    }
  }

  // The Harness clone answers its tags and origin; harnessPage is its GitHub page.
  async function makeApp(harnessPage?: DeployStateExtras["harnessPage"]) {
    const harness = new InMemoryHarnessGit();
    harness.root = harnessRoot;
    harness.commit("c32", { tdd: "tdd one", grill: "grill" });
    harness.commit(
      "c34",
      { tdd: "tdd two", grill: "grill" },
      { parent: "c32" },
    );
    harness.tags = [
      { name: "v0.3.2", commit: "c32" },
      { name: "v0.3.4", commit: "c34" },
    ];
    const app = nodeApp(
      {
        HOME: home,
        MAESTRO_HOME: join(home, ".maestro"),
        MAESTRO_INVENTORY_PATH: harnessRoot,
      },
      {
        toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
        git: {
          harness,
          githubPage: async (path) =>
            path === harnessRoot && harnessPage ? await harnessPage() : null,
        },
      },
    );
    const res = await app.request("/api/registry/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: repo }),
    });
    expect(res.status).toBe(201);
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

    const app = await makeApp();
    const res = await app.request(
      `/api/deploy-state?repo=${encodeURIComponent(repo)}`,
    );

    const body = (await res.json()) as { releaseHead: ReleaseHead };
    expect(body.releaseHead.changedSkills).toEqual(["tdd"]);
  });

  // The Skills `→ N targets` counts the Selection.
  it("carries the Selection the count speaks about", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
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

    const app = await makeApp();
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
          releaseHead: { ...HEAD, selection: ["tdd"], selected: 1 },
        },
        {
          tool: "codex",
          primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
          releaseHead: { ...HEAD, selection: ["tdd"], selected: 1 },
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
      const res = await (await makeApp(harnessPage)).request(path);
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
      const app = await makeApp(async () => ({
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
