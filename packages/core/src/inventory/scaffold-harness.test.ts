import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { ConfigStore } from "../registry/config-store";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import type { ConnectInventoryResult } from "./connect-inventory";
import { SCAFFOLD_ENTRIES } from "./harness-scaffold-files";
import type {
  HarnessScaffoldGitPort,
  ScaffoldPushOutcome,
} from "./harness-scaffold-git";
import { ScaffoldHarness } from "./scaffold-harness";
import { ScaffoldOffers } from "./scaffold-offers";

const REPO = "/Users/me/agent-harness";
const CONFIG_PATH = "/home/me/.maestro/config.json";
const ORIGIN = "git@github.com:fimoklei/agent-harness.git";

// Records every git call so a test can prove what the scaffold asked for, not
// merely what it returned.
class FakeGit implements HarnessScaffoldGitPort {
  readonly commits: { paths: string[]; message: string }[] = [];
  readonly pushes: string[] = [];
  readonly originHeads: string[] = [];
  readonly unstaged: string[] = [];
  repositoryRootAnswer = true;

  constructor(
    private readonly branches: {
      default: string | null;
      current: string | null;
      hasCommits: boolean;
    } = { default: "main", current: "main", hasCommits: true },
    private readonly outcomes: {
      commit?: "committed" | "commit-failed";
      push?: ScaffoldPushOutcome;
    } = {},
  ) {}

  async isRepositoryRoot() {
    return this.repositoryRootAnswer;
  }
  async defaultBranch() {
    return this.branches.default;
  }
  async currentBranch() {
    return this.branches.current;
  }
  async hasCommits() {
    return this.branches.hasCommits;
  }
  async commit(_root: string, paths: string[], message: string) {
    this.commits.push({ paths, message });
    return this.outcomes.commit ?? ("committed" as const);
  }
  async push(_root: string, branch: string) {
    this.pushes.push(branch);
    return this.outcomes.push ?? ("pushed" as const);
  }
  async setOriginHead(_root: string, branch: string) {
    this.originHeads.push(branch);
  }
  async unstage(_root: string, paths: string[]) {
    this.unstaged.push(...paths);
  }
}

function make(
  fs: InMemoryFileSystem,
  git: HarnessScaffoldGitPort = new FakeGit(),
  originUrl: string | null = ORIGIN,
  connect: (path: string) => Promise<ConnectInventoryResult> = async (
    path,
  ) => ({
    ok: true,
    outcome: "scaffolded",
    inventoryPath: path,
  }),
) {
  // Pre-offered: every test but the one below reaches the scaffold through a
  // connect that already refused this path and offered it.
  const offers = new ScaffoldOffers();
  offers.offer(REPO);
  return new ScaffoldHarness({
    fs,
    git,
    locks: new InFlightLocks(),
    offers,
    originUrl: async () => originUrl,
    connect,
  });
}

const emptyRepo = () =>
  new InMemoryFileSystem({ directories: { [REPO]: REPO } });

describe("ScaffoldHarness", () => {
  it("writes the canonical shape and lands connected as scaffolded", async () => {
    const fs = emptyRepo();

    const result = await make(fs).scaffold(REPO);

    expect(result).toEqual({
      ok: true,
      outcome: "scaffolded",
      inventoryPath: REPO,
    });
    expect(await fs.readFile(`${REPO}/apm.yml`)).toContain(
      "name: agent-harness",
    );
    expect(await fs.readFile(`${REPO}/README.md`)).toContain("agent-harness");
    expect(await fs.readFile(`${REPO}/.apm/skills/.gitkeep`)).toBe("");
    expect(
      await fs.readFile(`${REPO}/.github/workflows/skill-check.yml`),
    ).toContain("ubuntu-latest");
  });

  it("commits only the paths it wrote, so unrelated staged work survives", async () => {
    const git = new FakeGit();

    await make(emptyRepo(), git).scaffold(REPO);

    expect(git.commits).toHaveLength(1);
    expect(git.commits[0]?.paths.sort()).toEqual([
      ".apm/skills/.gitkeep",
      ".github/workflows/skill-check.yml",
      "README.md",
      "apm.yml",
    ]);
  });

  it("pushes the branch git reports as the default, then repairs origin/HEAD", async () => {
    const git = new FakeGit({
      default: "trunk",
      current: "trunk",
      hasCommits: true,
    });

    await make(emptyRepo(), git).scaffold(REPO);

    expect(git.pushes).toEqual(["trunk"]);
    expect(git.originHeads).toEqual(["trunk"]);
  });

  it("scaffolds onto the unborn branch of a freshly cloned empty repository", async () => {
    // An empty clone has no refs, so origin/HEAD names nothing; the branch it
    // landed on is the one the remote advertised (#552 G2).
    const git = new FakeGit({
      default: null,
      current: "trunk",
      hasCommits: false,
    });

    const result = await make(emptyRepo(), git).scaffold(REPO);

    expect(result.ok).toBe(true);
    expect(git.pushes).toEqual(["trunk"]);
  });

  it("refuses a repository whose default branch git cannot name", async () => {
    const git = new FakeGit({
      default: null,
      current: "feature",
      hasCommits: true,
    });

    await expect(make(emptyRepo(), git).scaffold(REPO)).resolves.toEqual({
      ok: false,
      error: "no-default-branch",
    });
  });

  it("refuses to scaffold from a branch that is not the default", async () => {
    const git = new FakeGit({
      default: "main",
      current: "feature",
      hasCommits: true,
    });

    await expect(make(emptyRepo(), git).scaffold(REPO)).resolves.toEqual({
      ok: false,
      error: "not-on-default-branch",
    });
  });

  it("names the repository-relative path of an entry it would overwrite", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [REPO]: REPO, [`${REPO}/.github`]: `${REPO}/.github` },
    });

    await expect(make(fs).scaffold(REPO)).resolves.toEqual({
      ok: false,
      error: "path-occupied",
      path: ".github",
    });
  });

  it("writes nothing when an entry is occupied", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [REPO]: REPO },
      files: { [`${REPO}/README.md`]: "mine\n" },
    });
    const git = new FakeGit();

    const result = await make(fs, git).scaffold(REPO);

    expect(result).toEqual({
      ok: false,
      error: "path-occupied",
      path: "README.md",
    });
    expect(await fs.readFile(`${REPO}/apm.yml`)).toBeNull();
    expect(await fs.readFile(`${REPO}/README.md`)).toBe("mine\n");
    expect(git.commits).toEqual([]);
  });

  it("refuses a directory that is already a Harness", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [REPO]: REPO },
      files: { [`${REPO}/apm.yml`]: "dependencies: []\n" },
    });

    await expect(make(fs).scaffold(REPO)).resolves.toEqual({
      ok: false,
      error: "already-a-harness",
    });
  });

  it("refuses a directory that is not a GitHub repository", async () => {
    await expect(
      make(emptyRepo(), new FakeGit(), null).scaffold(REPO),
    ).resolves.toEqual({ ok: false, error: "not-a-repository" });
  });

  // `git config --get remote.origin.url` answers from the enclosing repository,
  // so a subdirectory reads as a GitHub clone. Scaffolding one would write into
  // it and push to that repository's default branch.
  it("refuses a subdirectory of a repository, which reads as one", async () => {
    const git = new FakeGit();
    git.repositoryRootAnswer = false;

    const result = await make(emptyRepo(), git).scaffold(REPO);

    expect(result).toEqual({ ok: false, error: "not-a-repository" });
    expect(git.commits).toEqual([]);
    expect(git.pushes).toEqual([]);
  });

  // The endpoint writes, commits and pushes with ambient git credentials, so
  // the path may not be the client's to pick (security.md, #556).
  it("refuses a path connect never offered to scaffold", async () => {
    const fs = emptyRepo();
    const git = new FakeGit();
    const scaffold = new ScaffoldHarness({
      fs,
      git,
      locks: new InFlightLocks(),
      offers: new ScaffoldOffers(),
      originUrl: async () => ORIGIN,
      connect: async (path) => ({
        ok: true,
        outcome: "scaffolded",
        inventoryPath: path,
      }),
    });

    const result = await scaffold.scaffold(REPO);

    expect(result).toEqual({ ok: false, error: "not-offered" });
    expect(await fs.exists(`${REPO}/apm.yml`)).toBe(false);
    expect(git.commits).toEqual([]);
  });

  it("refuses a relative path before touching anything", async () => {
    await expect(make(emptyRepo()).scaffold("../elsewhere")).resolves.toEqual({
      ok: false,
      error: "relative",
    });
  });

  it("reports a rejected push and leaves the local commit in place", async () => {
    const git = new FakeGit(undefined, { push: "rejected" });

    const result = await make(emptyRepo(), git).scaffold(REPO);

    expect(result).toEqual({ ok: false, error: "push-rejected" });
    expect(git.commits).toHaveLength(1);
    // Nothing was pushed, so nothing may claim the remote's default branch.
    expect(git.originHeads).toEqual([]);
  });

  it("reports an unreachable remote apart from a rejection", async () => {
    const git = new FakeGit(undefined, { push: "offline" });

    await expect(make(emptyRepo(), git).scaffold(REPO)).resolves.toEqual({
      ok: false,
      error: "push-offline",
    });
  });

  it("reports a failed commit without pushing", async () => {
    const git = new FakeGit(undefined, { commit: "commit-failed" });

    await expect(make(emptyRepo(), git).scaffold(REPO)).resolves.toEqual({
      ok: false,
      error: "commit-failed",
    });
    expect(git.pushes).toEqual([]);
  });

  // A half-scaffold is unretryable: the apm.yml it left behind makes the next
  // attempt answer already-a-harness, and the message says to retry (#556).
  it("removes everything it wrote when the commit fails", async () => {
    const fs = emptyRepo();
    const git = new FakeGit(undefined, { commit: "commit-failed" });

    await make(fs, git).scaffold(REPO);

    for (const entry of SCAFFOLD_ENTRIES) {
      expect(await fs.exists(`${REPO}/${entry}`)).toBe(false);
    }
    // Deleting the files without this would leave the index claiming them.
    expect(git.unstaged.sort()).toEqual([
      ".apm/skills/.gitkeep",
      ".github/workflows/skill-check.yml",
      "README.md",
      "apm.yml",
    ]);
  });

  it("reports a failed write and removes the files it got as far as", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [REPO]: REPO },
      unwritable: [`${REPO}/README.md`],
    });
    const git = new FakeGit();

    const result = await make(fs, git).scaffold(REPO);

    expect(result).toEqual({ ok: false, error: "write-failed" });
    expect(await fs.exists(`${REPO}/apm.yml`)).toBe(false);
    expect(git.commits).toEqual([]);
  });

  it("refuses a path that appeared between the collision check and the write", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [REPO]: REPO },
      racedIntoExistence: [`${REPO}/README.md`],
    });
    const git = new FakeGit();

    const result = await make(fs, git).scaffold(REPO);

    expect(result).toEqual({
      ok: false,
      error: "path-occupied",
      path: "README.md",
    });
    expect(await fs.exists(`${REPO}/apm.yml`)).toBe(false);
    expect(git.commits).toEqual([]);
  });

  it("refuses a second scaffold of the same repository while one is running", async () => {
    const fs = emptyRepo();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reachedConnect = () => {};
    const running = new Promise<void>((resolve) => {
      reachedConnect = resolve;
    });
    const scaffold = make(fs, new FakeGit(), ORIGIN, async (path) => {
      reachedConnect();
      await held;
      return { ok: true, outcome: "scaffolded", inventoryPath: path };
    });

    const first = scaffold.scaffold(REPO);
    await running;
    await expect(scaffold.scaffold(REPO)).resolves.toEqual({
      ok: false,
      error: "busy",
    });
    release();
    expect((await first).ok).toBe(true);
  });

  it("creates no tag", async () => {
    const git = new FakeGit();

    await make(emptyRepo(), git).scaffold(REPO);

    // The port has no tag operation at all, so the scaffold cannot make one.
    expect(Object.keys(git)).not.toContain("tags");
    expect(git.commits[0]?.message).not.toMatch(/v\d+\.\d+\.\d+/);
  });

  it("connects the scaffolded Harness through the same use case connect uses", async () => {
    const connected: string[] = [];
    const fs = emptyRepo();
    const scaffold = make(fs, new FakeGit(), ORIGIN, async (path) => {
      connected.push(path);
      return { ok: true, outcome: "scaffolded", inventoryPath: path };
    });

    await scaffold.scaffold(REPO);

    expect(connected).toEqual([REPO]);
    // The store is connect's to write, never the scaffold's.
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });
});
