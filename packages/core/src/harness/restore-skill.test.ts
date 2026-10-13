import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import type { CopyEntryFacts } from "../filesystem/copy-tree-fs";
import { InMemoryHarnessGit } from "./harness-git.fake";
import type { WorktreeAmbiguity } from "./read-harness-state";
import { RestoreSkill } from "./restore-skill";

const ROOT = "/harness";
const SKILLS = "/harness/.apm/skills";
const STAGING = "/harness/.apm/skills/.maestro-copy-1";
const HEAD = "commit-abc";

const FOLDER: CopyEntryFacts = {
  kind: "directory",
  size: 96,
  hardLinks: 2,
  executable: true,
  identity: "1:2:3",
};

// `tdd` is committed at local HEAD and deleted from disk.
function build(overrides?: {
  root?: string | undefined;
  head?: string | null;
  staged?: boolean | null;
  atHead?: string[] | null;
  describes?: (CopyEntryFacts | null)[];
  write?: "missing" | "failed";
  realpath?: (path: string) => Promise<string>;
  moveFails?: boolean;
  locks?: InFlightLocks;
  ambiguity?: WorktreeAmbiguity | null;
}) {
  const git = new InMemoryHarnessGit();
  const atHead =
    overrides && "atHead" in overrides ? (overrides.atHead ?? null) : ["tdd"];
  git.commit(
    HEAD,
    Object.fromEntries((atHead ?? []).map((name) => [name, `${name} body`])),
  );
  if (atHead === null) {
    git.unreadable.add(HEAD);
  }
  git.tip = HEAD;
  git.head = HEAD;
  if (overrides && "head" in overrides) {
    if (overrides.head !== null && overrides.head !== undefined) {
      git.commit(overrides.head, {}, { parent: HEAD });
    }
    git.head = overrides.head ?? null;
  }
  if (overrides && "staged" in overrides) {
    git.staged = { tdd: overrides.staged ?? null };
  }
  git.writeOutcome = overrides?.write ?? null;
  git.ambiguity = overrides?.ambiguity ?? null;

  const moved: [string, string][] = [];
  const removed: string[] = [];
  const describes = overrides?.describes ?? [null, null];
  let described = 0;
  const restore = new RestoreSkill({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    fs: { realpath: overrides?.realpath ?? (async (path) => path) },
    copyFs: {
      describe: async () => describes[described++] ?? null,
      createStagingDir: async () => STAGING,
      movePath: async (from, to) => {
        if (overrides?.moveFails === true) {
          throw new Error("ENOTEMPTY");
        }
        moved.push([from, to]);
      },
      removePath: async (path) => {
        removed.push(path);
      },
    },
    git,
    locks: overrides?.locks ?? new InFlightLocks(),
  });

  return { restore, git, moved, removed };
}

describe("RestoreSkill", () => {
  it("writes the committed folder into place from the confirmed commit", async () => {
    const { restore, moved, git } = build();

    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: true,
      name: "tdd",
      commit: HEAD,
    });

    expect(git.written).toEqual([{ name: "tdd", commit: HEAD, into: STAGING }]);
    expect(moved).toEqual([[`${STAGING}/tdd`, `${SKILLS}/tdd`]]);
  });

  it("clears its staging directory whether the move worked or not", async () => {
    const done = build();
    await done.restore.execute("tdd", HEAD);
    expect(done.removed).toEqual([STAGING]);

    const failed = build({ moveFails: true });
    await expect(failed.restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
    expect(failed.removed).toEqual([STAGING]);
  });

  it("never fetches or pushes anything", async () => {
    const { restore, git } = build();
    await restore.execute("tdd", HEAD);
    expect(git.fetches).toBe(0);
    expect(git.pushed).toEqual([]);
    expect(git.published).toEqual([]);
  });

  it("refuses a name that is not a skill slug", async () => {
    const { restore, git } = build();
    await expect(restore.execute("../escape", HEAD)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(git.written).toEqual([]);
  });

  it("refuses when no Harness is connected", async () => {
    const { restore } = build({ root: undefined });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses when local HEAD moved after the confirmation read it", async () => {
    const { restore, git } = build({ head: "commit-xyz" });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "head-moved",
    });
    expect(git.written).toEqual([]);
  });

  it("refuses when local HEAD cannot be read at all", async () => {
    const { restore } = build({ head: null });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
  });

  it("refuses a skill with a staged edit or a staged deletion", async () => {
    const { restore, git } = build({ staged: true });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "staged-changes",
    });
    expect(git.written).toEqual([]);
  });

  // Fail-closed: an unasked question is not a clean index.
  it("refuses when the staged question could not be asked", async () => {
    const { restore } = build({ staged: null });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "staged-changes",
    });
  });

  it("refuses when the confirmed commit does not hold the skill", async () => {
    const { restore, git } = build({ atHead: ["jobs"] });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "not-in-commit",
    });
    expect(git.written).toEqual([]);
  });

  it("refuses when the commit's skills could not be read", async () => {
    const { restore } = build({ atHead: null });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
  });

  it("refuses when anything already sits at the destination", async () => {
    const { restore, git } = build({ describes: [FOLDER] });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-exists",
    });
    expect(git.written).toEqual([]);
  });

  // Something created the folder between the first look and the move.
  it("refuses a destination that appeared while the copy was built", async () => {
    const { restore, moved, removed } = build({ describes: [null, FOLDER] });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-exists",
    });
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  it("refuses when the skills folder does not resolve inside the Harness", async () => {
    const { restore, git } = build({
      realpath: async (path) => (path === SKILLS ? "/elsewhere/skills" : path),
    });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(git.written).toEqual([]);
  });

  it("refuses when the committed copy could not be written", async () => {
    const { restore, moved, removed } = build({ write: "failed" });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "restore-failed",
    });
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  // The trees said the skill is there, so this is a broken read, not absence.
  it("refuses when the committed subtree could no longer be read", async () => {
    const { restore, moved, removed } = build({ write: "missing" });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "source-unreadable",
    });
    expect(moved).toEqual([]);
    expect(removed).toEqual([STAGING]);
  });

  // An unread destination is never an empty one.
  it("refuses when the skills folder cannot be read at all", async () => {
    const { restore, git } = build({
      realpath: async (path) => {
        if (path === SKILLS) {
          throw new Error("ENOENT");
        }
        return path;
      },
    });
    await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
      ok: false,
      error: "destination-unreadable",
    });
    expect(git.written).toEqual([]);
  });

  // Asked first, so an unanswerable working tree refuses under its own name.
  describe("an ambiguous working tree", () => {
    const ambiguities: WorktreeAmbiguity[] = [
      "sparse-checkout",
      "merge-in-progress",
      "rebase-in-progress",
      "unresolved-conflicts",
      "unreadable",
    ];

    for (const ambiguity of ambiguities) {
      it(`refuses under ${ambiguity}, before any other fact is read`, async () => {
        const { restore, git, moved } = build({
          ambiguity,
          // Each would refuse under its own code; none is reached, proving the order.
          head: "commit-xyz",
          staged: true,
        });

        await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
          ok: false,
          error: ambiguity,
        });
        expect(git.written).toEqual([]);
        expect(moved).toEqual([]);
      });
    }
  });

  it("refuses a second restore while one holds the Harness", async () => {
    const locks = new InFlightLocks();
    const { restore } = build({ locks });

    const held = locks.run(ROOT, async () => {
      await expect(restore.execute("tdd", HEAD)).resolves.toEqual({
        ok: false,
        error: "restore-in-progress",
      });
    });

    await expect(held).resolves.toMatchObject({ ok: true });
  });
});
