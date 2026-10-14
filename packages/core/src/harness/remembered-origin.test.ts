import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { rememberOrigin } from "./remembered-origin";

const ROOT = "/Users/me/agent-harness";
const GIT_CONFIG = `${ROOT}/.git/config`;

function countingGit(origin: { host: string; ownerRepo: string } | null) {
  const git = {
    reads: 0,
    origin,
    readOrigin: async (_root: string) => {
      git.reads += 1;
      return git.origin;
    },
  };
  return git;
}

describe("rememberOrigin", () => {
  it("asks git once while the clone's git config is unchanged", async () => {
    const fs = new InMemoryFileSystem({ files: { [GIT_CONFIG]: "[core]" } });
    const git = countingGit({ host: "github.com", ownerRepo: "me/harness" });
    const readOrigin = rememberOrigin({ fs, readOrigin: git.readOrigin });

    await readOrigin(ROOT);
    const again = await readOrigin(ROOT);

    expect(again).toEqual({ host: "github.com", ownerRepo: "me/harness" });
    expect(git.reads).toBe(1);
  });

  it("asks git again once the clone's git config changed", async () => {
    const fs = new InMemoryFileSystem({ files: { [GIT_CONFIG]: "[core]" } });
    const git = countingGit({ host: "github.com", ownerRepo: "me/harness" });
    const readOrigin = rememberOrigin({ fs, readOrigin: git.readOrigin });
    await readOrigin(ROOT);

    git.origin = { host: "github.com", ownerRepo: "me/moved" };
    await fs.writeFile(GIT_CONFIG, '[remote "origin"]');

    await expect(readOrigin(ROOT)).resolves.toEqual({
      host: "github.com",
      ownerRepo: "me/moved",
    });
    expect(git.reads).toBe(2);
  });

  it("keeps each clone's origin apart", async () => {
    const other = "/Users/me/other-harness";
    const fs = new InMemoryFileSystem({
      files: { [GIT_CONFIG]: "[core]", [`${other}/.git/config`]: "[core]" },
    });
    const readOrigin = rememberOrigin({
      fs,
      readOrigin: async (root) => ({ host: "github.com", ownerRepo: root }),
    });
    await readOrigin(ROOT);

    await expect(readOrigin(other)).resolves.toEqual({
      host: "github.com",
      ownerRepo: other,
    });
  });

  it("asks git every time when the clone has no git config file to watch", async () => {
    const fs = new InMemoryFileSystem();
    const git = countingGit(null);
    const readOrigin = rememberOrigin({ fs, readOrigin: git.readOrigin });

    await readOrigin(ROOT);
    await readOrigin(ROOT);

    expect(git.reads).toBe(2);
  });
});
