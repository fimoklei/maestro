import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DeployedLocation,
  HarnessGitAdapter,
  NodeFileSystem,
  ReadDrift,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

// Integration lane: the whole chain behind ADR-0027, against real git objects.
// A release moves the latest tag for every deployed skill at once, so the
// content reading is what separates the one that changed from the ones that
// did not. The remote is a bare repo on disk, reached through an insteadOf
// rewrite — the configured origin URL stays the github.com one apm pins to.
const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/harness.git";

const IDENTITY = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

const git = (cwd: string, args: string[]) =>
  run("git", args, { cwd, env: { ...process.env, ...IDENTITY } });

const writeSkill = async (root: string, name: string, body: string) => {
  const dir = join(root, ".apm/skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), body);
};

const lockfile = (names: string[], ref: string) =>
  `lockfile_version: '1'\ndependencies:\n${names
    .map(
      (name) =>
        `- repo_url: fimoklei/harness\n  host: github.com\n  resolved_ref: ${ref}\n  virtual_path: .apm/skills/${name}\n  package_type: claude_skill\n`,
    )
    .join("")}`;

describe("the content reading beside apm's Behind", () => {
  let tree: string;
  let harness: string;
  let repo: string;

  beforeEach(async () => {
    tree = await mkdtemp(join(tmpdir(), "maestro-drift-content-"));
    const remote = join(tree, "origin.git");
    harness = join(tree, "harness");
    repo = join(tree, "repo");
    await mkdir(remote);
    await mkdir(harness);
    await mkdir(repo);

    await git(remote, ["init", "--bare", "--initial-branch=main", "."]);
    await git(harness, ["init", "--initial-branch=main", "."]);
    await git(harness, ["remote", "add", "origin", ORIGIN_URL]);
    // The rewrite is transport only: `remote.origin.url` still reads as the
    // github.com repository the lockfile pins to.
    await git(harness, ["config", `url.${remote}.insteadOf`, ORIGIN_URL]);

    await writeSkill(harness, "workflow-commit", "commit v1\n");
    await writeSkill(harness, "tdd", "tdd v1\n");
    await git(harness, ["add", "-A"]);
    await git(harness, ["commit", "-m", "first release"]);
    await git(harness, ["tag", "v0.2.0"]);

    await writeSkill(harness, "tdd", "tdd v2\n");
    await git(harness, ["add", "-A"]);
    await git(harness, ["commit", "-m", "second release"]);
    await git(harness, ["tag", "v0.3.0"]);

    await git(harness, ["push", "origin", "main", "--tags"]);
    // Both releases exist only on the remote from here on, so the reading has
    // to come from what the join's own fetch brings in.
    await git(harness, ["tag", "-d", "v0.2.0"]);
    await git(harness, ["tag", "-d", "v0.3.0"]);

    await writeFile(
      join(repo, "apm.lock.yaml"),
      lockfile(["workflow-commit", "tdd"], "v0.2.0"),
    );
  });

  afterEach(async () => {
    await removeGitTempTree(tree);
  });

  const readDriftFor = (root: string | undefined, behind: string[]) =>
    new ReadDrift({
      drift: {
        execute: async () => ({
          ok: true,
          behind: behind.map((name) => ({
            name,
            current: "v0.2.0",
            latest: "v0.3.0",
          })),
        }),
      },
      fs: new NodeFileSystem(),
      location: new DeployedLocation({}),
      resolveRoot: async () => root,
      git: new HarnessGitAdapter(),
    }).execute({ target: { kind: "repo", repoPath: repo } });

  it("separates the skill that moved in the release from the one that did not", async () => {
    const result = await readDriftFor(harness, ["workflow-commit", "tdd"]);

    expect(result).toEqual({
      ok: true,
      behind: [
        {
          name: "workflow-commit",
          current: "v0.2.0",
          latest: "v0.3.0",
          reading: "older-tag",
        },
        { name: "tdd", current: "v0.2.0", latest: "v0.3.0", reading: "behind" },
      ],
    });
  });

  it("falls back to behind when no harness is connected", async () => {
    const result = await readDriftFor(undefined, ["workflow-commit"]);

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });
});
