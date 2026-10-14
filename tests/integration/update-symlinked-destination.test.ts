// A linked skill folder blocks an update, read off the real disk; apm stays
// unreachable, so nothing installs (#954).
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { consumerManifest } from "../helpers/deploy-world";
import { nodeApp } from "../helpers/node-app";

const COPY = "# skill\n";
const SKILLS = ["tdd", "grill", "review"];
const FILES = SKILLS.map((name) => `.claude/skills/${name}/SKILL.md`);

// The shape apm 0.29.0 writes for a root package, its hashes read off the copies.
const lockfile = [
  "lockfile_version: '1'",
  "apm_version: 0.29.0",
  "dependencies:",
  "- repo_url: fimoklei/agent-harness",
  "  name: agent-harness",
  "  host: github.com",
  "  resolved_ref: v0.3.2",
  "  package_type: apm_package",
  "  deployed_files:",
  ...FILES.map((file) => `  - ${file}`),
  "  deployed_file_hashes:",
  ...FILES.map(
    (file) =>
      `    ${file}: sha256:${createHash("sha256").update(COPY).digest("hex")}`,
  ),
  "",
].join("\n");

describe("update into a target whose skill folder is a link", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    home = await realpath(
      await mkdtemp(join(tmpdir(), "maestro-update-link-")),
    );
    repo = join(home, "repo");
    await mkdir(join(repo, ".git"), { recursive: true });
    for (const file of FILES) {
      await mkdir(join(repo, file, ".."), { recursive: true });
      await writeFile(join(repo, file), COPY, "utf8");
    }
    await writeFile(join(repo, "apm.lock.yaml"), lockfile, "utf8");
    await writeFile(join(repo, "apm.yml"), consumerManifest(SKILLS), "utf8");
    await mkdir(join(home, "harness"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function makeApp() {
    const harness = new InMemoryHarnessGit();
    harness.root = join(home, "harness");
    harness.tags = [
      {
        name: "v0.3.2",
        commit: harness.commit("a", { tdd: "a", grill: "b", review: "d" }),
      },
      {
        name: "v0.3.4",
        commit: harness.commit("b", { tdd: "a2", grill: "b", wizard: "f" }),
      },
    ];
    const app = nodeApp(
      {
        HOME: home,
        MAESTRO_HOME: home,
        MAESTRO_INVENTORY_PATH: harness.root,
      },
      {
        toolPresence: { detectGlobalTools: async () => ["claude"] },
        git: {
          harness,
          inventory: () => ({
            skillExistsAtTag: async () => true,
            skillDivergesFromTag: async () => false,
            readSkillFilesAtTag: async () => null,
          }),
        },
      },
    );
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post("/api/registry/repos", { path: repo })).status).toBe(
      201,
    );
    return post;
  }

  // The skill's folder in the target becomes a link to a folder elsewhere.
  async function linkSkillFolder(name: string): Promise<string> {
    const elsewhere = join(home, "elsewhere", name);
    await mkdir(elsewhere, { recursive: true });
    await writeFile(join(elsewhere, "SKILL.md"), "# linked\n", "utf8");
    const linked = join(repo, ".claude", "skills", name);
    await rm(linked, { recursive: true, force: true });
    await symlink(elsewhere, linked);
    return linked;
  }

  it("refuses to price an update whose selected skill's folder is a link", async () => {
    const post = await makeApp();
    const linked = await linkSkillFolder("grill");

    const response = await post("/api/deploy/update/preflight", {
      target: { kind: "repo", repoPath: repo },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      error: "destination-symlinked",
      linkedPath: linked,
    });
  });

  it("refuses a confirm once a selected skill's folder became a link, changing nothing", async () => {
    const post = await makeApp();
    const priced = await post("/api/deploy/update/preflight", {
      target: { kind: "repo", repoPath: repo },
    });
    const { preview } = (await priced.json()) as { preview: { token: string } };
    const linked = await linkSkillFolder("tdd");
    const snapshot = () =>
      Promise.all(
        ["apm.yml", "apm.lock.yaml", ...FILES].map((file) =>
          readFile(join(repo, file), "utf8"),
        ),
      );
    const before = await snapshot();

    // apm is unreachable here: an install would throw instead of answering 409.
    const response = await post("/api/deploy/update", {
      target: { kind: "repo", repoPath: repo },
      token: preview.token,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      error: "destination-symlinked",
      linkedPath: linked,
    });
    expect(await snapshot()).toStrictEqual(before);
  });
});
