// A delta read from commit ancestry answers differently per merge strategy;
// reading skill trees must not (#517).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { HarnessFreshness, PendingSkillMovement } from "@maestro/core";
import { HarnessGitAdapter, ReadHarnessState } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { stubReview } from "../helpers/stub-review";

const run = promisify(execFile);

// Only a confirmed fetch makes tags mean anything.
const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-03T07:00:00.000Z",
};

type Strategy = "merge" | "squash" | "rebase";

describe("Pending release movements", { timeout: 60_000 }, () => {
  let base: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const writeSkill = async (root: string, name: string, body: string) => {
    await mkdir(join(root, ".apm", "skills", name), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", name, "SKILL.md"),
      `---\ndescription: ${body}\n---\n`,
      "utf8",
    );
  };

  const commitAll = async (root: string, message: string) => {
    await git(root, "add", "-A");
    await git(root, "commit", "-m", message);
  };

  // The GitHub origin is rewritten to the bare repo beside it, so the lane
  // stays offline.
  const buildClone = async (label: string) => {
    const remote = join(base, `${label}.git`);
    const root = join(base, label);
    const originUrl = `https://github.com/fimoklei/${label}.git`;
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "remote", "set-url", "origin", originUrl);
    await git(root, "config", `url.${remote}.insteadOf`, originUrl);
    await git(root, "config", "user.email", "author@example.com");
    await git(root, "config", "user.name", "Author");
    return { remote, root };
  };

  const buildHarness = async (label: string) => {
    const { remote, root } = await buildClone(label);
    await writeSkill(root, "tdd", "first");
    await commitAll(root, "add tdd");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    return { remote, root };
  };

  const readerFor = (root: string) =>
    new ReadHarnessState({
      resolveRoot: async () => root,
      git: new HarnessGitAdapter(),
      freshness: {
        read: async () => FETCHED,
        record: async () => {},
      },
      review: stubReview(),
    });

  const movementsOf = async (root: string): Promise<PendingSkillMovement[]> => {
    const read = readerFor(root);
    await read.refresh(new Date("2026-08-03T08:00:00.000Z"));
    const result = await read.planRelease();
    if (!result.ok) {
      throw new Error(`unexpected refusal: ${result.error}`);
    }
    return result.plan.delta;
  };

  const releaseStageOf = async (root: string): Promise<string[]> => {
    const result = await readerFor(root).refresh(
      new Date("2026-08-03T08:00:00.000Z"),
    );
    if (!result.ok) {
      throw new Error(`unexpected refusal: ${result.error}`);
    }
    const stage = result.state.stages.release;
    return stage.outcome === "read"
      ? stage.rows.map((row) => `${row.skill}:${row.status}`)
      : [stage.outcome];
  };

  const deliver = async (strategy: Strategy) => {
    const { remote, root } = await buildHarness(strategy);
    const mate = join(base, `${strategy}-mate`);
    await run("git", ["clone", remote, mate]);
    await git(mate, "config", "user.email", "mate@example.com");
    await git(mate, "config", "user.name", "Mate");
    await git(mate, "checkout", "-b", "work");
    await writeSkill(mate, "tdd", "second");
    await commitAll(mate, "sharpen tdd");
    await writeSkill(mate, "research", "new");
    await commitAll(mate, "add research");

    await git(mate, "checkout", "main");
    if (strategy === "merge") {
      await git(mate, "merge", "--no-ff", "work", "-m", "merge work");
    } else if (strategy === "squash") {
      await git(mate, "merge", "--squash", "work");
      await commitAll(mate, "squashed work");
    } else {
      await git(mate, "rebase", "work");
    }
    await git(mate, "push", "origin", "HEAD:main");

    return movementsOf(root);
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-pending-release-"));
  });

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  // One test per strategy, so a failure names the one that disagreed.
  const DELIVERED: PendingSkillMovement[] = [
    { kind: "added", name: "research", author: "Mate" },
    { kind: "changed", name: "tdd", author: "Mate" },
  ];

  it("reads the delta of work landed as a merge commit", async () => {
    await expect(deliver("merge")).resolves.toEqual(DELIVERED);
  });

  it("reads the same delta when the same work was squashed", async () => {
    await expect(deliver("squash")).resolves.toEqual(DELIVERED);
  });

  it("reads the same delta when the same work was rebased", async () => {
    await expect(deliver("rebase")).resolves.toEqual(DELIVERED);
  });

  it("counts a change outside the skills directory as no movement at all", async () => {
    const { root } = await buildHarness("unrelated");
    await writeFile(join(root, "README.md"), "docs\n", "utf8");
    await commitAll(root, "document the harness");
    await git(root, "push", "origin", "HEAD:main");

    await expect(movementsOf(root)).resolves.toEqual([]);
  });

  it("reads the whole remote skill set of a never-tagged harness", async () => {
    const { root } = await buildClone("fresh");
    await writeSkill(root, "tdd", "first");
    await writeSkill(root, "research", "first");
    await commitAll(root, "first skills");
    await git(root, "push", "origin", "HEAD:main");

    await expect(movementsOf(root)).resolves.toEqual([
      { kind: "added", name: "research", author: "Author" },
      { kind: "added", name: "tdd", author: "Author" },
    ]);
  });

  it("compares against the highest tag even where it sits outside main's history", async () => {
    const { root } = await buildHarness("sidetag");
    await git(root, "checkout", "-b", "side");
    await writeSkill(root, "tdd", "side release");
    await commitAll(root, "side work");
    await git(root, "tag", "v0.2.0");
    await git(root, "push", "--tags", "origin", "side");
    await git(root, "checkout", "main");
    await writeSkill(root, "research", "new");
    await commitAll(root, "add research");
    await git(root, "push", "origin", "HEAD:main");

    // The tag is compared, not the branch it hangs off.
    await expect(movementsOf(root)).resolves.toEqual([
      { kind: "added", name: "research", author: "Author" },
      { kind: "changed", name: "tdd", author: "Author" },
    ]);
  });

  it("names the author who deleted a skill, from the branch that no longer has it", async () => {
    const { root } = await buildHarness("deleted");
    await rm(join(root, ".apm", "skills", "tdd"), { recursive: true });
    await commitAll(root, "retire tdd");
    await git(root, "push", "origin", "HEAD:main");

    await expect(movementsOf(root)).resolves.toEqual([
      { kind: "removed", name: "tdd", author: "Author" },
    ]);
  });

  it("names a removal's author from the release the branch never carried", async () => {
    // The tag sits on another history, so main's log answers nothing.
    const { root } = await buildHarness("offhistory");
    await git(root, "checkout", "-b", "side");
    await writeSkill(root, "grilling", "side only");
    await git(root, "add", "-A");
    await git(root, "-c", "user.name=Mate", "commit", "-m", "add grilling");
    await git(root, "tag", "v0.2.0");
    await git(root, "push", "--tags", "origin", "side");
    await git(root, "checkout", "main");

    await expect(movementsOf(root)).resolves.toEqual([
      { kind: "removed", name: "grilling", author: "Mate" },
    ]);
  });

  it("reads a harness with no skills directory as empty, not as unreadable", async () => {
    const { root } = await buildClone("bare");
    await writeFile(join(root, "README.md"), "no skills yet\n", "utf8");
    await commitAll(root, "start the harness");
    await git(root, "push", "origin", "HEAD:main");

    const read = new ReadHarnessState({
      resolveRoot: async () => root,
      git: new HarnessGitAdapter(),
      freshness: { read: async () => FETCHED, record: async () => {} },
      review: stubReview(),
    });
    const result = await read.refresh(new Date("2026-08-03T08:00:00.000Z"));

    expect(result).toMatchObject({
      ok: true,
      state: {
        releaseState: "never-released",
        stages: { release: { outcome: "read", rows: [] } },
      },
    });
  });

  it("reads a renamed skill directory as one movement", async () => {
    const { root } = await buildHarness("renamed");
    await git(
      root,
      "mv",
      join(".apm", "skills", "tdd"),
      join(".apm", "skills", "test-first"),
    );
    await commitAll(root, "rename tdd");
    await git(root, "push", "origin", "HEAD:main");

    await expect(movementsOf(root)).resolves.toEqual([
      {
        kind: "renamed",
        name: "test-first",
        previousName: "tdd",
        author: "Author",
      },
    ]);
  });

  // Measured against the latest release, not anything local (#845).
  describe("Pending release membership", () => {
    it("holds a change reverted before release out of the stage", async () => {
      const { root } = await buildHarness("reverted");
      await writeSkill(root, "tdd", "second");
      await commitAll(root, "sharpen tdd");
      await writeSkill(root, "tdd", "first");
      await commitAll(root, "put tdd back");
      await git(root, "push", "origin", "HEAD:main");

      await expect(releaseStageOf(root)).resolves.toEqual([]);
      await expect(movementsOf(root)).resolves.toEqual([]);
    });

    it("leaves a skill untouched by another skill's change out of the stage", async () => {
      const { root } = await buildClone("unrelated-skill");
      await writeSkill(root, "tdd", "first");
      await writeSkill(root, "research", "first");
      await commitAll(root, "first skills");
      await git(root, "tag", "v0.1.0");
      await git(root, "push", "--tags", "origin", "HEAD:main");

      await writeSkill(root, "tdd", "second");
      await commitAll(root, "sharpen tdd");
      await git(root, "push", "origin", "HEAD:main");

      await expect(releaseStageOf(root)).resolves.toEqual(["tdd:changed"]);
    });

    it("awaits release for every skill on the default branch before the first release", async () => {
      const { root } = await buildClone("first-release");
      await writeSkill(root, "tdd", "first");
      await writeSkill(root, "research", "first");
      await commitAll(root, "first skills");
      await git(root, "push", "origin", "HEAD:main");

      await expect(releaseStageOf(root)).resolves.toEqual([
        "research:added",
        "tdd:added",
      ]);
    });

    it("reads a deletion on the default branch as a deleted row", async () => {
      const { root } = await buildHarness("stage-deleted");
      await rm(join(root, ".apm", "skills", "tdd"), { recursive: true });
      await commitAll(root, "retire tdd");
      await git(root, "push", "origin", "HEAD:main");

      await expect(releaseStageOf(root)).resolves.toEqual(["tdd:deleted"]);
    });

    it("never reads a proposal branch's content as released work", async () => {
      // Only what the default branch carries can await release (#845).
      const { root } = await buildHarness("reused-branch");
      await git(root, "checkout", "-b", "maestro/tdd");
      await writeSkill(root, "tdd", "second");
      await commitAll(root, "sharpen tdd");
      await git(root, "push", "origin", "HEAD:maestro/tdd");
      await git(root, "checkout", "main");

      await expect(releaseStageOf(root)).resolves.toEqual([]);

      // The stage reads main's content against the release, never the branch.
      await git(root, "merge", "--squash", "maestro/tdd");
      await commitAll(root, "squashed tdd");
      await git(root, "push", "origin", "HEAD:main");
      await git(root, "checkout", "maestro/tdd");
      await writeSkill(root, "tdd", "third");
      await commitAll(root, "sharpen tdd again");
      await git(root, "push", "origin", "HEAD:maestro/tdd");
      await git(root, "checkout", "main");

      await expect(releaseStageOf(root)).resolves.toEqual(["tdd:changed"]);
    });
  });
});
