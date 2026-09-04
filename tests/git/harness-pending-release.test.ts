// The Pending release delta against real repositories. The remote is a bare
// repo on disk, so the whole file is offline (.claude/rules/testing.md).
//
// The point of the lane: a delta read from commit ancestry answers differently
// per merge strategy. Reading skill trees must not (ADR-0021, #517).
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { HarnessFreshness, PendingSkillMovement } from "@maestro/core";
import { HarnessGitAdapter, ReadHarnessState } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

const run = promisify(execFile);

// A harness Maestro has fetched: only a confirmed fetch makes tags mean
// anything, and the delta hangs off the tag.
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

  // A clone whose configured origin is a GitHub URL — Maestro refuses any
  // other (ADR-0014) — while git reaches the bare repo beside it. The rewrite
  // keeps the lane offline (LEARNINGS.md · git-remote-get-url-resolves-insteadof).
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

  // A released harness carrying one skill, plus a clone Maestro reads from.
  const buildHarness = async (label: string) => {
    const { remote, root } = await buildClone(label);
    await writeSkill(root, "tdd", "first");
    await commitAll(root, "add tdd");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    return { remote, root };
  };

  const movementsOf = async (root: string): Promise<PendingSkillMovement[]> => {
    const read = new ReadHarnessState({
      resolveRoot: async () => root,
      git: new HarnessGitAdapter(),
      freshness: {
        read: async () => FETCHED,
        record: async () => {},
      },
    });
    const result = await read.refresh(new Date("2026-08-03T08:00:00.000Z"));
    if (!result.ok) {
      throw new Error(`unexpected refusal: ${result.error}`);
    }
    return result.state.pendingRelease;
  };

  // One teammate's work — change tdd, add research — landed on main the way the
  // named strategy would land it.
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

  // One delta, three ways of landing it: the strategies are separate tests so a
  // failure names the one that disagreed.
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
    // A repository shared with another product tags branches Maestro's default
    // branch never carried. The highest tag is still the previous release.
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

    // v0.2.0 carries the side branch's tdd, so main's original tdd reads as a
    // change against it — the tag is compared, not the branch it hangs off.
    await expect(movementsOf(root)).resolves.toEqual([
      { kind: "added", name: "research", author: "Author" },
      { kind: "changed", name: "tdd", author: "Author" },
    ]);
  });

  it("names the author who deleted a skill, from the branch that no longer has it", async () => {
    // The one claim the use-case makes about git: the commit that removed a
    // path is still found by a log of that path at the default branch.
    const { root } = await buildHarness("deleted");
    await rm(join(root, ".apm", "skills", "tdd"), { recursive: true });
    await commitAll(root, "retire tdd");
    await git(root, "push", "origin", "HEAD:main");

    await expect(movementsOf(root)).resolves.toEqual([
      { kind: "removed", name: "tdd", author: "Author" },
    ]);
  });

  it("names a removal's author from the release the branch never carried", async () => {
    // The release tag sits on another history and carries a skill main never
    // saw, so main's log of that path answers nothing and the tag must.
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
    });
    const result = await read.refresh(new Date("2026-08-03T08:00:00.000Z"));

    expect(result).toMatchObject({
      ok: true,
      state: { releaseState: "never-released", pendingRelease: [] },
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
});
