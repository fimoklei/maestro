import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { classifyCloneDestination } from "./clone-destination";

const DEST = "/Users/me/agent-harness";
const OWNER_REPO = "fimoklei/agent-harness";

function classify(
  fs: InMemoryFileSystem,
  {
    originUrl = "git@github.com:fimoklei/agent-harness.git",
    headCommit = "a1b2c3d",
  }: { originUrl?: string | null; headCommit?: string | null } = {},
) {
  return classifyCloneDestination(DEST, OWNER_REPO, {
    fs,
    originUrl: async () => originUrl,
    headCommit: async () => headCommit,
  });
}

// A clone git left behind: `.git` present, remote already written, no commit
// checked out yet.
function partialCloneSeed() {
  return {
    directories: { [DEST]: DEST, [`${DEST}/.git`]: `${DEST}/.git` },
    listings: { [DEST]: [".git"] },
  };
}

function cloneSeed() {
  return {
    directories: { [DEST]: DEST, [`${DEST}/.git`]: `${DEST}/.git` },
    listings: { [DEST]: [".git", "apm.yml"] },
    files: { [`${DEST}/apm.yml`]: "dependencies: []\n" },
  };
}

describe("classifyCloneDestination", () => {
  it("reports a destination nothing occupies as free", async () => {
    await expect(classify(new InMemoryFileSystem())).resolves.toBe("free");
  });

  // git clones into an existing empty directory, so this is not an obstacle.
  it("reports an existing empty directory as free", async () => {
    const fs = new InMemoryFileSystem({ directories: { [DEST]: DEST } });

    await expect(classify(fs)).resolves.toBe("free");
  });

  it("reports a clone of the same repository as same-origin", async () => {
    const fs = new InMemoryFileSystem(cloneSeed());

    await expect(classify(fs)).resolves.toBe("same-origin");
  });

  // Case is GitHub's to fold, not ours to refuse over.
  it("matches the origin regardless of its casing", async () => {
    const fs = new InMemoryFileSystem(cloneSeed());

    await expect(
      classify(fs, { originUrl: "https://github.com/Fimoklei/Agent-Harness" }),
    ).resolves.toBe("same-origin");
  });

  it("reports a clone of a different repository as occupied", async () => {
    const fs = new InMemoryFileSystem(cloneSeed());

    await expect(
      classify(fs, { originUrl: "git@github.com:someone/else.git" }),
    ).resolves.toBe("occupied");
  });

  it("reports a repository with no readable origin as occupied", async () => {
    const fs = new InMemoryFileSystem(cloneSeed());

    await expect(classify(fs, { originUrl: null })).resolves.toBe("occupied");
  });

  it("reports a non-empty directory that is not a repository as occupied", async () => {
    const fs = new InMemoryFileSystem({
      directories: { [DEST]: DEST },
      listings: { [DEST]: ["notes.txt"] },
      files: { [`${DEST}/notes.txt`]: "hello" },
    });

    await expect(classify(fs)).resolves.toBe("occupied");
  });

  it("reports a file sitting on the destination name as occupied", async () => {
    const fs = new InMemoryFileSystem({ files: { [DEST]: "hello" } });

    await expect(classify(fs)).resolves.toBe("occupied");
  });

  it("reports a repository with no commit at HEAD as a partial clone", async () => {
    const fs = new InMemoryFileSystem(partialCloneSeed());

    await expect(classify(fs, { headCommit: null })).resolves.toBe(
      "partial-clone",
    );
  });

  // An interrupted clone is unusable whatever its remote says, so the origin
  // is never consulted for one.
  it("reports a partial clone even when its origin is another repository", async () => {
    const fs = new InMemoryFileSystem(partialCloneSeed());

    await expect(
      classify(fs, {
        headCommit: null,
        originUrl: "git@github.com:someone/else.git",
      }),
    ).resolves.toBe("partial-clone");
  });
});
